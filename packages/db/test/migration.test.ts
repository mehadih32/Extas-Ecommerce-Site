// The migrations. 0001_init was exactly `prisma migrate diff --from-empty` of the schema when it shipped, followed by
// the hand-written PR 603 report views; it is applied on the server, so it never changes again (its hash is pinned).
// Every later schema change is its own folder (0002_…), checked here for shape and, on a real PostgreSQL, for drift:
// all migrations applied in order must give exactly the schema (the CI db job runs the same check on its database).
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, SCHEMA_PATH } from '../src/schema-meta';

const MARKER = '-- HAND-WRITTEN BELOW THIS LINE';
const migration = readFileSync(`${MIGRATIONS_DIR}0001_init/migration.sql`, 'utf8');
const markerAt = migration.indexOf(MARKER);
// The generated part ends at the separator line just above the marker.
const generated = migration.slice(0, migration.lastIndexOf('\n-- ====', markerAt) + 1);
const handWritten = migration.slice(markerAt);
/** sha256 of 0001_init/migration.sql as it shipped (PR 13, 603) and was applied on the server. */
const INIT_SHA256 = '94a4d065f06d933693823be9f95d815fec08a9f634d6499d23ee46a079f156b2';
const folders = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
const later = folders.filter((f) => f !== '0001_init');
const sqlOf = (f: string) => readFileSync(`${MIGRATIONS_DIR}${f}/migration.sql`, 'utf8');
const CLI = fileURLToPath(new URL('../scripts/prisma.mjs', import.meta.url));
const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL || '';

describe('0001_init migration', () => {
  it('has a lock file for PostgreSQL', () => {
    expect(readFileSync(`${MIGRATIONS_DIR}migration_lock.toml`, 'utf8')).toMatch(/provider = "postgresql"/);
  });

  it('has the hand-written block after the generated SQL', () => {
    expect(markerAt).toBeGreaterThan(0);
  });

  it('is never edited after it shipped (it is applied on the server; a change is a new migration folder)', () => {
    expect(createHash('sha256').update(migration).digest('hex')).toBe(INIT_SHA256);
  });

  it('with no later migration, matches a fresh `prisma migrate diff --from-empty` of the schema (no drift)', () => {
    if (later.length) return; // then the drift check below runs on a real database
    const run = spawnSync(process.execPath, [CLI, 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', SCHEMA_PATH, '--script'], { encoding: 'utf8' });
    expect(run.status, run.stderr).toBe(0);
    expect(generated.trimEnd()).toBe(run.stdout.trimEnd());
  });

  it('creates the pg_trgm extension before the trigram indexes', () => {
    const ext = generated.indexOf('CREATE EXTENSION IF NOT EXISTS "pg_trgm"');
    expect(ext).toBeGreaterThanOrEqual(0);
    expect(generated.indexOf('gin_trgm_ops')).toBeGreaterThan(ext);
  });

  it.each(['mv_sales_daily', 'mv_style_profit_monthly', 'mv_ad_performance_daily', 'mv_district_sales_monthly'])(
    'defines report view %s with a unique index (refresh CONCURRENTLY) and a refresh-schedule comment',
    (view) => {
      expect(handWritten).toContain(`CREATE MATERIALIZED VIEW "${view}"`);
      expect(handWritten).toMatch(new RegExp(`CREATE UNIQUE INDEX "${view}_key"\\s+ON "${view}"`));
      expect(handWritten).toMatch(new RegExp(`COMMENT ON MATERIALIZED VIEW "${view}" IS[^;]*reports\\.viewRefreshMinutes`));
      expect(handWritten).toContain(`REFRESH MATERIALIZED VIEW CONCURRENTLY "${view}"`);
    },
  );

  it('documents the refresh schedule as a setting and a job, never a number in code', () => {
    expect(handWritten).toMatch(/REFRESH SCHEDULE/);
    expect(handWritten).toMatch(/reports\.refresh-views/);
    expect(handWritten).toMatch(/Store\.timezone/);
  });

  it('never drops or truncates anything', () => {
    expect(migration).not.toMatch(/\b(DROP|TRUNCATE)\s+(TABLE|SCHEMA|DATABASE|MATERIALIZED VIEW)\b/i);
  });
});

describe('later migrations', () => {
  it('are numbered folders after 0001_init, each with a migration.sql that says why', () => {
    expect(folders[0]).toBe('0001_init');
    for (const [i, f] of later.entries()) {
      expect(f).toMatch(new RegExp(`^${String(i + 2).padStart(4, '0')}_[a-z0-9_]+$`));
      expect(sqlOf(f)).toMatch(/^-- PR \d+/);
    }
  });

  it.each(later.length ? later : ['(none)'])('%s never drops, truncates or deletes anything (hard rule 3)', (f) => {
    if (f === '(none)') return;
    const sql = sqlOf(f);
    expect(sql).not.toMatch(/\b(DROP|TRUNCATE)\s+(TABLE|SCHEMA|DATABASE|MATERIALIZED VIEW|COLUMN)\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it('PR 27, 32: links to size charts, collections and tags are archived, never deleted (0002_archived_links)', () => {
    const sql = sqlOf('0002_archived_links');
    for (const t of ['SizeChartAssignment', 'CollectionProduct', 'ProductTag']) {
      expect(sql).toContain(`ALTER TABLE "${t}" ADD COLUMN     "archivedAt" TIMESTAMPTZ(3);`);
    }
  });

  it('PR 208–219: the Smart Rules columns only add (0003_smart_rules)', () => {
    const sql = sqlOf('0003_smart_rules');
    for (const t of ['SmartRule', 'SmartRuleConflict', 'Notice']) expect(sql).toContain(`ALTER TABLE "${t}" ADD COLUMN`);
    // Every new NOT NULL column has a default, so existing rows stay valid.
    for (const line of sql.split('\n').filter((l) => /NOT NULL/.test(l))) expect(line).toMatch(/DEFAULT/);
    expect(sql).not.toMatch(/\bALTER COLUMN\b|\bRENAME\b/i);
  });
});

// All migrations applied in order to a throwaway database must give exactly the schema. Needs TEST_DATABASE_ADMIN_URL
// (CI db job, or the local extas-postgres); skipped without it. Connection strings are never printed.
describe.skipIf(!ADMIN_URL)('migrations on PostgreSQL', () => {
  it('apply in order and leave no drift against the schema', async () => {
    const name = `db_migrations_${randomBytes(4).toString('hex')}`;
    const admin = new PrismaClient({ datasourceUrl: ADMIN_URL });
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    const u = new URL(ADMIN_URL);
    u.pathname = `/${name}`;
    const url = u.toString();
    const hide = (out: string) => (u.password ? out.split(u.password).join('***') : out);
    try {
      const env = { ...process.env, DATABASE_URL: url, DATABASE_DIRECT_URL: url };
      const deploy = spawnSync(process.execPath, [CLI, 'migrate', 'deploy'], { encoding: 'utf8', env });
      expect(deploy.status, hide(deploy.stdout + deploy.stderr)).toBe(0);
      const diff = spawnSync(process.execPath, [CLI, 'migrate', 'diff', '--from-url', url, '--to-schema-datamodel', SCHEMA_PATH, '--exit-code'], { encoding: 'utf8', env });
      // --exit-code: 0 = no difference, 2 = the schema and the database differ.
      expect(diff.status, hide(diff.stdout + diff.stderr)).toBe(0);
    } finally {
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.$disconnect();
    }
  }, 180_000);
});

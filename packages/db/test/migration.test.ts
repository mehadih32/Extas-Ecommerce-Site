// The initial migration is exactly `prisma migrate diff --from-empty` of the schema, followed by the hand-written
// PR 603 report views. Fails when someone edits the schema without a migration, or edits the generated part by hand.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, SCHEMA_PATH } from '../src/schema-meta';

const MARKER = '-- HAND-WRITTEN BELOW THIS LINE';
const migration = readFileSync(`${MIGRATIONS_DIR}0001_init/migration.sql`, 'utf8');
const markerAt = migration.indexOf(MARKER);
// The generated part ends at the separator line just above the marker.
const generated = migration.slice(0, migration.lastIndexOf('\n-- ====', markerAt) + 1);
const handWritten = migration.slice(markerAt);

describe('0001_init migration', () => {
  it('has a lock file for PostgreSQL', () => {
    expect(readFileSync(`${MIGRATIONS_DIR}migration_lock.toml`, 'utf8')).toMatch(/provider = "postgresql"/);
  });

  it('has the hand-written block after the generated SQL', () => {
    expect(markerAt).toBeGreaterThan(0);
  });

  it('matches a fresh `prisma migrate diff --from-empty` of the schema (no drift)', () => {
    const cli = fileURLToPath(new URL('../scripts/prisma.mjs', import.meta.url));
    const run = spawnSync(
      process.execPath,
      [cli, 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', SCHEMA_PATH, '--script'],
      { encoding: 'utf8' },
    );
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

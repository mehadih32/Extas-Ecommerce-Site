// PR 139 (CN-022) on a real PostgreSQL: the audit log and the locked ledgers are append-only at the database. A
// throwaway database gets the real migrations; then, as the app's role (extas_app, a separate role that owns nothing and
// is not a superuser — reached with SET ROLE inside a transaction, so no password is ever made), INSERT and SELECT work
// and UPDATE, DELETE and TRUNCATE are refused by the privileges; as the owner role the trigger refuses them as well.
// Needs TEST_DATABASE_ADMIN_URL (CI db job, or a local server); skipped without it. Connection strings are never printed.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APP_DB_ROLE, APPEND_ONLY_LOCKED } from '../src/schema-meta';

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL || '';
const CLI = fileURLToPath(new URL('../scripts/prisma.mjs', import.meta.url));

/** Runs `sql` in its own transaction, as the app's role when `asApp`; returns 'ok' or the database's message. */
async function attempt(db: PrismaClient, sql: string, asApp: boolean): Promise<string> {
  try {
    await db.$transaction(async (tx) => {
      if (asApp) await tx.$executeRawUnsafe(`SET LOCAL ROLE ${APP_DB_ROLE}`);
      await tx.$executeRawUnsafe(sql);
    });
    return 'ok';
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

describe.skipIf(!ADMIN_URL)('append-only at the database (PR 139)', () => {
  const name = `db_append_only_${randomBytes(4).toString('hex')}`;
  const admin = new PrismaClient({ datasourceUrl: ADMIN_URL });
  let db: PrismaClient;
  let storeId = 0;
  const u = new URL(ADMIN_URL || 'postgresql://x@localhost/x');
  u.pathname = `/${name}`;

  beforeAll(async () => {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    const env = { ...process.env, DATABASE_URL: u.toString(), DATABASE_DIRECT_URL: u.toString() };
    const run = spawnSync(process.execPath, [CLI, 'migrate', 'deploy'], { encoding: 'utf8', env });
    if (run.status !== 0) {
      const out = run.stdout + run.stderr;
      throw new Error(`migrate deploy failed:\n${u.password ? out.split(u.password).join('***') : out}`);
    }
    db = new PrismaClient({ datasourceUrl: u.toString() });
    storeId = (await db.store.create({ data: { slug: 'sample-a', name: 'Sample store A', defaultLocale: 'en-GB', currency: 'BDT', timezone: 'Asia/Dhaka' } })).id;
  }, 180_000);

  afterAll(async () => {
    await db?.$disconnect();
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.$disconnect();
  });

  const insertAudit = (action: string) =>
    `INSERT INTO "AuditLog" ("id","storeId","actorType","action","entityType","entityId") VALUES ('${randomUUIDish()}', ${storeId}, 'SYSTEM', '${action}', 'Test', 'sample')`;

  it('the app role is its own role: not a superuser, owns no table, has no login until the server gives it one', async () => {
    const [r] = await db.$queryRawUnsafe<{ rolsuper: boolean; rolcanlogin: boolean; owns: bigint }[]>(
      `SELECT r.rolsuper, r.rolcanlogin, (SELECT count(*) FROM pg_tables t WHERE t.tableowner = r.rolname) AS owns FROM pg_roles r WHERE r.rolname = $1`,
      APP_DB_ROLE,
    );
    expect(r).toMatchObject({ rolsuper: false });
    expect(Number(r!.owns)).toBe(0);
    // The migration makes it without a login; only the server's setup gives it one (its password never in Git).
    expect(typeof r!.rolcanlogin).toBe('boolean');
  });

  it('the app role may insert and read audit rows', async () => {
    expect(await attempt(db, insertAudit('test.app-insert'), true)).toBe('ok');
    expect(await attempt(db, `SELECT count(*) FROM "AuditLog"`, true)).toBe('ok');
    expect(await db.auditLog.count({ where: { action: 'test.app-insert' } })).toBe(1);
  });

  it('the app role cannot update, delete or truncate audit rows (privileges)', async () => {
    expect(await attempt(db, `UPDATE "AuditLog" SET "action" = 'edited'`, true)).toMatch(/permission denied/i);
    expect(await attempt(db, `DELETE FROM "AuditLog"`, true)).toMatch(/permission denied/i);
    expect(await attempt(db, `TRUNCATE "AuditLog"`, true)).toMatch(/permission denied/i);
    expect(await db.auditLog.count({ where: { action: 'test.app-insert' } })).toBe(1);
  });

  it('even the owner role cannot change or remove them (the trigger), and the message says what to do', async () => {
    expect(await attempt(db, insertAudit('test.owner-insert'), false)).toBe('ok');
    expect(await attempt(db, `UPDATE "AuditLog" SET "action" = 'edited'`, false)).toMatch(/append-only: UPDATE on "AuditLog"/);
    expect(await attempt(db, `DELETE FROM "AuditLog" WHERE "action" = 'test.owner-insert'`, false)).toMatch(/append-only: DELETE on "AuditLog"/);
    expect(await attempt(db, `TRUNCATE "AuditLog"`, false)).toMatch(/append-only: TRUNCATE on "AuditLog"/);
    expect(await db.auditLog.count({ where: { action: { in: ['test.app-insert', 'test.owner-insert'] } } })).toBe(2);
  });

  it('every locked table: the app role may insert and read, never update, delete or truncate; the triggers are on', async () => {
    const rows = await db.$queryRawUnsafe<{ t: string; ins: boolean; sel: boolean; upd: boolean; del: boolean; trn: boolean; trig: bigint }[]>(
      `SELECT t,
              has_table_privilege($1, format('public.%I', t), 'INSERT')   AS ins,
              has_table_privilege($1, format('public.%I', t), 'SELECT')   AS sel,
              has_table_privilege($1, format('public.%I', t), 'UPDATE')   AS upd,
              has_table_privilege($1, format('public.%I', t), 'DELETE')   AS del,
              has_table_privilege($1, format('public.%I', t), 'TRUNCATE') AS trn,
              (SELECT count(*) FROM pg_trigger g WHERE g.tgrelid = format('public.%I', t)::regclass
                 AND g.tgname IN (t || '_append_only', t || '_no_truncate') AND g.tgenabled = 'O') AS trig
       FROM unnest($2::text[]) AS t`,
      APP_DB_ROLE,
      [...APPEND_ONLY_LOCKED],
    );
    expect(rows).toHaveLength(APPEND_ONLY_LOCKED.length);
    for (const r of rows) expect({ ...r, trig: Number(r.trig) }, r.t).toEqual({ t: r.t, ins: true, sel: true, upd: false, del: false, trn: false, trig: 2 });
  });

  it('the app role keeps full use of ordinary tables, and gets it on tables later migrations add', async () => {
    expect(await attempt(db, `UPDATE "Store" SET "name" = "name" WHERE "id" = ${storeId}`, true)).toBe('ok');
    // A table made by the migration role after 0010 (as the next migration would): the default privileges cover it.
    await db.$executeRawUnsafe(`CREATE TABLE "zz_later_table" ("id" int PRIMARY KEY, "n" int)`);
    expect(await attempt(db, `INSERT INTO "zz_later_table" VALUES (1, 1)`, true)).toBe('ok');
    expect(await attempt(db, `UPDATE "zz_later_table" SET "n" = 2`, true)).toBe('ok');
  });

  it('the app role may read the migration history, never write it', async () => {
    expect(await attempt(db, `SELECT count(*) FROM "_prisma_migrations"`, true)).toBe('ok');
    expect(await attempt(db, `UPDATE "_prisma_migrations" SET "logs" = NULL`, true)).toMatch(/permission denied/i);
  });

  it('PR 155 (0012): the app role refreshes and reads the KPI views only through their function, never owning them', async () => {
    expect(await attempt(db, `SELECT extas_refresh_kpi_views()`, true)).toBe('ok');
    expect(await attempt(db, `SELECT count(*) FROM "mv_kpi_daily", "mv_kpi_lines_monthly"`, true)).toBe('ok');
    // PostgreSQL 16 says "must be owner"; 17 checks its MAINTAIN privilege and says "permission denied".
    expect(await attempt(db, `REFRESH MATERIALIZED VIEW "mv_kpi_daily"`, true)).toMatch(
      /must be owner|permission denied/i,
    );
  });

  it("the server smoke test's check (infra/deploy/app-role.sh) passes here and names a table whose guard is off", async () => {
    const guards = async () => Object.values((await db.$queryRawUnsafe<Record<string, string>[]>(GUARDS_SQL.replace(/;\s*$/, '')))[0]!)[0];
    expect(await guards()).toBe(`ok: ${APPEND_ONLY_LOCKED.length} tables append-only`);
    await db.$executeRawUnsafe('ALTER TABLE "WalletEntry" DISABLE TRIGGER "WalletEntry_append_only"');
    await db.$executeRawUnsafe(`GRANT UPDATE ON "OrderEvent" TO ${APP_DB_ROLE}`);
    expect(await guards()).toBe('problem: guard off or app role may change OrderEvent, WalletEntry');
    await db.$executeRawUnsafe('ALTER TABLE "WalletEntry" ENABLE TRIGGER "WalletEntry_append_only"');
    await db.$executeRawUnsafe(`REVOKE UPDATE ON "OrderEvent" FROM ${APP_DB_ROLE}`);
    expect(await guards()).toBe(`ok: ${APPEND_ONLY_LOCKED.length} tables append-only`);
  });
});

// The SQL of app_role_guards, read from the shell script with the role name filled in (so the server's check is the
// one tested here).
const GUARDS_SQL = (() => {
  const sh = readFileSync(fileURLToPath(new URL('../../../infra/deploy/app-role.sh', import.meta.url)), 'utf8');
  const m = /APP_ROLE_GUARDS_SQL="([\s\S]*?)"\n/.exec(sh);
  if (!m) throw new Error('APP_ROLE_GUARDS_SQL not found in infra/deploy/app-role.sh');
  return m[1]!.split('$APP_DB_ROLE').join(APP_DB_ROLE);
})();

function randomUUIDish(): string {
  const h = randomBytes(16).toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-7${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

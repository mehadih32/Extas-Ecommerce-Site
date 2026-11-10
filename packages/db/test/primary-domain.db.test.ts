// S19 · PR 362 follow-up (go-live day) on a real PostgreSQL: setPrimaryDomain creates the mother store's first
// StoreDomain row, updates it on a second call instead of duplicating it, demotes a previously primary hostname of
// the same store, and refuses a hostname already registered to another store or not a plain host name. Needs
// TEST_DATABASE_ADMIN_URL (CI db job, or a local server); skipped without it.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setPrimaryDomain } from '../src/primary-domain';

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL || '';
const CLI = fileURLToPath(new URL('../scripts/prisma.mjs', import.meta.url));

describe.skipIf(!ADMIN_URL)('setPrimaryDomain (PR 362 follow-up)', () => {
  const name = `db_primary_domain_${randomBytes(4).toString('hex')}`;
  const admin = new PrismaClient({ datasourceUrl: ADMIN_URL });
  let db: PrismaClient;
  let otherStoreId = 0;

  beforeAll(async () => {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    const u = new URL(ADMIN_URL);
    u.pathname = `/${name}`;
    const env = { ...process.env, DATABASE_URL: u.toString(), DATABASE_DIRECT_URL: u.toString() };
    const run = spawnSync(process.execPath, [CLI, 'migrate', 'deploy'], { encoding: 'utf8', env });
    if (run.status !== 0) {
      const out = run.stdout + run.stderr;
      throw new Error(`migrate deploy failed:\n${u.password ? out.split(u.password).join('***') : out}`);
    }
    db = new PrismaClient({ datasourceUrl: u.toString() });
    await db.store.create({ data: { slug: 'mother', name: 'Mother store', isPrimary: true, defaultLocale: 'bn-BD', currency: 'BDT', timezone: 'Asia/Dhaka' } });
    otherStoreId = (await db.store.create({ data: { slug: 'other', name: 'Other store', defaultLocale: 'en-GB', currency: 'BDT', timezone: 'Asia/Dhaka' } })).id;
  }, 180_000);

  afterAll(async () => {
    await db?.$disconnect();
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.$disconnect();
  });

  it('creates the row on the mother store, lower-cased and trimmed, then updates (never duplicates) it', async () => {
    const r1 = await setPrimaryDomain(db, 'Extas.com.bd.');
    expect(r1).toEqual({ hostname: 'extas.com.bd', storeId: 1, created: true, demoted: [] });
    const row = await db.storeDomain.findUnique({ where: { hostname: 'extas.com.bd' } });
    expect(row).toMatchObject({ storeId: 1, isPrimaryHost: true, status: 'ACTIVE', archivedAt: null });

    const r2 = await setPrimaryDomain(db, 'extas.com.bd');
    expect(r2).toEqual({ hostname: 'extas.com.bd', storeId: 1, created: false, demoted: [] });
    expect(await db.storeDomain.count({ where: { hostname: 'extas.com.bd' } })).toBe(1);
  });

  it('demotes a previously primary hostname of the same store', async () => {
    await setPrimaryDomain(db, 'old.example.bd');
    const r = await setPrimaryDomain(db, 'new.example.bd');
    expect(r).toEqual({ hostname: 'new.example.bd', storeId: 1, created: true, demoted: ['old.example.bd'] });
    expect(await db.storeDomain.findUnique({ where: { hostname: 'old.example.bd' } })).toMatchObject({ isPrimaryHost: false });
    expect(await db.storeDomain.findUnique({ where: { hostname: 'new.example.bd' } })).toMatchObject({ isPrimaryHost: true });
  });

  it('refuses a hostname already registered to another store, and anything that is not a plain host name', async () => {
    await db.storeDomain.create({ data: { storeId: otherStoreId, hostname: 'taken.example.bd', isPrimaryHost: true, status: 'ACTIVE' } });
    await expect(setPrimaryDomain(db, 'taken.example.bd')).rejects.toThrow('already belongs to another store');
    await expect(setPrimaryDomain(db, 'not a host')).rejects.toThrow('not a plain host name');
    await expect(setPrimaryDomain(db, 'https://extas.com.bd')).rejects.toThrow('not a plain host name');
  });
});

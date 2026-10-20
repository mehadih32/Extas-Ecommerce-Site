// PR 508 — a fresh installation's mother store on a real PostgreSQL. Skipped without TEST_DATABASE_ADMIN_URL.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { registry } from '@extas/settings';
import { applyPackToAllStores, defaultPack, ensureMotherStore, MotherStoreRefused } from '../src';
import { createTestDatabase, HAS_DB, makeStore, type TestDatabase } from './pg';

describe.skipIf(!HAS_DB)('mother store of a fresh installation on PostgreSQL', () => {
  let db: TestDatabase;
  beforeAll(async () => {
    db = await createTestDatabase('mother');
  });
  afterAll(async () => {
    await db?.drop();
  });

  it('makes the mother store once: a draft at MOTHER_STORE_ID, no name, defaults from the registry', async () => {
    expect(await ensureMotherStore(db.prisma)).toEqual({ storeId: MOTHER_STORE_ID, created: true });
    const s = await db.prisma.store.findUniqueOrThrow({ where: { id: MOTHER_STORE_ID } });
    expect(s).toMatchObject({
      slug: defaultPack.motherStore?.slug,
      name: '',
      status: 'DRAFT',
      isPrimary: true,
      defaultLocale: registry['store.locale'].default,
      timezone: registry['store.timeZone'].default,
      currency: registry['store.currency'].default,
    });
    expect(await ensureMotherStore(db.prisma)).toEqual({ storeId: MOTHER_STORE_ID, created: false });
    expect(await db.prisma.store.count()).toBe(1);
  });

  it('then the default pack reaches it, and the next store gets the next id', async () => {
    const reports = await applyPackToAllStores(db.prisma, defaultPack);
    expect(reports.map((r) => r.storeId)).toEqual([MOTHER_STORE_ID]);
    const next = await makeStore(db.prisma, 'second');
    expect(next.id).toBeGreaterThan(MOTHER_STORE_ID);
  });

  it('never guesses when stores exist but none is the mother store', async () => {
    const other = await createTestDatabase('mother_none');
    try {
      await makeStore(other.prisma, 'not-mother');
      await expect(ensureMotherStore(other.prisma)).rejects.toBeInstanceOf(MotherStoreRefused);
      expect(await other.prisma.store.count()).toBe(1);
    } finally {
      await other.drop();
    }
  });
});

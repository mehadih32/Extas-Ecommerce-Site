// The resolver contract on a real PostgreSQL (prisma backend). Skipped without TEST_DATABASE_ADMIN_URL.
import { afterAll, beforeAll, describe } from 'vitest';
import { messages, prismaBackend, registry, syncSettings, type SettingTarget } from '../src';
import { backendContract } from './contract';
import { createTestDatabase, HAS_DB, seedStores, type TestDatabase } from './pg';

describe.skipIf(!HAS_DB)('PostgreSQL', () => {
  let db: TestDatabase;
  let stores: [number, number];

  beforeAll(async () => {
    db = await createTestDatabase('resolver');
    stores = await seedStores(db.prisma);
    await syncSettings(db.prisma, { registry, messages });
  });
  afterAll(async () => {
    await db?.drop();
  });

  backendContract('PostgreSQL', async () => {
    const p = db.prisma;
    // Each test starts from no values and an empty log (throwaway database; definitions stay synced).
    await p.$executeRawUnsafe('DELETE FROM "SettingChange"');
    await p.$executeRawUnsafe('DELETE FROM "StoreSettingValue"');
    await p.$executeRawUnsafe('DELETE FROM "InstallationSettingValue"');
    return {
      backend: prismaBackend(p),
      changes: async () =>
        (await p.settingChange.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })).map((c) => ({
          storeId: c.storeId,
          key: c.key,
          action: c.action as 'SET' | 'RESET_TO_DEFAULT',
          oldValue: c.oldValue,
          newValue: c.newValue,
          reason: c.reason,
          actorId: c.actorId,
        })),
      seedRaw: async (t: SettingTarget, key: string, value: unknown) => {
        if (t.level === 'installation') {
          await p.installationSettingValue.create({ data: { key, value: value as never } });
        } else {
          await p.storeSettingValue.create({ data: { storeId: t.storeId, key, value: value as never } });
        }
      },
      storeId: stores[0],
      otherStoreId: stores[1],
    };
  });
});

// PR 508 — the general default pack on a real PostgreSQL. Skipped without TEST_DATABASE_ADMIN_URL.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyPack, applyPackToAllStores, defaultPack, PACK_TABLES } from '../src';
import { createTestDatabase, fingerprint, HAS_DB, makeStore, type TestDatabase } from './pg';

const TABLES = [...PACK_TABLES, 'DefaultPackApplication'];

describe.skipIf(!HAS_DB)('general default pack on PostgreSQL', () => {
  let db: TestDatabase;
  let storeId: number;

  beforeAll(async () => {
    db = await createTestDatabase('pack');
    storeId = (await makeStore(db.prisma, 'pack-a', { isPrimary: true })).id;
  });
  afterAll(async () => {
    await db?.drop();
  });

  it('first run seeds every row, in the store, and records the pack once', async () => {
    const r = await applyPack(db.prisma, defaultPack, { storeId });
    expect(r).toMatchObject({ status: 'applied', recorded: true, packKey: 'general', version: defaultPack.version });
    expect(r.created).toEqual({
      GarmentType: defaultPack.garmentTypes.length,
      Category: defaultPack.categories.length,
      DeliveryBand: defaultPack.deliveryBands.length,
      NotificationTemplate: defaultPack.notificationTemplates.length,
    });
    for (const t of PACK_TABLES) {
      const delegate = (db.prisma as unknown as Record<string, { count(a: unknown): Promise<number> }>)[t.charAt(0).toLowerCase() + t.slice(1)]!;
      expect(await delegate.count({ where: { NOT: { storeId } } }), t).toBe(0);
    }
    const trousers = await db.prisma.category.findUniqueOrThrow({ where: { storeId_slug: { storeId, slug: 'trousers' } }, include: { garmentType: true } });
    expect(trousers).toMatchObject({ isVisible: false, garmentType: { key: 'trouser' } });
    // Money is never seeded: every band is off and its charge unset.
    const bands = await db.prisma.deliveryBand.findMany({ where: { storeId } });
    expect(bands.every((b) => !b.enabled && b.codLimitMinor === null)).toBe(true);
    expect(await db.prisma.defaultPackApplication.count({ where: { storeId, packKey: 'general' } })).toBe(1);
  });

  it('second run changes nothing at all', async () => {
    const before = await fingerprint(db.prisma, TABLES);
    const r = await applyPack(db.prisma, defaultPack, { storeId });
    expect(r).toMatchObject({ status: 'unchanged', recorded: false });
    expect(Object.values(r.created).every((n) => n === 0)).toBe(true);
    expect(await fingerprint(db.prisma, TABLES)).toBe(before);
  });

  it("never overwrites the owner's edits, and a newer pack version only adds", async () => {
    await db.prisma.category.update({ where: { storeId_slug: { storeId, slug: 'polos' } }, data: { nameEn: 'Polo shirts', isVisible: true } });
    const v2 = {
      ...defaultPack,
      version: defaultPack.version + 1,
      categories: [
        ...defaultPack.categories.map((c) => (c.slug === 'polos' ? { ...c, nameEn: 'Polos (new default)' } : c)),
        { slug: 'boxers', nameEn: 'Boxers', sortOrder: 80, garmentType: 'accessory' },
      ],
    };
    const r = await applyPack(db.prisma, v2, { storeId });
    expect(r).toMatchObject({ status: 'applied', recorded: true, created: { Category: 1, GarmentType: 0 } });
    expect(await db.prisma.category.findUniqueOrThrow({ where: { storeId_slug: { storeId, slug: 'polos' } } })).toMatchObject({
      nameEn: 'Polo shirts',
      isVisible: true,
    });
    expect(await db.prisma.defaultPackApplication.count({ where: { storeId, packKey: 'general' } })).toBe(2);
  });

  it('applies to every store, each with its own rows', async () => {
    const other = (await makeStore(db.prisma, 'pack-b')).id;
    const reports = await applyPackToAllStores(db.prisma, defaultPack);
    expect(reports.map((r) => [r.storeId, r.status])).toEqual([
      [storeId, 'unchanged'],
      [other, 'applied'],
    ]);
    expect(await db.prisma.category.count({ where: { storeId: other } })).toBe(defaultPack.categories.length);
  });

  it('two applications at the same moment never interleave', async () => {
    const third = (await makeStore(db.prisma, 'pack-c')).id;
    const [a, b] = await Promise.all([
      applyPack(db.prisma, defaultPack, { storeId: third }),
      applyPack(db.prisma, defaultPack, { storeId: third }),
    ]);
    expect([a.status, b.status].sort()).toEqual(['applied', 'unchanged']);
    expect(await db.prisma.category.count({ where: { storeId: third } })).toBe(defaultPack.categories.length);
  });

  it('PR 148: an untouched earlier template takes the new words; an edited one is never touched', async () => {
    const store = (await makeStore(db.prisma, 'pack-d')).id;
    const sms = (locale: string) => defaultPack.notificationTemplates.find((t) => t.key === 'order.placed' && t.channel === 'SMS' && t.locale === locale)!;
    // a store from before PR 148: the old words, the English one never edited, the Bengali one edited by the owner
    await db.prisma.notificationTemplate.create({ data: { storeId: store, key: 'order.placed', channel: 'SMS', locale: 'en', name: 'Order placed', body: sms('en').replaces![0]!, enabled: true } });
    await db.prisma.notificationTemplate.create({ data: { storeId: store, key: 'order.placed', channel: 'SMS', locale: 'bn', name: 'Order placed', body: 'নিজের লেখা {orderNumber}', enabled: true } });
    const r = await applyPack(db.prisma, defaultPack, { storeId: store });
    expect(r.updated.NotificationTemplate).toBe(1);
    const rows = await db.prisma.notificationTemplate.findMany({ where: { storeId: store, key: 'order.placed', channel: 'SMS' }, orderBy: { locale: 'asc' } });
    expect(rows.map((x) => [x.locale, x.body])).toEqual([
      ['bn', 'নিজের লেখা {orderNumber}'],
      ['en', sms('en').body],
    ]);
    // and a second run changes nothing
    expect((await applyPack(db.prisma, defaultPack, { storeId: store })).status).toBe('unchanged');
  });
});

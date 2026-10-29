// PR 14 — the sample seed on a real PostgreSQL, run twice: the second run must change nothing. Skipped without
// TEST_DATABASE_ADMIN_URL.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadSchema } from '@extas/db';
import { defaultPack, PACK_TABLES, SAMPLE_TABLES, sampleCatalogue, SampleSeedRefused, seedSample } from '../src';
import { createTestDatabase, fingerprint, HAS_DB, makeStore, type TestDatabase } from './pg';

const TABLES = [...new Set([...SAMPLE_TABLES, ...PACK_TABLES, 'DefaultPackApplication'])];
const schema = loadSchema();

describe.skipIf(!HAS_DB)('sample seed on PostgreSQL', () => {
  let db: TestDatabase;
  let storeId: number;

  beforeAll(async () => {
    db = await createTestDatabase('sample');
  });
  afterAll(async () => {
    await db?.drop();
  });

  it('first run builds the whole sample catalogue in one sample store', async () => {
    const r = await seedSample(db.prisma);
    storeId = r.storeId;
    expect(r).toMatchObject({ status: 'applied', recorded: true, categoriesShown: sampleCatalogue.visibleCategories.length });
    const variants = sampleCatalogue.products.reduce((n, p) => n + p.colours.length * p.sizes.length, 0);
    expect(r.created).toMatchObject({
      Store: 1,
      Category: sampleCatalogue.subCategories.length,
      Product: sampleCatalogue.products.length,
      ProductVariant: variants,
      StockLevel: variants,
      Colour: sampleCatalogue.colours.length,
      Size: sampleCatalogue.sizes.length,
      SizeChart: sampleCatalogue.sizeCharts.length,
      Customer: 1,
      Order: 1,
      OrderItem: sampleCatalogue.order.items.length,
      ProductQuestion: sampleCatalogue.questions?.length ?? 0,
    });
    expect(r.pack.created.Category).toBe(defaultPack.categories.length);

    // PR 425: the sample conversations, the way the support package writes them
    const conversations = sampleCatalogue.support?.conversations ?? [];
    expect(conversations.length).toBeGreaterThan(0);
    expect(r.created).toMatchObject({
      SupportChannel: 1,
      SupportContact: conversations.length,
      Conversation: conversations.length,
      Message: conversations.reduce((n, c) => n + c.messages.length, 0),
    });
    const first = await db.prisma.conversation.findUniqueOrThrow({
      where: { storeId_refCode: { storeId, refCode: conversations[0]!.refCode } },
      include: { messages: { orderBy: { sentAt: 'asc' } }, events: { orderBy: { createdAt: 'asc' } } },
    });
    const customer = await db.prisma.customer.findUniqueOrThrow({ where: { storeId_phone: { storeId, phone: sampleCatalogue.customer.phone } } });
    expect(first).toMatchObject({ status: 'OPEN', customerId: customer.id, lastDirection: 'IN' });
    expect(first.waitingSince?.toISOString()).toBe(conversations[0]!.messages.at(-1)!.at);
    expect(first.messages.find((m) => m.isInternalNote)).toMatchObject({ status: null, direction: 'NOTE' });
    expect(first.messages.find((m) => m.direction === 'OUT')).toMatchObject({ status: 'NOT_SENT', failReason: 'CHANNEL_NOT_CONNECTED' });
    expect(first.events.map((e) => e.kind)).toEqual(['RECEIVED', 'REPLIED', 'STATUS', 'NOTED', 'RECEIVED']);

    // The first store of an installation is the mother store (A4.5).
    expect(await db.prisma.store.findUniqueOrThrow({ where: { id: storeId } })).toMatchObject({ slug: 'sample', isPrimary: true, status: 'LIVE' });
    // Every store-scoped row the seed wrote carries the sample store's id.
    const scoped = TABLES.filter((t) => schema.models.find((m) => m.name === t)?.fields.some((f) => f.name === 'storeId'));
    expect(scoped.length).toBeGreaterThan(15);
    const delegates = db.prisma as unknown as Record<string, { count(a: unknown): Promise<number> }>;
    for (const t of scoped) expect(await delegates[t.charAt(0).toLowerCase() + t.slice(1)]!.count({ where: { NOT: { storeId } } }), t).toBe(0);
  });

  it('the demo order adds up and leaves the delivery charge to the owner', async () => {
    const order = await db.prisma.order.findUniqueOrThrow({
      where: { storeId_number: { storeId, number: sampleCatalogue.order.number } },
      include: { items: true, events: true, customer: true },
    });
    const sum = order.items.reduce((n, i) => n + i.lineTotalMinor, 0);
    expect(order).toMatchObject({ subtotalMinor: sum, totalMinor: sum, deliveryChargeMinor: 0, chargeFixed: false, status: 'PLACED' });
    expect(order.items.every((i) => i.lineTotalMinor === i.unitPriceMinor * i.quantity && i.sku.startsWith('SAMPLE-'))).toBe(true);
    expect(order.events).toHaveLength(1);
    expect(order.customer).toMatchObject({ name: sampleCatalogue.customer.name, phone: sampleCatalogue.customer.phone });
  });

  it('stock and listings follow the demo: sold-out sizes are not in stock', async () => {
    const polo = sampleCatalogue.products.find((p) => p.slug === 'essential-pique-polo')!;
    const sku = `SAMPLE-${polo.code}-NAVY-XXL`;
    const variant = await db.prisma.productVariant.findUniqueOrThrow({ where: { storeId_sku: { storeId, sku } }, include: { stockLevels: true } });
    expect(variant).toMatchObject({ inStock: false, priceMinor: polo.samplePriceMinor });
    expect(variant.stockLevels[0]).toMatchObject({ onHand: 0, available: 0 });
    const listings = await db.prisma.categoryProduct.count({ where: { storeId, isVisible: true } });
    expect(listings).toBe(sampleCatalogue.products.length);
    expect(await db.prisma.category.count({ where: { storeId, isVisible: true } })).toBe(
      sampleCatalogue.visibleCategories.length + sampleCatalogue.subCategories.length,
    );
  });

  it('follow-up 75: the sample sub-category sits under its parent with a product, so the phone menu draws it', async () => {
    expect(sampleCatalogue.subCategories.length).toBeGreaterThan(0);
    for (const c of sampleCatalogue.subCategories) {
      const row = await db.prisma.category.findUniqueOrThrow({
        where: { storeId_slug: { storeId, slug: c.slug } },
        include: { parent: { select: { slug: true, garmentTypeId: true } }, _count: { select: { products: true } } },
      });
      expect(row).toMatchObject({ isVisible: true, parent: { slug: c.parent } });
      expect(row.garmentTypeId).toBe(row.parent!.garmentTypeId);
      expect(row._count.products).toBeGreaterThan(0);
    }
  });

  it('second run changes nothing at all — not one row, not one updatedAt', async () => {
    const before = await fingerprint(db.prisma, TABLES);
    const r = await seedSample(db.prisma);
    expect(r).toMatchObject({ status: 'unchanged', recorded: false, categoriesShown: 0, storeId });
    expect(Object.values(r.created).every((n) => n === 0)).toBe(true);
    expect(r.pack.status).toBe('unchanged');
    expect(await fingerprint(db.prisma, TABLES)).toBe(before);
  });

  it('refuses a store called "sample" that it did not make, and refuses to sit beside a live shop', async () => {
    const other = await createTestDatabase('sample_refuse');
    try {
      await makeStore(other.prisma, 'sample', { isPrimary: true });
      await expect(seedSample(other.prisma)).rejects.toBeInstanceOf(SampleSeedRefused);
      await other.prisma.store.update({ where: { slug: 'sample' }, data: { slug: 'shop', status: 'LIVE' } });
      await expect(seedSample(other.prisma)).rejects.toThrow(/live store/);
      expect(await other.prisma.product.count()).toBe(0);
      // Explicitly allowed beside it (CI, preview): it then is not the mother store.
      const r = await seedSample(other.prisma, { besideLiveStore: true });
      expect(await other.prisma.store.findUniqueOrThrow({ where: { id: r.storeId } })).toMatchObject({ isPrimary: null });
    } finally {
      await other.drop();
    }
  });
});

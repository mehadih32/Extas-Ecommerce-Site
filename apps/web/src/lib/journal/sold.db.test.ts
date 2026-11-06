// S12 · PR 253 — what articles sold on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): per article the
// products in the orders that read it, in its own product block or bought besides, pieces ordered beside delivered
// and their Sales; the best seller first; money hidden without `reports.read`; counting off as shipped. Made-up values.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { soldReport, soldWithoutMoney } from './sold';

describe.skipIf(!HAS_TEST_DB)('Website › Blog & journal › What articles sold on PostgreSQL (PR 253)', () => {
  let t: TestDatabase;
  let resolver: SettingsResolver<typeof registry>;
  const S = MOTHER_STORE_ID;
  const now = new Date('2026-11-06T06:00:00Z');
  const ids: Record<string, string> = {};
  let n = 0;
  const order = async (reads: string[], lines: [string, number, number][], delivered: boolean) => {
    n += 1;
    const total = lines.reduce((s, [, q, each]) => s + q * each, 0);
    const o = await t.prisma.order.create({
      data: { storeId: S, number: `T253-${n}`, source: 'WEBSITE', currency: 'BDT', status: delivered ? 'DELIVERED' : 'PLACED', placedAt: new Date('2026-11-03T05:00:00Z'), deliveredAt: delivered ? new Date('2026-11-05T05:00:00Z') : null, subtotalMinor: total, discountMinor: 0, deliveryChargeMinor: 0, totalMinor: total, paymentMethod: 'COD', idempotencyKey: `t253-${n}` },
    });
    for (const [p, q, each] of lines) await t.prisma.orderItem.create({ data: { storeId: S, orderId: o.id, productId: p, sku: `S-${n}-${q}`, productName: 'Sample', quantity: q, unitPriceMinor: each, lineTotalMinor: q * each } });
    for (const postId of reads) await t.prisma.blogOrderRead.create({ data: { storeId: S, orderId: o.id, postId, readAt: new Date('2026-11-03T04:00:00Z') } });
  };

  beforeAll(async () => {
    t = await createTestDatabase('sold');
    await seedSampleStores(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    resolver = new SettingsResolver(prismaBackend(t.prisma), registry);
    const brand = await t.prisma.brand.findFirstOrThrow({ where: { storeId: S }, select: { id: true } }).catch(() => null);
    const product = async (slug: string, nameEn: string) => (await t.prisma.product.create({ data: { storeId: S, slug, nameEn, nameBn: `${nameEn} (বাংলা)`, ...(brand ? { brandId: brand.id } : {}) } as never })).id;
    ids.polo = await product('blue-polo', 'Blue polo');
    ids.chino = await product('black-chino', 'Black chino');
    const post = async (slug: string, productIds: string[]) => (await t.prisma.blogPost.create({ data: { storeId: S, locale: 'en', slug, title: `Sample ${slug}`, body: 'Sample.', status: 'PUBLISHED', publishedAt: new Date('2026-11-01T00:00:00Z'), productIds } })).id;
    ids.wash = await post('how-to-wash', [ids.polo!]);
    ids.linen = await post('linen-summer', []);
    await order([ids.wash!], [[ids.polo!, 2, 150_000], [ids.chino!, 1, 200_000]], true);
    await order([ids.wash!], [[ids.polo!, 1, 150_000]], false);
    await order([ids.linen!], [[ids.chino!, 1, 200_000]], false);
  });
  afterAll(async () => t?.drop());

  it('each article with its products: own or besides, ordered beside delivered, the best seller first', async () => {
    const r = await soldReport(t.prisma, resolver, now, { days: 30 });
    expect(r.counting).toBe(false);
    expect(r.days).toBe(30);
    expect(r.products).toBe(2);
    expect(r.articles.map((a) => a.title)).toEqual(['Sample how-to-wash', 'Sample linen-summer']);
    const wash = r.articles[0]!;
    expect(wash).toMatchObject({ piecesOrdered: 4, piecesDelivered: 3, salesMinor: 500_000, fromBlock: 3, live: true });
    expect(wash.products.map((p) => [p.name?.en, p.inBlock, p.ordered.pieces, p.sales.pieces, p.sales.valueMinor])).toEqual([
      ['Blue polo', true, 3, 2, 300_000],
      ['Black chino', false, 1, 1, 200_000],
    ]);
    expect(r.articles[1]).toMatchObject({ piecesOrdered: 1, piecesDelivered: 0, salesMinor: 0, fromBlock: 0 });
  });

  it('without the reports permission: pieces only', async () => {
    const r = soldWithoutMoney(await soldReport(t.prisma, resolver, now, { days: 30 }));
    expect(r.articles[0]!.salesMinor).toBe(0);
    expect(r.articles[0]!.products.every((p) => p.sales.valueMinor === 0 && p.ordered.valueMinor === 0)).toBe(true);
    expect(r.articles[0]!.piecesDelivered).toBe(3);
  });
});

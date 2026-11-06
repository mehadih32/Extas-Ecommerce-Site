// S13 · PR 278 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the orders whose kept campaign tags name
// a campaign — placed orders (a draft never), delivered orders and their Sales value; the source matched without case;
// another source, another campaign, an archived order and another store's orders never counted. Made-up values.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { campaignTagFigures } from './campaign-tags';

describe.skipIf(!HAS_TEST_DB)('PR 278 · campaign tag figures on PostgreSQL', () => {
  let t: TestDatabase;
  let S = 0;
  let O = 0;
  let n = 0;

  async function order(o: { status: 'DRAFT' | 'PLACED' | 'DELIVERED'; source: string; campaign: string; total?: number; store?: number; archived?: boolean }) {
    n += 1;
    await t.prisma.order.create({
      data: {
        storeId: o.store ?? S,
        number: `C278-${n}`,
        source: 'WEBSITE',
        currency: 'BDT',
        status: o.status,
        placedAt: new Date('2026-11-01T04:00:00Z'),
        deliveredAt: o.status === 'DELIVERED' ? new Date('2026-11-03T04:00:00Z') : null,
        paymentMethod: 'COD',
        subtotalMinor: o.total ?? 100_000,
        totalMinor: o.total ?? 100_000,
        idempotencyKey: `c278-${n}`,
        utmSource: o.source,
        utmCampaign: o.campaign,
        archivedAt: o.archived ? new Date() : null,
      },
    });
  }

  beforeAll(async () => {
    t = await createTestDatabase('metrics-campaign-tags');
    [S, O] = await seedSampleStores(t.prisma);
    await order({ status: 'DELIVERED', source: 'YouTube', campaign: 'yt-a', total: 150_000 });
    await order({ status: 'DELIVERED', source: 'youtube', campaign: 'yt-a', total: 50_000 });
    await order({ status: 'PLACED', source: 'youtube', campaign: 'yt-a' });
    await order({ status: 'DRAFT', source: 'youtube', campaign: 'yt-a' });
    await order({ status: 'DELIVERED', source: 'youtube', campaign: 'yt-a', archived: true });
    await order({ status: 'DELIVERED', source: 'facebook', campaign: 'yt-a' });
    await order({ status: 'DELIVERED', source: 'youtube', campaign: 'yt-other' });
    await order({ status: 'DELIVERED', source: 'youtube', campaign: 'yt-a', store: O });
  }, 120_000);
  afterAll(async () => t?.drop());

  it('counts placed and delivered orders and the delivered Sales value per tag', async () => {
    const m = await campaignTagFigures(t.prisma, S, 'youtube', ['yt-a', 'yt-none']);
    expect(m.get('yt-a')).toEqual({ orders: 3, delivered: 2, deliveredValueMinor: 200_000 });
    expect(m.has('yt-none')).toBe(false);
    expect(m.has('yt-other')).toBe(false);
  });

  it('reads nothing for no tags', async () => {
    expect((await campaignTagFigures(t.prisma, S, 'youtube', [])).size).toBe(0);
  });
});

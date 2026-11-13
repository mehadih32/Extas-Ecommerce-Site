// S28 · PR 697 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): Marketing › Message campaigns' one list.
// Win-back, group campaigns and e-mail sends of the shop together, newest first, with the channel, the saved segment, the
// numbers, the cost and the delivered orders of the people who got it; a plain SMS with no kind is not a campaign and
// stays out; a channel filter; another shop's sends never show; seeing needs `messages.journey.read`. Made-up values.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM } from '@extas/auth';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { campaignOverview, overviewKind } from './campaign-overview';
import { setUpCustomers, type CustomersFixture } from './testing';

const DAY = 86_400_000;

describe('overviewKind (PR 697)', () => {
  it('names a send by its kind, else an e-mail send; anything else is not a campaign', () => {
    expect(overviewKind('winback', 'SMS')).toBe('winback');
    expect(overviewKind('blast', 'WHATSAPP')).toBe('blast');
    expect(overviewKind(null, 'EMAIL')).toBe('email');
    expect(overviewKind(null, 'SMS')).toBeNull();
    expect(overviewKind('other', 'EMAIL')).toBeNull();
  });
});

describe.skipIf(!HAS_TEST_DB)('Message campaigns list on PostgreSQL (PR 697)', () => {
  let f: CustomersFixture;
  let reader: { actor: { staffUserId: string }; storeId: number };
  let nobody: { actor: { staffUserId: string }; storeId: number };
  const ids: Record<string, string> = {};
  const ago = (d: number) => new Date(f.clock.now.getTime() - d * DAY);

  beforeAll(async () => {
    f = await setUpCustomers('customers-overview');
    const db = f.t.prisma;
    const mk = async (key: string, permissions: string[]) => {
      const role = await createRole(db, SYSTEM, { key, nameEn: key, nameBn: key, permissions });
      const u = await db.staffUser.create({ data: { email: `${key}@example.com`, displayName: key, passwordHash: 'not-a-login' } });
      await db.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: f.S } });
      return { actor: { staffUserId: u.id }, storeId: f.S };
    };
    reader = await mk('ov697-reader', ['messages.journey.read']);
    nobody = await mk('ov697-nobody', ['orders.read']);
    ids.cust = await f.profile({ phone: '+8801700006970', name: 'Sample buyer' });
    ids.seg = (await db.segment.create({ data: { storeId: f.S, name: 'Two orders', definition: { v: 1, all: [{ field: 'ordersMin', value: 2 }] } } })).id;
    const mkB = (name: string, kind: string | null, channel: 'SMS' | 'WHATSAPP' | 'EMAIL', d: number, extra: Record<string, unknown> = {}) =>
      db.broadcast.create({ data: { storeId: f.S, name, kind, channel, status: 'SENT', createdAt: ago(d), updatedAt: ago(d), ...extra } });
    ids.win = (await mkB('Win back', 'winback', 'SMS', 3, { sentCount: 4, failedCount: 1, queuedCount: 5, costMinor: 2000 })).id;
    ids.blast = (await mkB('Eid drop', 'blast', 'WHATSAPP', 2, { segmentId: ids.seg, sentCount: 1, queuedCount: 1, costMinor: 500 })).id;
    await mkB('Newsletter', null, 'EMAIL', 1, { sentCount: 0, queuedCount: 2 });
    await mkB('Plain sms', null, 'SMS', 0, { sentCount: 9 });
    // the blast reached one customer, who ordered afterwards and got it delivered
    await db.notificationLog.create({ data: { storeId: f.S, customerId: ids.cust, broadcastId: ids.blast, channel: 'WHATSAPP', recipient: '+8801700006970', status: 'SENT', dedupeKey: 'ov697-1', step: 'crmCampaign', sentAt: ago(2) } });
    await db.order.create({ data: { storeId: f.S, number: 'OV-1', source: 'WEBSITE', currency: 'BDT', status: 'DELIVERED', placedAt: ago(1), deliveredAt: ago(0), subtotalMinor: 150_000, discountMinor: 0, deliveryChargeMinor: 0, totalMinor: 150_000, paymentMethod: 'COD', customerId: ids.cust, phone: '+8801700006970', idempotencyKey: 'ov697-o1' } });
    f.overrides.set('customers.winback', { enabled: false, perCustomerPerWeek: 1, gapDays: 30, batchSize: 2, resultDays: 14, defaultLapsedDays: 90, stopLine: { bn: 'বন্ধ', en: 'Stop' } });
  });
  afterAll(async () => f?.t.drop());

  it('needs the journey read key', async () => {
    await expect(campaignOverview(f.customersDeps(), nobody)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lists win-back, group campaigns and e-mail sends together, newest first; a plain SMS stays out', async () => {
    const o = await campaignOverview(f.customersDeps(), reader);
    expect(o.rows.map((r) => [r.name, r.kind, r.channel])).toEqual([
      ['Newsletter', 'email', 'EMAIL'],
      ['Eid drop', 'blast', 'WHATSAPP'],
      ['Win back', 'winback', 'SMS'],
    ]);
    expect(o.rows.find((r) => r.name === 'Eid drop')).toMatchObject({ segmentName: 'Two orders', sent: 1, costMinor: 500, orders: 1, deliveredOrders: 1, deliveredValueMinor: 150_000 });
    expect(o.rows.find((r) => r.name === 'Win back')).toMatchObject({ queued: 5, sent: 4, failed: 1, costMinor: 2000, orders: 0 });
    expect(o.totals).toMatchObject({ sends: 3, sent: 5, costMinor: 2500, deliveredOrders: 1, deliveredValueMinor: 150_000 });
    expect(o.salesPerCost).toBe(60);
    expect(o.currency).toBe('BDT');
  });

  it('filters by channel', async () => {
    expect((await campaignOverview(f.customersDeps(), reader, 'SMS')).rows.map((r) => r.name)).toEqual(['Win back']);
    expect((await campaignOverview(f.customersDeps(), reader, 'EMAIL')).rows.map((r) => r.name)).toEqual(['Newsletter']);
    expect((await campaignOverview(f.customersDeps(), reader, 'nope')).rows).toHaveLength(3);
  });
});

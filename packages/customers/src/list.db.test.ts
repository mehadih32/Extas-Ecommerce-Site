// PR 285 on a real PostgreSQL (a throwaway database with the real migrations; skipped without TEST_DATABASE_ADMIN_URL):
// the Customers list — one row per person (a merged profile counted under its survivor, never a row of its own), Sales
// delivered only beside Ordered value, a refusal the shop caused never counted, the owner's views with their counts
// (VIP hidden until the owner's figure), search by name or any number however written, the source filter, the sorts and
// the pages. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { customerList } from './list';
import { mergeCustomers } from './merge';
import { setUpCustomers, type CustomersFixture } from './testing';

// hardcode-ok: made-up test numbers
const N = { a: '+8801700002851', a2: '+8801900002851', b: '+8801700002852', c: '+8801700002853', d: '+8801700002854' };

describe.skipIf(!process.env.TEST_DATABASE_ADMIN_URL)('the Customers list on PostgreSQL (PR 285)', () => {
  let f: CustomersFixture;
  const ids: Record<string, string> = {};
  let n = 0;

  async function order(customerId: string | null, phone: string, status: 'PLACED' | 'DELIVERED' | 'RETURNED', total: number, o: { daysAgo?: number; reason?: string } = {}) {
    n += 1;
    const placed = new Date(f.clock.now.getTime() - (o.daysAgo ?? 1) * 86_400_000);
    const row = await f.t.prisma.order.create({
      data: {
        storeId: f.S,
        number: `L285-${n}`,
        source: 'WEBSITE',
        currency: 'BDT',
        status,
        placedAt: placed,
        deliveredAt: status === 'DELIVERED' ? placed : null,
        subtotalMinor: total,
        discountMinor: 0,
        deliveryChargeMinor: 0,
        totalMinor: total,
        paymentMethod: 'COD',
        customerId,
        phone,
        idempotencyKey: `l285-${n}`,
      },
    });
    if (o.reason) await f.t.prisma.orderEvent.create({ data: { storeId: f.S, orderId: row.id, type: 'order.returned', reasonCode: o.reason, actorType: 'SYSTEM', source: 'system' } });
    return row.id;
  }

  beforeAll(async () => {
    f = await setUpCustomers('customers-list');
    const p = f.t.prisma;
    // the sample store's own customer stays out of these counts (archived profiles are not listed)
    await p.customer.updateMany({ where: { storeId: f.S }, data: { archivedAt: f.clock.now } });
    ids.a = await f.profile({ phone: N.a, name: 'Rahim Uddin', email: 'rahim@example.com' });
    ids.a2 = await f.profile({ phone: N.a2, name: 'Rahim (office)' });
    ids.b = await f.profile({ phone: N.b, name: 'Karim' });
    ids.c = await f.profile({ phone: N.c, name: 'Sumon' });
    ids.d = await f.profile({ phone: N.d, name: 'Abul' });
    await p.customer.update({ where: { id: ids.b! }, data: { firstSource: 'WHATSAPP', smsMarketingConsent: true } });
    await p.customer.updateMany({ where: { id: { in: [ids.a!, ids.c!, ids.d!] } }, data: { firstSource: 'WEBSITE' } });
    // Rahim: two delivered (one on his second profile), one returned "late" (the shop's fault: never counted)
    await order(ids.a!, N.a, 'DELIVERED', 10_000, { daysAgo: 100 });
    await order(ids.a2!, N.a2, 'DELIVERED', 6_000, { daysAgo: 90 });
    await order(ids.a!, N.a, 'RETURNED', 3_000, { daysAgo: 80, reason: 'late' });
    // Karim: one refused at the door (his doing), one open
    await order(ids.b!, N.b, 'RETURNED', 4_000, { daysAgo: 5, reason: 'changedMind' });
    await order(ids.b!, N.b, 'PLACED', 2_000, { daysAgo: 1 });
    // Sumon: one delivered and exchanged
    const so = await order(ids.c!, N.c, 'DELIVERED', 5_000, { daysAgo: 3 });
    await p.exchange.create({ data: { storeId: f.S, orderId: so, customerId: ids.c!, number: 'X285-1', reason: 'size', tier: 1 } });
    await mergeCustomers(f.customersDeps(), f.manager, { survivorId: ids.a, mergedId: ids.a2 });
  });
  afterAll(async () => f?.t.drop());

  const list = (input: Record<string, unknown> = {}, who = f.manager) => customerList(f.customersDeps(), who, input);

  it('one row per person, the merged profile under its survivor, with Sales beside Ordered value', async () => {
    const l = await list();
    expect(l.rows.map((r) => r.id).sort()).toEqual([ids.a, ids.b, ids.c, ids.d].sort());
    const rahim = l.rows.find((r) => r.id === ids.a)!;
    expect(rahim).toMatchObject({ members: 1, orders: 3, orderedMinor: 19_000, delivered: 2, salesMinor: 16_000, exchanges: 0 });
    expect(l.rows.find((r) => r.id === ids.b)).toMatchObject({ orders: 2, delivered: 0, salesMinor: 0, consent: { sms: true, whatsapp: null }, source: 'WHATSAPP' });
    // newest order first; a person with no order last
    expect(l.rows[0]!.id).toBe(ids.b);
    expect(l.rows.at(-1)!.id).toBe(ids.d);
    expect(l.views).not.toContain('vip');
  });

  it('a refusal the shop caused is never counted; the owner\'s list of such reasons decides', async () => {
    // "late" is one of the shipped our-fault reasons (risk.history.ourFaultRefusals): Rahim's return does not count
    const l = await list();
    expect(l.rows.find((r) => r.id === ids.a)!.refused).toBe(0);
    expect(l.rows.find((r) => r.id === ids.b)!.refused).toBe(1);
    f.overrides.set('risk.history', { orders: 200, ourFaultRefusals: [], noAnswerOutcomes: [] });
    expect((await list()).rows.find((r) => r.id === ids.a)!.refused).toBe(1);
    f.overrides.delete('risk.history');
  });

  it('the views and their counts, VIP once the owner types his figure', async () => {
    const l = await list();
    expect(l.counts).toEqual({ all: 4, new: 2, returning: 2, atrisk: 1, refused: 1, exchanged: 1, nooffers: 3 });
    expect((await list({ view: 'atrisk' })).rows.map((r) => r.id)).toEqual([ids.a]);
    expect((await list({ view: 'exchanged' })).rows.map((r) => r.id)).toEqual([ids.c]);
    expect((await list({ view: 'vip' })).query.view).toBe('all');
    f.overrides.set('customers.list', { pageSize: 50, returningMinOrders: 2, atRiskDays: 60, vipMinSalesMinor: 15_000 });
    const v = await list({ view: 'vip' });
    expect(v.views).toContain('vip');
    expect(v.rows.map((r) => r.id)).toEqual([ids.a]);
    f.overrides.delete('customers.list');
  });

  it('search by name, e-mail or any number however written; the source filter; the sorts and pages', async () => {
    expect((await list({ q: 'rahim@' })).rows.map((r) => r.id)).toEqual([ids.a]);
    expect((await list({ q: 'office' })).rows.map((r) => r.id)).toEqual([ids.a]);
    expect((await list({ q: '01900-002851' })).rows.map((r) => r.id)).toEqual([ids.a]);
    expect((await list({ q: '002852' })).rows.map((r) => r.id)).toEqual([ids.b]);
    expect((await list({ q: '12' })).rows).toHaveLength(0);
    expect((await list({ q: '50%_' })).rows).toHaveLength(0);
    expect((await list({ source: 'WHATSAPP' })).rows.map((r) => r.id)).toEqual([ids.b]);
    expect((await list()).sources).toEqual(['WEBSITE', 'WHATSAPP']);
    expect((await list({ sort: 'spend' })).rows[0]!.id).toBe(ids.a);
    expect((await list({ sort: 'name' })).rows.map((r) => r.name)).toEqual(['Abul', 'Karim', 'Rahim Uddin', 'Sumon']);
    f.overrides.set('customers.list', { pageSize: 10, returningMinOrders: 2, atRiskDays: 60, vipMinSalesMinor: null });
    expect((await list({ page: 2 })).rows).toHaveLength(0);
    f.overrides.delete('customers.list');
    await expect(list({ sort: 'phone' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('numbers masked without the full-number key; nobody without customers.read', async () => {
    const l = await list({}, f.viewer);
    expect(l.rows.every((r) => !r.phone || (r.phone.masked && r.phone.dial === null))).toBe(true);
    await expect(list({}, { actor: { staffUserId: f.staffId }, storeId: f.S })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

// PR 294 on a real PostgreSQL (a throwaway database with the real migrations; skipped without TEST_DATABASE_ADMIN_URL):
// who and when to send — off as shipped; the saved segments ranked by recent buyers (delivered at least once) and left
// out when nobody in them can get an offer e-mail; the busiest hours in the store's time zone, kept out of the quiet
// hours; too few orders says so. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bestWindow, outsideQuiet, sendAdvice } from './send-advice';
import { setUpCustomers, type CustomersFixture } from './testing';

// hardcode-ok: made-up test numbers and addresses
const N = { a: '+8801700002941', b: '+8801700002942', c: '+8801700002943', g: '+8801700002949' };
const ON = { enabled: true, lookbackDays: 90, minOrders: 4, windowHours: 1, maxSegments: 3 };
const DHAKA_MS = 6 * 3_600_000;

describe('the window rules (PR 294)', () => {
  it('wraps past midnight, keeps out of the quiet hours, ties go to the earlier hour', () => {
    const h = Array.from({ length: 24 }, () => 0);
    h[23] = 2;
    h[0] = 2;
    h[10] = 3;
    expect(bestWindow(h, 2, null)).toEqual({ from: 23, count: 4 });
    expect(bestWindow(h, 2, { fromHour: 22, toHour: 8 })).toEqual({ from: 9, count: 3 });
    expect(outsideQuiet(21, 2, { fromHour: 22, toHour: 8 })).toBe(false);
    expect(outsideQuiet(12, 3, { fromHour: 13, toHour: 15 })).toBe(false);
    expect(bestWindow(Array.from({ length: 24 }, () => 0), 1, null)).toEqual({ from: 0, count: 0 });
  });
});

describe.skipIf(!process.env.TEST_DATABASE_ADMIN_URL)('who and when to send on PostgreSQL (PR 294)', () => {
  let f: CustomersFixture;
  const ids: Record<string, string> = {};
  let n = 0;
  /** A local Dhaka day and hour, `daysAgo` days back. */
  const at = (daysAgo: number, hour: number) => {
    const local = new Date(f.clock.now.getTime() + DHAKA_MS - daysAgo * 86_400_000);
    local.setUTCHours(hour, 30, 0, 0);
    return new Date(local.getTime() - DHAKA_MS);
  };
  async function order(customerId: string | null, phone: string, status: 'PLACED' | 'DELIVERED', placed: Date) {
    n += 1;
    await f.t.prisma.order.create({
      data: { storeId: f.S, number: `L294-${n}`, source: 'WEBSITE', currency: 'BDT', status, placedAt: placed, deliveredAt: status === 'DELIVERED' ? placed : null, subtotalMinor: 1000, discountMinor: 0, deliveryChargeMinor: 0, totalMinor: 1000, paymentMethod: 'COD', customerId, phone, idempotencyKey: `l294-${n}` },
    });
  }
  const segment = (name: string, ...all: Record<string, string | number | boolean>[]) => f.t.prisma.segment.create({ data: { storeId: f.S, name, definition: { v: 1, all } } });

  beforeAll(async () => {
    f = await setUpCustomers('customers-advice');
    const p = f.t.prisma;
    await p.customer.updateMany({ where: { storeId: f.S }, data: { archivedAt: f.clock.now } });
    await p.order.updateMany({ where: { storeId: f.S }, data: { archivedAt: f.clock.now } });
    ids.a = await f.profile({ phone: N.a, name: 'Recent', email: 'recent@example.com' });
    ids.b = await f.profile({ phone: N.b, name: 'Old', email: 'old@example.com' });
    ids.c = await f.profile({ phone: N.c, name: 'No address' });
    for (const [id, phone] of [[ids.a, N.a], [ids.b, N.b]] as const) await p.consentRecord.create({ data: { storeId: f.S, customerId: id!, phone, channel: 'EMAIL', granted: true, scope: 'MARKETING', source: 'staff' } });
    await order(ids.a!, N.a, 'DELIVERED', at(5, 20));
    await order(ids.b!, N.b, 'DELIVERED', at(200, 20));
    await order(ids.c!, N.c, 'PLACED', at(3, 20));
    await order(null, N.g, 'PLACED', at(5, 20));
    await order(null, N.g, 'PLACED', at(6, 10));
    await segment('Recent', { field: 'lastOrderWithin', value: 30 });
    await segment('Everyone who ordered', { field: 'ordersMin', value: 1 });
    await segment('Old', { field: 'lastOrderOver', value: 100 });
    await segment('Big buyers', { field: 'ordersMin', value: 9 });
    await grant(f, 'messages.journey.read');
  });
  afterAll(async () => f?.t.drop());

  it('off as shipped: no advice; reading needs the e-mail page\'s key', async () => {
    expect(await sendAdvice(f.customersDeps(), f.manager)).toBeNull();
    f.overrides.set('customers.sendAdvice', ON);
    await expect(sendAdvice(f.customersDeps(), f.viewer)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('who: ranked by recent buyers; nobody reachable is left out; nothing while segments are off', async () => {
    const who = f.manager;
    expect((await sendAdvice(f.customersDeps(), who))!.segments).toEqual([]);
    f.overrides.set('customers.segments', { enabled: true, maxSegments: 50, maxConditions: 10, previewShown: 8 });
    const s = (await sendAdvice(f.customersDeps(), who))!;
    // Recent: 2 people (Recent + No address), 1 reachable, 1 buyer; Everyone: 3 people, 2 reachable, 1 buyer; Old: 1, 1, 0
    expect(s.segments.map((x) => [x.name, x.people, x.reachable, x.buyers])).toEqual([
      ['Recent', 2, 1, 1],
      ['Everyone who ordered', 3, 2, 1],
      ['Old', 1, 1, 0],
    ]);
    f.overrides.set('customers.sendAdvice', { ...ON, maxSegments: 1 });
    expect((await sendAdvice(f.customersDeps(), who))!.segments.map((x) => x.name)).toEqual(['Recent']);
  });

  it('when: the busiest hour in Dhaka time and its weekday, out of the quiet hours; too few orders says so', async () => {
    f.overrides.set('customers.sendAdvice', ON);
    const s = (await sendAdvice(f.customersDeps(), f.manager))!;
    // 4 orders in 90 days (the 200-day one is out): three at 20:30, one at 10:30
    expect(s.timing).toMatchObject({ ok: true, orders: 4, fromHour: 20, toHour: 21, inWindow: 3 });
    expect(s.timing).toMatchObject({ weekday: new Date(at(5, 20).getTime() + DHAKA_MS).getUTCDay(), onWeekday: 2 });
    expect(s.quiet).toBeNull();
    expect(s.timeZone).toBe('Asia/Dhaka');
    f.overrides.set('messages.quietHours', { on: true, fromHour: 20, toHour: 8 });
    expect((await sendAdvice(f.customersDeps(), f.manager))!.timing).toMatchObject({ ok: true, fromHour: 10, inWindow: 1 });
    f.overrides.set('customers.sendAdvice', { ...ON, minOrders: 5 });
    expect((await sendAdvice(f.customersDeps(), f.manager))!.timing).toEqual({ ok: false, orders: 4, needed: 5, blocked: false });
    // enough orders, but a 6-hour window cannot fit outside 20:00–16:00 quiet hours
    f.overrides.set('messages.quietHours', { on: true, fromHour: 20, toHour: 16 });
    f.overrides.set('customers.sendAdvice', { ...ON, windowHours: 6 });
    expect((await sendAdvice(f.customersDeps(), f.manager))!.timing).toEqual({ ok: false, orders: 4, needed: 4, blocked: true });
  });
});

/** Gives the fixture's manager one more key (the e-mail page's read key). */
async function grant(f: CustomersFixture, key: string) {
  const { createRole, SYSTEM } = await import('@extas/auth');
  const role = await createRole(f.t.prisma, SYSTEM, { key: `a294-${key.replaceAll('.', '-')}`, nameEn: key, nameBn: key, permissions: [key] });
  await f.t.prisma.staffRoleAssignment.create({ data: { staffUserId: f.manager.actor.staffUserId!, roleId: role.id, storeId: f.S } });
}

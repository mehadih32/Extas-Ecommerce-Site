// PR 296 on a real PostgreSQL (a throwaway database with the real migrations; skipped without TEST_DATABASE_ADMIN_URL):
// rewards and points — off as shipped; a delivered order earns once by the owner's rule, after the exchange window and
// never from before the look-back; an erased customer earns nothing; the customer turns whole blocks into wallet
// credit at the owner's rate, once per key, audited; the Loyalty & wallet figures (SIM-F-032). Every value is a
// made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { balanceOf, loyaltyScreen, pointsFor, pointsOf, redeemableOf, redeemPoints, runPoints } from './rewards';
import { saveCrmSetting } from './settings';
import { setUpCustomers, type CustomersFixture } from './testing';

// hardcode-ok: made-up test numbers
const N = { a: '+8801700002961', b: '+8801700002962', e: '+8801700002969' };
const OFF = { enabled: false, pointsPer100: 0, orderPoints: 0, holdDays: 7, lookbackDays: 30, redeemPoints: 0, redeemMinor: 0, batchSize: 200 };
const ON = { ...OFF, enabled: true, pointsPer100: 5, orderPoints: 10 };
const DAY = 86_400_000;

describe('the rule in numbers (PR 296)', () => {
  it('points per ৳100 of goods, rounded down, plus the fixed points; whole blocks only', () => {
    expect(pointsFor({ pointsPer100: 5, orderPoints: 10 }, 150_000)).toBe(85);
    expect(pointsFor({ pointsPer100: 5, orderPoints: 0 }, 19_999)).toBe(9); // 5 × 199.99 / 100, rounded down
    expect(pointsFor({ pointsPer100: 0, orderPoints: 0 }, 150_000)).toBe(0);
    const r = { ...ON, redeemPoints: 100, redeemMinor: 5_000 };
    expect(redeemableOf(r, 250)).toEqual({ blocks: 2, points: 200, minor: 10_000 });
    expect(redeemableOf(r, 99)).toEqual({ blocks: 0, points: 0, minor: 0 });
    expect(redeemableOf({ ...r, redeemMinor: 0 }, 500)).toEqual({ blocks: 0, points: 0, minor: 0 });
  });
});

describe.skipIf(!process.env.TEST_DATABASE_ADMIN_URL)('rewards and points on PostgreSQL (PR 296)', () => {
  let f: CustomersFixture;
  const ids: Record<string, string> = {};
  let n = 0;
  async function order(customerId: string, phone: string, status: 'DELIVERED' | 'IN_TRANSIT', daysAgo: number, subtotalMinor = 150_000) {
    n += 1;
    const at = new Date(f.clock.now.getTime() - daysAgo * DAY);
    const o = await f.t.prisma.order.create({
      data: { storeId: f.S, number: `L296-${n}`, source: 'WEBSITE', currency: 'BDT', status, placedAt: at, deliveredAt: status === 'DELIVERED' ? at : null, subtotalMinor, discountMinor: 0, deliveryChargeMinor: 12_000, totalMinor: subtotalMinor + 12_000, paymentMethod: 'COD', customerId, phone, idempotencyKey: `l296-${n}` },
    });
    return o.id;
  }

  beforeAll(async () => {
    f = await setUpCustomers('customers-rewards');
    const p = f.t.prisma;
    await p.order.updateMany({ where: { storeId: f.S }, data: { archivedAt: f.clock.now } });
    ids.a = await f.profile({ phone: N.a, name: 'Points Buyer' });
    ids.b = await f.profile({ phone: N.b, name: 'Too Early' });
    ids.e = await f.profile({ phone: N.e, name: 'Erased' });
    ids.o1 = await order(ids.a!, N.a, 'DELIVERED', 10);
    ids.o2 = await order(ids.a!, N.a, 'DELIVERED', 20, 40_000);
    await order(ids.a!, N.a, 'DELIVERED', 40); // before the look-back: never earns
    await order(ids.b!, N.b, 'DELIVERED', 2); // inside the exchange window: not yet
    await order(ids.b!, N.b, 'IN_TRANSIT', 9);
    await order(ids.e!, N.e, 'DELIVERED', 10);
    await p.customer.update({ where: { id: ids.e }, data: { erasedAt: f.clock.now } });
  });
  afterAll(async () => f?.t.drop());

  it('off as shipped: nothing is given, nothing can be turned in', async () => {
    expect(await runPoints(f.customersDeps(), f.S)).toBeNull();
    f.overrides.set('customers.points', { ...OFF, enabled: true });
    expect(await runPoints(f.customersDeps(), f.S)).toBeNull(); // on, but the owner typed no rule
    await expect(redeemPoints(f.customersDeps(), { storeId: f.S, customerId: ids.a! }, { key: 'press-00000001' })).rejects.toMatchObject({ code: 'SWITCHED_OFF' });
    expect(await f.t.prisma.rewardEntry.count({ where: { storeId: f.S } })).toBe(0);
    // the rate is money: the card saves only with settings.write as well
    await expect(saveCrmSetting(f.customersDeps(), f.manager, { key: 'customers.points', value: ON })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('a delivered order earns once, after the exchange window, within the look-back; never for an erased customer', async () => {
    f.overrides.set('customers.points', ON);
    // order 1: ৳1,500 → 75 + 10; order 2: ৳400 → 20 + 10
    expect(await runPoints(f.customersDeps(), f.S)).toEqual({ given: 2, points: 115 });
    expect(await runPoints(f.customersDeps(), f.S)).toEqual({ given: 0, points: 0 });
    expect(await balanceOf(f.t.prisma, f.S, ids.a!)).toBe(115);
    expect(await balanceOf(f.t.prisma, f.S, ids.b!)).toBe(0);
    expect(await balanceOf(f.t.prisma, f.S, ids.e!)).toBe(0);
    const keys = (await f.t.prisma.rewardEntry.findMany({ where: { customerId: ids.a }, select: { idempotencyKey: true } })).map((r) => r.idempotencyKey).sort();
    expect(keys).toEqual([`order:${ids.o1}`, `order:${ids.o2}`].sort());
    // the database refuses a second entry with the same key
    await expect(f.t.prisma.rewardEntry.create({ data: { storeId: f.S, customerId: ids.a!, points: 1, pointsAfter: 116, reason: 'ORDER_DELIVERED', idempotencyKey: `order:${ids.o1}` } })).rejects.toThrow();
    const mine = await pointsOf(f.customersDeps(), f.S, ids.a!);
    expect(mine).toMatchObject({ enabled: true, balance: 115, canRedeem: false, redeemable: { blocks: 0 } });
    expect(mine.entries.map((e) => e.orderNumber).sort()).toEqual(['L296-1', 'L296-2']);
  });

  it('the customer turns whole blocks into wallet credit at the owner\'s rate, once per key, audited', async () => {
    f.overrides.set('customers.points', { ...ON, redeemPoints: 50, redeemMinor: 2_500 });
    // two presses at the same moment with the same key: one turn-in
    const both = await Promise.all([0, 1].map(() => redeemPoints(f.customersDeps(), { storeId: f.S, customerId: ids.a! }, { key: 'press-00000002' })));
    const first = both.find((b) => !b.replay)!;
    expect(first).toMatchObject({ points: 100, creditMinor: 5_000, balance: 15, replay: false });
    expect(both.find((b) => b.replay)).toMatchObject({ points: 100, creditMinor: 5_000, walletEntryId: first.walletEntryId, replay: true });
    await expect(redeemPoints(f.customersDeps(), { storeId: f.S, customerId: ids.a! }, { key: 'press-00000003' })).rejects.toMatchObject({ code: 'NOT_ENOUGH_POINTS' });
    const w = await f.t.prisma.walletAccount.findUnique({ where: { customerId: ids.a! }, select: { balanceMinor: true, entries: { select: { reason: true, amountMinor: true, direction: true } } } });
    expect(w).toEqual({ balanceMinor: 5_000, entries: [{ reason: 'POINTS', amountMinor: 5_000, direction: 'CREDIT' }] });
    const a = await f.t.prisma.auditLog.findFirst({ where: { storeId: f.S, action: 'customer.points.redeem' }, select: { actorType: true, actorId: true, after: true } });
    expect(a).toMatchObject({ actorType: 'CUSTOMER', actorId: ids.a, after: { points: 100, creditMinor: 5_000 } });
    await expect(redeemPoints(f.customersDeps(), { storeId: f.S, customerId: ids.a! }, { key: 'x' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('Loyalty & wallet: the figures; the wallet\'s lines only with payments.view; the card saves with settings.write too', async () => {
    const s = await loyaltyScreen(f.customersDeps(), f.manager);
    expect(s.kpis).toMatchObject({ members: 1, given: 115, redeemed: 100, walletMinor: null, walletLines: null });
    expect(s.walletLines).toBeNull();
    expect(s.canWrite).toBe(false);
    expect(s.pointsLines[0]).toMatchObject({ points: -100, customerName: 'Points Buyer' });
    const { createRole, SYSTEM } = await import('@extas/auth');
    const role = await createRole(f.t.prisma, SYSTEM, { key: 'a296-money', nameEn: 'money', nameBn: 'money', permissions: ['payments.view', 'settings.write'] });
    await f.t.prisma.staffRoleAssignment.create({ data: { staffUserId: f.manager.actor.staffUserId!, roleId: role.id, storeId: f.S } });
    const m = await loyaltyScreen(f.customersDeps(), f.manager);
    expect(m.kpis).toMatchObject({ walletMinor: 5_000, walletLines: 1 });
    expect(m.walletLines).toEqual([expect.objectContaining({ reason: 'POINTS', amountMinor: 5_000, customerName: 'Points Buyer' })]);
    expect(m.canWrite).toBe(true);
  });
});

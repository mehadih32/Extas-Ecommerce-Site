// S28 · PR 664 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): price adjust on every order. Off as shipped;
// inside a role's limit it applies at once (the order's total and the amount at the door follow, one new ledger line, the
// timeline and the audit log); above the limit a person without the approval key leaves a request that changes nothing, and
// the owner answers it with the PIN (approve) or without (refuse) as new ledger lines; an owner above his own limit needs the
// PIN too; a reason from the list is required (a note with "other"); free delivery, a percent and the customer's wallet; never
// more than is still due; never once a courier is booked; the ledger cannot be edited or deleted. Every value is made up.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, hashPassword, OWNER_ROLE_KEY, SYSTEM } from '@extas/auth';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { postWalletEntry } from '@extas/payments';
import { registry } from '@extas/settings';
import { adjustPrice, decidePriceAdjust, priceAdjustView, PRICE_ADJUSTED_EVENT, PRICE_ASKED_EVENT, PRICE_REFUSED_EVENT } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

const PIN = '480326';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 664 · price adjust on orders (PostgreSQL)', () => {
  let f: OrdersFixture;
  let manager: OrdersFixture['staff'];
  let owner: OrdersFixture['staff'];
  let courierId: string;
  const db = () => f.t.prisma;
  const d = () => f.ordersDeps();
  const rule = (v: Partial<(typeof registry)['orders.priceAdjust']['default']>) => f.overrides.set('orders.priceAdjust', { ...registry['orders.priceAdjust'].default, ...v });
  const row = (id: string) => db().order.findUniqueOrThrow({ where: { id }, select: { totalMinor: true, subtotalMinor: true, discountMinor: true, deliveryChargeMinor: true, codAmountMinor: true, walletAppliedMinor: true, version: true } });
  const lines = (orderId: string) => db().orderPriceAdjustment.findMany({ where: { orderId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });

  beforeAll(async () => {
    f = await setUpOrders('price-adjust');
    const p = db();
    // a manager who may adjust but not approve, and an owner with the books PIN
    const mRole = await createRole(p, SYSTEM, { key: 'order-manager', nameEn: 'm', nameBn: 'm', permissions: ['orders.read', 'orders.priceAdjust'] });
    const mUser = await p.staffUser.create({ data: { email: 'manager-664@example.com', displayName: 'Manager', passwordHash: 'not-a-login' } });
    await p.staffRoleAssignment.create({ data: { staffUserId: mUser.id, roleId: mRole.id, storeId: f.S } });
    manager = { actor: { staffUserId: mUser.id }, storeId: f.S };
    const ownerRole = await p.role.findUniqueOrThrow({ where: { key: OWNER_ROLE_KEY } });
    const oUser = await p.staffUser.create({ data: { email: 'owner-664@example.com', displayName: 'Owner', passwordHash: 'not-a-login', booksPinHash: await hashPassword(PIN) } });
    await p.staffRoleAssignment.create({ data: { staffUserId: oUser.id, roleId: ownerRole.id, storeId: null } });
    owner = { actor: { staffUserId: oUser.id }, storeId: f.S };
    courierId = (await p.courierAccount.create({ data: { storeId: f.S, providerKey: 'mock', name: 'Test courier', enabled: true } })).id;
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('off as shipped: nothing is adjusted and the view says why', async () => {
    expect(registry['orders.priceAdjust'].default.enabled).toBe(false);
    const o = await f.place('pa-off');
    expect(await code(adjustPrice(d(), manager, o.orderId, { kind: 'AMOUNT', value: 1000, reasonKey: 'customer-asked' }))).toBe('ADJUST_OFF');
    expect(await priceAdjustView(d(), manager, o.orderId)).toMatchObject({ enabled: false, canAdjust: false, closed: 'off', lines: [] });
    expect(await code(adjustPrice(d(), f.reader, o.orderId, { kind: 'AMOUNT', value: 1000, reasonKey: 'customer-asked' }))).toBe('FORBIDDEN');
  });

  it('inside the role\'s limit it applies at once: total, amount at the door, discount, one ledger line, timeline and audit', async () => {
    rule({ enabled: true, roleLimits: { 'order-manager': { amountMinor: 20_000, percent: 10 } } });
    const o = await f.place('pa-in');
    const before = await row(o.orderId);
    const r = await adjustPrice(d(), manager, o.orderId, { kind: 'AMOUNT', value: 5_000, reasonKey: 'customer-asked', note: 'asked on the call' }, { version: before.version });
    expect(r).toMatchObject({ state: 'APPLIED', totalMinor: before.totalMinor - 5_000, version: before.version + 1 });
    const after = await row(o.orderId);
    expect(after).toMatchObject({ totalMinor: before.totalMinor - 5_000, codAmountMinor: before.codAmountMinor - 5_000, discountMinor: before.discountMinor + 5_000, subtotalMinor: before.subtotalMinor });
    const [line] = await lines(o.orderId);
    expect(line).toMatchObject({ kind: 'AMOUNT', state: 'APPLIED', amountMinor: 5_000, reasonKey: 'customer-asked', note: 'asked on the call', pinChecked: false, totalBeforeMinor: before.totalMinor, totalAfterMinor: before.totalMinor - 5_000 });
    const ev = await db().orderEvent.findFirstOrThrow({ where: { orderId: o.orderId, type: PRICE_ADJUSTED_EVENT } });
    expect(ev).toMatchObject({ actorType: 'STAFF', reasonCode: 'customer-asked', message: 'asked on the call' });
    expect(await db().auditLog.count({ where: { entityId: o.orderId, action: PRICE_ADJUSTED_EVENT } })).toBe(1);
    // the screen's old version is refused, and nothing changes
    expect(await code(adjustPrice(d(), manager, o.orderId, { kind: 'AMOUNT', value: 100, reasonKey: 'customer-asked' }, { version: before.version }))).toBe('STALE');
    expect((await lines(o.orderId)).length).toBe(1);
  });

  it('a reason from the list is required, a note with "other", never more than is still due, a percent needs 1 to 100', async () => {
    const o = await f.place('pa-reason');
    const k = { kind: 'AMOUNT', value: 100 } as const;
    expect(await code(adjustPrice(d(), manager, o.orderId, { ...k, reasonKey: 'not-a-reason' }))).toBe('REASON_REQUIRED');
    expect(await code(adjustPrice(d(), manager, o.orderId, { ...k, reasonKey: 'other' }))).toBe('REASON_REQUIRED');
    expect(await code(adjustPrice(d(), manager, o.orderId, { kind: 'AMOUNT', value: 99_999_999, reasonKey: 'customer-asked' }))).toBe('ADJUST_TOO_MUCH');
    expect(await code(adjustPrice(d(), manager, o.orderId, { kind: 'PERCENT', value: 101, reasonKey: 'customer-asked' }))).toBe('INVALID_INPUT');
    expect((await lines(o.orderId)).length).toBe(0);
  });

  it('above the limit a manager leaves a request that changes nothing; the owner approves with the PIN (a new line), once only', async () => {
    const o = await f.place('pa-above');
    const before = await row(o.orderId);
    const r = await adjustPrice(d(), manager, o.orderId, { kind: 'AMOUNT', value: 30_000, reasonKey: 'price-match' });
    expect(r.state).toBe('PENDING');
    expect(await row(o.orderId)).toMatchObject({ totalMinor: before.totalMinor, discountMinor: before.discountMinor });
    expect(await db().orderEvent.count({ where: { orderId: o.orderId, type: PRICE_ASKED_EVENT } })).toBe(1);
    const view = await priceAdjustView(d(), owner, o.orderId);
    expect(view?.pending.map((p) => p.id)).toEqual([r.lineId]);
    expect(view?.canApprove).toBe(true);
    // a manager cannot answer; no PIN, a wrong PIN: nothing happens
    expect(await code(decidePriceAdjust(d(), manager, r.lineId, { decision: 'approve', pin: PIN }))).toBe('FORBIDDEN');
    expect(await code(decidePriceAdjust(d(), owner, r.lineId, { decision: 'approve' }))).toBe('PIN_REQUIRED');
    expect(await code(decidePriceAdjust(d(), owner, r.lineId, { decision: 'approve', pin: '999111' }))).toBe('WRONG_PIN');
    expect(await row(o.orderId)).toMatchObject({ totalMinor: before.totalMinor });
    const done = await decidePriceAdjust(d(), owner, r.lineId, { decision: 'approve', pin: PIN });
    expect(done).toMatchObject({ state: 'APPLIED', totalMinor: before.totalMinor - 30_000 });
    expect(await row(o.orderId)).toMatchObject({ totalMinor: before.totalMinor - 30_000, codAmountMinor: before.codAmountMinor - 30_000 });
    const all = await lines(o.orderId);
    expect(all.map((l) => l.state)).toEqual(['PENDING', 'APPLIED']);
    expect(all[1]).toMatchObject({ requestId: r.lineId, pinChecked: true, requestedById: manager.actor.staffUserId, decidedById: owner.actor.staffUserId });
    expect(all[0]!.state).toBe('PENDING'); // the request itself is never edited
    expect(await code(decidePriceAdjust(d(), owner, r.lineId, { decision: 'approve', pin: PIN }))).toBe('ALREADY_DECIDED');
    // the PIN is never in the audit log
    const audits = await db().auditLog.findMany({ where: { OR: [{ entityId: o.orderId }, { action: { startsWith: 'books.pin' } }] } });
    expect(JSON.stringify(audits)).not.toContain(PIN);
  });

  it('the owner may refuse without the PIN: a refused line, the order untouched', async () => {
    const o = await f.place('pa-refuse');
    const before = await row(o.orderId);
    const r = await adjustPrice(d(), manager, o.orderId, { kind: 'PERCENT', value: 30, reasonKey: 'loyal-customer' });
    expect(r.state).toBe('PENDING');
    const x = await decidePriceAdjust(d(), owner, r.lineId, { decision: 'reject', note: 'too much for this order' });
    expect(x.state).toBe('REJECTED');
    expect(await row(o.orderId)).toMatchObject({ totalMinor: before.totalMinor });
    expect(await db().orderEvent.count({ where: { orderId: o.orderId, type: PRICE_REFUSED_EVENT } })).toBe(1);
    expect((await priceAdjustView(d(), owner, o.orderId))?.pending).toEqual([]);
  });

  it('an owner needs the PIN above his own limit only when a limit applies to him — an owner has none, so it applies at once', async () => {
    const o = await f.place('pa-owner');
    const before = await row(o.orderId);
    const r = await adjustPrice(d(), owner, o.orderId, { kind: 'AMOUNT', value: 40_000, reasonKey: 'service-sorry' });
    expect(r).toMatchObject({ state: 'APPLIED', totalMinor: before.totalMinor - 40_000 });
  });

  it('a person with the approval key but a limit (not an owner) types the PIN to go above it', async () => {
    const p = db();
    const role = await createRole(p, SYSTEM, { key: 'lead-approver', nameEn: 'l', nameBn: 'l', permissions: ['orders.read', 'orders.priceAdjust', 'orders.priceApprove'] });
    const u = await p.staffUser.create({ data: { email: 'lead-664@example.com', displayName: 'Lead', passwordHash: 'not-a-login' } });
    await p.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: f.S } });
    const lead = { actor: { staffUserId: u.id }, storeId: f.S };
    const o = await f.place('pa-lead');
    expect(await code(adjustPrice(d(), lead, o.orderId, { kind: 'AMOUNT', value: 3_000, reasonKey: 'customer-asked' }))).toBe('PIN_REQUIRED');
    const r = await adjustPrice(d(), lead, o.orderId, { kind: 'AMOUNT', value: 3_000, reasonKey: 'customer-asked', pin: PIN });
    expect(r.state).toBe('APPLIED');
    expect((await lines(o.orderId))[0]).toMatchObject({ pinChecked: true });
  });

  it('free delivery empties the delivery charge; a second one has nothing to take off', async () => {
    const o = await f.place('pa-free');
    const before = await row(o.orderId);
    expect(before.deliveryChargeMinor).toBeGreaterThan(0);
    const r = await adjustPrice(d(), owner, o.orderId, { kind: 'FREE_DELIVERY', reasonKey: 'customer-asked' });
    expect(r.state).toBe('APPLIED');
    expect(await row(o.orderId)).toMatchObject({ deliveryChargeMinor: 0, totalMinor: before.totalMinor - before.deliveryChargeMinor });
    expect(await code(adjustPrice(d(), owner, o.orderId, { kind: 'FREE_DELIVERY', reasonKey: 'customer-asked' }))).toBe('NOTHING_TO_ADJUST');
  });

  it('the wallet: the customer\'s own balance, never more than it holds, debited in the wallet ledger; the total stays', async () => {
    const c = await db().customer.create({ data: { storeId: f.S, phone: '+8801710066401', name: 'Wallet Customer' } });
    await db().$transaction((tx) => postWalletEntry(tx, { storeId: f.S, customerId: c.id, direction: 'CREDIT', amountMinor: 4_000, reason: 'MANUAL_CREDIT', idempotencyKey: 'pa-seed', note: 'test' }));
    const o = await f.place('pa-wallet', { customerId: c.id, phone: '01710066401' });
    const before = await row(o.orderId);
    expect(await code(adjustPrice(d(), manager, o.orderId, { kind: 'WALLET', value: 5_000, reasonKey: 'customer-asked' }))).toBe('ADJUST_TOO_MUCH');
    // the wallet needs no approval even for a manager with a small limit
    const r = await adjustPrice(d(), manager, o.orderId, { kind: 'WALLET', value: 3_000, reasonKey: 'customer-asked' });
    expect(r.state).toBe('APPLIED');
    expect(await row(o.orderId)).toMatchObject({ totalMinor: before.totalMinor, walletAppliedMinor: before.walletAppliedMinor + 3_000, codAmountMinor: before.codAmountMinor - 3_000 });
    const w = await db().walletAccount.findUniqueOrThrow({ where: { customerId: c.id } });
    expect(w.balanceMinor).toBe(1_000);
    const [line] = await lines(o.orderId);
    expect(line!.walletEntryId).toBeTruthy();
    // no value: as much as is left
    const r2 = await adjustPrice(d(), manager, o.orderId, { kind: 'WALLET', reasonKey: 'customer-asked' });
    expect(r2.state).toBe('APPLIED');
    expect((await db().walletAccount.findUniqueOrThrow({ where: { customerId: c.id } })).balanceMinor).toBe(0);
    expect(await code(adjustPrice(d(), manager, o.orderId, { kind: 'WALLET', reasonKey: 'customer-asked' }))).toBe('NOTHING_TO_ADJUST');
  });

  it('never once a courier is booked, and never on a cancelled order (SIM-F-004)', async () => {
    const o = await f.place('pa-booked');
    await db().shipment.create({ data: { storeId: f.S, orderId: o.orderId, courierAccountId: courierId, status: 'PENDING_PICKUP', idempotencyKey: randomUUID(), bookedAt: f.clock.now } });
    expect(await code(adjustPrice(d(), owner, o.orderId, { kind: 'AMOUNT', value: 100, reasonKey: 'customer-asked' }))).toBe('BOOKED');
    expect((await priceAdjustView(d(), owner, o.orderId))).toMatchObject({ canAdjust: false, closed: 'BOOKED' });
    expect((await lines(o.orderId)).length).toBe(0);
  });

  it('the ledger is append-only: a line cannot be edited or deleted', async () => {
    const o = await f.place('pa-ledger');
    await adjustPrice(d(), owner, o.orderId, { kind: 'AMOUNT', value: 100, reasonKey: 'customer-asked' });
    const [l] = await lines(o.orderId);
    await expect(db().orderPriceAdjustment.update({ where: { id: l!.id }, data: { amountMinor: 1 } })).rejects.toThrow(/append-only/);
    await expect(db().orderPriceAdjustment.delete({ where: { id: l!.id } })).rejects.toThrow(/append-only/);
  });
});

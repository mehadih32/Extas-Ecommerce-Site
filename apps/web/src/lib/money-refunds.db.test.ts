// Go-live gate F-041 / F-054 (follow-ups of PR 172, 171) on a real PostgreSQL (orders placed through the real checkout;
// skipped without TEST_DATABASE_ADMIN_URL): a prepaid parcel comes back → its refund waits on Money › Refunds & wallet
// (to approve, asked by the shop itself, the money owed on top) → the owner approves it → a person records the money
// sent with its reference → paid out; the customer sees each step on his own order (and nobody else does). The money
// rules' cards: off as they ship, saved with `settings.write` (audited, a stale card and a bad amount refused), a reader
// may not. Nothing pays out by itself. Every value is a made-up test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { EXCHANGE_USED_NOTE as ACCOUNTS_EXCHANGE_NOTE, orderRefunds } from '@extas/accounts';
import * as pay_ from '@extas/payments';
import { createFirstOwner, defaultSecurityPolicy, hashPassword } from '@extas/auth';
import { confirmOrder, orderStep, systemBy } from '@extas/orders';
import { setUpOrders, type OrdersFixture } from '@extas/orders/testing';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import type { AdminDeps } from './admin-auth';
import { loginHandler } from './admin-api';
import { refundsHandler } from './money-refunds-api';
import { paymentsRoute } from './payments-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const READER_PW = 'another long sentence for the tests';

function call(method: string, path: string, opts: { body?: unknown; cookie?: string; key?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.42' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.key) headers['idempotency-key'] = opts.key;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

describe.skipIf(!HAS_TEST_DB)('Money › Refunds & wallet on PostgreSQL (gate F-041, F-054)', () => {
  let f: OrdersFixture;
  let deps: AdminDeps;
  let owner = '';
  let reader = '';
  const by = systemBy('test');
  const page = async (query = '', cookie = owner) => {
    const res = await refundsHandler(call('GET', `/api/admin/money/refunds${query}`, { cookie }), deps);
    return { status: res.status, body: (await res.json()) as Record<string, any> };
  };
  const put = async (body: unknown, cookie = owner) => {
    const res = await refundsHandler(call('PUT', '/api/admin/money/refunds', { body, cookie }), deps);
    return { status: res.status, body: (await res.json()) as Record<string, any> };
  };
  const pay = async (path: string[], body: unknown, key?: string) => {
    const res = await paymentsRoute(call('POST', `/api/admin/payments/${path.join('/')}`, { body, cookie: owner, key }), deps, path);
    return { status: res.status, body: (await res.json()) as Record<string, any> };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    f = await setUpOrders('money_refunds');
    const db = f.t.prisma;
    await syncSettings(db, { registry, messages });
    await createFirstOwner(db, defaultSecurityPolicy(), { email: 'admin-owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db, resolver: new SettingsResolver(prismaBackend(db), registry), vault: null, now: () => f.clock.now };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'admin-owner@example.com', password: OWNER_PW } }), deps));
    await db.staffUser.update({ where: { email: 'reader@example.com' }, data: { passwordHash: await hashPassword(READER_PW), passwordSetAt: new Date() } });
    reader = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'reader@example.com', password: READER_PW } }), deps));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await f?.t.drop();
  });

  it('a prepaid parcel comes back: its refund waits to be approved, is approved, then recorded as sent; the customer sees each step', async () => {
    const db = f.t.prisma;
    const o = await f.place('rf-rto', { payment: { method: 'mobile', option: 'bkash' }, pay: true });
    const r = { storeId: f.S, orderId: o.orderId };
    await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
    await orderStep(f.ordersDeps(), r, by, 'pack');
    const courier = await db.courierAccount.create({ data: { storeId: f.S, providerKey: 'mock', name: 'Test courier', enabled: true } });
    await db.shipment.create({ data: { storeId: f.S, orderId: o.orderId, courierAccountId: courier.id, status: 'PENDING_PICKUP', idempotencyKey: randomUUID(), bookedAt: f.clock.now } });
    await orderStep(f.ordersDeps(), r, by, 'handover');
    await orderStep(f.ordersDeps(), r, by, 'returned');
    const paid = (await db.order.findUniqueOrThrow({ where: { id: o.orderId } })).paidMinor;
    const customer = { storeId: f.S, number: o.number, customerId: null, visitorId: o.visitorId };
    const accounts = { db, settings: deps.resolver };

    const v = await page();
    expect(v.status).toBe(200);
    expect(v.body.view).toMatchObject({ view: 'approve', counts: { approve: 1, payout: 0, done: 0 }, owed: { totalMinor: paid }, can: { approve: true, execute: true, settings: true } });
    expect(v.body.view.rows).toMatchObject([{ orderId: o.orderId, number: o.number, source: 'RTO', status: 'REQUESTED', amountMinor: paid, askedBy: null }]);
    expect(v.body.cards.walletManual.value).toEqual({ enabled: false, max: '' });
    expect(await orderRefunds(accounts, customer)).toMatchObject([{ amountMinor: paid, toWallet: false, state: 'checking' }]);
    expect(await orderRefunds(accounts, { ...customer, visitorId: randomUUID() })).toBeNull();

    const id = v.body.view.rows[0].id as string;
    // the approval needs its tick; then it waits to be paid out
    expect((await pay(['refunds', id, 'approve'], {})).body).toMatchObject({ ok: false, error: 'CONFIRM_REQUIRED' });
    expect((await pay(['refunds', id, 'approve'], { confirm: true })).body.refund).toMatchObject({ status: 'APPROVED' });
    expect((await page('?view=payout')).body.view.rows).toMatchObject([{ id, status: 'APPROVED', decidedBy: 'Sample owner' }]);
    expect(await orderRefunds(accounts, customer)).toMatchObject([{ state: 'sending' }]);
    // a person sent the money by hand: its reference, once per key
    const key = randomUUID();
    expect((await pay(['refunds', id, 'complete'], { confirm: true }, key)).body).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    expect((await pay(['refunds', id, 'complete'], { confirm: true, reference: 'trx 9ab 001' }, key)).body.refund).toMatchObject({ status: 'COMPLETED', payoutReference: 'TRX9AB001' });
    const done = await page('?view=done');
    expect(done.body.view).toMatchObject({ counts: { approve: 0, payout: 0, done: 1 }, owed: { totalMinor: 0 } });
    expect(done.body.view.rows).toMatchObject([{ id, paidBy: 'Sample owner' }]);
    expect(await orderRefunds(accounts, customer)).toMatchObject([{ state: 'sent' }]);
    expect(await db.payment.findFirstOrThrow({ where: { orderId: o.orderId } })).toMatchObject({ status: 'REFUNDED' });

    // a second parcel comes back; the owner says no, with a reason: the list names him, the customer sees it closed
    const o2 = await f.place('rf-rto-2', { payment: { method: 'mobile', option: 'bkash' }, pay: true });
    const r2 = { storeId: f.S, orderId: o2.orderId };
    await confirmOrder(f.ordersDeps(), f.staff, o2.orderId);
    await orderStep(f.ordersDeps(), r2, by, 'pack');
    await db.shipment.create({ data: { storeId: f.S, orderId: o2.orderId, courierAccountId: courier.id, status: 'PENDING_PICKUP', idempotencyKey: randomUUID(), bookedAt: f.clock.now } });
    await orderStep(f.ordersDeps(), r2, by, 'handover');
    await orderStep(f.ordersDeps(), r2, by, 'returned');
    const id2 = (await page()).body.view.rows[0].id as string;
    expect((await pay(['refunds', id2, 'reject'], { note: 'paid back by hand already' })).body.refund).toMatchObject({ status: 'REJECTED' });
    expect((await page('?view=rejected')).body.view.rows).toMatchObject([{ id: id2, decidedBy: 'Sample owner', decisionNote: 'paid back by hand already' }]);
    expect(await orderRefunds(accounts, { ...customer, number: o2.number, visitorId: o2.visitorId })).toMatchObject([{ state: 'closed' }]);
    // review R3 (M1): a return refund the system closed because a re-ship exchange used its money is not shown to him
    expect(ACCOUNTS_EXCHANGE_NOTE).toBe(pay_.EXCHANGE_USED_NOTE);
    await db.refund.create({ data: { storeId: f.S, orderId: o2.orderId, amountMinor: 100, method: 'original', reason: 'RTO', source: 'RTO', status: 'REJECTED', decidedAt: f.clock.now, decisionNote: `${pay_.EXCHANGE_USED_NOTE} EX-1 (new order #2): 100 of 100 pays for the new parcel`, idempotencyKey: randomUUID() } });
    expect(await orderRefunds(accounts, { ...customer, number: o2.number, visitorId: o2.visitorId })).toMatchObject([{ state: 'closed' }]);
  });

  it('the money rules ship off; saved whole with settings.write, audited; a stale card, a bad amount and a reader are refused', async () => {
    expect((await page('', reader)).status).toBe(403);
    const v = (await page()).body.view;
    expect(v.cards.refunds.value).toEqual({ toWallet: false, afterDelivery: false, afterDeliverySources: { RTO: false, RIDER_OVERCHARGE: true, OUR_MISTAKE: false, OTHER: false }, rtoDeliveryCharge: 'REFUND', rtoAdvance: 'KEEP', fourEyes: false });
    expect(v.cards.apology.value).toMatchObject({ enabled: false, mode: 'PER_ORDER', amount: '', cap: '' });
    expect(v.apology).toMatchObject({ enabled: false, rows: [] });
    const wm = v.cards.walletManual;
    expect((await put({ key: 'walletManual', value: { enabled: true, max: 500 }, version: wm.version }, reader)).status).toBe(403);
    expect((await put({ key: 'walletManual', value: { enabled: true, max: -1 }, version: wm.version })).body).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['max'] });
    expect((await put({ key: 'teleport', value: {}, version: 'x' })).status).toBe(400);
    const saved = await put({ key: 'walletManual', value: { enabled: true, max: 500 }, version: wm.version });
    expect(saved.status).toBe(200);
    expect(saved.body.cards.walletManual.value).toEqual({ enabled: true, max: 500 });
    expect(await deps.resolver.value('payments.wallet.manual', { storeId: f.S })).toEqual({ enabled: true, maxMinor: 50_000 });
    expect((await put({ key: 'walletManual', value: { enabled: false, max: '' }, version: wm.version })).status).toBe(409);
    expect(await f.t.prisma.auditLog.count({ where: { action: 'payments.settings.save', entityId: 'payments.wallet.manual' } })).toBe(1);
    const rc = v.cards.refunds;
    const rules = await put({ key: 'refunds', value: { ...rc.value, fourEyes: true, rtoDeliveryCharge: 'KEEP', rtoAdvance: 'ASK', afterDeliverySources: { RTO: false, RIDER_OVERCHARGE: true, OUR_MISTAKE: true, OTHER: false } }, version: rc.version });
    expect(rules.status).toBe(200);
    expect(await deps.resolver.value('payments.refunds', { storeId: f.S })).toMatchObject({ fourEyes: true, rtoDeliveryCharge: 'KEEP', rtoAdvance: 'ASK', afterDeliverySources: ['RIDER_OVERCHARGE', 'OUR_MISTAKE'] });
  });
});

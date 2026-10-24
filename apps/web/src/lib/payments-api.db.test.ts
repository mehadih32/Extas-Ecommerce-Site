// S07 · PR 165, 166, 170, 171, 172 — the payments admin API end to end on a real PostgreSQL (a throwaway database with the sample catalogue;
// orders placed through the real checkout; skipped without TEST_DATABASE_ADMIN_URL): login, the same-site check and the
// permission; an order's money (due, what the rider collects, the pill, the payment rows); money recorded by staff —
// off until `payments.manual` is on, then needing the Idempotency-Key (a repeat is one payment), and an advance paid in
// full moving the order on through the order service. PR 166: the door outcome, a partial's approval, a courier
// statement with a trap, its line resolved, and the cash in transit. PR 172: a refund asked, approved by the owner and
// paid out by hand with its reference; nothing pays out by itself. PR 173: a pre-order's advance asked within the cap. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, hashPassword } from '@extas/auth';
import { awaitAdvance, staffBy } from '@extas/orders';
import { setUpOrders, type OrdersFixture } from '@extas/orders/testing';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import type { AdminDeps } from './admin-auth';
import { loginHandler } from './admin-api';
import { paymentsRoute } from './payments-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const READER_PW = 'another long sentence for the tests';

function call(method: string, path: string, opts: { body?: unknown; cookie?: string; origin?: string | null; key?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.42' };
  if (opts.origin !== null && method !== 'GET') headers.origin = opts.origin ?? `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.key) headers['idempotency-key'] = opts.key;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

describe.skipIf(!HAS_TEST_DB)('payments admin API on PostgreSQL (S07 · PR 165)', () => {
  let f: OrdersFixture;
  let deps: AdminDeps;
  let owner = '';
  let reader = '';
  const api = async (method: string, path: string[], opts: { body?: unknown; cookie?: string; key?: string; d?: AdminDeps | null; origin?: string; query?: string } = {}) => {
    const res = await paymentsRoute(call(method, `/api/admin/payments/${path.join('/')}${opts.query ?? ''}`, { body: opts.body, cookie: opts.cookie ?? owner, key: opts.key, origin: opts.origin }), opts.d === undefined ? deps : opts.d, path);
    return { status: res.status, body: (await res.json()) as Record<string, any> };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    f = await setUpOrders('payments_api');
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

  it('needs a login, a database, a same-site request and the payments permission; unknown paths are refused', async () => {
    expect(owner).not.toBe('');
    const o = await f.place('pay-api-guard');
    expect((await api('GET', ['orders', o.orderId], { cookie: '' })).status).toBe(401);
    expect((await api('GET', ['orders', o.orderId], { d: null })).status).toBe(503);
    expect((await api('POST', ['orders', o.orderId, 'payments'], { body: {}, origin: 'https://evil.example.test' })).status).toBe(403);
    // an order reader is not a payments reader
    expect(await api('GET', ['orders', o.orderId], { cookie: reader })).toMatchObject({ status: 403, body: { ok: false, error: 'FORBIDDEN' } });
    expect((await api('GET', [])).status).toBe(404);
    expect((await api('GET', ['orders', 'not-a-uuid'])).status).toBe(404);
    expect((await api('GET', ['orders', '00000000-0000-4000-8000-000000000000'])).status).toBe(404);
    expect((await api('PUT', ['orders', o.orderId])).status).toBe(405);
    expect((await api('GET', ['orders', o.orderId, 'payments'])).status).toBe(405);
    expect((await api('POST', ['orders', o.orderId, 'teleport'], { body: {} })).status).toBe(404);
  });

  it("an order's money: COD collects the whole due, a paid order collects nothing (SIM-F-001)", async () => {
    const cod = await f.place('pay-api-cod');
    const m = await api('GET', ['orders', cod.orderId]);
    expect(m.status).toBe(200);
    expect(m.body.money).toMatchObject({ pill: 'COD_TO_COLLECT', paidMinor: 0 });
    expect(m.body.money.codToCollectMinor).toBe(m.body.money.dueMinor);
    expect(m.body.money.dueMinor).toBeGreaterThan(0);

    const paid = await f.place('pay-api-paid', { payment: { method: 'mobile', option: 'bkash' }, pay: true });
    const p = await api('GET', ['orders', paid.orderId]);
    expect(p.body.money).toMatchObject({ pill: 'PAID', dueMinor: 0, codToCollectMinor: 0 });
    expect(p.body.money.payments).toHaveLength(1);
    expect(p.body.money.payments[0]).toMatchObject({ status: 'PAID', moneyStatus: 'PROVISIONAL' });
  });

  it('money recorded by staff: off by default; then once per key, audited, and a paid advance moves the order on', async () => {
    const o = await f.place('pay-api-advance');
    await awaitAdvance(f.ordersDeps(), { storeId: f.S, orderId: o.orderId }, staffBy(f.staff.actor), { requiredMinor: 6_000, level: 'soft' });
    const input = { method: 'BKASH', amountMinor: 6_000, reference: 'TRX API 0001', confirm: true };
    expect(await api('POST', ['orders', o.orderId, 'payments'], { body: input, key: 'pay-api-0001' })).toMatchObject({ status: 422, body: { error: 'MANUAL_OFF' } });

    await deps.resolver.set('payments.manual', { enabled: true, methods: ['BKASH', 'BANK_TRANSFER'] }, storeTarget(f.S));
    expect(await api('POST', ['orders', o.orderId, 'payments'], { body: input })).toMatchObject({ status: 400, body: { error: 'INVALID_INPUT' } });
    const before = (await api('GET', ['orders', o.orderId])).body.money;
    const r = await api('POST', ['orders', o.orderId, 'payments'], { body: input, key: 'pay-api-0001' });
    expect(r.status).toBe(201);
    expect(r.body.result).toMatchObject({ amountMinor: 6_000, dueMinor: before.dueMinor - 6_000, codToCollectMinor: before.dueMinor - 6_000, advanceMet: true, replay: false });
    const again = await api('POST', ['orders', o.orderId, 'payments'], { body: input, key: 'pay-api-0001' });
    expect(again.body.result).toMatchObject({ paymentId: r.body.result.paymentId, replay: true });

    const db = f.t.prisma;
    expect(await db.payment.count({ where: { orderId: o.orderId, provider: 'manual:bkash' } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: 'payment.record', entityId: r.body.result.paymentId } })).toBe(1);
    expect((await db.order.findUniqueOrThrow({ where: { id: o.orderId } })).status).toBe('PLACED');
    const after = (await api('GET', ['orders', o.orderId])).body.money;
    expect(after).toMatchObject({ pill: 'COD_TO_COLLECT', paidMinor: 6_000 });
  });

  it('PR 166: the door, a partial approved, a statement with its reasons, a line resolved and the cash in transit', async () => {
    const db = f.t.prisma;
    const o = await f.place('pay-api-door', { lines: [{ variantId: f.v.skyM }, { variantId: f.v.teeM }] });
    const items = await db.orderItem.findMany({ where: { orderId: o.orderId }, select: { id: true } });
    const courier = await db.courierAccount.create({ data: { storeId: f.S, providerKey: 'mock', name: 'API courier', enabled: true } });
    const ship = await db.shipment.create({
      data: { storeId: f.S, orderId: o.orderId, courierAccountId: courier.id, consignmentId: 'API-CN-1', status: 'PARTIALLY_DELIVERED', codAmountMinor: (await db.order.findUniqueOrThrow({ where: { id: o.orderId } })).codAmountMinor, deliveredAt: f.clock.now, idempotencyKey: 'api-ship-1' },
    });
    const input = { outcome: 'PARTIAL', collectedMinor: 50_000, keptItemIds: [items[0]!.id], shipmentId: ship.id };
    expect(await api('POST', ['orders', o.orderId, 'door'], { body: input, cookie: reader, key: 'api-door-0001' })).toMatchObject({ status: 403 });
    expect((await api('GET', ['orders', o.orderId, 'door'])).status).toBe(405);
    const d = await api('POST', ['orders', o.orderId, 'door'], { body: input, key: 'api-door-0001' });
    expect(d).toMatchObject({ status: 201, body: { result: { state: 'PENDING_APPROVAL', outcome: 'PARTIAL' } } });
    expect((await api('POST', ['door', 'not-a-uuid', 'decide'], { body: {} })).status).toBe(404);
    expect(await api('POST', ['door', d.body.result.id, 'decide'], { body: { decision: 'approve' } })).toMatchObject({ status: 200, body: { result: { state: 'APPROVED' } } });

    const st = await api('POST', ['settlements'], { body: { courierAccountId: courier.id, reference: 'API-STM-1', csv: 'cn,cod,charge,status\nAPI-CN-1,1,0,Delivered\nAPI-CN-404,5,0,Delivered\n' } });
    expect(st.status).toBe(201);
    expect(st.body.settlement.lines.map((l: { reasonCode: string }) => l.reasonCode)).toEqual(['SHORT_PAID', 'UNKNOWN_PARCEL']);
    expect((await api('GET', ['settlements', st.body.settlement.settlementId])).body.settlement.mismatched).toBe(2);
    expect((await api('GET', ['settlements'])).status).toBe(405);
    const line = st.body.settlement.lines[1].id;
    expect(await api('POST', ['settlements', 'lines', line, 'resolve'], { body: { note: 'not our parcel; told the courier' } })).toMatchObject({ status: 200, body: { line: { moneyStatus: 'RECONCILED' } } });
    const pos = await api('GET', ['cod']);
    expect(pos.status).toBe(200);
    expect(pos.body.position.openMismatches).toEqual({ SHORT_PAID: 1 });
    expect((await api('POST', ['cod'], { body: {} })).status).toBe(405);
  });

  it('PR 170 (SIM-F-026): failed and still-waiting online payments are listed for the team (payments.view)', async () => {
    const db = f.t.prisma;
    const o = await f.place('pay-api-issues');
    const at = f.clock.now;
    const row = (n: number, status: 'FAILED' | 'PENDING') => ({ storeId: f.S, orderId: o.orderId, method: 'BKASH' as const, provider: 'bkash', purpose: 'ORDER' as const, status, amountMinor: 1_000, currency: 'BDT', idempotencyKey: `api-issue-${n}`, attempt: n, statusAt: at, ...(status === 'FAILED' ? { failureCode: 'MOCK_FAILURE' } : {}) });
    await db.payment.createMany({ data: [row(1, 'FAILED'), row(2, 'PENDING')] });
    expect((await api('GET', ['issues'], { cookie: reader })).status).toBe(403);
    const failed = await api('GET', ['issues'], { query: '?state=failed' });
    expect(failed.status).toBe(200);
    expect(failed.body.rows.filter((r: { orderId: string }) => r.orderId === o.orderId)).toMatchObject([{ status: 'FAILED', failureCode: 'MOCK_FAILURE', attempt: 1, provider: 'bkash' }]);
    const waiting = await api('GET', ['issues'], { query: '?state=waiting&limit=5' });
    expect(waiting.body.rows.filter((r: { orderId: string }) => r.orderId === o.orderId)).toMatchObject([{ status: 'PENDING', attempt: 2 }]);
    expect((await api('POST', ['issues'], { body: {} })).status).toBe(405);
    expect((await api('GET', ['issues', 'x'])).status).toBe(404);
  });
  it('PR 171: a wallet with its ledger, a credit by hand (off until switched on), a reversal, the apology list and credit', async () => {
    const db = f.t.prisma;
    const c = await db.customer.create({ data: { storeId: f.S, name: 'API wallet customer', phone: '+8801700017100' } }); // hardcode-ok: a made-up test number
    expect((await api('GET', ['wallets', c.id], { cookie: reader })).status).toBe(403);
    expect(await api('GET', ['wallets', c.id])).toMatchObject({ status: 200, body: { wallet: { balanceMinor: 0, ledgerMinor: 0, entries: [] } } });
    expect((await api('GET', ['wallets', '00000000-0000-4000-8000-000000000000'])).status).toBe(404);
    expect((await api('GET', ['wallets', 'nope'])).status).toBe(404);
    const credit = { direction: 'CREDIT', amountMinor: 4_000, note: 'goodwill for a late reply', confirm: true };
    expect(await api('POST', ['wallets', c.id, 'entries'], { body: credit, key: 'api-wallet-0001' })).toMatchObject({ status: 422, body: { error: 'WALLET_OFF' } });
    await deps.resolver.set('payments.wallet.manual', { enabled: true, maxMinor: null }, storeTarget(f.S));
    const r = await api('POST', ['wallets', c.id, 'entries'], { body: credit, key: 'api-wallet-0001' });
    expect(r).toMatchObject({ status: 201, body: { entry: { reason: 'MANUAL_CREDIT', balanceAfterMinor: 4_000, replay: false } } });
    expect((await api('POST', ['wallets', c.id, 'entries'], { body: credit, key: 'api-wallet-0001' })).body.entry).toMatchObject({ entryId: r.body.entry.entryId, replay: true });
    expect((await api('GET', ['wallets', c.id, 'entries'])).status).toBe(405);
    const back = await api('POST', ['wallets', 'entries', r.body.entry.entryId, 'reverse'], { body: { note: 'given to the wrong person', confirm: true } });
    expect(back).toMatchObject({ status: 201, body: { entry: { reason: 'CORRECTION', direction: 'DEBIT', balanceAfterMinor: 0 } } });
    expect((await api('GET', ['wallets', c.id])).body.wallet.entries).toHaveLength(2);
    expect(await api('GET', ['apology'])).toMatchObject({ status: 200, body: { apology: { enabled: false, rows: [] } } });
    const o = await f.place('pay-api-apology');
    await db.order.update({ where: { id: o.orderId }, data: { customerId: c.id } });
    expect(await api('POST', ['orders', o.orderId, 'apology'], { body: { amountMinor: 1_000, confirm: true } })).toMatchObject({ status: 422, body: { error: 'APOLOGY_OFF' } });
    await deps.resolver.set('payments.wallet.apology', { enabled: true, mode: 'PER_ORDER', kind: 'AMOUNT', amountMinor: null, percent: null, capMinor: 2_000, lateAfterHours: 0, to: 'WALLET' }, storeTarget(f.S));
    expect(await api('POST', ['orders', o.orderId, 'apology'], { body: { amountMinor: 1_000, confirm: true } })).toMatchObject({ status: 201, body: { result: { amountMinor: 1_000, balanceAfterMinor: 1_000 } } });
    expect((await api('GET', ['orders', o.orderId, 'apology'])).status).toBe(405);
  });
  it('PR 172: a refund asked with a key, the owner\'s OK with [confirm], paid out by hand with its reference; the list shows what is owed', async () => {
    const paid = await f.place('pay-api-refund', { payment: { method: 'mobile', option: 'bkash' }, pay: true });
    const money = (await api('GET', ['orders', paid.orderId])).body.money;
    const ask = { source: 'OUR_MISTAKE', amountMinor: 5_000, note: 'one piece was out of stock', paymentId: money.payments[0].id };
    expect((await api('POST', ['orders', paid.orderId, 'refunds'], { body: ask, cookie: reader, key: 'api-refund-0001' })).status).toBe(403);
    expect(await api('POST', ['orders', paid.orderId, 'refunds'], { body: ask })).toMatchObject({ status: 400, body: { error: 'INVALID_INPUT' } });
    const r = await api('POST', ['orders', paid.orderId, 'refunds'], { body: ask, key: 'api-refund-0001' });
    expect(r).toMatchObject({ status: 201, body: { refund: { status: 'REQUESTED', amountMinor: 5_000, method: 'original' } } });
    const id = r.body.refund.id as string;
    const owed = await api('GET', ['refunds'], { query: '?state=owed' });
    expect(owed.status).toBe(200);
    expect(owed.body.refunds.owed.requestedMinor).toBeGreaterThanOrEqual(5_000);
    expect(owed.body.refunds.rows.map((x: { id: string }) => x.id)).toContain(id);
    expect(await api('POST', ['refunds', id, 'complete'], { body: { reference: 'BK-API-1', confirm: true }, key: 'api-refund-pay-1' })).toMatchObject({ status: 409, body: { error: 'NOT_PENDING' } });
    expect(await api('POST', ['refunds', id, 'approve'], { body: {} })).toMatchObject({ status: 400, body: { error: 'CONFIRM_REQUIRED' } });
    expect(await api('POST', ['refunds', id, 'approve'], { body: { confirm: true } })).toMatchObject({ status: 200, body: { refund: { status: 'APPROVED' } } });
    expect(await api('POST', ['refunds', id, 'complete'], { body: { reference: 'BK-API-1', confirm: true }, key: 'api-refund-pay-1' })).toMatchObject({ status: 200, body: { refund: { status: 'COMPLETED', payoutReference: 'BK-API-1' } } });
    expect((await f.t.prisma.payment.findUniqueOrThrow({ where: { id: ask.paymentId } })).status).toBe('PARTIALLY_REFUNDED');
    expect((await api('GET', ['refunds', id, 'approve'])).status).toBe(405);
    expect((await api('POST', ['refunds', id, 'teleport'], { body: {} })).status).toBe(404);
    expect((await api('POST', ['refunds', 'nope', 'approve'], { body: {} })).status).toBe(404);
    expect((await api('GET', ['orders', paid.orderId, 'refunds'])).status).toBe(405);
  });
  it('PR 173: a pre-order advance — the quote, off until switched on, then asked within the cap with a key', async () => {
    const o = await f.place('pay-api-advance-173');
    const q = await api('GET', ['orders', o.orderId, 'advance']);
    expect(q).toMatchObject({ status: 200, body: { quote: { enabled: false, blocked: 'PARTIAL_OFF' } } });
    expect((await api('GET', ['orders', o.orderId, 'advance'], { cookie: reader })).status).toBe(403);
    expect(await api('POST', ['orders', o.orderId, 'advance'], { body: { method: 'BKASH', confirm: true }, key: 'api-advance-0001' })).toMatchObject({ status: 422, body: { error: 'PARTIAL_OFF' } });
    await deps.resolver.set('payments.partial', { enabled: true, capPercent: 10, minMinor: null, allowFull: false }, storeTarget(f.S));
    const quote = (await api('GET', ['orders', o.orderId, 'advance'])).body.quote;
    expect(quote).toMatchObject({ enabled: true, blocked: null });
    expect(quote.capMinor).toBe(Math.min(quote.dueMinor, Math.floor(quote.totalMinor / 10)));
    expect(await api('POST', ['orders', o.orderId, 'advance'], { body: { method: 'BKASH', amountMinor: quote.capMinor + 1, confirm: true }, key: 'api-advance-0001' })).toMatchObject({ status: 422, body: { error: 'OVER_CAP', data: { capMinor: quote.capMinor } } });
    const r = await api('POST', ['orders', o.orderId, 'advance'], { body: { method: 'BKASH', confirm: true }, key: 'api-advance-0001' });
    expect(r).toMatchObject({ status: 201, body: { result: { advanceMinor: quote.capMinor, codAfterMinor: quote.dueMinor - quote.capMinor, replay: false } } });
    expect((await api('PUT', ['orders', o.orderId, 'advance'])).status).toBe(405);
  });
});

// S07 · PR 165 — the payments admin API end to end on a real PostgreSQL (a throwaway database with the sample catalogue;
// orders placed through the real checkout; skipped without TEST_DATABASE_ADMIN_URL): login, the same-site check and the
// permission; an order's money (due, what the rider collects, the pill, the payment rows); money recorded by staff —
// off until `payments.manual` is on, then needing the Idempotency-Key (a repeat is one payment), and an advance paid in
// full moving the order on through the order service. Every value is a made-up test value.
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
  const api = async (method: string, path: string[], opts: { body?: unknown; cookie?: string; key?: string; d?: AdminDeps | null; origin?: string } = {}) => {
    const res = await paymentsRoute(call(method, `/api/admin/payments/${path.join('/')}`, { body: opts.body, cookie: opts.cookie ?? owner, key: opts.key, origin: opts.origin }), opts.d === undefined ? deps : opts.d, path);
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
});

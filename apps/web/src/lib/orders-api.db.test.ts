// S05 · PR 138, 144, 145, 147, 153 — the order admin API end to end on a real PostgreSQL (a throwaway database with the
// sample catalogue; orders placed through the real checkout; skipped without TEST_DATABASE_ADMIN_URL): login, the
// same-site check and the permission (a reader may look, not act); the list and one order; a command with the
// Idempotency-Key header (a repeat gets the first answer) and with the screen's version (STALE); an illegal command
// refused with the commands open now; reasons, notes, flags; the duplicate review queue and a decision; the customer's
// own cancel through the account API. PR 563: the call queue. PR 127: "Add to this parcel" through the account API and
// the admin's lines routes. PR 151: the order export as a CSV download. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, hashPassword } from '@extas/auth';
import { linkIdentity, screenOrder } from '@extas/orders';
import { setUpOrders, type OrdersFixture } from '@extas/orders/testing';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import type { AdminDeps } from './admin-auth';
import { loginHandler } from './admin-api';
import { ordersRoute } from './orders-api';
import { accountHandler } from './shop/account-api';
import { BAG_COOKIE } from './shop/bag-model';

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

describe.skipIf(!HAS_TEST_DB)('order admin API on PostgreSQL (S05)', () => {
  let f: OrdersFixture;
  let deps: AdminDeps;
  let owner = '';
  let reader = '';
  const api = async (method: string, path: string[], opts: { body?: unknown; cookie?: string; key?: string; d?: AdminDeps | null } = {}) => {
    const res = await ordersRoute(call(method, `/api/admin/orders/${path.join('/')}`, { body: opts.body, cookie: opts.cookie ?? owner, key: opts.key }), opts.d === undefined ? deps : opts.d, path);
    return { status: res.status, body: (await res.json()) as Record<string, any> };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    f = await setUpOrders('orders_api');
    const db = f.t.prisma;
    await syncSettings(db, { registry, messages });
    await createFirstOwner(db, defaultSecurityPolicy(), { email: 'admin-owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db, resolver: new SettingsResolver(prismaBackend(db), registry), vault: null };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'admin-owner@example.com', password: OWNER_PW } }), deps));
    await db.staffUser.update({ where: { email: 'reader@example.com' }, data: { passwordHash: await hashPassword(READER_PW), passwordSetAt: new Date() } });
    reader = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'reader@example.com', password: READER_PW } }), deps));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await f?.t.drop();
  });

  it('needs a login, a database, a same-site request and the permission; unknown paths and methods are refused', async () => {
    expect(owner).not.toBe('');
    expect(reader).not.toBe('');
    expect((await api('GET', [], { cookie: '' })).status).toBe(401);
    expect((await api('GET', [], { d: null })).status).toBe(503);
    const o = await f.place('api-door');
    const evil = await ordersRoute(call('POST', `/api/admin/orders/${o.orderId}/confirm`, { cookie: owner, origin: 'https://evil.example.test', body: {} }), deps, [o.orderId, 'confirm']);
    expect(evil.status).toBe(403);
    expect((await api('GET', [], { cookie: reader })).status).toBe(200);
    const denied = await api('POST', [o.orderId, 'confirm'], { body: {}, cookie: reader });
    expect(denied).toMatchObject({ status: 403, body: { ok: false, error: 'FORBIDDEN' } });
    expect((await api('PUT', [])).status).toBe(405);
    expect((await api('GET', [o.orderId, 'confirm'])).status).toBe(405);
    expect((await api('GET', ['not-a-uuid'])).status).toBe(404);
    expect((await api('POST', [o.orderId, 'teleport'], { body: {} })).status).toBe(404);
    expect((await ordersRoute(call('GET', '/api/admin/orders?storeId=0', { cookie: owner }), deps, [])).status).toBe(400);
  });

  it('PR 563: the call queue — an order placed over an unclear address waits there, never on hold; a reader may look', async () => {
    const o = await f.place('api-calls', { address: 'Notun Para, Shahid Minar er pashe' });
    const q = await api('GET', ['calls'], { cookie: reader });
    expect(q.status).toBe(200);
    const row = q.body.rows.find((r: { order: { id: string } | null }) => r.order?.id === o.orderId);
    expect(row).toMatchObject({ reason: 'ADDRESS_UNCLEAR', status: 'OPEN', order: { status: 'PLACED', addressUnclear: true, shippingAddressText: 'Notun Para, Shahid Minar er pashe' } });
    expect((await api('POST', ['calls'], { body: {} })).status).toBe(405);
    expect((await api('GET', ['calls', 'x'])).status).toBe(404);
  });

  it('the list, the reasons and one order', async () => {
    const o = await f.place('api-list');
    const list = await api('GET', []);
    expect(list.status).toBe(200);
    expect(list.body.rows.map((r: { id: string }) => r.id)).toContain(o.orderId);
    expect(list.body.counts.new).toBeGreaterThan(0);
    const reasons = await api('GET', ['reasons']);
    expect(reasons.body.reasons.cancel.map((r: { key: string }) => r.key)).toContain('ADVANCE_NOT_PAID');
    const one = await api('GET', [o.orderId]);
    expect(one.body).toMatchObject({ ok: true, order: { id: o.orderId, status: 'PLACED', version: 0 }, allowed: expect.arrayContaining(['confirm', 'cancel']) });
  });

  it('a command: the Idempotency-Key gives the first answer again; an illegal one is refused with the commands open now; STALE', async () => {
    const o = await f.place('api-cmd');
    const key = 'test-confirm-0000000001';
    const a = await api('POST', [o.orderId, 'confirm'], { body: { version: 0 }, key });
    expect(a).toMatchObject({ status: 200, body: { ok: true, result: { status: 'CONFIRMED', version: 1, replay: false } } });
    const b = await api('POST', [o.orderId, 'confirm'], { body: { version: 0 }, key });
    expect(b.body.result).toMatchObject({ status: 'CONFIRMED', version: 1, replay: true });
    const again = await api('POST', [o.orderId, 'confirm'], { body: {} });
    expect(again).toMatchObject({ status: 409, body: { ok: false, error: 'ILLEGAL_TRANSITION', data: { from: 'CONFIRMED' } } });
    expect(again.body.data.allowed).toContain('hold');
    const stale = await api('POST', [o.orderId, 'hold'], { body: { reasonKey: 'customer-wait', version: 0 } });
    expect(stale).toMatchObject({ status: 409, body: { error: 'STALE', data: { version: 1 } } });
    expect((await api('POST', [o.orderId, 'hold'], { body: { reasonKey: 'customer-wait', version: 'x' } })).body.error).toBe('INVALID_INPUT');
    expect((await api('POST', [o.orderId, 'cancel'], { body: { reasonCode: 'BECAUSE' } })).body.error).toBe('REASON_REQUIRED');
    expect((await api('POST', [o.orderId, 'cancel-after-booking'], { body: {} })).body.error).toBe('NOT_BOOKED');
    expect((await api('POST', [o.orderId, 'courier-cancel'], { body: { answer: 'maybe' } })).body.error).toBe('INVALID_INPUT');
    const cancelled = await api('POST', [o.orderId, 'cancel'], { body: { reasonCode: 'OUT_OF_STOCK', version: 1 } });
    expect(cancelled.body.result).toMatchObject({ status: 'CANCELLED', version: 2 });
  });

  it('notes and flags', async () => {
    const o = await f.place('api-notes');
    const n = await api('POST', [o.orderId, 'notes'], { body: { body: 'Wants the parcel after 5' } });
    expect(n).toMatchObject({ status: 201, body: { note: { body: 'Wants the parcel after 5', isInternal: true } } });
    expect((await api('POST', [o.orderId, 'notes'], { body: { body: 'x' }, cookie: reader })).status).toBe(403);
    expect((await api('POST', [o.orderId, 'notes', n.body.note.id, 'archive'], { body: {} })).body.note.archivedAt).not.toBeNull();
    expect((await api('GET', [o.orderId, 'notes'])).body.notes).toHaveLength(0);
    expect((await api('POST', [o.orderId, 'flags'], { body: { flags: ['call-first'] } })).body.result).toMatchObject({ status: 'PLACED', version: 1 });
  });

  it('the duplicate review queue and a decision', async () => {
    const phone = '01700055501';
    await f.place('api-dup-a', { phone });
    const b = await f.place('api-dup-b', { phone });
    const { screenOrder } = await import('@extas/orders');
    const s = await screenOrder(f.ordersDeps(), { storeId: f.S, orderId: b.orderId });
    expect(s.alertId).toEqual(expect.any(String));
    const q = await api('GET', ['reviews']);
    expect(q.body.rows.map((r: { alertId: string }) => r.alertId)).toContain(s.alertId);
    expect((await api('GET', ['reviews'], { cookie: reader })).status).toBe(403);
    expect((await api('POST', [b.orderId, 'confirm'], { body: {} })).body.error).toBe('IN_REVIEW');
    const dec = await api('POST', ['reviews', s.alertId!], { body: { decision: 'approve', note: 'two different gifts' } });
    expect(dec.body.result).toMatchObject({ alertStatus: 'APPROVED' });
    expect((await api('POST', [b.orderId, 'confirm'], { body: {} })).body.result.status).toBe('CONFIRMED');
  });

  it('PR 127: "Add to this parcel" through the account API (his order only) and the admin lines routes', async () => {
    const o = await f.place('api-parcel');
    const shop = (action: string, b: unknown, visitor: string) =>
      accountHandler(
        new Request(`https://${HOST}/api/account/${action}`, { method: 'POST', headers: { host: HOST, origin: `https://${HOST}`, 'content-type': 'application/json', cookie: `${BAG_COOKIE}=${visitor}` }, body: JSON.stringify(b) }),
        { accounts: { db: f.t.prisma, settings: deps.resolver, now: () => f.clock.now }, storeId: f.S, storeName: async () => 'Sample' },
        action,
      );
    // off by default (the resolver reads the registry): the window says why, and an add is refused with it
    expect(await (await shop('parcel', { number: o.number }, o.visitorId)).json()).toMatchObject({ ok: true, open: false, closed: 'OFF', lines: [] });
    const closed = await shop('parcel-add', { number: o.number, variantId: f.v.teeM, lang: 'bn' }, o.visitorId);
    expect(closed.status).toBe(422);
    expect(await closed.json()).toMatchObject({ ok: false, error: 'ADD_ON_CLOSED', closed: 'OFF' });
    expect((await shop('parcel', { number: o.number }, 'test-visitor-someone-else-000')).status).toBe(404);
    // the team adds and takes out a line (orders.lines); a reader may not
    const before = await api('GET', [o.orderId]);
    const add = await api('POST', [o.orderId, 'lines'], { body: { variantId: f.v.teeM, version: before.body.order.version } });
    expect(add).toMatchObject({ status: 200, body: { ok: true, result: { command: 'addLine', status: 'PLACED' } } });
    expect((await api('POST', [o.orderId, 'lines'], { body: { variantId: f.v.linenM }, cookie: reader })).status).toBe(403);
    const one = await api('GET', [o.orderId]);
    const line = one.body.items.find((i: { isAddOn: boolean }) => i.isAddOn);
    expect(line).toMatchObject({ addedVia: 'admin', status: 'ACTIVE' });
    expect(one.body.money.totalMinor).toBe(before.body.money.totalMinor + line.lineTotalMinor);
    const out = await api('POST', [o.orderId, 'lines', line.id, 'remove'], { body: {} });
    expect(out.body.result).toMatchObject({ command: 'removeLine' });
    expect((await api('GET', [o.orderId])).body.money.totalMinor).toBe(before.body.money.totalMinor);
    expect((await api('POST', [o.orderId, 'lines', 'x', 'remove'], { body: {} })).status).toBe(404);
    expect((await api('POST', [o.orderId, 'lines', line.id], { body: {} })).status).toBe(404);
  });

  it("the customer's own cancel through the account API (his browser's order only)", async () => {
    const o = await f.place('api-customer');
    const shop = (action: string, b: unknown, visitor: string) =>
      accountHandler(
        new Request(`https://${HOST}/api/account/${action}`, { method: 'POST', headers: { host: HOST, origin: `https://${HOST}`, 'content-type': 'application/json', cookie: `${BAG_COOKIE}=${visitor}` }, body: JSON.stringify(b) }),
        { accounts: { db: f.t.prisma, settings: deps.resolver, now: () => f.clock.now }, storeId: f.S, storeName: async () => 'Sample' },
        action,
      );
    const other = await shop('cancel', { number: o.number, reasonKey: 'by-mistake' }, 'test-visitor-someone-else-000');
    expect(other.status).toBe(404);
    const state = await shop('cancel-state', { number: o.number }, o.visitorId);
    expect(await state.json()).toMatchObject({ ok: true, mode: 'tap' });
    const r = await shop('cancel', { number: o.number, reasonKey: 'by-mistake', lang: 'bn' }, o.visitorId);
    expect(await r.json()).toMatchObject({ ok: true, outcome: 'cancelled', status: 'CANCELLED' });
    const twice = await shop('cancel', { number: o.number, reasonKey: 'by-mistake' }, o.visitorId);
    expect(twice.status).toBe(422);
  });

  it('PR 151: the export is a CSV download for `orders.export` (a reader may not); GET takes the filters, POST the ticked ids', async () => {
    const o = await f.place('api-export');
    const dl = (method: string, opts: { cookie?: string; body?: unknown; qs?: string } = {}) =>
      ordersRoute(call(method, `/api/admin/orders/export${opts.qs ?? ''}`, { cookie: opts.cookie ?? owner, body: opts.body }), deps, ['export']);
    expect((await dl('GET', { cookie: reader })).status).toBe(403);
    expect((await dl('GET', { cookie: '' })).status).toBe(401);
    const res = await dl('GET', { qs: `?q=${encodeURIComponent(o.number)}` });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="orders-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect([res.headers.get('x-rows'), res.headers.get('x-personal'), res.headers.get('cache-control')]).toEqual(['1', '1', 'no-store']);
    expect(await res.text()).toContain(o.number);
    const ticked = await dl('POST', { body: { ids: [o.orderId] } });
    expect([ticked.status, ticked.headers.get('x-rows')]).toEqual([200, '1']);
    const bad = await dl('POST', { body: { ids: ['nope'] } });
    expect([bad.status, (await bad.json()).error]).toEqual([400, 'INVALID_INPUT']);
    expect((await dl('PUT')).status).toBe(405);
    expect((await ordersRoute(call('GET', '/api/admin/orders/export/x', { cookie: owner }), deps, ['export', 'x'])).status).toBe(404);
  });

  it('S06 · PR 157: the number\'s history beside the order — a reader may look; only GET; an unknown order is not found', async () => {
    const o = await f.place('api-phone-history', { phone: '01700000298' });
    const h = await api('GET', [o.orderId, 'phone-history'], { cookie: reader });
    expect(h).toMatchObject({ status: 200, body: { ok: true, history: { phone: '01700-000298', summary: { orders: 0 }, recent: [] } } });
    expect((await api('POST', [o.orderId, 'phone-history'], { body: {} })).status).toBe(405);
    expect((await api('GET', [o.orderId, 'phone-history', 'x'])).status).toBe(404);
    expect((await api('GET', ['01a16af2-30f0-7462-aab8-719bb3ce5998', 'phone-history'])).status).toBe(404);
  });

  it('S06 · PR 160: the risk panel (orders.risk.read) and "score again" (orders.risk.decide)', async () => {
    const o = await f.place('api-risk', { phone: '01700000299' });
    // off by default: nothing scored, "score again" says so
    let risk = await api('GET', [o.orderId, 'risk']);
    expect(risk).toMatchObject({ status: 200, body: { ok: true, risk: { enabled: false, current: null, canRescore: false } } });
    expect(await api('POST', [o.orderId, 'risk', 'assess'], { body: {} })).toMatchObject({ status: 422, body: { error: 'RISK_OFF' } });
    expect((await api('GET', [o.orderId, 'risk'], { cookie: reader })).status).toBe(403);
    // the owner switches the score on (here: a reader of the settings that says so)
    const on = Object.create(deps.resolver) as AdminDeps['resolver'];
    on.value = ((key: string, opts?: { storeId?: number }) => (key === 'risk.score' ? Promise.resolve({ ...registry['risk.score'].default, enabled: true }) : deps.resolver.value(key as never, opts))) as never;
    const d = { ...deps, resolver: on };
    const scored = await api('POST', [o.orderId, 'risk', 'assess'], { body: {}, d });
    expect(scored).toMatchObject({ status: 200, body: { result: { score: expect.any(Number), command: { command: 'riskAssess', status: 'PLACED' } } } });
    risk = await api('GET', [o.orderId, 'risk'], { d });
    expect(risk.body.risk).toMatchObject({ enabled: true, canRescore: true, current: { after: 'manual', fired: expect.arrayContaining([{ key: 'newPhone', weight: 10, values: {} }]) } });
    expect((await api('GET', [o.orderId, 'risk', 'x'])).status).toBe(404);
    expect((await api('POST', [o.orderId, 'risk'], { body: {} })).status).toBe(405);
    expect((await api('GET', ['01a16af2-30f0-7462-aab8-719bb3ce5999', 'risk'])).status).toBe(404);
  });

  it("S06 · PR 519: the order's identity (orders.risk.read) — off by default it says so; on, the same person's other order", async () => {
    const a = await f.place('api-identity-a', { phone: '01700000519' });
    const off = await api('GET', [a.orderId, 'identity']);
    expect(off).toMatchObject({ status: 200, body: { ok: true, identity: { enabled: false, clusterId: null, orders: [] } } });
    expect((await api('GET', [a.orderId, 'identity'], { cookie: reader })).status).toBe(403);
    const on = Object.create(deps.resolver) as AdminDeps['resolver'];
    on.value = ((key: string, opts?: { storeId?: number }) => (key === 'risk.identity' ? Promise.resolve({ ...registry['risk.identity'].default, enabled: true }) : deps.resolver.value(key as never, opts))) as never;
    const d = { ...deps, resolver: on };
    const b = await f.place('api-identity-b', { phone: '01700000519' });
    await linkIdentity({ db: deps.db, settings: on }, { storeId: f.S, orderId: b.orderId });
    const seen = await api('GET', [b.orderId, 'identity'], { d });
    // the same phone (and, in this file, the same test name and address as the other test orders)
    expect(seen.body.identity).toMatchObject({ enabled: true, clusterId: expect.any(String), orders: expect.arrayContaining([expect.objectContaining({ id: a.orderId, via: expect.arrayContaining(['phone']) })]) });
    expect((await api('POST', [a.orderId, 'identity'], { body: {} })).status).toBe(405);
    expect((await api('GET', [a.orderId, 'identity', 'x'])).status).toBe(404);
    expect((await api('GET', ['01a16af2-30f0-7462-aab8-719bb3ce5519', 'identity'])).status).toBe(404);
  });

  it('S06 · PR 521: one alert explained (orders.risk.read) — why, the matched order, his history, the options', async () => {
    const a = await f.place('api-alert-a', { phone: '01700000521' });
    const b = await f.place('api-alert-b', { phone: '01700000521' });
    const r = await screenOrder({ db: deps.db, settings: deps.resolver }, { storeId: f.S, orderId: b.orderId });
    const got = await api('GET', ['reviews', r.alertId!]);
    expect(got).toMatchObject({ status: 200, body: { ok: true, summary: { kind: 'duplicate', status: 'OPEN', severity: 'high', proposed: 'approve', matches: [expect.objectContaining({ orderId: a.orderId, number: a.number })], options: expect.arrayContaining(['approve', 'decline', 'merge']) } } });
    expect(got.body.summary.history.phone.orders).toBeGreaterThanOrEqual(1);
    expect((await api('GET', ['reviews', r.alertId!], { cookie: reader })).status).toBe(403);
    expect((await api('GET', ['reviews', '01a16af2-30f0-7462-aab8-719bb3ce5521'])).status).toBe(404);
    expect((await api('PUT', ['reviews', r.alertId!], { body: {} })).status).toBe(405);
  });

  it('S06 · PR 542: "Request advance" and "Send again" (orders.advance.request) — the order waits, the pay link comes back', async () => {
    const o = await f.place('api-advance', { phone: '01700000542' });
    const one = await api('GET', [o.orderId]);
    const version = one.body.order?.version ?? one.body.detail?.order?.version;
    expect((await api('POST', [o.orderId, 'advance', 'request'], { body: { kind: 'full', channels: ['SMS'] }, cookie: reader })).status).toBe(403);
    expect(await api('POST', [o.orderId, 'advance', 'request'], { body: { kind: 'full', channels: [] } })).toMatchObject({ status: 422, body: { error: 'NO_CHANNEL' } });
    const r = await api('POST', [o.orderId, 'advance', 'request'], { body: { kind: 'full', channels: ['SMS', 'CALL'], ...(typeof version === 'number' ? { version } : {}) }, key: 'api-advance-request-1' });
    expect(r).toMatchObject({ status: 200, body: { ok: true, result: { command: 'awaitAdvance', status: 'AWAITING_ADVANCE' }, link: { path: expect.stringMatching(/^\/pay\/[A-Za-z0-9_-]{24}$/), channels: ['SMS', 'CALL'] } } });
    expect(r.body.link.callTaskId).toBeTruthy();
    const again = await api('POST', [o.orderId, 'advance', 'resend'], { body: { channels: ['WHATSAPP'] } });
    expect(again).toMatchObject({ status: 200, body: { result: { command: 'advanceResend', status: 'AWAITING_ADVANCE' }, link: { path: r.body.link.path } } });
    expect((await api('POST', [o.orderId, 'advance', 'teleport'], { body: {} })).status).toBe(404);
    expect((await api('POST', [o.orderId, 'advance'], { body: {} })).status).toBe(404);
  });

  it('PR 610: the ERP part of an order — in v5 there is none; a short line is refused; paths and methods checked', async () => {
    const o = await f.place('api-erp');
    expect(await api('GET', [o.orderId, 'erp'], { cookie: reader })).toMatchObject({ status: 200, body: { ok: true, erp: null } });
    expect((await api('POST', [o.orderId, 'erp'], { body: {} })).status).toBe(405);
    expect((await api('GET', [o.orderId, 'erp', 'lines', 'X-1'])).status).toBe(405);
    expect((await api('POST', [o.orderId, 'erp', 'teleport'], { body: {} })).status).toBe(404);
    expect((await api('POST', [o.orderId, 'erp', 'lines'], { body: {} })).status).toBe(404);
    // a reader may not decide a line
    expect((await api('POST', [o.orderId, 'erp', 'lines', 'X-1'], { body: { action: 'WAIT' }, cookie: reader })).status).toBe(403);
    // the owner may, but a v5 store has no ERP lines
    expect(await api('POST', [o.orderId, 'erp', 'lines', 'X-1'], { body: { action: 'WAIT' } })).toMatchObject({ body: { ok: false, error: 'CONFLICT' } });
    expect(await api('POST', [o.orderId, 'erp', 'lines', 'X-1'], { body: { action: 'CANCEL' } })).toMatchObject({ body: { ok: false, error: 'INVALID_INPUT' } });
  });
});

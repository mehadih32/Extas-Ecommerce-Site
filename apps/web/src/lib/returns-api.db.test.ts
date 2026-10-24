// S08 · PR 185 — the returns and exchanges admin API end to end on a real PostgreSQL (a throwaway database with the
// sample catalogue; skipped without TEST_DATABASE_ADMIN_URL): login, the same-site check and the permission (a person
// with only orders.read may not look); an order's exchange choices, opening one with the Idempotency-Key header (a
// repeat gets the same exchange), the board, one case, approving it with the screen's version (an older version is
// STALE) into the linked exchange order; PR 188's size switch. Every value is a made-up test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, hashPassword } from '@extas/auth';
import { confirmOrder, orderStep, systemBy } from '@extas/orders';
import { setUpOrders, type OrdersFixture } from '@extas/orders/testing';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import type { AdminDeps } from './admin-auth';
import { loginHandler } from './admin-api';
import { returnsRoute } from './returns-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const READER_PW = 'another long sentence for the tests';

function call(method: string, path: string, opts: { body?: unknown; cookie?: string; origin?: string | null; key?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.43' };
  if (opts.origin !== null && method !== 'GET') headers.origin = opts.origin ?? `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.key) headers['idempotency-key'] = opts.key;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

describe.skipIf(!HAS_TEST_DB)('returns admin API on PostgreSQL (S08)', () => {
  let f: OrdersFixture;
  let deps: AdminDeps;
  let owner = '';
  let reader = '';
  const api = async (method: string, path: string, opts: { body?: unknown; cookie?: string; key?: string; origin?: string; d?: AdminDeps | null } = {}) => {
    const [p, qs] = path.split('?');
    const parts = (p ?? '').split('/').filter(Boolean);
    const res = await returnsRoute(call(method, `/api/admin/returns/${parts.join('/')}${qs ? `?${qs}` : ''}`, { body: opts.body, cookie: opts.cookie ?? owner, key: opts.key, origin: opts.origin }), opts.d === undefined ? deps : opts.d, parts);
    return { status: res.status, body: (await res.json()) as Record<string, any> };
  };

  async function delivered(name: string) {
    const o = await f.place(name);
    const by = systemBy('test');
    const r = { storeId: f.S, orderId: o.orderId };
    const db = f.t.prisma;
    const courier = await db.courierAccount.create({ data: { storeId: f.S, providerKey: 'mock', name: `Courier ${name}`, enabled: true } });
    await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
    await orderStep(f.ordersDeps(), r, by, 'pack');
    await db.shipment.create({ data: { storeId: f.S, orderId: o.orderId, courierAccountId: courier.id, status: 'PENDING_PICKUP', idempotencyKey: randomUUID(), bookedAt: f.clock.now } });
    await orderStep(f.ordersDeps(), r, by, 'handover');
    await orderStep(f.ordersDeps(), r, by, 'delivered');
    return o;
  }

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    f = await setUpOrders('returns_api');
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

  it('needs a login, a database, a same-site request and returns.view; unknown paths and methods are refused', async () => {
    expect(owner).not.toBe('');
    expect((await api('GET', '', { cookie: '' })).status).toBe(401);
    expect((await api('GET', '', { d: null })).status).toBe(503);
    expect((await api('GET', '', { cookie: reader })).body).toMatchObject({ ok: false, error: 'FORBIDDEN' });
    expect((await api('GET', '')).body).toMatchObject({ ok: true, exchanges: [] });
    expect((await api('POST', '', { body: {} })).status).toBe(405);
    expect((await api('GET', 'exchanges/not-a-uuid')).status).toBe(404);
    expect((await api('GET', `exchanges/${randomUUID()}/approve`)).status).toBe(405);
    expect((await api('POST', `exchanges/${randomUUID()}/teleport`, { body: {} })).status).toBe(404);
    expect((await api('POST', `orders/${randomUUID()}/exchange`, { body: {}, origin: 'https://evil.example.test' })).status).toBe(403);
  });

  it('choices, opening with an idempotency key, the board, one case and approving with the version', async () => {
    const o = await delivered('api-ex');
    const line = await f.t.prisma.orderItem.findFirstOrThrow({ where: { orderId: o.orderId } });
    const ch = await api('GET', `orders/${o.orderId}/choices?orderItemId=${line.id}&reason=size&sizeKey=l`);
    expect(ch.status).toBe(200);
    expect(ch.body.choices).toMatchObject({ closed: null, tier: 1 });
    const pick = ch.body.choices.options[0];
    const key = `api-${randomUUID()}`;
    const body = { reason: 'size', items: [{ orderItemId: line.id, newVariantId: pick.variantId }] };
    const opened = await api('POST', `orders/${o.orderId}/exchange`, { body, key });
    expect(opened.status).toBe(201);
    const again = await api('POST', `orders/${o.orderId}/exchange`, { body, key });
    expect(again.body.exchange).toMatchObject({ exchangeId: opened.body.exchange.exchangeId, replay: true });
    const id = opened.body.exchange.exchangeId as string;

    const board = await api('GET', '?status=REQUESTED');
    expect(board.body.exchanges.map((x: { id: string }) => x.id)).toContain(id);
    const one = await api('GET', `exchanges/${id}`);
    expect(one.body.exchange).toMatchObject({ id, status: 'REQUESTED', orderId: o.orderId });

    // PR 188: the size switcher — the other sizes of the piece, then a switch back to the same price with the version
    const sizes = (await api('GET', `exchanges/${id}/sizes`)).body.sizes;
    expect(sizes[0]).toMatchObject({ exchangeItemId: one.body.exchange.items[0].id, newVariantId: pick.variantId });
    const other = sizes[0].sizes.find((s: { current: boolean; samePrice: boolean; sellable: number }) => !s.current && s.samePrice && s.sellable > 0);
    expect((await api('POST', `exchanges/${id}/switch`, { body: { exchangeItemId: one.body.exchange.items[0].id, newVariantId: pick.variantId } })).body).toMatchObject({ ok: false, error: 'NOTHING_CHANGED' });
    expect((await api('POST', `exchanges/${id}/switch`, { cookie: reader, body: { exchangeItemId: one.body.exchange.items[0].id, newVariantId: other.variantId } })).body).toMatchObject({ ok: false, error: 'FORBIDDEN' });
    const sw = await api('POST', `exchanges/${id}/switch`, { body: { exchangeItemId: one.body.exchange.items[0].id, newVariantId: other.variantId, version: one.body.exchange.version } });
    expect(sw.body).toMatchObject({ ok: true, result: { to: { variantId: other.variantId }, newOrderId: null } });
    one.body.exchange.version += 1;
    const stale = await api('POST', `exchanges/${id}/approve`, { body: { version: one.body.exchange.version + 5 } });
    expect(stale).toMatchObject({ status: 409, body: { ok: false, error: 'STALE' } });
    expect((await api('POST', `exchanges/${id}/approve`, { body: { version: 'x' } })).body).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    const ok = await api('POST', `exchanges/${id}/approve`, { body: { version: one.body.exchange.version } });
    expect(ok.status).toBe(200);
    expect(ok.body.result).toMatchObject({ exchangeId: id });
    const order = await f.t.prisma.order.findUniqueOrThrow({ where: { id: ok.body.result.newOrderId } });
    expect(order.flags).toContain('EXCHANGE');
    expect((await api('POST', `exchanges/${id}/refuse`, { body: { note: 'too late' } })).body).toMatchObject({ ok: false, error: 'EXCHANGE_STATE' });

    // PR 187: the old piece's parcel — found, received, checked in one save; then the exchange is completed
    const retId = ok.body.result.returnId as string;
    expect((await api('GET', 'parcels', { cookie: reader })).body).toMatchObject({ ok: false, error: 'FORBIDDEN' });
    const parcels = await api('GET', `parcels?status=EXPECTED&order=${o.number}`);
    expect(parcels.body.parcels.map((p: { id: string }) => p.id)).toEqual([retId]);
    const parcel = (await api('GET', `parcels/${retId}`)).body.parcel;
    expect(parcel).toMatchObject({ status: 'EXPECTED', kind: 'EXCHANGE_PICKUP', items: [{ expectedSku: line.sku }] });
    expect((await api('POST', `parcels/${retId}/receive`, { body: { version: parcel.version } })).body).toMatchObject({ ok: true, result: { status: 'RECEIVED' } });
    const wrong = await api('POST', `parcels/${retId}/qc`, { body: { items: [{ returnItemId: parcel.items[0].id, scannedSku: pick.sku, disposition: 'SELLABLE' }] } });
    expect(wrong).toMatchObject({ status: 422, body: { ok: false, error: 'SKU_MISMATCH' } });
    const qc = await api('POST', `parcels/${retId}/qc`, { body: { items: [{ returnItemId: parcel.items[0].id, scannedSku: line.sku, disposition: 'SELLABLE' }] } });
    expect(qc.body).toMatchObject({ ok: true, result: { status: 'QC_DONE', exchangeStatus: 'QC_PASSED' } });
    expect((await api('POST', `parcels/${retId}/teleport`, { body: {} })).status).toBe(404);
    const done = await api('POST', `exchanges/${id}/complete`, { body: {} });
    expect(done.body).toMatchObject({ ok: true, result: { status: 'COMPLETED' } });
  });
});

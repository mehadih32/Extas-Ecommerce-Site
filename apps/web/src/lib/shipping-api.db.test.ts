// S08 · PR 175 — the courier admin API end to end on a real PostgreSQL (a throwaway database with the sample catalogue;
// orders placed through the real checkout; skipped without TEST_DATABASE_ADMIN_URL): login, the same-site check and the
// permission; the courier accounts; the parcels with an exception recorded by staff; the RTO cost book. PR 176: the
// orders ready to book, a press of "Book" with Steadfast on its practice world, a parcel read now, "Try again" refused on
// a parcel the courier holds. Every value is a made-up test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MOCK_COURIER_PROVIDER, STEADFAST_PROVIDER } from '@extas/adapters';
import { createFirstOwner, defaultSecurityPolicy, hashPassword } from '@extas/auth';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { setUpShipping, type ShippingFixture } from '@extas/shipping/testing';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import type { AdminDeps } from './admin-auth';
import { loginHandler } from './admin-api';
import { confirmOrder } from '@extas/orders';
import { bookingsRoute, couriersRoute, parcelsRoute, rtoCostRoute } from './shipping-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const READER_PW = 'another long sentence for the tests';

function call(method: string, path: string, opts: { body?: unknown; cookie?: string; origin?: string | null } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.42' };
  if (opts.origin !== null && method !== 'GET') headers.origin = opts.origin ?? `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

describe.skipIf(!HAS_TEST_DB)('courier admin API on PostgreSQL (S08 · PR 175)', () => {
  let f: ShippingFixture;
  let deps: AdminDeps;
  let owner = '';
  let reader = '';
  const read = async (res: Response) => ({ status: res.status, body: (await res.json()) as Record<string, any> });
  const couriers = (method: string, path: string[], opts: { body?: unknown; cookie?: string; qs?: string } = {}) =>
    couriersRoute(call(method, `/api/admin/delivery/couriers/${path.join('/')}${opts.qs ?? ''}`, { body: opts.body, cookie: opts.cookie ?? owner }), deps, path).then(read);
  const parcels = (method: string, path: string[], opts: { body?: unknown; cookie?: string; qs?: string } = {}) =>
    parcelsRoute(call(method, `/api/admin/delivery/parcels/${path.join('/')}${opts.qs ?? ''}`, { body: opts.body, cookie: opts.cookie ?? owner }), deps, path).then(read);

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    f = await setUpShipping('shipping_api');
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

  it('needs a login, a database, a same-site request and the permission; unknown paths and methods are refused', async () => {
    expect(owner).not.toBe('');
    expect((await couriers('GET', [], { cookie: '' })).status).toBe(401);
    expect((await couriersRoute(call('GET', '/api/admin/delivery/couriers', { cookie: owner }), null, [])).status).toBe(503);
    const evil = await couriersRoute(call('POST', '/api/admin/delivery/couriers', { cookie: owner, origin: 'https://evil.example.test', body: {} }), deps, []);
    expect(evil.status).toBe(403);
    // the order reader may not see couriers or parcels (no delivery permission at all)
    expect((await couriers('GET', [], { cookie: reader })).status).toBe(403);
    expect((await parcels('GET', [], { cookie: reader })).status).toBe(403);
    expect((await couriers('PUT', [])).status).toBe(405);
    expect((await couriers('PATCH', ['not-a-uuid'], { body: {} })).status).toBe(404);
    expect((await parcels('GET', [randomUUID(), 'teleport'])).status).toBe(404);
    expect((await parcels('DELETE', [])).status).toBe(405);
    expect((await couriersRoute(call('GET', '/api/admin/delivery/couriers?storeId=0', { cookie: owner }), deps, [])).status).toBe(400);
  });

  it('courier accounts: add (practice mode), refuse an unknown courier and a twin, switch off, archive — never delete', async () => {
    const added = await couriers('POST', [], { body: { providerKey: MOCK_COURIER_PROVIDER, name: 'Practice' } });
    expect(added).toMatchObject({ status: 201, body: { ok: true, courier: { providerKey: MOCK_COURIER_PROVIDER, mode: 'MOCK', enabled: true } } });
    expect(await couriers('POST', [], { body: { providerKey: 'teleport', name: 'X' } })).toMatchObject({ status: 400, body: { error: 'UNKNOWN_PROVIDER' } });
    expect(await couriers('POST', [], { body: { providerKey: MOCK_COURIER_PROVIDER, name: 'Practice' } })).toMatchObject({ status: 409, body: { error: 'DUPLICATE' } });
    const id = added.body.courier.id as string;
    expect(await couriers('PATCH', [id], { body: { enabled: false } })).toMatchObject({ status: 200, body: { courier: { enabled: false } } });
    expect(await couriers('PATCH', [id], { body: {} })).toMatchObject({ status: 400, body: { error: 'INVALID_INPUT' } });
    expect(await couriers('PATCH', [randomUUID()], { body: { enabled: true } })).toMatchObject({ status: 404 });
    expect(await couriers('PATCH', [id], { body: { archived: true } })).toMatchObject({ status: 200, body: { courier: { archived: true } } });
    const list = await couriers('GET', [], { qs: '?includeArchived=1' });
    expect(list.body.couriers.map((c: { id: string }) => c.id)).toContain(id);
    expect(list.body.providers).toContain(MOCK_COURIER_PROVIDER);
  });

  it('parcels: the list by view, one parcel with its events, an exception from the phone (SIM-F-017); the RTO book (SIM-F-027)', async () => {
    const courierId = await f.courier(MOCK_COURIER_PROVIDER, 'API practice');
    const o = await f.place('api-parcel');
    const s = await f.t.prisma.shipment.create({ data: { storeId: f.S, orderId: o.orderId, courierAccountId: courierId, consignmentId: 'MOCK-P-API0000001', status: 'IN_TRANSIT', mode: 'MOCK', idempotencyKey: randomUUID(), bookedAt: f.clock.now } });
    const list = await parcels('GET', [], { qs: '?view=active' });
    expect(list.status).toBe(200);
    expect(list.body.rows.map((r: { id: string }) => r.id)).toContain(s.id);
    expect(list.body.counts).toMatchObject({ active: 1, exceptions: 0 });
    expect(await parcels('GET', [], { qs: '?view=nope' })).toMatchObject({ status: 400 });
    const bad = await parcels('POST', [s.id, 'exception'], { body: { status: 'LOST', reasonKey: 'receiverUnreachable' } });
    expect(bad).toMatchObject({ status: 400, body: { error: 'INVALID_INPUT' } });
    const ok = await parcels('POST', [s.id, 'exception'], { body: { status: 'LOST', reasonKey: 'lostInTransit', note: 'nine days, no scan' } });
    expect(ok).toMatchObject({ status: 200, body: { result: { status: 'LOST', changed: true } } });
    const one = await parcels('GET', [s.id]);
    expect(one.body.parcel).toMatchObject({ status: 'LOST', exceptionKey: 'lostInTransit' });
    expect(one.body.parcel.events[0]).toMatchObject({ status: 'LOST', source: 'staff', message: 'nine days, no scan' });
    expect(await parcels('GET', [randomUUID()])).toMatchObject({ status: 404, body: { error: 'NOT_FOUND' } });
    const book = await read(await rtoCostRoute(call('GET', '/api/admin/delivery/rto-cost?practice=1', { cookie: owner }), deps));
    expect(book).toMatchObject({ status: 200, body: { ok: true, real: { parcels: 0, knownMinor: 0 } } });
    expect((await rtoCostRoute(call('GET', '/api/admin/delivery/rto-cost', { cookie: reader }), deps)).status).toBe(403);
  });

  it('PR 176: the orders ready to book, a press of "Book" (practice Steadfast), a parcel read now, "Try again" only where it applies', async () => {
    const bookings = (method: string, opts: { body?: unknown; cookie?: string } = {}) => bookingsRoute(call(method, '/api/admin/delivery/bookings', { body: opts.body, cookie: opts.cookie ?? owner }), deps).then(read);
    const courierId = await f.courier(STEADFAST_PROVIDER, 'API Steadfast');
    const o = await f.place('api-book', { phone: '01700001770' }); // hardcode-ok: a made-up test number
    await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
    expect((await bookings('GET', { cookie: reader })).status).toBe(403);
    expect((await bookings('DELETE')).status).toBe(405);
    const ready = await bookings('GET');
    expect(ready).toMatchObject({ status: 200, body: { ok: true, total: 1, giftsWaiting: 0 } });
    expect(ready.body.rows[0]).toMatchObject({ orderId: o.orderId, phone: '+8801700001770', problems: [] }); // hardcode-ok: a made-up test number
    expect(await bookings('POST', { body: { courierAccountId: courierId } })).toMatchObject({ status: 400, body: { error: 'INVALID_INPUT' } });
    const booked = await bookings('POST', { body: { courierAccountId: courierId, orderIds: [o.orderId] } });
    expect(booked).toMatchObject({ status: 200, body: { ok: true, mode: 'MOCK', counts: { booked: 1 } } });
    const shipmentId = booked.body.results[0].shipmentId as string;
    expect(await parcels('POST', [shipmentId, 'track'])).toMatchObject({ status: 200, body: { result: { from: 'IN_REVIEW', status: 'IN_TRANSIT' } } });
    expect(await parcels('POST', [shipmentId, 'retry'])).toMatchObject({ status: 409, body: { error: 'NOT_RETRYABLE', data: { status: 'IN_TRANSIT' } } });
    expect((await parcels('GET', [shipmentId, 'track'])).status).toBe(405);
  });

  it('PR 554: the zone sync — read a practice list now, the courier page tabs, pair and unpair an area, Steadfast has none', async () => {
    const id = (await couriers('POST', [], { body: { providerKey: MOCK_COURIER_PROVIDER, name: 'Practice zones' } })).body.courier.id as string;
    const sf = (await couriers('GET', [])).body.couriers.find((c: { providerKey: string }) => c.providerKey === STEADFAST_PROVIDER)?.id as string | undefined;
    if (sf) expect(await couriers('POST', [sf, 'zone-sync'])).toMatchObject({ status: 422, body: { error: 'NO_ZONE_LIST' } });
    expect((await couriers('POST', [id, 'zone-sync'], { cookie: reader })).status).toBe(403);
    const now = await couriers('POST', [id, 'zone-sync']);
    expect(now).toMatchObject({ status: 200, body: { ok: true, now: true, run: { status: 'SUCCEEDED' } } });
    const page = await couriers('GET', [id, 'zones'], { qs: '?tab=unmapped&q=Uttara' });
    expect(page.body).toMatchObject({ ok: true, tab: 'unmapped', counts: { places: { city: 8 } } });
    const uttara = page.body.rows.find((r: { area: { name: string } }) => r.area.name === 'Uttara');
    expect(uttara.candidates).toHaveLength(2);
    const places = await couriers('GET', [id, 'places'], { qs: '?q=Uttara' });
    expect(places.body.places).toHaveLength(2);
    expect(await couriers('POST', [id, 'areas'], { body: { areaId: uttara.area.id, placeId: places.body.places[0].id } })).toMatchObject({ status: 200, body: { pair: { ids: { cityId: '1' } } } });
    expect(await couriers('POST', [id, 'areas'], { body: { areaId: 'x' } })).toMatchObject({ status: 400, body: { error: 'INVALID_INPUT' } });
    expect((await couriers('GET', [id, 'zones'], { qs: '?tab=mapped&q=Uttara' })).body.rows[0]).toMatchObject({ source: 'staff' });
    expect(await couriers('POST', [id, 'areas', uttara.area.id, 'unmap'])).toMatchObject({ status: 200, body: { ok: true } });
    expect(await couriers('POST', [id, 'areas', uttara.area.id, 'unmap'])).toMatchObject({ status: 404, body: { error: 'NOT_FOUND' } });
    expect((await couriers('GET', [id, 'zones'], { qs: '?tab=teleport' })).status).toBe(400);
    expect((await couriers('GET', [id, 'zone-sync'])).status).toBe(405);
    expect((await couriers('GET', [id, 'teleport'])).status).toBe(404);
  });
});

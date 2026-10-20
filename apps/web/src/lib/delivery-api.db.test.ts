// S06 · PR 550 — the delivery admin API end to end on a real PostgreSQL (a throwaway database with the SAMPLE gazetteer;
// skipped without TEST_DATABASE_ADMIN_URL): login, same-site and method checks, the bands as shipped (off, no charge),
// switching a band on only with its charge, the sub-area mode, the sub-area list (add, take off, move) and the search.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { forgetGazetteer, importGazetteer } from '@extas/delivery';
import { sampleGazetteerRows } from '@extas/delivery/sample';
import { prismaBackend, registry, SettingsResolver } from '@extas/settings';
import type { AdminDeps } from './admin-auth';
import { loginHandler } from './admin-api';
import { areaHandler, areasHandler, bandHandler, bandsHandler, placesHandler } from './delivery-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, opts: { body?: unknown; cookie?: string; origin?: string | null } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.41' };
  if (opts.origin !== null && method !== 'GET') headers.origin = opts.origin ?? `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');
async function read(res: Response) {
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

describe.skipIf(!HAS_TEST_DB)('delivery admin API on PostgreSQL', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let A = 0;

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('delivery_api');
    [A] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await importGazetteer(t.prisma, sampleGazetteerRows(), { source: 'sample' });
    forgetGazetteer();
    for (const [i, key] of ['dhaka-city', 'dhaka-sub-area', 'outside-dhaka'].entries()) {
      await t.prisma.deliveryBand.create({ data: { storeId: A, key, nameEn: key, chargeMinor: 0, enabled: false, sortOrder: i } });
    }
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: null };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    forgetGazetteer();
    await t?.drop();
  });

  it('needs a login, a database, a same-site request and the right method', async () => {
    expect((await bandsHandler(call('GET', '/api/admin/delivery/bands'), deps)).status).toBe(401);
    expect((await bandsHandler(call('GET', '/api/admin/delivery/bands', { cookie: owner }), null)).status).toBe(503);
    expect((await areasHandler(call('POST', '/api/admin/delivery/areas', { cookie: owner, origin: 'https://evil.example.test', body: {} }), deps)).status).toBe(403);
    expect((await bandsHandler(call('POST', '/api/admin/delivery/bands', { cookie: owner, body: {} }), deps)).status).toBe(405);
    expect((await bandHandler(call('PATCH', '/api/admin/delivery/bands/x', { cookie: owner, body: {} }), deps, 'x')).status).toBe(400);
    expect((await bandsHandler(call('GET', '/api/admin/delivery/bands?storeId=0', { cookie: owner }), deps)).status).toBe(400);
  });

  it('shows the bands off with no charge; switching on needs the charge', async () => {
    const list = await read(await bandsHandler(call('GET', '/api/admin/delivery/bands', { cookie: owner }), deps));
    expect(list.status).toBe(200);
    expect(list.body.bands.map((b: { key: string; enabled: boolean }) => [b.key, b.enabled])).toEqual([
      ['dhaka-city', false],
      ['dhaka-sub-area', false],
      ['outside-dhaka', false],
    ]);
    const city = list.body.bands[0].id as string;
    const refused = await read(await bandHandler(call('PATCH', `/api/admin/delivery/bands/${city}`, { cookie: owner, body: { enabled: true } }), deps, city));
    expect(refused).toEqual({ status: 409, body: { ok: false, error: 'CHARGE_REQUIRED', details: ['chargeMinor'] } });
    const on = await read(await bandHandler(call('PATCH', `/api/admin/delivery/bands/${city}`, { cookie: owner, body: { enabled: true, chargeMinor: 6000 } }), deps, city));
    expect(on.status).toBe(200);
    expect(on.body.band).toMatchObject({ enabled: true, chargeMinor: 6000 });
    const sub = list.body.bands[1].id as string;
    const mode = await read(await bandHandler(call('PATCH', `/api/admin/delivery/bands/${city}`, { cookie: owner, body: { mode: 'city' } }), deps, city));
    expect(mode.body.error).toBe('MODE_NOT_ALLOWED');
    expect((await read(await bandHandler(call('PATCH', `/api/admin/delivery/bands/${sub}`, { cookie: owner, body: { mode: 'outside' } }), deps, sub))).body.band.chargedAs.key).toBe('outside-dhaka');
  });

  it('searches places, puts one on the list, takes it off and moves it', async () => {
    const found = await read(await placesHandler(call('GET', '/api/admin/delivery/places?q=gazipur', { cookie: owner }), deps));
    const gazipur = found.body.places.find((p: { code: string }) => p.code === 'bd.dhaka.gazipur');
    expect(gazipur).toMatchObject({ bandKey: 'outside-dhaka', via: 'outside' });
    const added = await read(await areasHandler(call('POST', '/api/admin/delivery/areas', { cookie: owner, body: { areaId: gazipur.id } }), deps));
    expect(added.status).toBe(201);
    expect(added.body.area).toMatchObject({ id: gazipur.id, bandKey: 'dhaka-sub-area' });
    const again = await read(await placesHandler(call('GET', '/api/admin/delivery/places?q=tongi', { cookie: owner }), deps));
    expect(again.body.places.find((p: { code: string }) => p.code === 'bd.dhaka.gazipur.gazipur-sadar.tongi')).toMatchObject({ bandKey: 'dhaka-sub-area', via: 'owner-list', listedAreaId: gazipur.id });

    expect((await areaHandler(call('PATCH', `/api/admin/delivery/areas/${gazipur.id}`, { cookie: owner, body: { archived: false } }), deps, gazipur.id)).status).toBe(400);
    const off = await read(await areaHandler(call('PATCH', `/api/admin/delivery/areas/${gazipur.id}`, { cookie: owner, body: { archived: true } }), deps, gazipur.id));
    expect(off.body.area).toEqual({ areaId: gazipur.id, archived: true });
    const listed = await read(await areasHandler(call('GET', '/api/admin/delivery/areas?includeArchived=1', { cookie: owner }), deps));
    expect(listed.body.areas).toHaveLength(1);
    expect(listed.body.areas[0]).toMatchObject({ archived: true });
    const outside = (await read(await bandsHandler(call('GET', '/api/admin/delivery/bands', { cookie: owner }), deps))).body.bands[2].id as string;
    const moved = await read(await areaHandler(call('PATCH', `/api/admin/delivery/areas/${gazipur.id}`, { cookie: owner, body: { bandId: outside } }), deps, gazipur.id));
    expect(moved.body.area).toMatchObject({ bandKey: 'outside-dhaka', archived: false });
    expect(await t.prisma.areaBand.count()).toBe(1);
  });
});

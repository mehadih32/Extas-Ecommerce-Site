// S06 · PR 551 — the address read end to end on a real PostgreSQL (a throwaway database with the SAMPLE gazetteer;
// skipped without TEST_DATABASE_ADMIN_URL): the admin's "Try an address" (login and `delivery.read`) and the checkout's
// public route (POST only, same site, size-capped). A band that is off answers with no charge; an ambiguous line asks;
// a picked band is kept.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { forgetGazetteer, importGazetteer } from '@extas/delivery';
import { sampleGazetteerRows } from '@extas/delivery/sample';
import { prismaBackend, registry, SettingsResolver } from '@extas/settings';
import type { AdminDeps } from './admin-auth';
import { loginHandler } from './admin-api';
import { publicResolveHandler, tryAddressHandler } from './delivery-api';

const HOST = 'shop.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, opts: { body?: unknown; raw?: string; cookie?: string; origin?: string | null } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.42' };
  if (opts.origin !== null && method !== 'GET') headers.origin = opts.origin ?? `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  const payload = opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body));
  if (payload !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: payload });
}
const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');
async function read(res: Response) {
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

describe.skipIf(!HAS_TEST_DB)('the address read on PostgreSQL', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let A = 0;
  const bandId: Record<string, string> = {};

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('delivery_resolve');
    [A] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await importGazetteer(t.prisma, sampleGazetteerRows(), { source: 'sample' });
    forgetGazetteer();
    for (const [i, key] of ['dhaka-city', 'dhaka-sub-area', 'outside-dhaka'].entries()) {
      // only the city band is on in this test; the others stay as shipped: off, no charge
      const b = await t.prisma.deliveryBand.create({ data: { storeId: A, key, nameEn: key, chargeMinor: key === 'dhaka-city' ? 6000 : 0, enabled: key === 'dhaka-city', hoursMin: 24, hoursMax: 48, sortOrder: i } });
      bandId[key] = b.id;
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

  it('"Try an address" needs a login and answers like checkout', async () => {
    expect((await tryAddressHandler(call('POST', '/api/admin/delivery/resolve', { body: { line: 'Gabtoli' } }), deps)).status).toBe(401);
    expect((await tryAddressHandler(call('GET', '/api/admin/delivery/resolve', { cookie: owner }), deps)).status).toBe(405);
    const r = await read(await tryAddressHandler(call('POST', '/api/admin/delivery/resolve', { cookie: owner, body: { line: 'Gabtoli Bus Stand, Dhaka' } }), deps));
    expect(r.status).toBe(200);
    expect(r.body.read).toMatchObject({ status: 'resolved', via: 'line', placeSure: true, band: { key: 'dhaka-city', priced: true, chargeMinor: 6000 }, area: { code: 'bd.dhaka.dhaka.gabtoli' } });
  });

  it('the public read: POST only, a database, the same site, a store that exists, a small body', async () => {
    expect((await publicResolveHandler(call('GET', '/api/delivery/resolve'), deps)).status).toBe(405);
    expect((await publicResolveHandler(call('POST', '/api/delivery/resolve', { body: { line: 'x' } }), null)).status).toBe(503);
    expect((await publicResolveHandler(call('POST', '/api/delivery/resolve', { origin: 'https://evil.example.test', body: { line: 'Gabtoli' } }), deps)).status).toBe(403);
    expect((await publicResolveHandler(call('POST', '/api/delivery/resolve', { origin: null, body: { line: 'Gabtoli' } }), deps)).status).toBe(403);
    expect((await publicResolveHandler(call('POST', '/api/delivery/resolve?storeId=0', { body: { line: 'Gabtoli' } }), deps)).status).toBe(400);
    expect((await read(await publicResolveHandler(call('POST', '/api/delivery/resolve?storeId=99999', { body: { line: 'Gabtoli' } }), deps))).body.error).toBe('NOT_FOUND');
    const max = await deps.resolver.value('delivery.public.maxBodyBytes');
    expect((await read(await publicResolveHandler(call('POST', '/api/delivery/resolve', { raw: JSON.stringify({ line: 'a'.repeat(max) }) }), deps))).body.error).toBe('TOO_LARGE');
    const long = await read(await publicResolveHandler(call('POST', '/api/delivery/resolve', { body: { line: 'a'.repeat((await deps.resolver.value('delivery.resolver.maxChars', { storeId: A })) + 1) } }), deps));
    expect(long).toMatchObject({ status: 400, body: { error: 'INVALID_INPUT' } });
    expect((await read(await publicResolveHandler(call('POST', '/api/delivery/resolve', { body: { line: 'Gabtoli', name: 'someone' } }), deps))).body.error).toBe('INVALID_INPUT');
  });

  it('asks for an ambiguous line, shows no charge for a band that is off, and keeps the pick', async () => {
    const ask = await read(await publicResolveHandler(call('POST', '/api/delivery/resolve', { body: { line: 'Gabtoli' } }), deps));
    expect(ask.status).toBe(200);
    expect(ask.body.read.status).toBe('ask');
    expect(ask.body.read.reason).toBe('two-places');
    const options = ask.body.read.options as { band: { key: string; priced: boolean; chargeMinor: number | null }; places: { code: string; parentEn: string }[] }[];
    expect(options.map((o) => [o.band.key, o.places.map((p) => p.parentEn)])).toEqual([
      ['dhaka-city', ['Dhaka']],
      ['outside-dhaka', ['Bogura']],
    ]);
    expect(options[1]!.band).toMatchObject({ priced: false, chargeMinor: null });

    const picked = await read(await publicResolveHandler(call('POST', '/api/delivery/resolve', { body: { line: 'Gabtoli', confirmed: { bandId: bandId['outside-dhaka'] } } }), deps));
    expect(picked.body.read).toMatchObject({ status: 'resolved', via: 'choice', band: { key: 'outside-dhaka', priced: false, chargeMinor: null } });
    const changed = await read(await publicResolveHandler(call('POST', '/api/delivery/resolve', { body: { line: 'Gabtoli Bus Stand, Dhaka', confirmed: { bandId: bandId['outside-dhaka'] } } }), deps));
    expect(changed.body.read).toMatchObject({ status: 'ask', reason: 'changed' });
  });

  it('never answers with anything about a customer', async () => {
    const r = await read(await publicResolveHandler(call('POST', '/api/delivery/resolve', { body: { line: 'House 12, Road 3, 1216' } }), deps));
    expect(r.body.read.status).toBe('resolved');
    expect(Object.keys(r.body.read).sort()).toEqual(['area', 'band', 'clues', 'placeSure', 'status', 'via']);
  });
});

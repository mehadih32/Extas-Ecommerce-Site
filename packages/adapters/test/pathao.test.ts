// PR 177 — Pathao, the second courier behind the same contract: the HTTP client against a stand-in server (never the real
// one, no real keys) with its token, the booking with zone ids and the weight in kg (SIM-F-029), its status words mapped
// onto the shop's states with the exceptions of SIM-F-017, no lookup by reference (never booked twice by guess), the
// practice Pathao in Pathao's own words, and its keys in Keys & connections.
import { describe, expect, it } from 'vitest';
import {
  connectionCatalogue,
  courierAdapters,
  createPathaoClient,
  keyedCourierAdapters,
  mapStatus,
  MOCK_SCRIPTS,
  mockCourierWorld,
  PATHAO_LIVE_BASE_URL,
  PATHAO_SANDBOX_BASE_URL,
  pathaoAdapter,
  pathaoStatusTable,
  pathaoVocabulary,
  type CourierParcel,
} from '../src';

const BASE = 'https://pathao.example.test';
const KEYS = { storeId: '149', clientId: 'test-client', clientSecret: 'test-client-secret', username: 'merchant@example.com', password: 'a test password' };

interface Seen {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | undefined;
}

/** A stand-in Pathao: a token endpoint and answers by path; records every request. */
function stand(answers: Record<string, { status?: number; body?: unknown } | Error>, opts: { expiresIn?: number; rejectFirstToken?: boolean } = {}) {
  const seen: Seen[] = [];
  let tokens = 0;
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const s: Seen = { method: init?.method ?? 'GET', url, headers: init?.headers as Record<string, string>, body: init?.body ? JSON.parse(String(init.body)) : undefined };
    seen.push(s);
    if (url.endsWith('/aladdin/api/v1/issue-token')) {
      tokens += 1;
      return new Response(JSON.stringify({ token_type: 'Bearer', expires_in: opts.expiresIn ?? 3600, access_token: `token-${tokens}`, refresh_token: 'r' }), { status: 200 });
    }
    if (opts.rejectFirstToken && s.headers.Authorization === 'Bearer token-1') return new Response(JSON.stringify({ message: 'Unauthenticated.' }), { status: 401 });
    const key = Object.keys(answers).find((k) => url.endsWith(k));
    const a = key ? answers[key]! : { status: 404, body: { message: 'Not found', code: 404 } };
    if (a instanceof Error) throw a;
    return new Response(JSON.stringify(a.body ?? {}), { status: a.status ?? 200 });
  }) as typeof fetch;
  return { seen, fetchFn, tokens: () => tokens };
}

const parcel: CourierParcel = {
  merchantRef: 'EX-1002-1',
  receiver: { name: 'Test Receiver', phone: '01700001771', address: 'House 1, Road 2, Dhanmondi, Dhaka' }, // hardcode-ok: a made-up test number
  zone: { cityId: '1', zoneId: '52', areaId: '1033' },
  codMinor: 210_000,
  declaredValueMinor: 210_000,
  weightGrams: 2100,
  itemCount: 3,
  description: 'Oxford shirt (Sky, M) x3',
  note: 'Call before coming',
};

describe('Pathao (PR 177)', () => {
  it('books with a token from the four keys, the store, the zone ids, the weight in kg and the COD in taka; its fee is the courier\'s own charge', async () => {
    const s = stand({ '/aladdin/api/v1/orders': { body: { message: 'Order Created Successfully', type: 'success', code: 200, data: { consignment_id: 'DL121224VS8TTJ', merchant_order_id: 'EX-1002-1', order_status: 'Pending', delivery_fee: 83 } } } });
    const api = createPathaoClient({ baseUrl: `${BASE}/`, ...KEYS, fetch: s.fetchFn });
    const r = await api.book(parcel);
    expect(r).toEqual({ ok: true, consignmentId: 'DL121224VS8TTJ', trackingCode: 'DL121224VS8TTJ', status: 'PENDING_PICKUP', rawStatus: 'Pending', chargeMinor: 8300 });
    expect(s.seen[0]).toMatchObject({ method: 'POST', url: `${BASE}/aladdin/api/v1/issue-token`, body: { client_id: KEYS.clientId, client_secret: KEYS.clientSecret, grant_type: 'password', username: KEYS.username, password: KEYS.password } });
    expect(s.seen[1]).toMatchObject({ method: 'POST', url: `${BASE}/aladdin/api/v1/orders`, headers: { Authorization: 'Bearer token-1' } });
    expect(s.seen[1]!.body).toMatchObject({ store_id: 149, merchant_order_id: 'EX-1002-1', recipient_phone: '01700001771', recipient_city: 1, recipient_zone: 52, recipient_area: 1033, item_quantity: 3, item_weight: 2.1, amount_to_collect: 2100, special_instruction: 'Call before coming' }); // hardcode-ok: a made-up test number
    // the token is kept: a second booking asks for none
    await api.book({ ...parcel, merchantRef: 'EX-1002-2', zone: { cityId: null, zoneId: null, areaId: null }, weightGrams: 200 });
    expect(s.tokens()).toBe(1);
    expect(s.seen[2]!.body).not.toHaveProperty('recipient_city');
    // Pathao's lightest weight
    expect(s.seen[2]!.body).toMatchObject({ item_weight: 0.5 });
  });

  it('SIM-F-029: a parcel without a weight is refused before anything is sent; a refusal, a 5xx and a lost connection are told apart', async () => {
    const s = stand({});
    const api = createPathaoClient({ baseUrl: BASE, ...KEYS, fetch: s.fetchFn });
    expect(await api.book({ ...parcel, weightGrams: null })).toMatchObject({ ok: false, unknown: false });
    expect(s.seen).toHaveLength(0);
    const refused = createPathaoClient({ baseUrl: BASE, ...KEYS, fetch: stand({ '/aladdin/api/v1/orders': { status: 422, body: { message: 'Please fix the given errors', type: 'error', code: 422, errors: { recipient_phone: ['The recipient phone format is invalid.'] } } } }).fetchFn });
    const r = await refused.book(parcel);
    expect(r).toMatchObject({ ok: false, unknown: false });
    expect(!r.ok && r.error).toContain('recipient phone format is invalid');
    expect(await createPathaoClient({ baseUrl: BASE, ...KEYS, fetch: stand({ '/aladdin/api/v1/orders': { status: 503, body: {} } }).fetchFn }).book(parcel)).toMatchObject({ ok: false, unknown: true });
    expect(await createPathaoClient({ baseUrl: BASE, ...KEYS, fetch: stand({ '/aladdin/api/v1/orders': new Error('ECONNRESET') }).fetchFn }).book(parcel)).toMatchObject({ ok: false, unknown: true });
  });

  it('an expired token is replaced once; Pathao cannot be asked by reference, so a lost booking is never booked again by guess', async () => {
    const s = stand({ '/aladdin/api/v1/orders/DL1/info': { body: { code: 200, data: { order_status_slug: 'Picked', updated_at: '2026-10-24 14:00:00' } } } }, { rejectFirstToken: true }); // hardcode-ok: a fixed test time
    const api = createPathaoClient({ baseUrl: BASE, ...KEYS, fetch: s.fetchFn });
    expect((await api.track({ consignmentId: 'DL1', trackingCode: null, merchantRef: 'EX-1', lastRawStatus: 'Pending' }))[0]).toMatchObject({ status: 'PICKED_UP', rawStatus: 'Picked', providerEventId: 'DL1:Picked:2026-10-24 14:00:00' }); // hardcode-ok: a fixed test time
    expect(s.tokens()).toBe(2);
    await expect(api.findByRef('EX-1')).rejects.toThrow(/Pathao panel/);
    expect(await api.track({ consignmentId: null, trackingCode: null, merchantRef: 'EX-1' })).toEqual([]);
  });

  it('SIM-F-017: a poll reports a change only; a failed delivery and a hold are failed tries with their reasons; unknown words stay raw', async () => {
    let word = 'Delivery_Failed';
    const fetchFn = (async (input: string | URL | Request) =>
      String(input).endsWith('issue-token') ? new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }), { status: 200 }) : new Response(JSON.stringify({ code: 200, data: { order_status_slug: word } }), { status: 200 })) as typeof fetch;
    const api = createPathaoClient({ baseUrl: BASE, ...KEYS, fetch: fetchFn, now: () => Date.parse('2026-10-24T08:00:00Z') }); // hardcode-ok: a fixed test clock
    const ref = { consignmentId: 'DL2', trackingCode: null, merchantRef: 'EX-2' };
    expect((await api.track({ ...ref, lastRawStatus: 'Assigned_for_Delivery' }))[0]).toMatchObject({ status: 'ATTEMPT_FAILED', reasonKey: 'other' });
    expect(await api.track({ ...ref, lastRawStatus: 'Delivery_Failed' })).toEqual([]);
    word = 'On_Hold';
    expect((await api.track({ ...ref, lastRawStatus: 'Delivery_Failed' }))[0]).toMatchObject({ status: 'ATTEMPT_FAILED', reasonKey: 'receiverAskedLater' });
    word = 'Payment_Invoice';
    expect((await api.track({ ...ref, lastRawStatus: 'Delivered' }))[0]).toMatchObject({ status: null, rawStatus: 'Payment_Invoice', codCollectedMinor: null });
    expect(mapStatus(pathaoStatusTable, 'Received_at_Last_Mile_HUB')).toEqual({ status: 'IN_TRANSIT', reasonKey: null });
    expect(mapStatus(pathaoStatusTable, 'Paid_Return')).toEqual({ status: 'RETURNED', reasonKey: null });
  });

  it('the practice Pathao speaks Pathao\'s words, refuses a parcel without a weight, and its lives map back (lost and damaged stay raw)', async () => {
    const api = await pathaoAdapter.mock!({} as never);
    const world = mockCourierWorld('pathao');
    expect(await api.book({ ...parcel, merchantRef: 'EX-PR-2', weightGrams: null })).toMatchObject({ ok: false, unknown: false });
    const b = await api.book({ ...parcel, merchantRef: 'EX-PR-3' });
    expect(b).toMatchObject({ ok: true, status: 'PENDING_PICKUP', rawStatus: 'Pickup_Requested', chargeMinor: null });
    expect(b.ok && b.consignmentId).toMatch(/^MOCK-PT-/);
    for (const steps of Object.values(MOCK_SCRIPTS))
      for (const st of steps) {
        const mapped = mapStatus(pathaoVocabulary.table, pathaoVocabulary.say(st)).status;
        if (st.status === 'LOST' || st.status === 'DAMAGED') expect(mapped, st.status).toBeNull();
        else expect(mapped, st.status).not.toBeNull();
      }
    world.reset();
  });

  it('PR 554: reads Pathao\'s own cities, a city\'s zones and a zone\'s areas (ids as text, names as Pathao spells them); a list needs its parent', async () => {
    const s = stand({
      '/aladdin/api/v1/city-list': { body: { message: 'City successfully fetched.', type: 'success', code: 200, data: { data: [{ city_id: 1, city_name: 'Dhaka' }, { city_id: 2, city_name: 'Chittagong' }, { city_id: 3 }] } } },
      '/aladdin/api/v1/cities/1/zone-list': { body: { code: 200, data: { data: [{ zone_id: 52, zone_name: 'Dhanmondi' }] } } },
      '/aladdin/api/v1/zones/52/area-list': { body: { code: 200, data: { data: [{ area_id: 1033, area_name: ' Road 1 ', home_delivery_available: true }] } } },
    });
    const api = createPathaoClient({ baseUrl: BASE, ...KEYS, fetch: s.fetchFn });
    expect(pathaoAdapter.mock).toBeDefined();
    expect(await api.places!('city', null)).toEqual([{ id: '1', name: 'Dhaka' }, { id: '2', name: 'Chittagong' }]);
    expect(await api.places!('zone', '1')).toEqual([{ id: '52', name: 'Dhanmondi' }]);
    expect(await api.places!('area', '52')).toEqual([{ id: '1033', name: 'Road 1' }]);
    expect(s.seen.filter((x) => !x.url.endsWith('issue-token')).map((x) => [x.method, x.url.replace(BASE, '')])).toEqual([
      ['GET', '/aladdin/api/v1/city-list'],
      ['GET', '/aladdin/api/v1/cities/1/zone-list'],
      ['GET', '/aladdin/api/v1/zones/52/area-list'],
    ]);
    await expect(api.places!('zone', null)).rejects.toThrow(/parent/);
  });

  it('PR 554: the practice Pathao has the practice place list; the world can drop, add and fail a read', async () => {
    const api = await pathaoAdapter.mock!({} as never);
    const world = mockCourierWorld('pathao');
    world.reset();
    const cities = await api.places!('city', null);
    expect(cities.map((c) => c.name)).toEqual(expect.arrayContaining(['Dhaka', 'Gazipur', 'Bogra']));
    const dhaka = cities.find((c) => c.name === 'Dhaka')!;
    const zones = await api.places!('zone', dhaka.id);
    expect(zones.filter((z) => z.name === 'Uttara')).toHaveLength(2);
    const mirpur = zones.find((z) => z.name === 'Mirpur')!;
    world.dropPlace('zone', mirpur.id);
    expect((await api.places!('zone', dhaka.id)).map((z) => z.id)).not.toContain(mirpur.id);
    expect(await api.places!('area', mirpur.id)).toEqual([]);
    world.addPlace('zone', { id: mirpur.id, name: 'Mirpur', parentId: dhaka.id });
    expect((await api.places!('zone', dhaka.id)).map((z) => z.id)).toContain(mirpur.id);
    world.failPlaceReads(1);
    await expect(api.places!('city', null)).rejects.toThrow(/planned failure/);
    expect((await api.places!('city', null)).length).toBe(cities.length);
    world.reset();
  });

  it('Keys & connections: four keys and the Pathao store; Sandbox talks to Pathao\'s sandbox, Live to Pathao; one more courier, nothing else changes', async () => {
    expect(pathaoAdapter).toMatchObject({ kind: 'COURIER', provider: 'pathao', modes: ['SANDBOX', 'LIVE'], secrets: ['clientId', 'clientSecret', 'username', 'password'] });
    expect(pathaoAdapter.configSchema.safeParse({}).success).toBe(false);
    expect(pathaoAdapter.configSchema.safeParse({ storeId: 'main' }).success).toBe(false);
    expect(pathaoAdapter.configSchema.safeParse({ storeId: '149', baseUrl: 'http://plain.example.test' }).success).toBe(false);
    expect(connectionCatalogue.find((c) => c.provider === 'pathao')).toMatchObject({ kind: 'COURIER', secrets: [{ field: 'clientId' }, { field: 'clientSecret' }, { field: 'username' }, { field: 'password' }], config: [{ field: 'storeId' }, { field: 'baseUrl', optional: true }] });
    expect(courierAdapters.map((a) => a.provider)).toEqual(['mockCourier', 'steadfast', 'pathao']);
    expect(keyedCourierAdapters.map((a) => a.provider)).toEqual(['steadfast', 'pathao']);
    expect([PATHAO_LIVE_BASE_URL, PATHAO_SANDBOX_BASE_URL].every((u) => u.startsWith('https://'))).toBe(true);
    // the address follows the mode (the token request shows which one it reached)
    const reached: string[] = [];
    const g = globalThis as { fetch: typeof fetch };
    const real = g.fetch;
    g.fetch = (async (input: string | URL | Request) => {
      reached.push(String(input));
      return new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }), { status: 200 });
    }) as typeof fetch;
    try {
      const secret = async (f: string) => (KEYS as Record<string, string>)[f] ?? null;
      for (const mode of ['SANDBOX', 'LIVE'] as const) await (await pathaoAdapter.create({ mode, config: { storeId: '149' }, storeId: null, secret })).health();
    } finally {
      g.fetch = real;
    }
    expect(reached).toEqual([`${PATHAO_SANDBOX_BASE_URL}/aladdin/api/v1/issue-token`, `${PATHAO_LIVE_BASE_URL}/aladdin/api/v1/issue-token`]);
  });
});

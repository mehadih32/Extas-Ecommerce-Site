// PR 672 — RedX, the third courier behind the same contract: the HTTP client against a stand-in server (never the real
// one, no real token), the booking with the delivery area by name and id and the weight in grams, a parcel to an area the
// shop has not paired never sent, status words mapped with the exceptions of SIM-F-017, no lookup by reference (never
// booked twice by guess), the place list read as city → zone → area, the practice RedX in RedX's own words, and its token
// in Keys & connections. Every value is a made-up test value.
import { describe, expect, it } from 'vitest';
import {
  connectionCatalogue,
  courierAdapters,
  courierCapabilitiesOf,
  createRedxClient,
  keyedCourierAdapters,
  mapStatus,
  MOCK_SCRIPTS,
  mockCourierWorld,
  REDX_LIVE_BASE_URL,
  REDX_SANDBOX_BASE_URL,
  redxAdapter,
  redxStatusTable,
  redxVocabulary,
  type CourierParcel,
} from '../src';

const BASE = 'https://redx.example.test/v1';
const AREAS = [
  { id: 1, name: 'Dhanmondi', zone_id: 1, zone_name: 'Dhaka Metro 1', division_name: 'Dhaka' },
  { id: 2, name: 'Mirpur 10', zone_id: 2, zone_name: 'Dhaka Metro 2', division_name: 'Dhaka' },
  { id: 3, name: 'Agrabad', zone_id: 9, division_name: 'Chattogram' },
];

interface Seen {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | undefined;
}

function stand(answers: Record<string, { status?: number; body?: unknown } | Error>) {
  const seen: Seen[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    seen.push({ method: init?.method ?? 'GET', url, headers: init?.headers as Record<string, string>, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const key = Object.keys(answers).find((k) => url.endsWith(k));
    const a = key ? answers[key]! : { status: 404, body: { message: 'Not found' } };
    if (a instanceof Error) throw a;
    return new Response(JSON.stringify(a.body ?? {}), { status: a.status ?? 200 });
  }) as typeof fetch;
  return { seen, fetchFn };
}

const parcel: CourierParcel = {
  merchantRef: 'EX-3001-1',
  receiver: { name: 'Test Receiver', phone: '01700003001', address: 'House 1, Road 2, Dhanmondi, Dhaka' }, // hardcode-ok: a made-up test number
  zone: { cityId: 'Dhaka', zoneId: '1', areaId: '1' },
  codMinor: 210_000,
  declaredValueMinor: 210_000,
  weightGrams: 2100,
  itemCount: 3,
  description: 'Oxford shirt (Sky, M) x3',
  note: 'Call before coming',
};

describe('RedX (PR 672)', () => {
  it('books with the token header, the area by name and id, the weight in grams and the COD in taka', async () => {
    const s = stand({ '/areas': { body: { areas: AREAS } }, '/parcel': { body: { tracking_id: '21A427TUBJ6T' } } });
    const api = createRedxClient({ baseUrl: `${BASE}/`, accessToken: 'test-token', pickupStoreId: '12', fetch: s.fetchFn });
    const r = await api.book(parcel);
    expect(r).toEqual({ ok: true, consignmentId: '21A427TUBJ6T', trackingCode: '21A427TUBJ6T', status: 'PENDING_PICKUP', rawStatus: 'pending', chargeMinor: null });
    const post = s.seen.find((x) => x.method === 'POST')!;
    expect(post.url).toBe(`${BASE}/parcel`);
    expect(post.headers['API-ACCESS-TOKEN']).toBe('Bearer test-token');
    expect(post.body).toMatchObject({
      customer_phone: '01700003001',
      delivery_area: 'Dhanmondi',
      delivery_area_id: 1,
      merchant_invoice_id: 'EX-3001-1',
      cash_collection_amount: '2100',
      parcel_weight: 2100,
      instruction: 'Call before coming',
      value: 2100,
      pickup_store_id: 12,
    }); // hardcode-ok: a made-up test number
    // the area list is kept: a second booking does not read it again
    await api.book({ ...parcel, merchantRef: 'EX-3001-2' });
    expect(s.seen.filter((x) => x.url.endsWith('/areas'))).toHaveLength(1);
  });

  it('never sends a parcel without the paired area or the weight, and says why; a timeout is "may have booked"', async () => {
    const s = stand({ '/areas': { body: { areas: AREAS } }, '/parcel': new Error('socket hang up') });
    const api = createRedxClient({ baseUrl: BASE, accessToken: 't', fetch: s.fetchFn });
    expect(await api.book({ ...parcel, zone: { cityId: null, zoneId: null, areaId: null } })).toMatchObject({ ok: false, unknown: false, error: expect.stringMatching(/delivery area/) });
    expect(await api.book({ ...parcel, weightGrams: null })).toMatchObject({ ok: false, unknown: false, error: expect.stringMatching(/weight/) });
    expect(await api.book({ ...parcel, zone: { cityId: null, zoneId: null, areaId: '999' } })).toMatchObject({ ok: false, unknown: false, error: expect.stringMatching(/pair the area again/) });
    expect(s.seen.filter((x) => x.method === 'POST')).toHaveLength(0);
    expect(await api.book(parcel)).toMatchObject({ ok: false, unknown: true });
  });

  it("tracks by the tracking id: the status word from the parcel info, the rider's last step as the note, its charge and cash", async () => {
    const s = stand({
      '/parcel/info/T1': { body: { parcel: { tracking_id: 'T1', status: 'delivered', charge: 83, cash_collection_amount: 2100, updated_at: '2026-11-10T10:00:00Z' } } },
      '/parcel/track/T1': {
        body: {
          tracking: [
            { message_en: 'Parcel picked up', time: 'x' },
            { message_en: 'Delivered to receiver', time: 'y' },
          ],
        },
      },
    });
    const api = createRedxClient({ baseUrl: BASE, accessToken: 't', fetch: s.fetchFn });
    const ev = await api.track({ consignmentId: 'T1', trackingCode: 'T1', merchantRef: 'EX-1', lastRawStatus: 'delivery-in-progress' });
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ status: 'DELIVERED', rawStatus: 'delivered', note: 'Delivered to receiver', codCollectedMinor: 210_000, chargeMinor: 8300 });
    // the same word again is no event
    expect(await api.track({ consignmentId: 'T1', trackingCode: 'T1', merchantRef: 'EX-1', lastRawStatus: 'delivered' })).toEqual([]);
    // a failed step read never loses the status
    const s2 = stand({ '/parcel/info/T2': { body: { parcel: { status: 'agent-hold' } } } });
    const ev2 = await createRedxClient({ baseUrl: BASE, accessToken: 't', fetch: s2.fetchFn }).track({ consignmentId: 'T2', trackingCode: null, merchantRef: null });
    expect(ev2[0]).toMatchObject({ status: 'ATTEMPT_FAILED', reasonKey: 'receiverAskedLater', note: null });
  });

  it("a word the table does not know stays raw and flagged; the table covers RedX's words", () => {
    expect(mapStatus(redxStatusTable, 'agent-returning').status).toBe('RETURNING');
    expect(mapStatus(redxStatusTable, 'Ready-For-Delivery').status).toBe('IN_TRANSIT');
    expect(mapStatus(redxStatusTable, 'something-new').status).toBeNull();
  });

  it('cannot be asked by the shop reference, has no payout feature and reads zone ids', async () => {
    const api = createRedxClient({ baseUrl: BASE, accessToken: 't', fetch: stand({}).fetchFn });
    await expect(api.findByRef('EX-1')).rejects.toThrow(/RedX panel/);
    expect(api.capabilities).toMatchObject({ lookupByRef: false, payouts: 'none', zoneNeeds: 'area', weightRequired: true, zoneList: true });
    expect(api.payouts).toBeUndefined();
  });

  it("reads its flat area list as the shop's city → zone → area chain (division, RedX zone, area)", async () => {
    const api = createRedxClient({ baseUrl: BASE, accessToken: 't', fetch: stand({ '/areas': { body: { areas: AREAS } } }).fetchFn });
    expect(await api.places!('city', null)).toEqual([
      { id: 'Dhaka', name: 'Dhaka' },
      { id: 'Chattogram', name: 'Chattogram' },
    ]);
    expect(await api.places!('zone', 'Dhaka')).toEqual([
      { id: '1', name: 'Dhaka Metro 1' },
      { id: '2', name: 'Dhaka Metro 2' },
    ]);
    expect(await api.places!('zone', 'Chattogram')).toEqual([{ id: '9', name: 'Zone 9' }]);
    expect(await api.places!('area', '2')).toEqual([{ id: '2', name: 'Mirpur 10' }]);
    await expect(api.places!('area', null)).rejects.toThrow(/parent/);
  });

  it("the Test reads the store list; a refused token is an error with RedX's reason", async () => {
    const ok = createRedxClient({ baseUrl: BASE, accessToken: 't', fetch: stand({ '/pickup-stores': { body: { pickup_stores: [] } } }).fetchFn });
    expect(await ok.health()).toMatchObject({ ok: true });
    const bad = createRedxClient({ baseUrl: BASE, accessToken: 'x', fetch: stand({ '/pickup-stores': { status: 401, body: { message: 'Unauthenticated' } } }).fetchFn });
    await expect(bad.health()).rejects.toThrow(/RedX refused \(401\).*Unauthenticated/);
  });

  it("practice RedX: RedX's own words through every scripted life, a booking in the practice world, no invented money", async () => {
    const world = mockCourierWorld('redx');
    world.reset();
    const api = await redxAdapter.mock!({} as never);
    const b = await api.book({ ...parcel, merchantRef: 'EX-PR-1' });
    expect(b).toMatchObject({ ok: true, status: 'PENDING_PICKUP', rawStatus: 'pending', chargeMinor: null });
    expect(b.ok && b.consignmentId).toMatch(/^MOCK-RX-/);
    for (const steps of Object.values(MOCK_SCRIPTS))
      for (const st of steps) {
        const word = redxVocabulary.say(st);
        const mapped = mapStatus(redxVocabulary.table, word).status;
        // RedX has no word for a lost or a damaged parcel (staff record those by hand)
        if (st.status === 'LOST' || st.status === 'DAMAGED') expect(mapped, st.status).toBeNull();
        else expect(mapped, st.status).not.toBeNull();
      }
    // no lookup by reference on the practice world either
    await expect(api.findByRef('EX-PR-1')).rejects.toThrow(/panel/);
    world.reset();
  });

  it('Keys & connections: one token, optional store and https address; practice until the Test passes; listed with the other couriers', () => {
    expect(redxAdapter).toMatchObject({ kind: 'COURIER', provider: 'redx', modes: ['SANDBOX', 'LIVE'], secrets: ['accessToken'] });
    expect(REDX_LIVE_BASE_URL.startsWith('https://')).toBe(true);
    expect(REDX_SANDBOX_BASE_URL.startsWith('https://')).toBe(true);
    expect(redxAdapter.configSchema.safeParse({ baseUrl: 'http://plain.example.test' }).success).toBe(false);
    expect(redxAdapter.configSchema.safeParse({ pickupStoreId: 'abc' }).success).toBe(false);
    expect(redxAdapter.configSchema.safeParse({}).success).toBe(true);
    expect(connectionCatalogue.find((c) => c.provider === 'redx')).toMatchObject({ kind: 'COURIER', secrets: [{ field: 'accessToken' }] });
    expect(courierAdapters.map((a) => a.provider)).toContain('redx');
    expect(keyedCourierAdapters.map((a) => a.provider)).toContain('redx');
    expect(courierCapabilitiesOf('redx')).toMatchObject({ booking: true, payouts: 'none' });
  });
});

// PR 176 — Steadfast behind the courier contract: the HTTP client against a stand-in server (never the real one, no real
// keys), its status words mapped onto the shop's states with the exceptions of SIM-F-017, a lost answer recovered by the
// shop's reference, the practice Steadfast in Steadfast's own words, and the adapter's keys in Keys & connections.
import { describe, expect, it } from 'vitest';
import {
  connectionCatalogue,
  createSteadfastClient,
  mapStatus,
  mockCourierWorld,
  STEADFAST_DEFAULT_BASE_URL,
  steadfastAdapter,
  steadfastStatusTable,
  steadfastVocabulary,
  MOCK_SCRIPTS,
  type CourierParcel,
} from '../src';

const BASE = 'https://courier.example.test/api/v1';
const KEYS = { apiKey: 'test-api-key', secretKey: 'test-secret-key' };

interface Seen {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/** A stand-in Steadfast: answers by path, records every request. */
function stand(answers: Record<string, { status?: number; body?: unknown } | Error>) {
  const seen: Seen[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    seen.push({ method: init?.method ?? 'GET', url, headers: init?.headers as Record<string, string>, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const key = Object.keys(answers).find((k) => url.endsWith(k));
    const a = key ? answers[key]! : { status: 404, body: { status: 404, message: 'Not found' } };
    if (a instanceof Error) throw a;
    return new Response(JSON.stringify(a.body ?? {}), { status: a.status ?? 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { seen, fetchFn };
}

const parcel: CourierParcel = {
  merchantRef: 'EX-1001-1',
  receiver: { name: 'Test Receiver', phone: '01700001761', address: 'House 1, Road 2, Dhanmondi, Dhaka' }, // hardcode-ok: a made-up test number
  zone: { cityId: null, zoneId: null, areaId: null },
  codMinor: 154_050,
  declaredValueMinor: null,
  weightGrams: 2100,
  itemCount: 3,
  description: 'Oxford shirt (Sky, M) x3',
  note: 'Gift from Rafiq: deliver on or after 2026-11-02.', // hardcode-ok: a fixed test day
};

describe('Steadfast (PR 176)', () => {
  it('books with the keys in the headers, the shop\'s reference as the invoice and the COD in taka', async () => {
    const s = stand({ '/create_order': { body: { status: 200, message: 'Consignment has been created successfully.', consignment: { consignment_id: 1424107, invoice: 'EX-1001-1', tracking_code: '15BAEB8A', status: 'in_review' } } } });
    const api = createSteadfastClient({ baseUrl: `${BASE}/`, ...KEYS, fetch: s.fetchFn });
    const r = await api.book(parcel);
    expect(r).toEqual({ ok: true, consignmentId: '1424107', trackingCode: '15BAEB8A', status: 'IN_REVIEW', rawStatus: 'in_review', chargeMinor: null });
    expect(s.seen[0]).toMatchObject({ method: 'POST', url: `${BASE}/create_order`, headers: { 'Api-Key': KEYS.apiKey, 'Secret-Key': KEYS.secretKey } });
    expect(s.seen[0]!.body).toEqual({ invoice: 'EX-1001-1', recipient_name: 'Test Receiver', recipient_phone: '01700001761', recipient_address: parcel.receiver.address, cod_amount: 1540.5, note: parcel.note, item_description: parcel.description, total_lot: 3 }); // hardcode-ok: a made-up test number
  });

  it('a refusal is a failure with Steadfast\'s reasons; a 5xx, a timeout or an answer without an id is "unknown" (ask before booking again)', async () => {
    const refused = createSteadfastClient({ baseUrl: BASE, ...KEYS, fetch: stand({ '/create_order': { status: 422, body: { status: 422, message: 'Validation failed', errors: { recipient_phone: ['The recipient phone must be 11 digits.'] } } } }).fetchFn });
    const r1 = await refused.book(parcel);
    expect(r1).toMatchObject({ ok: false, unknown: false });
    expect(!r1.ok && r1.error).toContain('recipient phone must be 11 digits');
    const down = createSteadfastClient({ baseUrl: BASE, ...KEYS, fetch: stand({ '/create_order': { status: 502, body: {} } }).fetchFn });
    expect(await down.book(parcel)).toMatchObject({ ok: false, unknown: true });
    const gone = createSteadfastClient({ baseUrl: BASE, ...KEYS, fetch: stand({ '/create_order': new Error('socket hang up') }).fetchFn });
    expect(await gone.book(parcel)).toMatchObject({ ok: false, unknown: true });
    const odd = createSteadfastClient({ baseUrl: BASE, ...KEYS, fetch: stand({ '/create_order': { body: { status: 200 } } }).fetchFn });
    expect(await odd.book(parcel)).toMatchObject({ ok: false, unknown: true });
  });

  it('finds a lost booking by the shop\'s reference (status only, tracked by reference); nothing found is null', async () => {
    const s = stand({ '/status_by_invoice/EX-1001-1': { body: { status: 200, delivery_status: 'in_review' } } });
    const api = createSteadfastClient({ baseUrl: BASE, ...KEYS, fetch: s.fetchFn });
    expect(await api.findByRef('EX-1001-1')).toEqual({ consignmentId: null, trackingCode: null, status: 'IN_REVIEW', rawStatus: 'in_review' });
    expect(await api.findByRef('EX-9999-1')).toBeNull();
  });

  it('SIM-F-017: a poll reports a change only (Steadfast gives the current word); "hold" is a failed try with its reason; unknown words stay raw', async () => {
    let word = 'pending';
    const fetchFn = (async () => new Response(JSON.stringify({ status: 200, delivery_status: word }), { status: 200 })) as unknown as typeof fetch;
    let t = Date.parse('2026-10-24T08:00:00Z'); // hardcode-ok: a fixed test clock
    const api = createSteadfastClient({ baseUrl: BASE, ...KEYS, fetch: fetchFn, now: () => t });
    const ref = { consignmentId: '1424107', trackingCode: null, merchantRef: 'EX-1001-1' };
    const first = await api.track({ ...ref, lastRawStatus: 'in_review' });
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ status: 'IN_TRANSIT', rawStatus: 'pending', providerEventId: `1424107:pending:${t}` });
    expect(await api.track({ ...ref, lastRawStatus: 'pending' })).toEqual([]);
    word = 'hold';
    t += 60_000;
    expect((await api.track({ ...ref, lastRawStatus: 'pending' }))[0]).toMatchObject({ status: 'ATTEMPT_FAILED', reasonKey: 'receiverAskedLater', codCollectedMinor: null });
    word = 'unknown_approval_pending';
    expect((await api.track({ ...ref, lastRawStatus: 'hold' }))[0]).toMatchObject({ status: null, rawStatus: 'unknown_approval_pending' });
    // by reference when the courier gave no id
    const s = stand({ '/status_by_invoice/EX-1001-1': { body: { delivery_status: 'delivered' } } });
    const byRef = createSteadfastClient({ baseUrl: BASE, ...KEYS, fetch: s.fetchFn });
    expect((await byRef.track({ consignmentId: null, trackingCode: null, merchantRef: 'EX-1001-1' }))[0]).toMatchObject({ status: 'DELIVERED' });
    expect(await byRef.track({ consignmentId: null, trackingCode: null, merchantRef: null })).toEqual([]);
  });

  it('the status table: every word maps to a shop state (cancelled at the door comes back as RETURNING); the Test reads the balance', async () => {
    expect(mapStatus(steadfastStatusTable, 'partial_delivered_approval_pending')).toEqual({ status: 'PARTIALLY_DELIVERED', reasonKey: null });
    expect(mapStatus(steadfastStatusTable, 'cancelled')).toEqual({ status: 'RETURNING', reasonKey: null });
    expect(mapStatus(steadfastStatusTable, 'Delivered')).toEqual({ status: 'DELIVERED', reasonKey: null });
    const ok = createSteadfastClient({ baseUrl: BASE, ...KEYS, fetch: stand({ '/get_balance': { body: { status: 200, current_balance: 0 } } }).fetchFn });
    expect(await ok.health()).toMatchObject({ ok: true });
    const bad = createSteadfastClient({ baseUrl: BASE, ...KEYS, fetch: stand({ '/get_balance': { status: 401, body: { message: 'Unauthorized' } } }).fetchFn });
    await expect(bad.health()).rejects.toThrow(/401/);
  });

  it('the practice Steadfast speaks Steadfast\'s words and every scripted life maps back (lost and damaged stay raw: it has no word)', async () => {
    const api = await steadfastAdapter.mock!({} as never);
    const world = mockCourierWorld('steadfast');
    world.plan('EX-PR-1', 'failedAttempt');
    const b = await api.book({ ...parcel, merchantRef: 'EX-PR-1' });
    expect(b).toMatchObject({ ok: true, status: 'IN_REVIEW', rawStatus: 'in_review', chargeMinor: null });
    expect(b.ok && b.consignmentId).toMatch(/^MOCK-SF-/);
    // Steadfast has no word for a lost or a damaged parcel: those stay raw and flagged (staff record them by hand)
    for (const steps of Object.values(MOCK_SCRIPTS))
      for (const st of steps) {
        const mapped = mapStatus(steadfastVocabulary.table, steadfastVocabulary.say(st)).status;
        if (st.status === 'LOST' || st.status === 'DAMAGED') expect(mapped, st.status).toBeNull();
        else expect(mapped, st.status).not.toBeNull();
      }
    world.reset();
  });

  it('Keys & connections: two keys, an optional https address; practice until they pass', () => {
    expect(steadfastAdapter).toMatchObject({ kind: 'COURIER', provider: 'steadfast', modes: ['SANDBOX', 'LIVE'], secrets: ['apiKey', 'secretKey'] });
    expect(STEADFAST_DEFAULT_BASE_URL.startsWith('https://')).toBe(true);
    expect(steadfastAdapter.configSchema.safeParse({ baseUrl: 'http://plain.example.test' }).success).toBe(false);
    expect(steadfastAdapter.configSchema.safeParse({}).success).toBe(true);
    expect(connectionCatalogue.find((c) => c.provider === 'steadfast')).toMatchObject({ kind: 'COURIER', secrets: [{ field: 'apiKey' }, { field: 'secretKey' }] });
  });
});

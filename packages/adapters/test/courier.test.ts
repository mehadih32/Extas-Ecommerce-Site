// PR 175 — the courier contract and the practice courier (SIM-F-017, SIM-F-027): every scripted life plays out in the
// courier's own words and maps back to the shop's states, every exception state is reachable with its reason, ids are
// deterministic and a timeout never books twice, and the practice courier never reports money.
import { describe, expect, it } from 'vitest';
import {
  COURIER_STATES,
  courierAdapters,
  createConnections,
  EXCEPTION_REASONS,
  EXCEPTION_STATES,
  mapStatus,
  MOCK_COURIER_PROVIDER,
  MOCK_SCENARIOS,
  MOCK_SCRIPTS,
  mockCourierAdapter,
  mockCourierWorld,
  takaToMinor,
  type CourierApi,
  type CourierParcel,
  type MockScenario,
} from '../src';

const parcel = (merchantRef: string, over: Partial<CourierParcel> = {}): CourierParcel => ({
  merchantRef,
  receiver: { name: 'Test Receiver', phone: '01700000175', address: 'House 1, Road 2, Dhanmondi, Dhaka' }, // hardcode-ok: a made-up test number
  zone: { cityId: null, zoneId: null, areaId: null },
  codMinor: 150_000,
  declaredValueMinor: 150_000,
  weightGrams: 400,
  itemCount: 1,
  description: null,
  note: null,
  ...over,
});

async function practice(): Promise<CourierApi> {
  return mockCourierAdapter.mock({ mode: 'MOCK', config: {}, storeId: 1, secret: async () => null });
}

/** Books a parcel on `scenario` and reads it until its script ends; returns every read's events. */
async function play(api: CourierApi, ref: string, scenario: MockScenario) {
  mockCourierWorld(api.provider).plan(ref, scenario);
  const booked = await api.book(parcel(ref));
  if (!booked.ok) throw new Error(booked.error);
  const reads = [];
  for (let i = 0; i < MOCK_SCRIPTS[scenario].length + 2; i++) reads.push(await api.track({ consignmentId: booked.consignmentId, trackingCode: booked.trackingCode, merchantRef: ref }));
  return { booked, reads, last: reads[reads.length - 1]! };
}

describe('the courier contract (PR 175)', () => {
  it('maps a courier word through its table; an unknown word is kept raw with no state (never guessed)', () => {
    const table = { delivered: { status: 'DELIVERED' as const }, hold: { status: 'ATTEMPT_FAILED' as const, reasonKey: 'receiverAskedLater' } };
    expect(mapStatus(table, ' Delivered ')).toEqual({ status: 'DELIVERED', reasonKey: null });
    expect(mapStatus(table, 'HOLD')).toEqual({ status: 'ATTEMPT_FAILED', reasonKey: 'receiverAskedLater' });
    expect(mapStatus(table, 'teleported')).toEqual({ status: null, reasonKey: null });
    expect(mapStatus(table, null)).toEqual({ status: null, reasonKey: null });
  });

  it('reads taka amounts as minor units, and nothing else', () => {
    expect(takaToMinor('120')).toBe(12_000);
    expect(takaToMinor(65.5)).toBe(6_550);
    expect(takaToMinor('abc')).toBeNull();
    expect(takaToMinor(-1)).toBeNull();
    expect(takaToMinor(null)).toBeNull();
  });

  it('SIM-F-017: every exception state has reasons, and each is a state of the contract', () => {
    for (const s of EXCEPTION_STATES) {
      expect(COURIER_STATES).toContain(s);
      expect(EXCEPTION_REASONS[s].length).toBeGreaterThan(0);
      expect(EXCEPTION_REASONS[s]).toContain('other');
    }
  });
});

describe('the practice courier (PR 175)', () => {
  it('is a COURIER adapter with no key and no live mode, reached through the connection layer as MOCK', async () => {
    expect(mockCourierAdapter.kind).toBe('COURIER');
    expect(mockCourierAdapter.secrets).toEqual([]);
    expect(mockCourierAdapter.modes).toEqual([]);
    expect(courierAdapters.map((a) => a.provider)).toContain(MOCK_COURIER_PROVIDER);
    const db = { integration: { findMany: async () => [] } } as never;
    const c = createConnections({ db, vault: { get: async () => null }, adapters: courierAdapters, secretCacheMs: 0, testTimeoutMs: 1_000 });
    const used = await c.use<CourierApi>('COURIER', { storeId: 1, provider: MOCK_COURIER_PROVIDER });
    expect(used).toMatchObject({ mode: 'MOCK', provider: MOCK_COURIER_PROVIDER, integrationId: null });
    expect(await used.api.health()).toMatchObject({ ok: true });
  });

  it('gives deterministic "MOCK-…" ids; the same reference is the same parcel, never a second one', async () => {
    const api = await practice();
    mockCourierWorld(api.provider).reset();
    const a = await api.book(parcel('EX-1-1'));
    const again = await api.book(parcel('EX-1-1'));
    const b = await api.book(parcel('EX-1-2'));
    expect(a.ok && again.ok && b.ok).toBe(true);
    if (!a.ok || !again.ok || !b.ok) return;
    expect(a.consignmentId).toMatch(/^MOCK-P-[0-9A-F]{10}$/);
    expect(again.consignmentId).toBe(a.consignmentId);
    expect(b.consignmentId).not.toBe(a.consignmentId);
    expect(mockCourierWorld(api.provider).booked()).toHaveLength(2);
  });

  it('a lost answer (timeout) is "unknown": the parcel is found by its reference, and booking again books nothing new', async () => {
    const api = await practice();
    const w = mockCourierWorld(api.provider);
    w.reset();
    w.failNext('timeout');
    const lost = await api.book(parcel('EX-2-1'));
    expect(lost).toMatchObject({ ok: false, unknown: true });
    const found = await api.findByRef('EX-2-1');
    expect(found?.consignmentId).toMatch(/^MOCK-P-/);
    const retry = await api.book(parcel('EX-2-1'));
    expect(retry.ok && retry.consignmentId).toBe(found!.consignmentId);
    expect(w.booked()).toHaveLength(1);
    w.failNext('error');
    expect(await api.book(parcel('EX-2-2'))).toMatchObject({ ok: false, unknown: false });
    expect(await api.findByRef('EX-2-2')).toBeNull();
  });

  it('refuses a parcel the courier could not deliver (no mobile number, no address, no name)', async () => {
    const api = await practice();
    expect(await api.book(parcel('EX-3-1', { receiver: { name: 'A', phone: '12345', address: 'x' } }))).toMatchObject({ ok: false, unknown: false });
    expect(await api.book(parcel('EX-3-2', { receiver: { name: 'A', phone: '01700000175', address: ' ' } }))).toMatchObject({ ok: false }); // hardcode-ok: a made-up test number
    expect(await api.book(parcel('EX-3-3', { receiver: { name: '', phone: '01700000175', address: 'x' } }))).toMatchObject({ ok: false }); // hardcode-ok: a made-up test number
  });

  it.each(MOCK_SCENARIOS)('SIM-F-017: the "%s" life plays out step by step, every word understood, ids stable', async (scenario) => {
    const api = await practice();
    const { booked, reads, last } = await play(api, `EX-4-${scenario}`, scenario);
    const script = MOCK_SCRIPTS[scenario];
    expect(booked.ok && booked.status).toBe(script[0]!.status);
    expect(last.map((e) => e.status)).toEqual(script.map((s) => s.status));
    // each read adds one step until the script ends; the earlier events keep their ids and times
    expect(reads[0]!.length).toBe(2);
    expect(reads[1]!.slice(0, 2)).toEqual(reads[0]);
    expect(new Set(last.map((e) => e.providerEventId)).size).toBe(last.length);
    for (const e of last) {
      expect(e.status).not.toBeNull();
      if ((EXCEPTION_STATES as readonly string[]).includes(e.status!)) expect((EXCEPTION_REASONS as Record<string, readonly string[]>)[e.status!]).toContain(e.reasonKey);
    }
  });

  it('SIM-F-017: the scripts reach every exception state (failed try, address problem, lost, damaged) and a partial delivery', () => {
    const reached = new Set(Object.values(MOCK_SCRIPTS).flatMap((s) => s.map((x) => x.status)));
    for (const s of [...EXCEPTION_STATES, 'PARTIALLY_DELIVERED', 'RETURNED', 'IN_REVIEW'] as const) expect(reached.has(s), s).toBe(true);
  });

  it('SIM-F-027: the practice courier never reports money — no charge at booking, none collected, none in any event', async () => {
    const api = await practice();
    for (const scenario of MOCK_SCENARIOS) {
      const { booked, last } = await play(api, `EX-5-${scenario}`, scenario);
      expect(booked.ok && booked.chargeMinor).toBeNull();
      for (const e of last) {
        expect(e.chargeMinor).toBeNull();
        expect(e.codCollectedMinor).toBeNull();
      }
    }
  });
});

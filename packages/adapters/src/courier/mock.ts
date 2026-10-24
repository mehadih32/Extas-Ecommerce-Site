// PR 175 — the practice courier (BACKEND-ARCHITECTURE §7.4 "Mock adapter (first)"). Every courier adapter runs on it
// until the owner types the courier's keys into Keys & connections: nothing leaves the server, consignment ids are
// deterministic ("MOCK-…", the same reference always gives the same id, like a real courier refusing a duplicate
// invoice), and each parcel follows a scripted life, one step per tracking read, in the courier's OWN words (so the
// adapter's status table is exercised exactly as with the real courier). The scripts include every exception of
// SIM-F-017: a failed delivery try, an address problem, a lost parcel, a damaged parcel, a partial delivery and a refusal
// that comes back.
//
// What the mock never does: invent money. It reports no charge and no collected amount, so a practice parcel can never
// be read as the shop's real courier cost (SIM-F-027). Tests and the staging check steer it through `mockCourierWorld`.
import { createHash } from 'node:crypto';
import type { BookResult, CourierApi, CourierCapabilities, CourierEvent, CourierParcel, CourierState, StatusTable } from './contract';
import { mapStatus } from './contract';

/** A scripted parcel life. `delivered` is the default; the others are the simulation's exceptions. */
export const MOCK_SCENARIOS = ['delivered', 'review', 'failedAttempt', 'addressProblem', 'lost', 'damaged', 'partial', 'refused'] as const;
export type MockScenario = (typeof MOCK_SCENARIOS)[number];

interface Step {
  status: CourierState;
  reasonKey?: string;
  note?: string;
}

const START: Step[] = [{ status: 'PENDING_PICKUP' }, { status: 'PICKED_UP' }, { status: 'IN_TRANSIT' }];

/** Each scenario's steps after booking (the first is the state the booking itself returns). */
export const MOCK_SCRIPTS: Readonly<Record<MockScenario, readonly Step[]>> = {
  delivered: [...START, { status: 'OUT_FOR_DELIVERY' }, { status: 'DELIVERED' }],
  review: [{ status: 'IN_REVIEW' }, ...START, { status: 'OUT_FOR_DELIVERY' }, { status: 'DELIVERED' }],
  failedAttempt: [...START, { status: 'OUT_FOR_DELIVERY' }, { status: 'ATTEMPT_FAILED', reasonKey: 'receiverUnreachable', note: 'receiver not answering' }, { status: 'OUT_FOR_DELIVERY' }, { status: 'DELIVERED' }],
  addressProblem: [...START, { status: 'ADDRESS_PROBLEM', reasonKey: 'addressNotFound', note: 'rider cannot find the house' }, { status: 'OUT_FOR_DELIVERY' }, { status: 'DELIVERED' }],
  lost: [...START, { status: 'LOST', reasonKey: 'lostInTransit' }],
  damaged: [...START, { status: 'DAMAGED', reasonKey: 'damagedInTransit' }],
  partial: [...START, { status: 'OUT_FOR_DELIVERY' }, { status: 'PARTIALLY_DELIVERED', note: 'kept one piece' }],
  refused: [...START, { status: 'OUT_FOR_DELIVERY' }, { status: 'RETURNING', note: 'refused at the door' }, { status: 'RETURNED' }],
};

/** How a provider's mock says each step (its own raw words) and reads them back (its status table). */
export interface MockVocabulary {
  /** Prefix of the consignment ids (`MOCK-<prefix>-…`). */
  prefix: string;
  say(step: { status: CourierState; reasonKey?: string }): string;
  table: StatusTable;
}

interface MockParcel {
  consignmentId: string;
  trackingCode: string;
  parcel: CourierParcel;
  scenario: MockScenario;
  /** How many steps have happened (1 = the booking's own state). */
  reached: number;
  bookedAt: number;
}

interface MockState {
  parcels: Map<string, MockParcel>;
  planned: Map<string, MockScenario>;
  failNext: ('error' | 'timeout')[];
  /** The clock the world's event times are read from (tests set the shop's test clock). */
  clock: (() => number) | null;
}

const G = globalThis as unknown as { __extasMockCourier?: Map<string, MockState> };
const worlds = (): Map<string, MockState> => (G.__extasMockCourier ??= new Map());
function stateOf(provider: string): MockState {
  let s = worlds().get(provider);
  if (!s) worlds().set(provider, (s = { parcels: new Map(), planned: new Map(), failNext: [], clock: null }));
  return s;
}

const MINUTE = 60_000;

/** Tests and the staging check steer one provider's practice courier (this process only). */
export function mockCourierWorld(provider: string) {
  const s = stateOf(provider);
  return {
    /** The parcel booked under this reference follows `scenario` (set before booking). */
    plan(merchantRef: string, scenario: MockScenario): void {
      s.planned.set(merchantRef, scenario);
    },
    /** The next booking fails: `error` (refused, nothing booked) or `timeout` (booked, but the answer is lost). */
    failNext(kind: 'error' | 'timeout'): void {
      s.failNext.push(kind);
    },
    /** Every parcel as it was sent, in booking order. */
    booked(): { consignmentId: string; parcel: CourierParcel; scenario: MockScenario }[] {
      return [...s.parcels.values()].map((p) => ({ consignmentId: p.consignmentId, parcel: p.parcel, scenario: p.scenario }));
    },
    byRef(merchantRef: string): CourierParcel | undefined {
      return [...s.parcels.values()].find((p) => p.parcel.merchantRef === merchantRef)?.parcel;
    },
    /** Event times follow this clock instead of the server's (tests); null: the server's clock again. */
    useClock(clock: (() => number) | null): void {
      s.clock = clock;
    },
    reset(): void {
      s.parcels.clear();
      s.planned.clear();
      s.failNext.length = 0;
      s.clock = null;
    },
  };
}

/** The phone a courier accepts: a Bangladeshi mobile number 01XXXXXXXXX. */
const BD_MOBILE = /^01[3-9]\d{8}$/;

/** A practice courier speaking `vocab`; `now` is the clock its event times are made from (unless the world's is set). */
export function createMockCourier(provider: string, vocab: MockVocabulary, capabilities: CourierCapabilities, now: () => number = Date.now): CourierApi {
  const s = stateOf(provider);
  const idOf = (ref: string) => `MOCK-${vocab.prefix}-${createHash('sha256').update(`${provider}:${ref}`).digest('hex').slice(0, 10).toUpperCase()}`;
  const stepAt = (p: MockParcel, i: number) => MOCK_SCRIPTS[p.scenario][i]!;

  function eventsOf(p: MockParcel): CourierEvent[] {
    const out: CourierEvent[] = [];
    for (let i = 0; i < p.reached; i++) {
      const step = stepAt(p, i);
      const raw = vocab.say(step);
      const mapped = mapStatus(vocab.table, raw);
      out.push({
        providerEventId: `${p.consignmentId}:${i + 1}`,
        status: mapped.status,
        rawStatus: raw,
        occurredAt: new Date(p.bookedAt + i * MINUTE),
        note: step.note ?? null,
        reasonKey: mapped.reasonKey ?? step.reasonKey ?? null,
        codCollectedMinor: null,
        chargeMinor: null,
      });
    }
    return out;
  }

  return {
    provider,
    capabilities,
    async book(parcel): Promise<BookResult> {
      const fail = s.failNext.shift();
      if (fail === 'error') return { ok: false, error: 'practice courier: booking refused (planned failure)', unknown: false };
      if (!BD_MOBILE.test(parcel.receiver.phone)) return { ok: false, error: 'the receiver phone is not a mobile number 01XXXXXXXXX', unknown: false };
      if (!parcel.receiver.address.trim()) return { ok: false, error: 'the address is empty', unknown: false };
      if (!parcel.receiver.name.trim()) return { ok: false, error: 'the receiver name is empty', unknown: false };
      // like the real courier: one that charges by weight refuses a parcel without it
      if (capabilities.weightRequired && parcel.weightGrams === null) return { ok: false, error: 'the parcel weight is missing', unknown: false };
      const consignmentId = idOf(parcel.merchantRef);
      let p = s.parcels.get(consignmentId);
      if (!p) {
        p = { consignmentId, trackingCode: consignmentId.slice(-8), parcel: structuredClone(parcel), scenario: s.planned.get(parcel.merchantRef) ?? 'delivered', reached: 1, bookedAt: (s.clock ?? now)() };
        s.parcels.set(consignmentId, p);
      }
      if (fail === 'timeout') return { ok: false, error: 'practice courier: no answer (planned timeout)', unknown: true };
      const first = vocab.say(stepAt(p, 0));
      return { ok: true, consignmentId, trackingCode: p.trackingCode, status: mapStatus(vocab.table, first).status, rawStatus: first, chargeMinor: null };
    },
    async findByRef(merchantRef) {
      const p = s.parcels.get(idOf(merchantRef));
      if (!p) return null;
      const raw = vocab.say(stepAt(p, p.reached - 1));
      return { consignmentId: p.consignmentId, trackingCode: p.trackingCode, status: mapStatus(vocab.table, raw).status, rawStatus: raw };
    },
    async track(ref) {
      const p = ref.consignmentId ? s.parcels.get(ref.consignmentId) : ref.merchantRef ? s.parcels.get(idOf(ref.merchantRef)) : undefined;
      if (!p) return [];
      // every read moves the practice parcel one step on, so a few polls play its whole life
      p.reached = Math.min(p.reached + 1, MOCK_SCRIPTS[p.scenario].length);
      return eventsOf(p);
    },
    async health() {
      return { ok: true, message: 'practice courier: nothing leaves the server' };
    },
  };
}

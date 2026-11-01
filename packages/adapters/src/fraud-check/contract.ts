// S06 · PR 567 — the courier fraud check contract (kind FRAUD_CHECK): one question every source answers — "how many of
// this number's parcels were delivered, and how many cancelled or refused?" — whether it is Steadfast's own check,
// Pathao's own check, or an aggregator that sums several couriers. A customer's refusal history is spread across couriers
// and none of them share it, so the shop asks every connected source (@extas/orders `phoneRiskCheck`, PR 559), keeps each
// answer, and the owner's pattern signal draws the maximum from them (the highest failure share of any source). Each
// source's own words, paths and keys stay inside its adapter; a source only ever reports counts, never a verdict.
//
// A connection is used only once its Test passes (A1.3): until then the mock answers "nothing known" for every number,
// and the shop asks nobody. An answer that is not two whole counts is no answer (the customer simply passes).
import { z } from 'zod';

/** What one source knows about one number. */
export interface FraudCheckAnswer {
  delivered: number;
  /** Cancelled or refused at the door. */
  cancelled: number;
}

export interface FraudCheckApi {
  /** The source's short name kept with each answer ('steadfast', 'pathao', 'aggregator'). */
  source: string;
  /** Asks about one Bangladeshi mobile (E.164, +8801…); gives up when `signal` aborts. */
  check(phoneE164: string, signal?: AbortSignal): Promise<FraudCheckAnswer>;
  /** One cheap round trip for the Test button. */
  health(): Promise<{ ok: boolean; message: string }>;
}

export class FraudCheckError extends Error {}

const BD_E164 = /^\+8801[3-9]\d{8}$/;

/** The number as the couriers write it (01XXXXXXXXX); a number that is not a Bangladeshi mobile is refused. */
export function localNumberBD(phoneE164: string): string {
  if (!BD_E164.test(phoneE164)) throw new FraudCheckError('not a Bangladeshi mobile number');
  return `0${phoneE164.slice(4)}`;
}

const count = z.coerce.number().int().min(0).max(1_000_000);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** The first key of `keys` in `o` that holds a whole count, or null. */
function pick(o: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const k of keys) {
    if (o[k] === undefined || o[k] === null || o[k] === '') continue;
    const r = count.safeParse(o[k]);
    if (r.success) return r.data;
  }
  return null;
}

const DELIVERED_KEYS = ['total_delivered', 'delivered', 'success_parcel', 'successful_delivery', 'success'] as const;
const CANCELLED_KEYS = ['total_cancelled', 'cancelled', 'cancelled_parcel', 'cancel', 'returned'] as const;

/**
 * Reads two counts from a source's answer (pure). Looks at the body itself, then its `data`, `summary`,
 * `data.summary`, `courierData.summary` and `data.customer`; Pathao's customer answer gives the total and the successful
 * ones, so the cancelled are the rest. Null when no pair of whole counts is there.
 */
export function readCounts(body: unknown): FraudCheckAnswer | null {
  const b = obj(body);
  const data = obj(b.data);
  const places = [b, data, obj(b.summary), obj(data.summary), obj(obj(b.courierData).summary), obj(data.customer)];
  for (const o of places) {
    const delivered = pick(o, DELIVERED_KEYS);
    const cancelled = pick(o, CANCELLED_KEYS);
    if (delivered !== null && cancelled !== null) return { delivered, cancelled };
    const total = pick(o, ['total_delivery', 'total_parcel', 'total_parcels']);
    if (delivered !== null && total !== null && total >= delivered) return { delivered, cancelled: total - delivered };
  }
  return null;
}

/** "Nothing known": the mock's answer, and what a number no courier has seen looks like. */
export const NOTHING_KNOWN: FraudCheckAnswer = { delivered: 0, cancelled: 0 };

/**
 * The practice source: answers "nothing known" for every number unless a test hands it sample answers (by the number as
 * the couriers write it). Never used for a real customer: the shop asks only connections whose Test passed.
 */
export function createMockFraudCheck(source: string, samples: Readonly<Record<string, FraudCheckAnswer>> = {}): FraudCheckApi {
  return {
    source,
    async check(phoneE164, signal) {
      if (signal?.aborted) throw new FraudCheckError('asked to stop');
      return samples[localNumberBD(phoneE164)] ?? NOTHING_KNOWN;
    },
    async health() {
      return { ok: true, message: `${source}: practice — nothing is asked` };
    },
  };
}

type Fetch = typeof fetch;

export interface HttpCheckOptions {
  source: string;
  url: (local: string) => string;
  method?: 'GET' | 'POST';
  body?: (local: string) => unknown;
  headers: () => Promise<Record<string, string>>;
  /** A 401 gets one fresh set of headers and one more try (a token that ran out). */
  refresh?: () => Promise<void>;
  fetch?: Fetch;
  /** The number the Test asks about (a well-formed number nobody uses). */
  probe: string;
}

/** One HTTP fraud check (SANDBOX / LIVE): a GET or POST per number, two counts read from the answer. */
export function createHttpFraudCheck(o: HttpCheckOptions): FraudCheckApi {
  const doFetch = o.fetch ?? fetch;
  async function once(local: string, signal?: AbortSignal): Promise<Response> {
    try {
      return await doFetch(o.url(local), {
        method: o.method ?? 'GET',
        headers: { Accept: 'application/json', ...(o.body ? { 'Content-Type': 'application/json' } : {}), ...(await o.headers()) },
        body: o.body ? JSON.stringify(o.body(local)) : undefined,
        signal,
      });
    } catch (e) {
      throw new FraudCheckError(`${o.source} did not answer: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200));
    }
  }
  async function check(phoneE164: string, signal?: AbortSignal): Promise<FraudCheckAnswer> {
    const local = localNumberBD(phoneE164);
    let res = await once(local, signal);
    if (res.status === 401 && o.refresh) {
      await o.refresh();
      res = await once(local, signal);
    }
    if (!res.ok) throw new FraudCheckError(`${o.source} refused (${res.status})`);
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      throw new FraudCheckError(`${o.source} gave an answer that is not JSON`);
    }
    const counts = readCounts(body);
    if (!counts) throw new FraudCheckError(`${o.source} gave no delivered and cancelled counts`);
    return counts;
  }
  return {
    source: o.source,
    check,
    async health() {
      const a = await check(o.probe);
      return { ok: true, message: `${o.source}: the check answers (${a.delivered} delivered, ${a.cancelled} cancelled for the test number)` };
    },
  };
}

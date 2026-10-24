// PR 176 — Steadfast Courier behind the courier contract (provider `steadfast`). The owner types the API key and the
// secret key from Steadfast's merchant panel into Keys & connections (vault names `steadfast.apiKey`,
// `steadfast.secretKey`); the Test button reads the account's balance endpoint, so a pass proves both keys. Until then,
// and whenever its test fails, Steadfast runs on its practice world in Steadfast's own words (mock.ts) — the shop never
// waits for a key (A1.3).
//
// What Steadfast's API offers (its merchant API v1): booking (`create_order`, the shop's reference as the invoice, COD
// in taka), the parcel's current status by consignment id or by invoice (one word, no history), the balance, and
// status webhooks (PR 184 reads them). It has no zone ids, no weight and no declared value on a booking, and no
// cancel. Its status words map onto the shop's states here; a word not in the table stays raw and flagged:
//   in_review → IN_REVIEW · pending (with the courier, from pickup to the door) → IN_TRANSIT · hold → ATTEMPT_FAILED
//   (receiver asked for another day) · delivered and delivered_approval_pending → DELIVERED · partial_delivered(…) →
//   PARTIALLY_DELIVERED · cancelled and cancelled_approval_pending → RETURNING (refused or cancelled at the door, the
//   parcel comes back; receiving it is PR 189) · unknown, unknown_approval_pending → kept raw.
// A poll gives only the current word, so the adapter reports an event only when the word changed since the parcel's
// last one (the shop sends it in `lastRawStatus`).
import { z } from 'zod';
import { defineAdapter, requireSecret } from '../define';
import { type BookResult, type CourierApi, type CourierCapabilities, type CourierParcel, type StatusTable } from './contract';
import { createMockCourier, type MockVocabulary } from './mock';

export const STEADFAST_PROVIDER = 'steadfast';

/** Steadfast's public API address (its merchant API v1); a different one can be set on the connection. */
export const STEADFAST_DEFAULT_BASE_URL = 'https://portal.packzy.com/api/v1';

export const steadfastStatusTable: StatusTable = {
  in_review: { status: 'IN_REVIEW' },
  pending: { status: 'IN_TRANSIT' },
  hold: { status: 'ATTEMPT_FAILED', reasonKey: 'receiverAskedLater' },
  delivered_approval_pending: { status: 'DELIVERED' },
  delivered: { status: 'DELIVERED' },
  partial_delivered_approval_pending: { status: 'PARTIALLY_DELIVERED' },
  partial_delivered: { status: 'PARTIALLY_DELIVERED' },
  cancelled_approval_pending: { status: 'RETURNING' },
  cancelled: { status: 'RETURNING' },
};

export const steadfastCapabilities: CourierCapabilities = {
  booking: true,
  tracking: 'both',
  partialDelivery: true,
  zoneIds: false,
  // PR 554: Steadfast reads the address itself and publishes no place list: nothing to sync
  zoneList: false,
  zoneNeeds: null,
  weight: false,
  declaredValue: false,
  cancel: false,
};

/** How the practice Steadfast says each step: in Steadfast's own words (lost, damaged: words it has none for). */
export const steadfastVocabulary: MockVocabulary = {
  prefix: 'SF',
  say(step) {
    switch (step.status) {
      // a new parcel is in Steadfast's review until its rider picks it up
      case 'IN_REVIEW':
      case 'PENDING_PICKUP':
        return 'in_review';
      case 'PICKED_UP':
      case 'IN_TRANSIT':
      case 'OUT_FOR_DELIVERY':
        return 'pending';
      case 'ATTEMPT_FAILED':
      case 'ADDRESS_PROBLEM':
        return 'hold';
      case 'DELIVERED':
        return 'delivered';
      case 'PARTIALLY_DELIVERED':
        return 'partial_delivered';
      case 'RETURNING':
      case 'RETURNED':
      case 'CANCELLED':
        return 'cancelled';
      default:
        return 'unknown';
    }
  },
  table: steadfastStatusTable,
};

export const steadfastConfig = z.object({
  /** Only to point at another address than Steadfast's own (a test server). HTTPS only. */
  baseUrl: z.url({ protocol: /^https$/, message: 'not an https address' }).max(500).optional(),
});
export type SteadfastConfig = z.output<typeof steadfastConfig>;

type Fetch = typeof fetch;

interface ClientOptions {
  baseUrl: string;
  apiKey: string;
  secretKey: string;
  fetch?: Fetch;
  now?: () => number;
}

/** Steadfast's answer body, as far as the shop reads it. */
interface SfBody {
  status?: number;
  message?: string;
  errors?: Record<string, string[] | string>;
  delivery_status?: string;
  current_balance?: number;
  consignment?: { consignment_id?: number | string; tracking_code?: string; status?: string };
}

class SfHttpError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number | null,
  ) {
    super(message);
  }
}

/** The Steadfast HTTP client (SANDBOX and LIVE are the same client pointed at the connection's address). */
export function createSteadfastClient(opts: ClientOptions): CourierApi {
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const base = opts.baseUrl.replace(/\/+$/, '');

  async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<SfBody> {
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        method,
        headers: { 'Api-Key': opts.apiKey, 'Secret-Key': opts.secretKey, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      throw new SfHttpError(`Steadfast did not answer: ${e instanceof Error ? e.message : String(e)}`, null);
    }
    let parsed: SfBody = {};
    try {
      parsed = (await res.json()) as SfBody;
    } catch {
      // a body that is not JSON: the status code speaks
    }
    if (!res.ok || (typeof parsed.status === 'number' && parsed.status >= 400)) {
      const errors = parsed.errors ? Object.values(parsed.errors).flat().join('; ') : '';
      throw new SfHttpError(`Steadfast refused (${res.status}): ${[parsed.message, errors].filter(Boolean).join(' — ') || 'no reason given'}`.slice(0, 300), res.status);
    }
    return parsed;
  }

  const unknownAnswer = (e: unknown) => e instanceof SfHttpError && (e.httpStatus === null || e.httpStatus >= 500);

  return {
    provider: STEADFAST_PROVIDER,
    capabilities: steadfastCapabilities,
    async book(p: CourierParcel): Promise<BookResult> {
      try {
        const r = await call('POST', '/create_order', {
          invoice: p.merchantRef,
          recipient_name: p.receiver.name.slice(0, 100),
          recipient_phone: p.receiver.phone,
          recipient_address: p.receiver.address.slice(0, 250),
          cod_amount: p.codMinor / 100,
          note: p.note ?? undefined,
          item_description: p.description ?? undefined,
          total_lot: p.itemCount,
        });
        const c = r.consignment;
        if (!c?.consignment_id) return { ok: false, error: 'Steadfast answered without a consignment id', unknown: true };
        const raw = c.status ?? 'in_review';
        return { ok: true, consignmentId: String(c.consignment_id), trackingCode: c.tracking_code ?? null, status: steadfastStatusTable[raw]?.status ?? null, rawStatus: raw, chargeMinor: null };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e), unknown: unknownAnswer(e) };
      }
    },
    async findByRef(merchantRef) {
      try {
        const r = await call('GET', `/status_by_invoice/${encodeURIComponent(merchantRef)}`);
        if (!r.delivery_status) return null;
        // Steadfast answers by invoice with the status only: the parcel is tracked by its invoice from then on
        return { consignmentId: null, trackingCode: null, status: steadfastStatusTable[r.delivery_status]?.status ?? null, rawStatus: r.delivery_status };
      } catch (e) {
        if (e instanceof SfHttpError && e.httpStatus === 404) return null;
        throw e;
      }
    },
    async track(ref) {
      const path = ref.consignmentId ? `/status_by_cid/${encodeURIComponent(ref.consignmentId)}` : ref.merchantRef ? `/status_by_invoice/${encodeURIComponent(ref.merchantRef)}` : null;
      if (!path) return [];
      const r = await call('GET', path);
      const raw = r.delivery_status;
      if (!raw || raw === ref.lastRawStatus) return [];
      const mapped = steadfastStatusTable[raw];
      const at = now();
      return [
        {
          providerEventId: `${ref.consignmentId ?? ref.merchantRef}:${raw}:${at}`,
          status: mapped?.status ?? null,
          rawStatus: raw,
          occurredAt: new Date(at),
          note: null,
          reasonKey: mapped?.reasonKey ?? null,
          codCollectedMinor: null,
          chargeMinor: null,
        },
      ];
    },
    async health() {
      const r = await call('GET', '/get_balance');
      return { ok: typeof r.current_balance === 'number', message: typeof r.current_balance === 'number' ? 'Steadfast: the keys work' : 'Steadfast answered without the account' };
    },
  };
}

export const steadfastAdapter = defineAdapter<CourierApi, SteadfastConfig>({
  kind: 'COURIER',
  provider: STEADFAST_PROVIDER,
  modes: ['SANDBOX', 'LIVE'],
  secrets: ['apiKey', 'secretKey'],
  configSchema: steadfastConfig,
  async create(ctx) {
    const [apiKey, secretKey] = await Promise.all([requireSecret(ctx, 'apiKey'), requireSecret(ctx, 'secretKey')]);
    return createSteadfastClient({ baseUrl: ctx.config.baseUrl ?? STEADFAST_DEFAULT_BASE_URL, apiKey, secretKey });
  },
  async mock() {
    return createMockCourier(STEADFAST_PROVIDER, steadfastVocabulary, steadfastCapabilities);
  },
  async test(api) {
    return api.health();
  },
});

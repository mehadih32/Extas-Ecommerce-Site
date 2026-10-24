// PR 177 — Pathao Courier behind the same courier contract (provider `pathao`), the second courier: the shipping
// service books and tracks it exactly as it does Steadfast, nothing else changes. The owner types the four values of
// Pathao's merchant API (client id, client secret, the merchant login's e-mail and password; vault names
// `pathao.clientId`, `pathao.clientSecret`, `pathao.username`, `pathao.password`) and the Pathao store the parcels go
// out from (`storeId`, plain config) into Keys & connections. Sandbox mode talks to Pathao's sandbox, Live to Pathao;
// the Test issues a token, so a pass proves all four keys. Until then Pathao runs on its practice world in Pathao's
// own words (mock.ts) — the shop never waits for a key (A1.3).
//
// What Pathao's API takes that Steadfast's does not: the courier's own city / zone / area ids (sent when the shop has
// mapped the area, PR 554; Pathao reads the address otherwise) and the weight in kg (SIM-F-029). Pathao charges by
// weight and needs one, so a parcel whose weight is not known is refused here with the reason, never sent with a made-up
// weight. Its booking answer carries Pathao's own delivery fee: recorded as the courier's charge (Pathao's word, never
// estimated). It has no lookup by the shop's reference, so a booking whose answer was lost is not booked again by
// itself: staff check Pathao's panel (follow-up). Its status words (`order_status_slug`) map onto the shop's states
// here, the exceptions of SIM-F-017 among them; a word not in the table stays raw and flagged:
//   Pending, Pickup_Requested, Assigned_for_Pickup, Pickup_Failed → PENDING_PICKUP · Picked → PICKED_UP ·
//   At_the_Sorting_HUB, In_Transit, Received_at_Last_Mile_HUB → IN_TRANSIT · Assigned_for_Delivery → OUT_FOR_DELIVERY ·
//   Delivered → DELIVERED · Partial_Delivery → PARTIALLY_DELIVERED · Delivery_Failed → ATTEMPT_FAILED · On_Hold →
//   ATTEMPT_FAILED (receiver asked for another day) · Return → RETURNING · Paid_Return → RETURNED · Pickup_Cancelled →
//   CANCELLED · Payment_Invoice, Exchange … → kept raw.
import { z } from 'zod';
import { AdapterError, defineAdapter, requireSecret } from '../define';
import { takaToMinor, type BookResult, type CourierApi, type CourierCapabilities, type CourierParcel, type StatusTable } from './contract';
import { createMockCourier, type MockVocabulary } from './mock';

export const PATHAO_PROVIDER = 'pathao';

/** Pathao's public API addresses: Live and its sandbox (a different one can be set on the connection). */
export const PATHAO_LIVE_BASE_URL = 'https://api-hermes.pathao.com';
export const PATHAO_SANDBOX_BASE_URL = 'https://courier-api-sandbox.pathao.com';

/** Pathao's own codes on a booking (its API's words, not the shop's settings): a normal delivery of a parcel. */
const PATHAO_SERVICE_NORMAL = 48;
const PATHAO_ITEM_PARCEL = 2;
/** Pathao's lightest weight in kg (it bills at least this). */
const PATHAO_MIN_KG = 0.5;

export const pathaoStatusTable: StatusTable = {
  pending: { status: 'PENDING_PICKUP' },
  pickup_requested: { status: 'PENDING_PICKUP' },
  assigned_for_pickup: { status: 'PENDING_PICKUP' },
  pickup_failed: { status: 'PENDING_PICKUP' },
  picked: { status: 'PICKED_UP' },
  at_the_sorting_hub: { status: 'IN_TRANSIT' },
  in_transit: { status: 'IN_TRANSIT' },
  received_at_last_mile_hub: { status: 'IN_TRANSIT' },
  assigned_for_delivery: { status: 'OUT_FOR_DELIVERY' },
  delivered: { status: 'DELIVERED' },
  partial_delivery: { status: 'PARTIALLY_DELIVERED' },
  delivery_failed: { status: 'ATTEMPT_FAILED', reasonKey: 'other' },
  on_hold: { status: 'ATTEMPT_FAILED', reasonKey: 'receiverAskedLater' },
  return: { status: 'RETURNING' },
  paid_return: { status: 'RETURNED' },
  pickup_cancelled: { status: 'CANCELLED' },
};

export const pathaoCapabilities: CourierCapabilities = {
  booking: true,
  tracking: 'both',
  partialDelivery: true,
  zoneIds: true,
  weight: true,
  weightRequired: true,
  declaredValue: false,
  cancel: false,
};

/** How the practice Pathao says each step, in Pathao's own words (lost, damaged: words it has none for). */
export const pathaoVocabulary: MockVocabulary = {
  prefix: 'PT',
  say(step) {
    switch (step.status) {
      case 'IN_REVIEW':
        return 'Pending';
      case 'PENDING_PICKUP':
        return 'Pickup_Requested';
      case 'PICKED_UP':
        return 'Picked';
      case 'IN_TRANSIT':
        return 'In_Transit';
      case 'OUT_FOR_DELIVERY':
        return 'Assigned_for_Delivery';
      case 'DELIVERED':
        return 'Delivered';
      case 'PARTIALLY_DELIVERED':
        return 'Partial_Delivery';
      case 'ATTEMPT_FAILED':
      case 'ADDRESS_PROBLEM':
        return 'Delivery_Failed';
      case 'RETURNING':
        return 'Return';
      case 'RETURNED':
        return 'Paid_Return';
      case 'CANCELLED':
        return 'Pickup_Cancelled';
      default:
        return 'Unknown';
    }
  },
  table: pathaoStatusTable,
};

export const pathaoConfig = z.object({
  /** The Pathao store the parcels go out from (Pathao merchant panel → Stores). Needed to book. */
  storeId: z.string().trim().regex(/^\d{1,12}$/, 'Pathao store id is a number'),
  /** Only to point at another address than Pathao's own (a test server). HTTPS only. */
  baseUrl: z.url({ protocol: /^https$/, message: 'not an https address' }).max(500).optional(),
});
export type PathaoConfig = z.output<typeof pathaoConfig>;

type Fetch = typeof fetch;

interface ClientOptions {
  baseUrl: string;
  storeId: string;
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  fetch?: Fetch;
  now?: () => number;
}

/** Pathao's answer body, as far as the shop reads it. */
interface PtBody {
  message?: string;
  type?: string;
  code?: number;
  errors?: Record<string, string[] | string>;
  access_token?: string;
  expires_in?: number;
  data?: {
    consignment_id?: string | number;
    merchant_order_id?: string;
    order_status?: string;
    order_status_slug?: string;
    delivery_fee?: number | string;
    updated_at?: string;
  };
}

class PtHttpError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number | null,
  ) {
    super(message);
  }
}

/** The Pathao HTTP client (SANDBOX and LIVE are the same client pointed at the mode's address). */
export function createPathaoClient(opts: ClientOptions): CourierApi {
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const base = opts.baseUrl.replace(/\/+$/, '');
  let token: { value: string; until: number } | null = null;

  async function raw(method: 'GET' | 'POST', path: string, body: unknown, bearer: string | null): Promise<PtBody> {
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      throw new PtHttpError(`Pathao did not answer: ${e instanceof Error ? e.message : String(e)}`, null);
    }
    let parsed: PtBody = {};
    try {
      parsed = (await res.json()) as PtBody;
    } catch {
      // a body that is not JSON: the status code speaks
    }
    if (!res.ok || (typeof parsed.code === 'number' && parsed.code >= 400)) {
      const errors = parsed.errors ? Object.values(parsed.errors).flat().join('; ') : '';
      throw new PtHttpError(`Pathao refused (${res.status}): ${[parsed.message, errors].filter(Boolean).join(' — ') || 'no reason given'}`.slice(0, 300), res.status);
    }
    return parsed;
  }

  /** A token from the four keys, kept until shortly before it runs out. */
  async function bearer(fresh = false): Promise<string> {
    if (!fresh && token && token.until > now()) return token.value;
    const r = await raw('POST', '/aladdin/api/v1/issue-token', { client_id: opts.clientId, client_secret: opts.clientSecret, grant_type: 'password', username: opts.username, password: opts.password }, null);
    if (!r.access_token) throw new PtHttpError('Pathao gave no token', 401);
    // kept for its life less a minute (a technical margin), so a call never carries a token about to run out
    token = { value: r.access_token, until: now() + Math.max(0, (r.expires_in ?? 0) - 60) * 1000 };
    return token.value;
  }

  /** A call with the token; a 401 gets one fresh token and one more try. */
  async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<PtBody> {
    try {
      return await raw(method, path, body, await bearer());
    } catch (e) {
      if (e instanceof PtHttpError && e.httpStatus === 401) return raw(method, path, body, await bearer(true));
      throw e;
    }
  }

  const unknownAnswer = (e: unknown) => e instanceof PtHttpError && (e.httpStatus === null || e.httpStatus >= 500);

  return {
    provider: PATHAO_PROVIDER,
    capabilities: pathaoCapabilities,
    async book(p: CourierParcel): Promise<BookResult> {
      if (p.weightGrams === null) return { ok: false, error: 'Pathao needs the parcel weight: enter the weight of every piece in the parcel', unknown: false };
      try {
        const r = await call('POST', '/aladdin/api/v1/orders', {
          store_id: Number(opts.storeId),
          merchant_order_id: p.merchantRef,
          recipient_name: p.receiver.name.slice(0, 100),
          recipient_phone: p.receiver.phone,
          recipient_address: p.receiver.address.slice(0, 220),
          ...(p.zone.cityId ? { recipient_city: Number(p.zone.cityId) } : {}),
          ...(p.zone.zoneId ? { recipient_zone: Number(p.zone.zoneId) } : {}),
          ...(p.zone.areaId ? { recipient_area: Number(p.zone.areaId) } : {}),
          delivery_type: PATHAO_SERVICE_NORMAL,
          item_type: PATHAO_ITEM_PARCEL,
          special_instruction: p.note ?? undefined,
          item_quantity: p.itemCount,
          item_weight: Math.max(PATHAO_MIN_KG, p.weightGrams / 1000),
          amount_to_collect: p.codMinor / 100,
          item_description: p.description ?? undefined,
        });
        const d = r.data;
        if (!d?.consignment_id) return { ok: false, error: 'Pathao answered without a consignment id', unknown: true };
        const word = d.order_status_slug ?? d.order_status ?? 'Pending';
        const mapped = pathaoStatusTable[word.trim().toLowerCase().replace(/[\s-]+/g, '_')];
        return { ok: true, consignmentId: String(d.consignment_id), trackingCode: String(d.consignment_id), status: mapped?.status ?? null, rawStatus: word, chargeMinor: takaToMinor(d.delivery_fee) };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e), unknown: unknownAnswer(e) };
      }
    },
    async findByRef() {
      // Pathao cannot be asked by the shop's reference: staff check its panel (never booked twice by guess)
      throw new AdapterError('Pathao cannot look a parcel up by the shop reference: check the Pathao panel for this order');
    },
    async track(ref) {
      if (!ref.consignmentId) return [];
      const r = await call('GET', `/aladdin/api/v1/orders/${encodeURIComponent(ref.consignmentId)}/info`);
      const word = r.data?.order_status_slug ?? r.data?.order_status;
      if (!word || word === ref.lastRawStatus) return [];
      const mapped = pathaoStatusTable[word.trim().toLowerCase().replace(/[\s-]+/g, '_')];
      const at = now();
      return [
        {
          providerEventId: `${ref.consignmentId}:${word}:${r.data?.updated_at ?? at}`,
          status: mapped?.status ?? null,
          rawStatus: word,
          occurredAt: new Date(at),
          note: null,
          reasonKey: mapped?.reasonKey ?? null,
          codCollectedMinor: null,
          chargeMinor: null,
        },
      ];
    },
    async health() {
      await bearer(true);
      return { ok: true, message: 'Pathao: the keys work' };
    },
  };
}

export const pathaoAdapter = defineAdapter<CourierApi, PathaoConfig>({
  kind: 'COURIER',
  provider: PATHAO_PROVIDER,
  modes: ['SANDBOX', 'LIVE'],
  secrets: ['clientId', 'clientSecret', 'username', 'password'],
  configSchema: pathaoConfig,
  async create(ctx) {
    const [clientId, clientSecret, username, password] = await Promise.all(['clientId', 'clientSecret', 'username', 'password'].map((f) => requireSecret(ctx, f)));
    const baseUrl = ctx.config.baseUrl ?? (ctx.mode === 'LIVE' ? PATHAO_LIVE_BASE_URL : PATHAO_SANDBOX_BASE_URL);
    return createPathaoClient({ baseUrl, storeId: ctx.config.storeId, clientId: clientId!, clientSecret: clientSecret!, username: username!, password: password! });
  },
  async mock() {
    return createMockCourier(PATHAO_PROVIDER, pathaoVocabulary, pathaoCapabilities);
  },
  async test(api) {
    return api.health();
  },
});

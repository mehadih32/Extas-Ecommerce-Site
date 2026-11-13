// PR 672 (S28, wave 2) — RedX behind the same courier contract (provider `redx`), the third courier: the shipping
// service books and tracks it exactly as it does Steadfast and Pathao, nothing else changes. The owner types RedX's one
// API access token (vault name `redx.accessToken`, RedX merchant panel → API) and, if parcels go out from a RedX pickup
// store, its id (`pickupStoreId`, plain config) into Keys & connections. Sandbox mode talks to RedX's sandbox, Live to
// RedX; the Test reads the store list, so a pass proves the token. Until then RedX runs on its practice world in RedX's
// own words (mock.ts) — the shop never waits for a key (A1.3).
//
// What RedX's open API (v1.0.0-beta) offers, as far as the shop reads it (paths from RedX's merchant docs; the live
// answers are confirmed when the owner's token arrives, so every field is read leniently and a word not in the table
// stays raw and flagged):
//   - parcel create: customer name / phone / address, the delivery area by NAME and ID (RedX needs both), the shop's
//     invoice, the cash to collect, the weight in GRAMS, an instruction and the value. Answer: its tracking id.
//   - areas: one flat list (id, name, post code, zone, division). Read into the shop's city → zone → area chain
//     for the zone sync (PR 554): city = division, zone = RedX's own zone, area = the area. A parcel to an area the
//     shop has not paired is never sent (`zoneNeeds: 'area'`): it waits with the reason.
//   - track by tracking id: steps, each with a time and a message in English and Bangla; parcel info by tracking id: its
//     status word, its charge and the cash it collected.
//   - no lookup by the shop's invoice (a lost answer is closed by staff from the RedX panel), no cancel, no payout feature
//     of its own (`payouts: 'none'`; its payments come on the statement the shop imports).
// RedX status words map onto the shop's states here:
//   pending → PENDING_PICKUP · ready-for-delivery → IN_TRANSIT · delivery-in-progress → OUT_FOR_DELIVERY · delivered →
//   DELIVERED · agent-hold → ATTEMPT_FAILED (receiver asked for another day) · agent-returning → RETURNING · returned →
//   RETURNED · cancelled → CANCELLED · anything else → kept raw.
import { z } from 'zod';
import { AdapterError, defineAdapter, requireSecret } from '../define';
import { API_TAKA, minorToMajor } from '../money';
import { takaToMinor, type BookResult, type CourierApi, type CourierCapabilities, type CourierParcel, type CourierPlace, type CourierPlaceLevel, type StatusTable } from './contract';
import { createMockCourier, type MockVocabulary } from './mock';

export const REDX_PROVIDER = 'redx';

/** RedX's public API addresses: Live and its sandbox (a different one can be set on the connection). */
export const REDX_LIVE_BASE_URL = 'https://openapi.redx.com.bd/v1.0.0-beta';
export const REDX_SANDBOX_BASE_URL = 'https://sandbox.redx.com.bd/v1.0.0-beta';

/** How long RedX's area list is kept in memory before it is read again (it hardly changes). */
const AREAS_KEPT_MS = 60 * 60 * 1000;

export const redxStatusTable: StatusTable = {
  pending: { status: 'PENDING_PICKUP' },
  ready_for_delivery: { status: 'IN_TRANSIT' },
  delivery_in_progress: { status: 'OUT_FOR_DELIVERY' },
  delivered: { status: 'DELIVERED' },
  agent_hold: { status: 'ATTEMPT_FAILED', reasonKey: 'receiverAskedLater' },
  agent_returning: { status: 'RETURNING' },
  returned: { status: 'RETURNED' },
  cancelled: { status: 'CANCELLED' },
};

export const redxCapabilities: CourierCapabilities = {
  booking: true,
  tracking: 'poll',
  partialDelivery: false,
  zoneIds: true,
  zoneList: true,
  // RedX needs the delivery area (name and id) on every parcel: one to an area the shop has not paired waits (PR 554)
  zoneNeeds: 'area',
  weight: true,
  weightRequired: true,
  declaredValue: true,
  cancel: false,
  lookupByRef: false,
  payouts: 'none',
};

/** How the practice RedX says each step, in RedX's own words (lost, damaged, address problem: words it has none for). */
export const redxVocabulary: MockVocabulary = {
  prefix: 'RX',
  say(step) {
    switch (step.status) {
      case 'IN_REVIEW':
      case 'PENDING_PICKUP':
        return 'pending';
      case 'PICKED_UP':
      case 'IN_TRANSIT':
        return 'ready-for-delivery';
      case 'OUT_FOR_DELIVERY':
        return 'delivery-in-progress';
      case 'DELIVERED':
      case 'PARTIALLY_DELIVERED':
        return 'delivered';
      case 'ATTEMPT_FAILED':
      case 'ADDRESS_PROBLEM':
        return 'agent-hold';
      case 'RETURNING':
        return 'agent-returning';
      case 'RETURNED':
        return 'returned';
      case 'CANCELLED':
        return 'cancelled';
      default:
        return 'unknown';
    }
  },
  table: redxStatusTable,
};

export const redxConfig = z.object({
  /** The RedX pickup store the parcels go out from (RedX panel → Stores); left out, RedX uses the account's default. */
  pickupStoreId: z
    .string()
    .trim()
    .regex(/^\d{1,12}$/, 'RedX store id is a number')
    .optional(),
  /** Only to point at another address than RedX's own (a test server). HTTPS only. */
  baseUrl: z
    .url({ protocol: /^https$/, message: 'not an https address' })
    .max(500)
    .optional(),
});
export type RedxConfig = z.output<typeof redxConfig>;

type Fetch = typeof fetch;

interface ClientOptions {
  baseUrl: string;
  accessToken: string;
  pickupStoreId?: string;
  fetch?: Fetch;
  now?: () => number;
}

interface RxArea {
  id?: number | string;
  name?: string;
  zone_id?: number | string;
  zone_name?: string;
  division_name?: string;
}

/** RedX's answer body, as far as the shop reads it. */
interface RxBody {
  message?: string;
  error?: string;
  tracking_id?: string;
  areas?: RxArea[];
  tracking?: { message_en?: string; message_bn?: string; time?: string }[];
  parcel?: { tracking_id?: string; status?: string; charge?: number | string; cash_collection_amount?: number | string; delivery_charge?: number | string; updated_at?: string };
  pickup_stores?: unknown[];
}

class RxHttpError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number | null,
  ) {
    super(message);
  }
}

const slug = (w: string) =>
  w
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

/** The RedX HTTP client (SANDBOX and LIVE are the same client pointed at the mode's address). */
export function createRedxClient(opts: ClientOptions): CourierApi {
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const base = opts.baseUrl.replace(/\/+$/, '');
  let areas: { rows: RxArea[]; until: number } | null = null;

  async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<RxBody> {
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        method,
        headers: { 'API-ACCESS-TOKEN': `Bearer ${opts.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      throw new RxHttpError(`RedX did not answer: ${e instanceof Error ? e.message : String(e)}`, null);
    }
    let parsed: RxBody = {};
    try {
      parsed = (await res.json()) as RxBody;
    } catch {
      // a body that is not JSON: the status code speaks
    }
    if (!res.ok) throw new RxHttpError(`RedX refused (${res.status}): ${[parsed.message, parsed.error].filter(Boolean).join(' — ') || 'no reason given'}`.slice(0, 300), res.status);
    return parsed;
  }

  const unknownAnswer = (e: unknown) => e instanceof RxHttpError && (e.httpStatus === null || e.httpStatus >= 500);

  async function areaRows(): Promise<RxArea[]> {
    if (areas && areas.until > now()) return areas.rows;
    const r = await call('GET', '/areas');
    const rows = Array.isArray(r.areas) ? r.areas : [];
    areas = { rows, until: now() + AREAS_KEPT_MS };
    return rows;
  }

  return {
    provider: REDX_PROVIDER,
    capabilities: redxCapabilities,
    async book(p: CourierParcel): Promise<BookResult> {
      if (p.weightGrams === null) return { ok: false, error: 'RedX needs the parcel weight: enter the weight of every piece in the parcel', unknown: false };
      if (!p.zone.areaId) return { ok: false, error: "RedX needs the delivery area: pair this area with a RedX area in the courier's area list", unknown: false };
      try {
        const area = (await areaRows()).find((a) => String(a.id) === p.zone.areaId);
        if (!area?.name) return { ok: false, error: 'RedX does not list the paired delivery area any more: pair the area again', unknown: false };
        const r = await call('POST', '/parcel', {
          customer_name: p.receiver.name.slice(0, 100),
          customer_phone: p.receiver.phone,
          delivery_area: area.name,
          delivery_area_id: Number(p.zone.areaId),
          customer_address: p.receiver.address.slice(0, 250),
          merchant_invoice_id: p.merchantRef,
          cash_collection_amount: String(minorToMajor(p.codMinor, API_TAKA)),
          parcel_weight: Math.max(1, Math.round(p.weightGrams)),
          instruction: p.note ?? '',
          value: p.declaredValueMinor === null ? undefined : minorToMajor(p.declaredValueMinor, API_TAKA),
          ...(opts.pickupStoreId ? { pickup_store_id: Number(opts.pickupStoreId) } : {}),
          parcel_details_json: [{ name: (p.description ?? 'Garments').slice(0, 100), category: 'Garments', value: p.declaredValueMinor === null ? 0 : minorToMajor(p.declaredValueMinor, API_TAKA) }],
        });
        if (!r.tracking_id) return { ok: false, error: 'RedX answered without a tracking id', unknown: true };
        return { ok: true, consignmentId: String(r.tracking_id), trackingCode: String(r.tracking_id), status: 'PENDING_PICKUP', rawStatus: 'pending', chargeMinor: null };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e), unknown: unknownAnswer(e) };
      }
    },
    async findByRef() {
      // RedX cannot be asked by the shop's invoice: staff check its panel (never booked twice by guess)
      throw new AdapterError('RedX cannot look a parcel up by the shop reference: check the RedX panel for this order');
    },
    async track(ref) {
      if (!ref.consignmentId) return [];
      const id = encodeURIComponent(ref.consignmentId);
      const info = await call('GET', `/parcel/info/${id}`);
      const word = info.parcel?.status;
      if (!word || word === ref.lastRawStatus) return [];
      const mapped = redxStatusTable[slug(word)];
      // the rider's last step (its words, in English) goes with the status; a failed read of the steps never loses the status
      let note: string | null = null;
      try {
        const steps = (await call('GET', `/parcel/track/${id}`)).tracking;
        const last = Array.isArray(steps) && steps.length ? steps[steps.length - 1] : null;
        note = last?.message_en?.trim() || null;
      } catch {
        note = null;
      }
      const at = now();
      return [
        {
          providerEventId: `${ref.consignmentId}:${word}:${info.parcel?.updated_at ?? at}`,
          status: mapped?.status ?? null,
          rawStatus: word,
          occurredAt: new Date(at),
          note,
          reasonKey: mapped?.reasonKey ?? null,
          codCollectedMinor: mapped?.status === 'DELIVERED' ? takaToMinor(info.parcel?.cash_collection_amount) : null,
          chargeMinor: takaToMinor(info.parcel?.charge ?? info.parcel?.delivery_charge),
        },
      ];
    },
    async places(level: CourierPlaceLevel, parentId: string | null): Promise<CourierPlace[]> {
      if (level !== 'city' && !parentId) throw new AdapterError(`RedX's ${level} list needs its parent`);
      const rows = await areaRows();
      const seen = new Map<string, string>();
      for (const a of rows) {
        const name = typeof a.name === 'string' ? a.name.trim() : '';
        const division = typeof a.division_name === 'string' ? a.division_name.trim() : '';
        const zoneId = a.zone_id === undefined || a.zone_id === null ? '' : String(a.zone_id);
        if (level === 'city' && division) seen.set(division, division);
        else if (level === 'zone' && zoneId && division === parentId) seen.set(zoneId, (a.zone_name ?? '').trim() || `Zone ${zoneId}`);
        else if (level === 'area' && a.id !== undefined && name && zoneId === parentId) seen.set(String(a.id), name);
      }
      return [...seen].map(([id, name]) => ({ id, name }));
    },
    async health() {
      const r = await call('GET', '/pickup-stores');
      return { ok: r.pickup_stores !== undefined || !r.error, message: 'RedX: the token works' };
    },
  };
}

export const redxAdapter = defineAdapter<CourierApi, RedxConfig>({
  kind: 'COURIER',
  provider: REDX_PROVIDER,
  modes: ['SANDBOX', 'LIVE'],
  secrets: ['accessToken'],
  configSchema: redxConfig,
  async create(ctx) {
    const accessToken = await requireSecret(ctx, 'accessToken');
    const baseUrl = ctx.config.baseUrl ?? (ctx.mode === 'LIVE' ? REDX_LIVE_BASE_URL : REDX_SANDBOX_BASE_URL);
    return createRedxClient({ baseUrl, accessToken, ...(ctx.config.pickupStoreId ? { pickupStoreId: ctx.config.pickupStoreId } : {}) });
  },
  async mock() {
    return createMockCourier(REDX_PROVIDER, redxVocabulary, redxCapabilities);
  },
  async test(api) {
    return api.health();
  },
});

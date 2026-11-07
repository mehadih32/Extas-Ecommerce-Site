// Follow-up 372 (PR 176, 177; PR 184 reads them) — the couriers' own status calls (webhooks), read into the same
// `CourierEvent` a poll gives, so the shipping service stores each one once through `applyEvents` (signed, replay safe)
// and polling becomes the fallback. Pure: no database, no network. What each courier sends:
//
// Steadfast (merchant panel → API → Webhook: a callback address and an "auth token" the owner chooses). Every call
//   carries `Authorization: Bearer <that token>`; the body is JSON. `notification_type: "delivery_status"` carries the
//   parcel's new word in `status` (the same words as its status read: pending, delivered, partial_delivered,
//   cancelled, hold, in_review …), its `consignment_id`, the shop's reference as `invoice`, `cod_amount`,
//   `delivery_charge`, `tracking_message` and `updated_at`. `tracking_update` carries only a message: kept, not a step.
//   Steadfast expects 200.
// Pathao (merchant panel → Developer API → Webhook: a callback address and a secret). Every call carries
//   `X-PATHAO-Signature: <that secret>`; `event` is `order.<step>` in Pathao's words with hyphens (order.picked,
//   order.in-transit, order.delivered, order.partial-delivery, order.delivery-failed, order.on-hold, order.returned,
//   order.paid-return, order.pickup-cancelled …), with `consignment_id`, `merchant_order_id` (the shop's reference),
//   `updated_at`, `timestamp`, `delivery_fee`, `collected_amount` and `reason`. Its set-up check (`webhook_integration`)
//   must be answered 202 with the reply header its webhook page names; every other call is answered 202 too.
//
// A word not in the courier's table is still an event (kept raw and flagged, never guessed); a call that is not about
// a parcel's step (Pathao's order.created / updated / paid, Steadfast's tracking_update) is `ignored`.
import { mapStatus, takaToMinor, type CourierEvent, type StatusTable } from './contract';
import { PATHAO_PROVIDER, pathaoStatusTable } from './pathao';
import { STEADFAST_PROVIDER, steadfastStatusTable } from './steadfast';

/** Reads one request header (a `Headers` object, or anything with `get`). */
export interface HeaderReader {
  get(name: string): string | null;
}

/** What one courier call says. */
export type CourierWebhook =
  /** Pathao's set-up check: answered with the reply header, nothing stored. */
  | { kind: 'handshake' }
  /** A call that is not a parcel's step: kept as received, nothing applied. */
  | { kind: 'ignored'; type: string; key: string | null }
  | { kind: 'bad'; detail: string }
  | {
      kind: 'event';
      type: string;
      /** The courier's id of the parcel, and the shop's reference it was booked under (either may be missing). */
      consignmentId: string | null;
      merchantRef: string | null;
      /** Stable per call: the same call sent twice has the same key (stored once). */
      key: string;
      event: CourierEvent;
    };

export interface CourierWebhookSpec {
  provider: string;
  /** The vault key (of the courier's Keys & connections row) the call's credential is compared with. */
  secretField: string;
  /** The credential the call carries, or null when it has none. */
  credential(headers: HeaderReader): string | null;
  parse(body: unknown, now: Date): CourierWebhook;
  /** The status a received call is answered with (the courier's own expectation). */
  okStatus: number;
}

const str = (v: unknown, max = 120): string | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
};
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
/** The courier's word in the form its status read uses (lower case, underscores). */
const wordOf = (raw: string) => raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
/** An ISO time with its offset, else `now` (a courier's local time without a zone is never guessed). */
function timeOf(v: unknown, now: Date): Date {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(v.trim())) return now;
  const d = new Date(v.trim());
  return Number.isNaN(d.getTime()) ? now : d;
}

function eventOf(table: StatusTable, word: string, opts: { id: string; at: Date; note: string | null; cod: number | null; charge: number | null }): CourierEvent {
  const m = mapStatus(table, word);
  return { providerEventId: opts.id.slice(0, 200), status: m.status, rawStatus: word, occurredAt: opts.at, note: opts.note, reasonKey: m.reasonKey, codCollectedMinor: opts.cod, chargeMinor: opts.charge };
}

/** `Authorization: Bearer <token>` → the token. */
function bearer(headers: HeaderReader): string | null {
  const h = headers.get('authorization');
  const m = h ? /^Bearer\s+(\S{1,512})\s*$/i.exec(h) : null;
  return m ? m[1]! : null;
}

/** The words of a Steadfast door outcome that carry the money it collected. */
const SF_COLLECTED = new Set(['delivered', 'delivered_approval_pending', 'partial_delivered', 'partial_delivered_approval_pending']);

export const steadfastWebhook: CourierWebhookSpec = {
  provider: STEADFAST_PROVIDER,
  secretField: 'webhookToken',
  credential: bearer,
  okStatus: 200,
  parse(body, now) {
    const b = obj(body);
    if (!b) return { kind: 'bad', detail: 'not a JSON object' };
    const type = str(b.notification_type, 60) ?? 'delivery_status';
    const consignmentId = str(b.consignment_id);
    const merchantRef = str(b.invoice);
    const updated = str(b.updated_at, 60);
    if (type !== 'delivery_status') return { kind: 'ignored', type, key: consignmentId ? `${consignmentId}:${type}:${updated ?? ''}:${str(b.tracking_message, 200) ?? ''}` : null };
    const raw = str(b.status, 60);
    if (!raw) return { kind: 'bad', detail: 'status: missing' };
    if (!consignmentId && !merchantRef) return { kind: 'bad', detail: 'consignment_id / invoice: missing' };
    const word = wordOf(raw);
    const key = `${consignmentId ?? merchantRef}:${word}:${updated ?? ''}`;
    const event = eventOf(steadfastStatusTable, word, {
      id: `wh:${key}`,
      at: timeOf(b.updated_at, now),
      note: str(b.tracking_message, 500),
      cod: SF_COLLECTED.has(word) ? takaToMinor(b.cod_amount) : null,
      charge: takaToMinor(b.delivery_charge),
    });
    return { kind: 'event', type, consignmentId, merchantRef, key, event };
  },
};

/** Pathao's calls that are not a parcel's step. */
const PATHAO_NOT_STEPS = new Set(['created', 'updated', 'paid', 'exchanged']);
/** Pathao's webhook words that differ from its status read's (`order.returned` is the read's "Return"). */
const PATHAO_ALIASES: Readonly<Record<string, string>> = { returned: 'return' };

export const pathaoWebhook: CourierWebhookSpec = {
  provider: PATHAO_PROVIDER,
  secretField: 'webhookSecret',
  credential: (headers) => str(headers.get('x-pathao-signature'), 512),
  okStatus: 202,
  parse(body, now) {
    const b = obj(body);
    if (!b) return { kind: 'bad', detail: 'not a JSON object' };
    const type = str(b.event, 80);
    if (!type) return { kind: 'bad', detail: 'event: missing' };
    if (type === 'webhook_integration') return { kind: 'handshake' };
    const consignmentId = str(b.consignment_id);
    const merchantRef = str(b.merchant_order_id);
    const updated = str(b.updated_at, 60) ?? str(b.timestamp, 60) ?? '';
    const step = wordOf(type.replace(/^order\./i, ''));
    if (PATHAO_NOT_STEPS.has(step) || !/^order\./i.test(type)) return { kind: 'ignored', type, key: consignmentId ? `${consignmentId}:${type}:${updated}` : null };
    if (!consignmentId && !merchantRef) return { kind: 'bad', detail: 'consignment_id / merchant_order_id: missing' };
    const word = PATHAO_ALIASES[step] ?? step;
    const key = `${consignmentId ?? merchantRef}:${type}:${updated}`;
    const event = eventOf(pathaoStatusTable, word, {
      id: `wh:${key}`,
      at: timeOf(b.timestamp, now),
      note: str(b.reason, 500),
      cod: takaToMinor(b.collected_amount),
      charge: takaToMinor(b.delivery_fee),
    });
    return { kind: 'event', type, consignmentId, merchantRef, key, event };
  },
};

/** The couriers that call the shop, by provider key. */
export const COURIER_WEBHOOKS: Readonly<Record<string, CourierWebhookSpec>> = { [STEADFAST_PROVIDER]: steadfastWebhook, [PATHAO_PROVIDER]: pathaoWebhook };

export const courierWebhookOf = (provider: string): CourierWebhookSpec | null => (Object.hasOwn(COURIER_WEBHOOKS, provider) ? COURIER_WEBHOOKS[provider]! : null);

// Follow-up 372 (PR 176, 177, 184) — the couriers' own status calls (webhooks) into the same `applyEvents` a status read
// uses. POST /api/courier/<courier>/webhook (apps/web lib/courier-webhook.ts) hands the raw body and the headers here:
// 1. Off (`delivery.courier.webhooks`, the mother store's value: one address serves every store) or an unknown courier:
//    404, nothing read. A body over the setting's size: 413, unread.
// 2. The call's credential (Steadfast's bearer token, Pathao's signature header) must equal the token or secret the
//    owner typed into that courier's Keys & connections row for one of the stores with an account of that courier
//    (compared in constant time); that store is the call's store. None typed in yet: 503. Wrong or missing: 401.
// 3. A parcel's step is kept once in WebhookEvent (source `courier:<provider>`, the courier's parcel, word and time as
//    the key): the same call again is answered DUPLICATE and applies nothing. The parcel is found by the courier's id
//    (else the shop's reference) among that store's real (never practice) parcels of that courier; a parcel the shop
//    does not know is kept IGNORED and answered, so the courier does not send it forever.
// 4. The events go through `applyEvents(…, 'webhook')` (stored once more by their own id, state worked out again), the
//    courier's charge is noted (record only), and the order follows (`syncOrder`), exactly as after a read. A parcel told
//    this way counts as read now, so the hourly read reaches it only when the courier stays quiet.
// Nothing here moves money: the amount the courier says it collected is recorded on the parcel, as a read records it.
import { createHash, timingSafeEqual } from 'node:crypto';
import { courierWebhookOf, type Connections, type CourierWebhook, type HeaderReader } from '@extas/adapters';
import { MOTHER_STORE_ID, type Prisma } from '@extas/db/client';
import { noteCourierCharge } from './charge-mismatch';
import { nowOf, setting, type ShippingDeps } from './context';
import { applyEvents } from './events';
import { syncOrder } from './sync';

export const courierWebhookSource = (provider: string): string => `courier:${provider}`;

export interface CourierWebhookDeps extends ShippingDeps {
  connections: Pick<Connections, 'use' | 'secretOf'>;
}

export type CourierWebhookCode = 'OK' | 'OFF' | 'TOO_LARGE' | 'NOT_CONNECTED' | 'UNAUTHORIZED' | 'BAD_JSON' | 'BAD_PAYLOAD' | 'HANDSHAKE' | 'IGNORED' | 'UNKNOWN_PARCEL' | 'DUPLICATE' | 'FAILED';

export interface CourierWebhookAnswer {
  status: number;
  code: CourierWebhookCode;
  /** Headers the courier expects on the answer (Pathao's set-up reply). */
  headers?: Record<string, string>;
  /** The stored call, when one was kept. */
  eventId?: string;
  shipmentId?: string;
  changed?: boolean;
}

/** The largest body the webhook reads, in bytes (null: the webhooks are off). */
export async function courierWebhookMaxBytes(deps: Pick<ShippingDeps, 'settings'>): Promise<number | null> {
  const cfg = await setting(deps, MOTHER_STORE_ID, 'delivery.courier.webhooks');
  return cfg.enabled ? cfg.maxBodyKb * 1024 : null;
}

const same = (a: string, b: string): boolean => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

/** The store whose typed-in credential the call carries, with its connection row, or why there is none. */
async function storeOf(deps: CourierWebhookDeps, provider: string, field: string, credential: string | null): Promise<{ storeId: number; integrationId: string } | 'NOT_CONNECTED' | 'UNAUTHORIZED'> {
  const accounts = await deps.db.courierAccount.findMany({ where: { providerKey: provider, archivedAt: null }, select: { storeId: true }, distinct: ['storeId'] });
  const found = await Promise.all(accounts.map((a) => deps.connections.secretOf('COURIER', field, { storeId: a.storeId, provider }).then((s) => (s ? { ...s, storeId: a.storeId } : null)).catch(() => null)));
  const keys = found.filter((f): f is NonNullable<typeof f> => f !== null);
  if (!keys.length) return 'NOT_CONNECTED';
  if (!credential) return 'UNAUTHORIZED';
  const hit = keys.find((k) => same(k.value, credential));
  return hit ? { storeId: hit.storeId, integrationId: hit.integrationId } : 'UNAUTHORIZED';
}

/** Pathao's set-up reply header, from its connection's plain settings (empty: answered without it). */
async function handshakeHeaders(deps: CourierWebhookDeps, integrationId: string): Promise<Record<string, string>> {
  const row = await deps.db.integration.findUnique({ where: { id: integrationId }, select: { config: true } });
  const reply = (row?.config as { webhookReply?: unknown } | null)?.webhookReply;
  return typeof reply === 'string' && reply.trim() ? { 'X-Pathao-Merchant-Webhook-Integration-Secret': reply.trim() } : {};
}

/** Keeps the call once; `taken` when the same call was already handled (received again only while it failed). */
async function keep(deps: CourierWebhookDeps, storeId: number, provider: string, w: Extract<CourierWebhook, { kind: 'event' | 'ignored' }>, payload: unknown, status: 'RECEIVED' | 'IGNORED'): Promise<{ id: string; taken: boolean }> {
  const source = courierWebhookSource(provider);
  const idempotencyKey = (w.key ?? `${w.type}:${nowOf(deps).toISOString()}`).slice(0, 300);
  try {
    const row = await deps.db.webhookEvent.create({
      data: { storeId, source, eventType: w.type.slice(0, 100), idempotencyKey, signatureValid: true, payload: payload as Prisma.InputJsonValue, status, processedAt: status === 'IGNORED' ? nowOf(deps) : null },
      select: { id: true },
    });
    return { id: row.id, taken: false };
  } catch (e) {
    if ((e as { code?: string }).code !== 'P2002') throw e;
    const row = await deps.db.webhookEvent.findFirstOrThrow({ where: { source, idempotencyKey }, select: { id: true, status: true } });
    return { id: row.id, taken: row.status !== 'FAILED' && row.status !== 'RECEIVED' };
  }
}

const close = (deps: CourierWebhookDeps, id: string, status: 'PROCESSED' | 'IGNORED' | 'FAILED', error: string | null = null) =>
  deps.db.webhookEvent.update({ where: { id }, data: { status, error: error?.slice(0, 300) ?? null, processedAt: nowOf(deps) } });

/** One call from a courier. `rawBody` is the body as sent (already capped by the route). Never throws for a bad call. */
export async function receiveCourierWebhook(deps: CourierWebhookDeps, provider: string, req: { rawBody: string; headers: HeaderReader }): Promise<CourierWebhookAnswer> {
  const spec = courierWebhookOf(provider);
  if (!spec) return { status: 404, code: 'OFF' };
  const maxBytes = await courierWebhookMaxBytes(deps);
  if (maxBytes === null) return { status: 404, code: 'OFF' };
  if (Buffer.byteLength(req.rawBody, 'utf8') > maxBytes) return { status: 413, code: 'TOO_LARGE' };
  const who = await storeOf(deps, provider, spec.secretField, spec.credential(req.headers));
  if (who === 'NOT_CONNECTED') return { status: 503, code: 'NOT_CONNECTED' };
  if (who === 'UNAUTHORIZED') return { status: 401, code: 'UNAUTHORIZED' };
  let body: unknown;
  try {
    body = JSON.parse(req.rawBody);
  } catch {
    return { status: 400, code: 'BAD_JSON' };
  }
  const now = nowOf(deps);
  const w = spec.parse(body, now);
  if (w.kind === 'bad') return { status: 400, code: 'BAD_PAYLOAD' };
  if (w.kind === 'handshake') return { status: spec.okStatus, code: 'HANDSHAKE', headers: await handshakeHeaders(deps, who.integrationId) };
  if (w.kind === 'ignored') {
    const kept = await keep(deps, who.storeId, provider, w, body, 'IGNORED');
    return { status: spec.okStatus, code: kept.taken ? 'DUPLICATE' : 'IGNORED', eventId: kept.id };
  }
  const kept = await keep(deps, who.storeId, provider, w, body, 'RECEIVED');
  if (kept.taken) return { status: spec.okStatus, code: 'DUPLICATE', eventId: kept.id };
  const realParcel: Prisma.ShipmentWhereInput = { storeId: who.storeId, courierAccount: { providerKey: provider }, OR: [{ mode: null }, { mode: { in: ['SANDBOX', 'LIVE'] } }] };
  const parcel =
    (w.consignmentId ? await deps.db.shipment.findFirst({ where: { ...realParcel, consignmentId: w.consignmentId }, select: { id: true } }) : null) ??
    (w.merchantRef ? await deps.db.shipment.findFirst({ where: { ...realParcel, merchantRef: w.merchantRef }, orderBy: { createdAt: 'desc' }, select: { id: true } }) : null);
  if (!parcel) {
    await close(deps, kept.id, 'IGNORED', 'UNKNOWN_PARCEL');
    return { status: spec.okStatus, code: 'UNKNOWN_PARCEL', eventId: kept.id };
  }
  const ref = { storeId: who.storeId, shipmentId: parcel.id };
  try {
    const applied = await applyEvents(deps, ref, [w.event], 'webhook');
    // PR 564: a charge in the courier's call may show it read another band — recorded only, never in the way
    if (w.event.chargeMinor !== null) await noteCourierCharge(deps, ref, 'tracking').catch(() => null);
    await syncOrder(deps, ref);
    await close(deps, kept.id, 'PROCESSED');
    return { status: spec.okStatus, code: 'OK', eventId: kept.id, shipmentId: parcel.id, changed: applied.changed };
  } catch (e) {
    // kept FAILED: the courier's own retry (answered 500) applies it again; its events are stored once either way
    await close(deps, kept.id, 'FAILED', e instanceof Error ? e.message.split('\n')[0]! : String(e)).catch(() => null);
    return { status: 500, code: 'FAILED', eventId: kept.id, shipmentId: parcel.id };
  }
}

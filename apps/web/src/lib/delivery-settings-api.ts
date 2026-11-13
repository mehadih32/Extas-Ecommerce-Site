// S08 · PR 193 — Delivery › Delivery settings (demo 97t-adm2-delivery.js /admin/delivery/settings): its cards, first the
// holiday mode (`delivery.holiday`, Blueprint B1.14) — the break's first and last day, the notice on the shop and the
// checkout's "ships from …" during the break. Other cards of the demo's page join with their PRs.
// S08 · PR 176 follow-up 370 — the courier cards (`delivery.courier.*`, CN-018: settings inside their section): reading
// the couriers (tracking), booking (the gift's lead days and note, the note's language, the item names, how many a
// press books), the courier by cost (PR 178) and the couriers' own status calls (follow-up 372). Each keeps its
// registry default; nothing here moves money, changes a price, a delivery charge or Cash on Delivery.
// Follow-up 431: the couriers' own area lists (`delivery.courier.zoneSync`, PR 554), until now only shown.
// Follow-up 462: under "More options", the packing step's cards (`fulfilment.packing.*`, PR 182/183, follow-up 434) —
// the piece check, the packing photo, the parcel's weight, the packing lists and a defective or missing piece — until
// now only shown as chips on Orders › Packing & print › Pack.
//
//   GET  /api/admin/delivery/settings   the page's cards with their versions (`delivery.read`)
//   PUT  /api/admin/delivery/settings   {key, value, version} one card saved whole; a card changed by someone else in
//                                       between is STALE (`delivery.charges`, as the demo's page asks; audited, and in
//                                       the settings change log with who)
// Off as shipped. Nothing here moves money, changes a price, a delivery charge or Cash on Delivery, and nothing closes
// the shop: the catalogue and checkout stay open (B1.14).
import { createHash } from 'node:crypto';
import { audit, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { couriersSchema, courierPayoutsSchema, courierClaimTermsSchema, courierBookingSchema, courierSelectionSchema, courierTrackingSchema, courierWebhooksSchema, courierZoneSyncSchema, districtPromiseSchema, holidaySchema, packingCheckSchema, packingIssuesSchema, packingPhotoSchema, packingQueueSchema, packingWeightSchema, stickerLatinSchema, storeTarget, voiceAddressSchema } from '@extas/settings';
import type { ZodType } from 'zod';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from './admin-auth';

const S = MOTHER_STORE_ID;
/** The keys this page saves (one card each). */
export const DELIVERY_SETTING_KEYS = ['delivery.holiday', 'delivery.sticker.latin', 'delivery.promise.districts', 'checkout.voice', 'delivery.courier.tracking', 'delivery.courier.booking', 'delivery.courier.selection', 'delivery.courier.webhooks', 'delivery.courier.zoneSync', 'delivery.couriers', 'delivery.courier.payouts', 'delivery.courier.claimTerms', 'fulfilment.packing.check', 'fulfilment.packing.photo', 'fulfilment.packing.weight', 'fulfilment.packing.queue', 'fulfilment.packing.issues'] as const;
export type DeliverySettingKey = (typeof DELIVERY_SETTING_KEYS)[number];

/** Each card's schema, its line in the settings change log and its audit action. */
const CARDS: Record<DeliverySettingKey, { schema: ZodType<Record<string, unknown>>; reason: string; action: string }> = {
  'delivery.holiday': { schema: holidaySchema, reason: 'Delivery › Delivery settings › Holiday mode', action: 'delivery.holiday.save' },
  'delivery.sticker.latin': { schema: stickerLatinSchema, reason: 'Delivery › Delivery settings › Sticker address in Latin letters', action: 'delivery.sticker.latin.save' },
  'delivery.promise.districts': { schema: districtPromiseSchema, reason: 'Delivery › Delivery settings › Delivery promise per district', action: 'delivery.promise.districts.save' },
  // CN-020 (4): the checkout address box's mic (the address the rider needs, said aloud)
  'checkout.voice': { schema: voiceAddressSchema, reason: 'Delivery › Delivery settings › Voice address at checkout', action: 'checkout.voice.save' },
  // follow-up 370: the courier cards
  'delivery.courier.tracking': { schema: courierTrackingSchema, reason: 'Delivery › Delivery settings › Reading the couriers', action: 'delivery.courier.tracking.save' },
  'delivery.courier.booking': { schema: courierBookingSchema as unknown as ZodType<Record<string, unknown>>, reason: 'Delivery › Delivery settings › Booking with the courier', action: 'delivery.courier.booking.save' },
  'delivery.courier.selection': { schema: courierSelectionSchema, reason: 'Delivery › Delivery settings › The courier by cost', action: 'delivery.courier.selection.save' },
  'delivery.courier.webhooks': { schema: courierWebhooksSchema, reason: "Delivery › Delivery settings › The couriers' own status calls", action: 'delivery.courier.webhooks.save' },
  // follow-up 431
  'delivery.courier.zoneSync': { schema: courierZoneSyncSchema, reason: "Delivery › Delivery settings › The couriers' area lists", action: 'delivery.courier.zoneSync.save' },
  // S28 · PR 670: the default courier
  'delivery.couriers': { schema: couriersSchema, reason: 'Delivery › Delivery settings › Default courier', action: 'delivery.couriers.save' },
  // S28 · PR 671: courier payouts through the courier's own payment request (off)
  'delivery.courier.payouts': { schema: courierPayoutsSchema, reason: "Delivery › Delivery settings › Courier payouts", action: 'delivery.courier.payouts.save' },
  // S28 · PR 673: the courier's time to pay a claim (off)
  'delivery.courier.claimTerms': { schema: courierClaimTermsSchema, reason: 'Delivery › Delivery settings › Courier claims', action: 'delivery.courier.claimTerms.save' },
  // follow-up 462: the packing step's cards, under More options
  'fulfilment.packing.check': { schema: packingCheckSchema, reason: 'Delivery › Delivery settings › More options › Checking the pieces', action: 'fulfilment.packing.check.save' },
  'fulfilment.packing.photo': { schema: packingPhotoSchema, reason: 'Delivery › Delivery settings › More options › The packing photo', action: 'fulfilment.packing.photo.save' },
  'fulfilment.packing.weight': { schema: packingWeightSchema, reason: "Delivery › Delivery settings › More options › The parcel's weight", action: 'fulfilment.packing.weight.save' },
  'fulfilment.packing.queue': { schema: packingQueueSchema, reason: 'Delivery › Delivery settings › More options › The packing lists', action: 'fulfilment.packing.queue.save' },
  'fulfilment.packing.issues': { schema: packingIssuesSchema, reason: 'Delivery › Delivery settings › More options › A defective or missing piece', action: 'fulfilment.packing.issues.save' },
};

/** A district of the gazetteer, for the promise card's picker (its code is what a row names). */
export interface DeliveryDistrictOption {
  code: string;
  nameEn: string;
  nameBn: string | null;
}

/** The gazetteer's districts, by English name. */
export async function deliveryDistrictOptions(deps: Pick<Deps, 'db'>): Promise<DeliveryDistrictOption[]> {
  const rows = await deps.db.geoArea.findMany({ where: { level: 'DISTRICT', archivedAt: null, code: { not: null } }, select: { code: true, nameEn: true, nameBn: true }, orderBy: { nameEn: 'asc' } });
  return rows.map((d) => ({ code: d.code!, nameEn: d.nameEn, nameBn: d.nameBn }));
}
const isKey = (k: unknown): k is DeliverySettingKey => typeof k === 'string' && (DELIVERY_SETTING_KEYS as readonly string[]).includes(k);

export interface DeliverySettingCard {
  key: DeliverySettingKey;
  value: Record<string, unknown>;
  version: string;
}

export class DeliverySettingsError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details: string[] = [],
  ) {
    super(code);
  }
}

interface Who {
  actor: Actor;
  ctx: RequestContext;
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

type Deps = Pick<AdminDeps, 'db' | 'resolver'>;

/** The page's cards with their versions (`delivery.read`). */
export async function deliverySettingCards(deps: Deps, who: Who): Promise<Record<DeliverySettingKey, DeliverySettingCard>> {
  await requirePermission(deps.db, who.actor, 'delivery.read', { storeId: S });
  const entries = await Promise.all(
    DELIVERY_SETTING_KEYS.map(async (key) => {
      const value = (await deps.resolver.value(key, { storeId: S })) as unknown as Record<string, unknown>;
      return [key, { key, value, version: versionOf(value) }] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<DeliverySettingKey, DeliverySettingCard>;
}

/** Saves one card whole (`delivery.charges`): checked against its schema and the version the page showed; audited. */
export async function saveDeliverySetting(deps: Deps, who: Who, input: unknown): Promise<Record<DeliverySettingKey, DeliverySettingCard>> {
  await requirePermission(deps.db, who.actor, 'delivery.charges', { storeId: S });
  if (!isObj(input) || !isKey(input.key)) throw new DeliverySettingsError('INVALID_INPUT', 400, ['key']);
  const key = input.key;
  const card = CARDS[key];
  const before = await deps.resolver.value(key, { storeId: S });
  if (input.version !== versionOf(before)) throw new DeliverySettingsError('STALE', 409);
  const ok = card.schema.safeParse(input.value);
  if (!ok.success) throw new DeliverySettingsError('INVALID_INPUT', 400, [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  if (key === 'delivery.promise.districts') {
    const known = new Set((await deliveryDistrictOptions(deps)).map((d) => d.code));
    if ((ok.data as { rows: { district: string }[] }).rows.some((r) => !known.has(r.district))) throw new DeliverySettingsError('INVALID_INPUT', 400, ['rows']);
  }
  if (key === 'delivery.couriers') {
    // the default must be a courier account of this store (or empty: the first one)
    const id = (ok.data as { defaultCourierId: string }).defaultCourierId;
    if (id && !(await deps.db.courierAccount.findFirst({ where: { id, storeId: S, archivedAt: null }, select: { id: true } }))) throw new DeliverySettingsError('INVALID_INPUT', 400, ['defaultCourierId']);
  }
  if (versionOf(ok.data) !== versionOf(before)) {
    await deps.resolver.set(key, ok.data as never, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: card.reason });
    await audit(deps.db, who.actor, { storeId: S, action: card.action, entityType: 'Setting', entityId: key, before: { ...before }, after: { ...ok.data } }, who.ctx);
  }
  return deliverySettingCards(deps, who);
}

/** /api/admin/delivery/settings — GET the cards (`delivery.read`), PUT one card (`delivery.charges`). */
export async function deliverySettingsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'delivery.read' : 'delivery.charges', storeId: S });
  if (g instanceof Response) return g;
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    const cards = method === 'GET' ? await deliverySettingCards(deps!, who) : await saveDeliverySetting(deps!, who, await body(request));
    return json({ ok: true, cards });
  } catch (e) {
    if (e instanceof DeliverySettingsError) return json({ ok: false, error: e.code, ...(e.details.length ? { details: e.details } : {}) }, { status: e.status });
    return errorResponse(e);
  }
}

// S13 · PR 274 (register "Incomplete-order capture"; SIM-F-026; Blueprint C6.3, ADMIN-ARCHITECTURE §4.2 "Incomplete
// (typed but not placed)") — Orders › Incomplete at /admin/orders/incomplete. With the owner's switch on
// (`checkout.capture.enabled`, off as it ships) the checkout keeps what a customer typed once his phone number is real;
// this lists the ones that left without ordering (no word for `orders.incomplete.leftAfterMinutes`, within
// `checkout.capture.keepDays`), hottest first: how far he got, his bag and its worth, how long ago, which visit brought
// him, and one tap to WhatsApp or call him. A person hands one to a teammate or marks it handled with a short note
// ("Open again" undoes it); nothing is deleted. Prepaid orders whose payment failed or never finished are listed beside
// them (the order's own page has "Try again"). A bag with no phone number is only counted. Nothing here messages a
// customer, changes a price, a discount or COD, or places an order. GET `orders.read`, POST `orders.confirm`, PUT (the
// settings card) `settings.write`; every change audited.
// PR 275: the follow-up card (`orders.followUp`, off as it ships): the reminder with the bag's link, then at most one
// offer with the owner's live code (two messages ever; the Messages engine sends them, with his yes for offers only);
// each row says what went to him, and the card how many went and how many then ordered. Switching the offer on, or
// changing its code, needs `rules.approve` too (a discount).
// PR 276: the left-bag card (`orders.cartRecovery`, off as it ships): a signed-in customer who left things in his bag
// and never reached the checkout's number box gets the same two-message ladder (the reminder with the bag's link, then
// at most one offer under the offer rules: bag worth, once per customer in the days, the code usable by him); the card
// says how many such bags there are, how many messages went and how many bags came back. A bag with no account and no
// number is only counted (reached on the site and by ad retargeting). The offer again needs `rules.approve`.
import { createHash } from 'node:crypto';
import { audit, can, permissionsFor } from '@extas/auth';
import { CHECKOUT_PAY_PURPOSES, checkoutQuote, CheckoutError, LANDING_LINE_SOURCE, ORDER_FLAGS, phoneNormalizeBD, placeOrder, type CheckoutDeps } from '@extas/checkout';
import { MOTHER_STORE_ID, type Prisma, type PrismaClient } from '@extas/db/client';
import { FOLLOW_UP_CEILING, registry, storeTarget, type CartRecoverySettings, type FollowUpSettings } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import type { AdPlatformsWho } from '../marketing/ad-platforms';
import { bagValue, channelOf, dayKey, fillTemplate, HANDLED_NOTE_MAX, newestFirst, rangeBounds, rangeOf, smsLink, stageOf, viewOf, whatsAppTextLink, zoneOffsetMinutes, type IncompleteRange, type IncompleteStage, type IncompleteView, type VisitChannel } from './incomplete-model';

const S = MOTHER_STORE_ID;
/** RecoveryMessage.kind of an unfinished checkout's follow-up (@extas/messages FOLLOW_UP_KIND). */
const FOLLOW_UP_KIND = 'INCOMPLETE';
/** RecoveryMessage.kind of a left bag's recovery (@extas/messages CART_RECOVERY_KIND). */
const CART_KIND = 'CART';
/** Paisa per taka: the card's bag-worth fields are typed in taka and kept in paisa. */
const MINOR_PER_UNIT = 100; // hardcode-ok: the currency's minor unit (paisa)
const DAY = 86_400_000;
const MINUTE = 60_000;
/** Rows shown per list (newest kept first; the oldest beyond this wait for the next look). */
const ROWS_SHOWN = 100;
/** Bag lines named per row (the rest is "+N more"). */
const LINES_NAMED = 3;

export class IncompleteError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: string[],
  ) {
    super(code);
  }
}

export interface IncompleteDeps {
  db: PrismaClient;
  /** PR 668 — "Confirm as order": the shop's checkout wiring and its after-order checks (the route fills it in). */
  place?: { checkout: CheckoutDeps; afterPlace: (storeId: number, orderId: string) => Promise<void> };
  resolver: AdminDeps['resolver'];
  now?: () => Date;
}

export type IncompleteWho = AdPlatformsWho;

/** What a call found (PR 668); a message logs its template's key instead. */
export const CALL_OUTCOMES = ['ANSWERED', 'NO_ANSWER', 'WILL_ORDER', 'NOT_INTERESTED', 'WRONG_NUMBER'] as const;
const TEMPLATE_KEYS = ['forgot', 'size', 'delivery', 'offer'] as const;
/** The longest offer words a person types into the offer message. */
const OFFER_TEXT_MAX = 120; // hardcode-ok: a field-length guard

export interface IncompleteLine {
  nameEn: string;
  nameBn: string | null;
  size: string | null;
  colourEn: string | null;
  colourBn: string | null;
  quantity: number;
}

export interface IncompleteRow {
  id: string;
  name: string | null;
  phone: string;
  addressText: string | null;
  stage: IncompleteStage;
  lastAt: string;
  lines: IncompleteLine[];
  /** Lines beyond the named ones. */
  more: number;
  valueMinor: number;
  channel: VisitChannel | null;
  customerId: string | null;
  assignedTo: { id: string; name: string } | null;
  handled: { at: string; by: string | null; note: string | null } | null;
  /** PR 668 — the shop-clock day (YYYY-MM-DD) the screen groups the rows under (newest first inside it). */
  day: string;
  /** PR 668 — a known customer (his phone or sign-in matched an account): the chip links to Customer 360. */
  known: boolean;
  /** PR 668 — the same connection as an earlier customer's order under another phone; marked only, never attached. */
  possibleMatch: { customerId: string } | null;
  /** PR 668 — the calls and messages the team logged on it, newest last. */
  contacts: { kind: string; outcome: string; note: string | null; at: string; by: string | null }[];
  /** PR 668 — "Ordered later": the order he placed after leaving (view `later` only). */
  ordered: { orderId: string; number: string; at: string; byPhone: boolean } | null;
  /** PR 275 — the follow-up messages that went to him (of two at most), the last one's time and way, and whether it was the offer. */
  followUps: { sent: number; last: { at: string; channel: string; offer: boolean } | null };
}

export interface UnpaidRow {
  orderId: string;
  number: string;
  name: string | null;
  phone: string | null;
  totalMinor: number;
  currency: string;
  method: string;
  state: 'failed' | 'pending';
  at: string;
}

export interface IncompleteCard {
  key: 'incomplete';
  value: { capture: boolean; keepDays: number; leftAfterMinutes: number };
  version: string;
}

/** PR 275 — the follow-up card, flat for the card's fields (`orders.followUp`; the channels as one ordered choice). */
export type FollowUpCardValue = { enabled: boolean; firstAfterMinutes: number; channels: string; minStep: FollowUpSettings['minStep']; catchUpHours: number; phoneGapDays: number; offer: boolean; offerAfterHours: number; offerCode: string };

export interface FollowUpCard {
  key: 'followUp';
  value: FollowUpCardValue;
  version: string;
}

/** PR 276 — the left-bag card, flat for the card's fields (`orders.cartRecovery`; the bag worths in taka). */
export type CartRecoveryCardValue = { enabled: boolean; firstAfterMinutes: number; channels: string; minBag: number; catchUpHours: number; creditDays: number; offer: boolean; offerAfterHours: number; offerCode: string; offerMinBag: number; offerOncePerDays: number };

export interface CartRecoveryCard {
  key: 'cartRecovery';
  value: CartRecoveryCardValue;
  version: string;
}

/** PR 668 — the "possible match and ready messages" card, flat for the card's fields (`orders.incompleteV5`). */
export type V5CardValue = { possibleMatch: boolean; forgot: string; size: string; delivery: string; offer: string };
export interface V5Card {
  key: 'v5';
  value: V5CardValue;
  version: string;
}

/** The channel orders the card offers (the first one he said yes to offers on is used). */
export const FOLLOW_UP_CHANNEL_ORDERS = ['WHATSAPP,SMS', 'SMS,WHATSAPP', 'WHATSAPP', 'SMS'] as const;

export interface IncompleteOverview {
  view: IncompleteView;
  capture: boolean;
  counts: Record<IncompleteView, number>;
  /** PR 668 — the date filter read from the address. */
  range: { range: IncompleteRange; from: string | null; to: string | null };
  /** PR 668 — the four ready messages (words in braces filled per row by the screen's link maker) and the marking switch. */
  v5: { possibleMatch: boolean; templates: Record<'forgot' | 'size' | 'delivery' | 'offer', string> };
  /** PR 668 — the journey report: how far the left checkouts of the filtered days got, and how many then ordered. */
  journey: { phone: number; address: number; payment: number; ordered: number; orderedLater: number; recoveredByPhone: number };
  rows: IncompleteRow[];
  unpaid: UnpaidRow[];
  /** Bags left in the same window with no phone number (only counted; their worth at bag prices, sets by lines). */
  noPhone: { bags: number; valueMinor: number; signedIn: number };
  /** Who a draft can be handed to: active staff who may confirm orders here. */
  staff: { id: string; name: string }[];
  card: IncompleteCard;
  /** PR 275 — the follow-up card and what it did in the kept days: messages sent, and checkouts that then ordered. */
  followUp: { card: FollowUpCard; sent: number; recovered: number; ceiling: number };
  /** PR 276 — the left-bag card and what it did in the kept days: messages sent, and bags that then came back as an order. */
  cartRecovery: { card: CartRecoveryCard; sent: number; recovered: number };
  /** PR 668 — the possible-match switch and the four ready messages. */
  v5Card: V5Card;
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

async function cardOf(deps: IncompleteDeps): Promise<IncompleteCard> {
  const [capture, keepDays, inc] = await Promise.all([deps.resolver.value('checkout.capture.enabled', { storeId: S }), deps.resolver.value('checkout.capture.keepDays', { storeId: S }), deps.resolver.value('orders.incomplete', { storeId: S })]);
  const value = { capture, keepDays, leftAfterMinutes: inc.leftAfterMinutes };
  return { key: 'incomplete', value, version: versionOf(value) };
}

const flat = (f: FollowUpSettings): FollowUpCardValue => ({ enabled: f.enabled, firstAfterMinutes: f.firstAfterMinutes, channels: f.channels.join(','), minStep: f.minStep, catchUpHours: f.catchUpHours, phoneGapDays: f.phoneGapDays, offer: f.offer.enabled, offerAfterHours: f.offer.afterHours, offerCode: f.offer.couponCode });

const flatBag = (r: CartRecoverySettings): CartRecoveryCardValue => ({
  enabled: r.enabled,
  firstAfterMinutes: r.firstAfterMinutes,
  channels: r.channels.join(','),
  minBag: r.minBagMinor / MINOR_PER_UNIT,
  catchUpHours: r.catchUpHours,
  creditDays: r.creditDays,
  offer: r.offer.enabled,
  offerAfterHours: r.offer.afterHours,
  offerCode: r.offer.couponCode,
  offerMinBag: r.offer.minBagMinor / MINOR_PER_UNIT,
  offerOncePerDays: r.offer.oncePerDays,
});

async function cartRecoveryCardOf(deps: IncompleteDeps): Promise<CartRecoveryCard> {
  const value = flatBag(await deps.resolver.value('orders.cartRecovery', { storeId: S }));
  return { key: 'cartRecovery', value, version: versionOf(value) };
}

async function v5CardOf(deps: IncompleteDeps): Promise<V5Card> {
  const v = await deps.resolver.value('orders.incompleteV5', { storeId: S });
  const value = { possibleMatch: v.possibleMatch, ...v.templates };
  return { key: 'v5', value, version: versionOf(value) };
}

async function followUpCardOf(deps: IncompleteDeps): Promise<FollowUpCard> {
  const value = flat(await deps.resolver.value('orders.followUp', { storeId: S }));
  return { key: 'followUp', value, version: versionOf(value) };
}

/** The drafts the list reads: not ordered, a number kept, left (no word for the owner's minutes), within the kept days. */
function windowWhere(card: IncompleteCard, now: Date): Prisma.CheckoutDraftWhereInput {
  const leftBefore = new Date(now.getTime() - card.value.leftAfterMinutes * MINUTE);
  const since = new Date(now.getTime() - card.value.keepDays * DAY);
  return { storeId: S, convertedOrderId: null, phone: { not: null }, lastActivityAt: { lt: leftBefore, gte: since } };
}

const viewWhere = (view: IncompleteView, me: string | null): Prisma.CheckoutDraftWhereInput => (view === 'handled' ? { handledAt: { not: null } } : view === 'mine' ? { handledAt: null, assignedToId: me ?? '00000000-0000-0000-0000-000000000000' } : { handledAt: null });

/** Active staff holding `orders.confirm` in this store (the people a draft can be handed to). */
async function staffOf(db: PrismaClient): Promise<{ id: string; name: string }[]> {
  const people = await db.staffUser.findMany({ where: { status: 'ACTIVE', archivedAt: null }, select: { id: true, displayName: true }, orderBy: { displayName: 'asc' } });
  const out: { id: string; name: string }[] = [];
  for (const p of people) if ((await permissionsFor(db, p.id, { storeId: S })).has('orders.confirm')) out.push({ id: p.id, name: p.displayName });
  return out;
}

/** The open count the All orders page shows on its "Incomplete" link (0 while the switch is off and nothing is kept). */
export async function incompleteOpenCount(deps: IncompleteDeps): Promise<number> {
  const card = await cardOf(deps);
  return deps.db.checkoutDraft.count({ where: { ...windowWhere(card, deps.now?.() ?? new Date()), handledAt: null } });
}

/** The page: the view's rows (hottest first), the counts, unfinished payments, bags without a number and the card. */
export async function incompleteOverview(deps: IncompleteDeps, me: string | null, rawView: unknown, rawFilter: { range?: unknown; from?: unknown; to?: unknown } = {}): Promise<IncompleteOverview> {
  const view = viewOf(rawView);
  const now = deps.now?.() ?? new Date();
  const card = await cardOf(deps);
  const [zone, v5] = await Promise.all([deps.resolver.value('store.timeZone', { storeId: S }), deps.resolver.value('orders.incompleteV5', { storeId: S })]);
  const offset = zoneOffsetMinutes(zone, now);
  const range = rangeOf(rawFilter.range);
  const text = (x: unknown) => (typeof x === 'string' ? x : null);
  const bounds = rangeBounds(range, now, offset, { from: text(rawFilter.from), to: text(rawFilter.to) });
  const windowBase = windowWhere(card, now);
  const base: Prisma.CheckoutDraftWhereInput = bounds ? { ...windowBase, AND: [{ lastActivityAt: { gte: bounds.from, lt: bounds.to } }] } : windowBase;
  const laterWhere: Prisma.CheckoutDraftWhereInput = { storeId: S, convertedOrderId: { not: null }, phone: { not: null }, lastActivityAt: bounds ? { gte: bounds.from, lt: bounds.to } : { gte: new Date(now.getTime() - card.value.keepDays * DAY) } };
  const [open, mine, handled, drafts, staff, followUpCard, bagCard, laterCount] = await Promise.all([
    deps.db.checkoutDraft.count({ where: { ...base, ...viewWhere('open', me) } }),
    deps.db.checkoutDraft.count({ where: { ...base, ...viewWhere('mine', me) } }),
    deps.db.checkoutDraft.count({ where: { ...base, ...viewWhere('handled', me) } }),
    deps.db.checkoutDraft.findMany({ where: view === 'later' ? laterWhere : { ...base, ...viewWhere(view, me) }, orderBy: { lastActivityAt: 'desc' }, take: ROWS_SHOWN * (view === 'later' ? 3 : 1) }),
    staffOf(deps.db),
    followUpCardOf(deps),
    cartRecoveryCardOf(deps),
    orderedLater(deps, laterWhere, card.value.leftAfterMinutes).then((x) => x.length),
  ]);
  const laterOrders = (await orderedLater(deps, laterWhere, card.value.leftAfterMinutes)).slice(0, ROWS_SHOWN);
  const laterIds = new Set(laterOrders.map((x) => x.draftId));
  const shown = view === 'later' ? drafts.filter((d) => laterIds.has(d.id)).slice(0, ROWS_SHOWN) : drafts;
  const orderOf = new Map(laterOrders.map((x) => [x.draftId, x]));
  const rowsDrafts = shown;
  const calls = rowsDrafts.length ? await deps.db.checkoutDraftCall.findMany({ where: { storeId: S, draftId: { in: rowsDrafts.map((d) => d.id) } }, orderBy: { createdAt: 'asc' } }) : [];
  const journey = await journeyOf(deps, base, laterWhere, card.value.leftAfterMinutes);
  const since = new Date(now.getTime() - card.value.keepDays * DAY);
  const [sentFollowUps, recovered, sentToRows, sentBags, recoveredBags] = await Promise.all([
    deps.db.recoveryMessage.count({ where: { storeId: S, kind: FOLLOW_UP_KIND, sentAt: { gte: since } } }),
    deps.db.recoveryMessage.findMany({ where: { storeId: S, kind: FOLLOW_UP_KIND, sentAt: { gte: since }, recoveredOrderId: { not: null } }, distinct: ['checkoutDraftId'], select: { checkoutDraftId: true } }),
    rowsDrafts.length ? deps.db.recoveryMessage.findMany({ where: { storeId: S, kind: FOLLOW_UP_KIND, checkoutDraftId: { in: rowsDrafts.map((d) => d.id) }, sentAt: { not: null } }, orderBy: { sentAt: 'asc' }, select: { checkoutDraftId: true, sentAt: true, channel: true, offerCouponId: true } }) : [],
    deps.db.recoveryMessage.count({ where: { storeId: S, kind: CART_KIND, sentAt: { gte: since } } }),
    deps.db.recoveryMessage.findMany({ where: { storeId: S, kind: CART_KIND, sentAt: { gte: since }, recoveredOrderId: { not: null } }, distinct: ['cartId'], select: { cartId: true } }),
  ]);
  const followUpsOf = new Map<string, IncompleteRow['followUps']>();
  for (const f of sentToRows) {
    const k = f.checkoutDraftId!;
    followUpsOf.set(k, { sent: (followUpsOf.get(k)?.sent ?? 0) + 1, last: { at: f.sentAt!.toISOString(), channel: f.channel, offer: !!f.offerCouponId } });
  }

  const cartIds = [...new Set(rowsDrafts.map((d) => d.cartId).filter((x): x is string => !!x))];
  const lines = cartIds.length ? await deps.db.cartItem.findMany({ where: { storeId: S, cartId: { in: cartIds }, removedAt: null, savedForLater: false }, orderBy: { createdAt: 'asc' }, select: { cartId: true, variantId: true, quantity: true, unitPriceMinor: true, comboGroupKey: true, setPriceMinor: true, source: true } }) : [];
  const variantIds = [...new Set(lines.map((l) => l.variantId))];
  const variants = new Map((variantIds.length ? await deps.db.productVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, product: { select: { nameEn: true, nameBn: true } }, size: { select: { label: true } }, colour: { select: { nameEn: true, nameBn: true } } } }) : []).map((v) => [v.id, v]));
  const byCart = new Map<string, typeof lines>();
  for (const l of lines) byCart.set(l.cartId, [...(byCart.get(l.cartId) ?? []), l]);
  const people = new Map(staff.map((p) => [p.id, p.name]));
  const others = [...new Set(rowsDrafts.flatMap((d) => [d.assignedToId, d.handledById]).filter((x): x is string => !!x && !people.has(x)))];
  if (others.length) for (const p of await deps.db.staffUser.findMany({ where: { id: { in: others } }, select: { id: true, displayName: true } })) people.set(p.id, p.displayName);

  // a number that is already an account's (or a signed-in draft) is a known customer: the chip opens Customer 360; nothing is changed on the draft
  const accounts = rowsDrafts.length ? await deps.db.customer.findMany({ where: { storeId: S, phone: { in: rowsDrafts.map((d) => d.phone!) }, archivedAt: null, erasedAt: null }, select: { id: true, phone: true } }) : [];
  const accountOf = new Map(accounts.map((a) => [a.phone!, a.id]));
  const callers = [...new Set(calls.map((c) => c.byId).filter((x): x is string => !!x && !people.has(x)))];
  if (callers.length) for (const p of await deps.db.staffUser.findMany({ where: { id: { in: callers } }, select: { id: true, displayName: true } })) people.set(p.id, p.displayName);
  const rows = newestFirst(
    rowsDrafts.map((d) => {
      const bag = (d.cartId ? byCart.get(d.cartId) : undefined) ?? [];
      const row: IncompleteRow = {
        id: d.id,
        name: d.name,
        phone: d.phone!,
        addressText: d.addressText,
        stage: stageOf(d.lastStep),
        lastAt: d.lastActivityAt.toISOString(),
        lines: bag.slice(0, LINES_NAMED).map((l) => {
          const v = variants.get(l.variantId);
          return { nameEn: v?.product.nameEn ?? '', nameBn: v?.product.nameBn ?? null, size: v?.size?.label ?? null, colourEn: v?.colour?.nameEn ?? null, colourBn: v?.colour?.nameBn ?? null, quantity: l.quantity };
        }),
        more: Math.max(0, bag.length - LINES_NAMED),
        valueMinor: bagValue(bag),
        channel: channelOf(
          d.data,
          bag.some((l) => (l.source ?? '').startsWith(LANDING_LINE_SOURCE)),
        ),
        customerId: d.customerId ?? accountOf.get(d.phone!) ?? null,
        day: dayKey(d.lastActivityAt, offset),
        known: !!(d.customerId ?? accountOf.get(d.phone!)),
        possibleMatch: v5.possibleMatch && d.possibleMatch && d.possibleMatchCustomerId && !(d.customerId ?? accountOf.get(d.phone!)) ? { customerId: d.possibleMatchCustomerId } : null,
        contacts: calls.filter((c) => c.draftId === d.id).map((c) => ({ kind: c.kind, outcome: c.outcome, note: c.note, at: c.createdAt.toISOString(), by: c.byId ? (people.get(c.byId) ?? null) : null })),
        ordered: orderOf.get(d.id) ? { orderId: orderOf.get(d.id)!.orderId, number: orderOf.get(d.id)!.number, at: orderOf.get(d.id)!.at, byPhone: !!d.recoveredAt } : null,
        assignedTo: d.assignedToId ? { id: d.assignedToId, name: people.get(d.assignedToId) ?? '' } : null,
        handled: d.handledAt ? { at: d.handledAt.toISOString(), by: d.handledById ? (people.get(d.handledById) ?? null) : null, note: d.handledNote } : null,
        followUps: followUpsOf.get(d.id) ?? { sent: 0, last: null },
      };
      return { stage: row.stage, lastAt: d.lastActivityAt, row };
    }),
  ).map((x) => x.row);

  return {
    view,
    capture: card.value.capture,
    counts: { open, mine, handled, later: laterCount },
    range: { range, from: range === 'custom' ? text(rawFilter.from) : null, to: range === 'custom' ? text(rawFilter.to) : null },
    v5: { possibleMatch: v5.possibleMatch, templates: v5.templates },
    journey,
    rows,
    unpaid: await unpaidOf(deps, card, now),
    noPhone: await noPhoneOf(deps, card, now),
    staff,
    card,
    v5Card: await v5CardOf(deps),
    followUp: { card: followUpCard, sent: sentFollowUps, recovered: recovered.length, ceiling: FOLLOW_UP_CEILING },
    cartRecovery: { card: bagCard, sent: sentBags, recovered: recoveredBags.length },
  };
}

/** "Ordered later": drafts that were already left (no word for the owner's minutes) when the same checkout's order was placed. */
async function orderedLater(deps: IncompleteDeps, where: Prisma.CheckoutDraftWhereInput, leftAfterMinutes: number): Promise<{ draftId: string; orderId: string; number: string; at: string }[]> {
  const drafts = await deps.db.checkoutDraft.findMany({ where, select: { id: true, lastActivityAt: true, convertedOrderId: true }, orderBy: { lastActivityAt: 'desc' }, take: ROWS_SHOWN * 5 });
  const ids = drafts.map((d) => d.convertedOrderId!).filter(Boolean);
  const orders = ids.length ? await deps.db.order.findMany({ where: { id: { in: ids }, storeId: S }, select: { id: true, number: true, placedAt: true } }) : [];
  const byId = new Map(orders.map((o) => [o.id, o]));
  const out: { draftId: string; orderId: string; number: string; at: string }[] = [];
  for (const d of drafts) {
    const o = byId.get(d.convertedOrderId!);
    if (o && o.placedAt.getTime() - d.lastActivityAt.getTime() >= leftAfterMinutes * MINUTE) out.push({ draftId: d.id, orderId: o.id, number: o.number, at: o.placedAt.toISOString() });
  }
  return out;
}

/** The journey report: how far each left checkout of the filtered days got (the furthest step it kept), and how many ordered. */
async function journeyOf(deps: IncompleteDeps, base: Prisma.CheckoutDraftWhereInput, later: Prisma.CheckoutDraftWhereInput, leftAfterMinutes: number): Promise<IncompleteOverview['journey']> {
  const left = await deps.db.checkoutDraft.groupBy({ by: ['lastStep'], where: base, _count: { _all: true } });
  const n = { phone: 0, address: 0, payment: 0 };
  for (const g of left) n[stageOf(g.lastStep)] += g._count._all;
  const ordered = await orderedLater(deps, later, leftAfterMinutes);
  const recoveredByPhone = await deps.db.checkoutDraft.count({ where: { ...later, recoveredAt: { not: null } } });
  return { ...n, ordered: ordered.length, orderedLater: ordered.length, recoveredByPhone };
}

/** Prepaid orders whose last checkout payment failed, or stayed unanswered past the owner's minutes (not cancelled). */
async function unpaidOf(deps: IncompleteDeps, card: IncompleteCard, now: Date): Promise<UnpaidRow[]> {
  const leftBefore = new Date(now.getTime() - card.value.leftAfterMinutes * MINUTE);
  const orders = await deps.db.order.findMany({
    where: { storeId: S, status: { not: 'CANCELLED' }, flags: { hasSome: [ORDER_FLAGS.paymentFailed, ORDER_FLAGS.paymentPending] }, placedAt: { gte: new Date(now.getTime() - card.value.keepDays * DAY) } },
    orderBy: { placedAt: 'desc' },
    take: ROWS_SHOWN,
    select: { id: true, number: true, customerName: true, phone: true, totalMinor: true, currency: true, payments: { where: { purpose: { in: CHECKOUT_PAY_PURPOSES }, method: { notIn: ['COD', 'WALLET'] } }, orderBy: { createdAt: 'desc' }, take: 1, select: { method: true, status: true, statusAt: true, createdAt: true } } },
  });
  const out: UnpaidRow[] = [];
  for (const o of orders) {
    const p = o.payments[0];
    if (!p) continue;
    const at = p.statusAt ?? p.createdAt;
    const state = p.status === 'FAILED' ? 'failed' : (p.status === 'INITIATED' || p.status === 'PENDING') && at < leftBefore ? 'pending' : null;
    if (!state) continue;
    out.push({ orderId: o.id, number: o.number, name: o.customerName, phone: o.phone, totalMinor: o.totalMinor, currency: o.currency, method: p.method, state, at: at.toISOString() });
  }
  return out;
}

/**
 * Open bags left in the window whose checkout never kept a phone number: how many, and their worth at bag prices; and
 * (PR 276) how many of them are signed-in customers' with a number on the account (the left-bag card can reach those).
 */
async function noPhoneOf(deps: IncompleteDeps, card: IncompleteCard, now: Date): Promise<{ bags: number; valueMinor: number; signedIn: number }> {
  const leftBefore = new Date(now.getTime() - card.value.leftAfterMinutes * MINUTE);
  const since = new Date(now.getTime() - card.value.keepDays * DAY);
  const [r] = await deps.db.$queryRaw<{ bags: number; value: bigint | null; signedIn: number }[]>`
    SELECT count(DISTINCT c."id")::int AS "bags", sum(i."quantity" * i."unitPriceMinor")::bigint AS "value",
      count(DISTINCT c."id") FILTER (WHERE EXISTS (SELECT 1 FROM "Customer" u WHERE u."id" = c."customerId" AND u."phone" IS NOT NULL AND u."archivedAt" IS NULL AND u."erasedAt" IS NULL))::int AS "signedIn"
    FROM "Cart" c JOIN "CartItem" i ON i."cartId" = c."id" AND i."removedAt" IS NULL AND i."savedForLater" = false
    WHERE c."storeId" = ${S} AND c."status" = 'ACTIVE' AND c."lastActivityAt" < ${leftBefore} AND c."lastActivityAt" >= ${since}
      AND NOT EXISTS (SELECT 1 FROM "CheckoutDraft" d WHERE d."cartId" = c."id" AND d."phone" IS NOT NULL)`;
  return { bags: r?.bags ?? 0, valueMinor: Number(r?.value ?? 0), signedIn: r?.signedIn ?? 0 };
}

async function draftOf(deps: IncompleteDeps, id: unknown) {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new IncompleteError('INVALID_INPUT', 400, ['id']);
  const d = await deps.db.checkoutDraft.findFirst({ where: { id, storeId: S, convertedOrderId: null, phone: { not: null } }, select: { id: true, assignedToId: true, handledAt: true, handledNote: true } });
  if (!d) throw new IncompleteError('NOT_FOUND', 404);
  return d;
}

/**
 * POST {action: 'assign', id, staffUserId | null} hands it to a teammate (or back to nobody); {action: 'handled', id,
 * note} marks it handled with a short note; {action: 'reopen', id} puts it back on the open list. Audited.
 */
export async function incompleteAction(deps: IncompleteDeps, who: IncompleteWho, input: unknown): Promise<{ id: string }> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const d = await draftOf(deps, o.id);
  const now = deps.now?.() ?? new Date();
  const me = who.actor.staffUserId ?? null;
  const log = (action: string, before: Record<string, unknown>, after: Record<string, unknown>) => audit(deps.db, who.actor, { storeId: S, action, entityType: 'CheckoutDraft', entityId: d.id, before, after }, who.ctx);
  if (o.action === 'assign') {
    const to = o.staffUserId === null || o.staffUserId === '' ? null : o.staffUserId;
    if (to !== null && (typeof to !== 'string' || !(await staffOf(deps.db)).some((p) => p.id === to))) throw new IncompleteError('INVALID_INPUT', 400, ['staffUserId']);
    await deps.db.checkoutDraft.update({ where: { id: d.id }, data: { assignedToId: to, assignedAt: to ? now : null } });
    await log('incomplete.assign', { assignedToId: d.assignedToId }, { assignedToId: to });
    return { id: d.id };
  }
  if (o.action === 'handled') {
    if (o.note !== undefined && o.note !== null && typeof o.note !== 'string') throw new IncompleteError('INVALID_INPUT', 400, ['note']);
    const note = typeof o.note === 'string' ? o.note.trim() : '';
    if (note.length > HANDLED_NOTE_MAX) throw new IncompleteError('INVALID_INPUT', 400, ['note']);
    if (d.handledAt) throw new IncompleteError('HANDLED', 409);
    await deps.db.checkoutDraft.update({ where: { id: d.id }, data: { handledAt: now, handledById: me, handledNote: note || null } });
    await log('incomplete.handled', {}, { note: note || null });
    return { id: d.id };
  }
  if (o.action === 'reopen') {
    if (!d.handledAt) throw new IncompleteError('OPEN', 409);
    await deps.db.checkoutDraft.update({ where: { id: d.id }, data: { handledAt: null, handledById: null } });
    await log('incomplete.reopen', { handledAt: d.handledAt.toISOString(), note: d.handledNote }, {});
    return { id: d.id };
  }
  // PR 668 — the call log: one row per call and what it found (append-only; a note is optional)
  if (o.action === 'call') {
    const outcome = (CALL_OUTCOMES as readonly unknown[]).includes(o.outcome) ? (o.outcome as string) : null;
    if (!outcome) throw new IncompleteError('INVALID_INPUT', 400, ['outcome']);
    if (o.note !== undefined && o.note !== null && typeof o.note !== 'string') throw new IncompleteError('INVALID_INPUT', 400, ['note']);
    const note = typeof o.note === 'string' ? o.note.trim() : '';
    if (note.length > HANDLED_NOTE_MAX) throw new IncompleteError('INVALID_INPUT', 400, ['note']);
    await deps.db.checkoutDraftCall.create({ data: { storeId: S, draftId: d.id, byId: me, kind: 'CALL', outcome, note: note || null } });
    await log('incomplete.call', {}, { outcome, note: note || null });
    return { id: d.id };
  }
  // PR 668 — a ready message: the screen opens WhatsApp or SMS with the words in the box; a person presses send. The
  // offer message names a discount, so only someone who may approve one opens it, and types the offer words himself.
  if (o.action === 'message') {
    const key = (TEMPLATE_KEYS as readonly unknown[]).includes(o.template) ? (o.template as (typeof TEMPLATE_KEYS)[number]) : null;
    if (!key) throw new IncompleteError('INVALID_INPUT', 400, ['template']);
    const offer = typeof o.offer === 'string' ? o.offer.trim() : '';
    if (key === 'offer') {
      if (!(await can(deps.db, who.actor, 'rules.approve', { storeId: S }))) throw new IncompleteError('forbidden', 403, ['offer']);
      if (!offer || offer.length > OFFER_TEXT_MAX) throw new IncompleteError('INVALID_INPUT', 400, ['offer']);
    }
    const [v5, full] = await Promise.all([deps.resolver.value('orders.incompleteV5', { storeId: S }), deps.db.checkoutDraft.findUniqueOrThrow({ where: { id: d.id }, select: { name: true, phone: true, restoreCode: true, cartId: true } })]);
    const lines = full.cartId ? await deps.db.cartItem.findMany({ where: { storeId: S, cartId: full.cartId, removedAt: null, savedForLater: false }, orderBy: { createdAt: 'asc' }, take: LINES_NAMED, select: { variantId: true } }) : [];
    const named = lines.length ? await deps.db.productVariant.findMany({ where: { id: { in: lines.map((l) => l.variantId) } }, select: { id: true, product: { select: { nameEn: true } } } }) : [];
    const items = lines.map((l) => ({ name: named.find((v) => v.id === l.variantId)?.product.nameEn ?? '' }));
    const first = (full.name ?? '').trim().split(/\s+/)[0] ?? '';
    const words = fillTemplate(v5.templates[key], { name: first, items: items.map((i) => i.name).join(', '), link: null, offer });
    await deps.db.checkoutDraftCall.create({ data: { storeId: S, draftId: d.id, byId: me, kind: 'MESSAGE', outcome: key, note: null } });
    await log('incomplete.message', {}, { template: key });
    return { id: d.id, whatsapp: whatsAppTextLink(full.phone!, words), sms: smsLink(full.phone!, words), text: words } as { id: string };
  }
  // PR 668 — "Confirm as order": the person phoned him and he agreed. The same checkout as the website places it (the
  // same stock hold, delivery charge, risk look and number); Cash on Delivery only, so no money is asked or moved here.
  if (o.action === 'confirmOrder') return confirmAsOrder(deps, who, d.id, o);
  throw new IncompleteError('INVALID_INPUT', 400, ['action']);
}

async function confirmAsOrder(deps: IncompleteDeps, who: IncompleteWho, draftId: string, o: Record<string, unknown>): Promise<{ id: string }> {
  if (!deps.place) throw new IncompleteError('UNAVAILABLE', 503);
  const dr = await deps.db.checkoutDraft.findFirst({ where: { id: draftId, storeId: S, convertedOrderId: null }, select: { id: true, cartId: true, visitorId: true, customerId: true, phone: true, name: true, addressText: true } });
  if (!dr || !dr.cartId) throw new IncompleteError('NO_BAG', 409);
  const text = (x: unknown) => (typeof x === 'string' ? x.trim() : '');
  const name = text(o.name) || (dr.name ?? '');
  const address = text(o.address) || (dr.addressText ?? '');
  const p = phoneNormalizeBD(dr.phone ?? '');
  const phone = p.ok ? p.e164 : (dr.phone ?? '');
  const me = who.actor.staffUserId ?? null;
  try {
    const q = await checkoutQuote(deps.place.checkout, { storeId: S, cartId: dr.cartId, lang: 'en', customerId: dr.customerId, address: { line: address, confirmed: null, ...(p.ok ? { phone: p.e164 } : {}) }, payment: { method: 'cod' }, useWallet: false, ip: null, gift: false, details: { name, phone } });
    // an advance or a closed Cash on Delivery means money is asked: that is the customer's own checkout, never a phone click
    if (!q.pay.cod || (q.advance && q.pay.chosen && q.pay.chosen.method !== 'cod')) throw new IncompleteError('NEEDS_PAYMENT', 409);
    const placed = await placeOrder(deps.place.checkout, { storeId: S, visitorId: dr.visitorId, customerId: dr.customerId, chat: { source: 'PHONE', conversationId: dr.id, channelKind: 'phone', staffUserId: me }, input: { idempotencyKey: draftKey(dr.id), lang: 'en', form: { name, phone, address }, confirmed: null, payment: { method: 'cod' }, fingerprint: q.fingerprint } });
    if (!placed.replay) await deps.place.afterPlace(S, placed.orderId);
    const now = deps.now?.() ?? new Date();
    await deps.db.checkoutDraft.updateMany({ where: { id: dr.id, storeId: S, recoveredAt: null }, data: { recoveredAt: now, recoveredById: me } });
    await deps.db.checkoutDraftCall.create({ data: { storeId: S, draftId: dr.id, byId: me, kind: 'CALL', outcome: 'ORDERED', note: null } });
    await audit(deps.db, who.actor, { storeId: S, action: 'incomplete.confirmOrder', entityType: 'CheckoutDraft', entityId: dr.id, before: {}, after: { orderId: placed.orderId } }, who.ctx);
    return { id: dr.id, orderId: placed.orderId } as { id: string };
  } catch (e) {
    if (e instanceof CheckoutError) throw new IncompleteError('CHECKOUT', 422, [e.code]);
    throw e;
  }
}

/** One press, one order: the key is made from the draft, so a second press finds the order the first placed. */
const draftKey = (id: string): string => `${id.slice(0, 8)}-${id.slice(9, 13)}-4${id.slice(15, 18)}-8${id.slice(19, 23)}-${id.slice(24)}`;

/** PUT {key: 'incomplete', value: {capture, keepDays, leftAfterMinutes}, version}: the card (audited when it changes). */
export async function saveIncompleteCard(deps: IncompleteDeps, who: IncompleteWho, input: unknown): Promise<IncompleteCard> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (o.key !== 'incomplete') throw new IncompleteError('INVALID_INPUT', 400, ['key']);
  const before = await cardOf(deps);
  if (o.version !== before.version) throw new IncompleteError('STALE', 409);
  const v = o.value && typeof o.value === 'object' ? (o.value as Record<string, unknown>) : {};
  const capture = registry['checkout.capture.enabled'].schema.safeParse(v.capture);
  const keepDays = registry['checkout.capture.keepDays'].schema.safeParse(v.keepDays);
  const inc = registry['orders.incomplete'].schema.safeParse({ leftAfterMinutes: v.leftAfterMinutes });
  const bad = [!capture.success && 'capture', !keepDays.success && 'keepDays', !inc.success && 'leftAfterMinutes'].filter((x): x is string => !!x);
  if (bad.length || !capture.success || !keepDays.success || !inc.success) throw new IncompleteError('INVALID_INPUT', 400, bad);
  const after = { capture: capture.data, keepDays: keepDays.data, leftAfterMinutes: inc.data.leftAfterMinutes };
  const meta = { actorId: who.actor.staffUserId ?? null, reason: 'Orders › Incomplete' };
  if (after.capture !== before.value.capture) await deps.resolver.set('checkout.capture.enabled', after.capture, storeTarget(S), meta);
  if (after.keepDays !== before.value.keepDays) await deps.resolver.set('checkout.capture.keepDays', after.keepDays, storeTarget(S), meta);
  if (after.leftAfterMinutes !== before.value.leftAfterMinutes) await deps.resolver.set('orders.incomplete', inc.data, storeTarget(S), meta);
  if (versionOf(after) !== before.version) await audit(deps.db, who.actor, { storeId: S, action: 'incomplete.settings', entityType: 'Setting', entityId: 'orders.incomplete', before: { ...before.value }, after: { ...after } }, who.ctx);
  return { key: 'incomplete', value: after, version: versionOf(after) };
}

/**
 * PR 668 — PUT {key: 'v5', value, version}: the possible-match switch and the four ready messages (audited when they
 * change). The offer message names a discount only in words a person types when sending, so no code is kept here; the
 * texts are checked by the setting's own schema (1 to 500 characters each).
 */
export async function saveV5Card(deps: IncompleteDeps, who: IncompleteWho, input: unknown): Promise<V5Card> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const before = await v5CardOf(deps);
  if (o.version !== before.version) throw new IncompleteError('STALE', 409);
  const v = o.value && typeof o.value === 'object' ? (o.value as Record<string, unknown>) : {};
  const parsed = registry['orders.incompleteV5'].schema.safeParse({ possibleMatch: v.possibleMatch, templates: { forgot: v.forgot, size: v.size, delivery: v.delivery, offer: v.offer } });
  if (!parsed.success) throw new IncompleteError('INVALID_INPUT', 400, [...new Set(parsed.error.issues.map((i) => (i.path[0] === 'templates' ? String(i.path[1]) : String(i.path[0]))))]);
  const after: V5CardValue = { possibleMatch: parsed.data.possibleMatch, ...parsed.data.templates };
  if (versionOf(after) === before.version) return before;
  await deps.resolver.set('orders.incompleteV5', parsed.data, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Orders › Incomplete' });
  await audit(deps.db, who.actor, { storeId: S, action: 'incomplete.v5', entityType: 'Setting', entityId: 'orders.incompleteV5', before: { ...before.value }, after: { ...after } }, who.ctx);
  return { key: 'v5', value: after, version: versionOf(after) };
}

/**
 * PR 275 — PUT {key: 'followUp', value, version}: the follow-up card (audited when it changes). The offer's code must be
 * one of the shop's live codes; switching the offer on or changing its code is a discount, so it also needs
 * `rules.approve` (the owner's OK); the reminder alone needs `settings.write`.
 */
export async function saveFollowUpCard(deps: IncompleteDeps, who: IncompleteWho, input: unknown): Promise<FollowUpCard> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const before = await followUpCardOf(deps);
  if (o.version !== before.version) throw new IncompleteError('STALE', 409);
  const v = o.value && typeof o.value === 'object' ? (o.value as Record<string, unknown>) : {};
  const order = typeof v.channels === 'string' && (FOLLOW_UP_CHANNEL_ORDERS as readonly string[]).includes(v.channels) ? v.channels.split(',') : null;
  const parsed = registry['orders.followUp'].schema.safeParse({ enabled: v.enabled, firstAfterMinutes: v.firstAfterMinutes, channels: order, minStep: v.minStep, catchUpHours: v.catchUpHours, phoneGapDays: v.phoneGapDays, offer: { enabled: v.offer, afterHours: v.offerAfterHours, couponCode: typeof v.offerCode === 'string' ? v.offerCode : undefined } });
  if (!parsed.success) {
    const paths = parsed.error.issues.map((i) => (i.path[0] === 'offer' ? ({ enabled: 'offer', afterHours: 'offerAfterHours', couponCode: 'offerCode' } as Record<string, string>)[String(i.path[1])] : String(i.path[0])));
    throw new IncompleteError('INVALID_INPUT', 400, [...new Set(paths.filter((x): x is string => !!x))]);
  }
  const next = { ...parsed.data, offer: { ...parsed.data.offer, couponCode: parsed.data.offer.couponCode.toUpperCase() } };
  const after = flat(next);
  if (after.offer && !after.offerCode) throw new IncompleteError('INVALID_INPUT', 400, ['offerCode']);
  if (after.offerCode) {
    const live = await deps.db.coupon.findFirst({ where: { storeId: S, code: { equals: after.offerCode, mode: 'insensitive' }, enabled: true }, select: { code: true } });
    if (!live) throw new IncompleteError('INVALID_INPUT', 400, ['offerCode']);
    next.offer.couponCode = live.code;
    after.offerCode = live.code;
  }
  const offerChanged = after.offer && (!before.value.offer || after.offerCode !== before.value.offerCode);
  if (offerChanged && !(await can(deps.db, who.actor, 'rules.approve', { storeId: S }))) throw new IncompleteError('forbidden', 403, ['offer']);
  if (versionOf(after) === before.version) return before;
  await deps.resolver.set('orders.followUp', next, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Orders › Incomplete' });
  await audit(deps.db, who.actor, { storeId: S, action: 'incomplete.followUp', entityType: 'Setting', entityId: 'orders.followUp', before: { ...before.value }, after: { ...after } }, who.ctx);
  return { key: 'followUp', value: after, version: versionOf(after) };
}

/**
 * PR 276 — PUT {key: 'cartRecovery', value, version}: the left-bag card (audited when it changes). The bag worths are
 * typed in taka (kept in paisa). The offer's code must be one of the shop's live codes; switching the offer on, changing
 * its code or easing its rules (a lower bag worth, fewer days between offers) is a discount decision, so it also needs
 * `rules.approve` (the owner's OK); the reminder alone needs `settings.write`.
 */
export async function saveCartRecoveryCard(deps: IncompleteDeps, who: IncompleteWho, input: unknown): Promise<CartRecoveryCard> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const before = await cartRecoveryCardOf(deps);
  if (o.version !== before.version) throw new IncompleteError('STALE', 409);
  const v = o.value && typeof o.value === 'object' ? (o.value as Record<string, unknown>) : {};
  const order = typeof v.channels === 'string' && (FOLLOW_UP_CHANNEL_ORDERS as readonly string[]).includes(v.channels) ? v.channels.split(',') : null;
  const minor = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * MINOR_PER_UNIT) : x);
  const parsed = registry['orders.cartRecovery'].schema.safeParse({
    enabled: v.enabled,
    firstAfterMinutes: v.firstAfterMinutes,
    channels: order,
    minBagMinor: minor(v.minBag),
    catchUpHours: v.catchUpHours,
    creditDays: v.creditDays,
    offer: { enabled: v.offer, afterHours: v.offerAfterHours, couponCode: typeof v.offerCode === 'string' ? v.offerCode : undefined, minBagMinor: minor(v.offerMinBag), oncePerDays: v.offerOncePerDays },
  });
  if (!parsed.success) {
    const names: Record<string, string> = { enabled: 'offer', afterHours: 'offerAfterHours', couponCode: 'offerCode', minBagMinor: 'offerMinBag', oncePerDays: 'offerOncePerDays' };
    const paths = parsed.error.issues.map((i) => (i.path[0] === 'offer' ? names[String(i.path[1])] : i.path[0] === 'minBagMinor' ? 'minBag' : String(i.path[0])));
    throw new IncompleteError('INVALID_INPUT', 400, [...new Set(paths.filter((x): x is string => !!x))]);
  }
  const next = { ...parsed.data, offer: { ...parsed.data.offer, couponCode: parsed.data.offer.couponCode.toUpperCase() } };
  const after = flatBag(next);
  if (after.offer && !after.offerCode) throw new IncompleteError('INVALID_INPUT', 400, ['offerCode']);
  if (after.offerCode) {
    const live = await deps.db.coupon.findFirst({ where: { storeId: S, code: { equals: after.offerCode, mode: 'insensitive' }, enabled: true, archivedAt: null }, select: { code: true } });
    if (!live) throw new IncompleteError('INVALID_INPUT', 400, ['offerCode']);
    next.offer.couponCode = live.code;
    after.offerCode = live.code;
  }
  const b = before.value;
  const offerChanged = after.offer && (!b.offer || after.offerCode !== b.offerCode || after.offerMinBag < b.offerMinBag || after.offerOncePerDays < b.offerOncePerDays);
  if (offerChanged && !(await can(deps.db, who.actor, 'rules.approve', { storeId: S }))) throw new IncompleteError('forbidden', 403, ['offer']);
  if (versionOf(after) === before.version) return before;
  await deps.resolver.set('orders.cartRecovery', next, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Orders › Incomplete' });
  await audit(deps.db, who.actor, { storeId: S, action: 'incomplete.cartRecovery', entityType: 'Setting', entityId: 'orders.cartRecovery', before: { ...b }, after: { ...after } }, who.ctx);
  return { key: 'cartRecovery', value: after, version: versionOf(after) };
}

const answer = (e: unknown): Response => (e instanceof IncompleteError ? json({ ok: false, error: e.code, details: e.details }, { status: e.status }) : errorResponse(e));

/** /api/admin/orders/incomplete — GET the page (`orders.read`, `?view=`); POST an action (`orders.confirm`); PUT the card (`settings.write`). */
export async function incompleteHandler(request: Request, deps: AdminDeps | null, extra: Partial<IncompleteDeps> = {}): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const b = method === 'GET' ? {} : await body(request).catch(() => ({}) as Record<string, unknown>);
  const permission = method === 'GET' ? 'orders.read' : method === 'PUT' ? 'settings.write' : 'orders.confirm';
  const g = await guardAdmin(request, deps, { permission, storeId: S });
  if (g instanceof Response) return g;
  const d: IncompleteDeps = { db: deps!.db, resolver: deps!.resolver, ...extra };
  const who: IncompleteWho = { actor: g.actor, ctx: g.ctx };
  try {
    if (method === 'GET') {
      const q = new URL(request.url).searchParams;
      const o = await incompleteOverview(d, g.actor.staffUserId ?? null, q.get('view'), { range: q.get('range'), from: q.get('from'), to: q.get('to') });
      return json({ ok: true, ...o, cards: { incomplete: o.card, followUp: o.followUp.card, cartRecovery: o.cartRecovery.card, v5: o.v5Card } });
    }
    if (method === 'PUT' && b.key === 'cartRecovery') return json({ ok: true, cards: { cartRecovery: await saveCartRecoveryCard(d, who, b) } });
    if (method === 'PUT' && b.key === 'v5') return json({ ok: true, cards: { v5: await saveV5Card(d, who, b) } });
    if (method === 'PUT' && b.key === 'followUp') return json({ ok: true, cards: { followUp: await saveFollowUpCard(d, who, b) } });
    if (method === 'PUT') return json({ ok: true, cards: { incomplete: await saveIncompleteCard(d, who, b) } });
    return json({ ok: true, ...(await incompleteAction(d, who, b)) });
  } catch (e) {
    return answer(e);
  }
}

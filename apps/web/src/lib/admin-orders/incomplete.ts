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
import { createHash } from 'node:crypto';
import { audit, can, permissionsFor } from '@extas/auth';
import { CHECKOUT_PAY_PURPOSES, LANDING_LINE_SOURCE, ORDER_FLAGS } from '@extas/checkout';
import { MOTHER_STORE_ID, type Prisma, type PrismaClient } from '@extas/db/client';
import { FOLLOW_UP_CEILING, registry, storeTarget, type FollowUpSettings } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import type { AdPlatformsWho } from '../marketing/ad-platforms';
import { bagValue, channelOf, HANDLED_NOTE_MAX, hotFirst, stageOf, viewOf, type IncompleteStage, type IncompleteView, type VisitChannel } from './incomplete-model';

const S = MOTHER_STORE_ID;
/** RecoveryMessage.kind of an unfinished checkout's follow-up (@extas/messages FOLLOW_UP_KIND). */
const FOLLOW_UP_KIND = 'INCOMPLETE';
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
  resolver: AdminDeps['resolver'];
  now?: () => Date;
}

export type IncompleteWho = AdPlatformsWho;

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
export type FollowUpCardValue = {
  enabled: boolean;
  firstAfterMinutes: number;
  channels: string;
  minStep: FollowUpSettings['minStep'];
  catchUpHours: number;
  phoneGapDays: number;
  offer: boolean;
  offerAfterHours: number;
  offerCode: string;
};

export interface FollowUpCard {
  key: 'followUp';
  value: FollowUpCardValue;
  version: string;
}

/** The channel orders the card offers (the first one he said yes to offers on is used). */
export const FOLLOW_UP_CHANNEL_ORDERS = ['WHATSAPP,SMS', 'SMS,WHATSAPP', 'WHATSAPP', 'SMS'] as const;

export interface IncompleteOverview {
  view: IncompleteView;
  capture: boolean;
  counts: Record<IncompleteView, number>;
  rows: IncompleteRow[];
  unpaid: UnpaidRow[];
  /** Bags left in the same window with no phone number (only counted; their worth at bag prices, sets by lines). */
  noPhone: { bags: number; valueMinor: number };
  /** Who a draft can be handed to: active staff who may confirm orders here. */
  staff: { id: string; name: string }[];
  card: IncompleteCard;
  /** PR 275 — the follow-up card and what it did in the kept days: messages sent, and checkouts that then ordered. */
  followUp: { card: FollowUpCard; sent: number; recovered: number; ceiling: number };
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

async function cardOf(deps: IncompleteDeps): Promise<IncompleteCard> {
  const [capture, keepDays, inc] = await Promise.all([
    deps.resolver.value('checkout.capture.enabled', { storeId: S }),
    deps.resolver.value('checkout.capture.keepDays', { storeId: S }),
    deps.resolver.value('orders.incomplete', { storeId: S }),
  ]);
  const value = { capture, keepDays, leftAfterMinutes: inc.leftAfterMinutes };
  return { key: 'incomplete', value, version: versionOf(value) };
}

const flat = (f: FollowUpSettings): FollowUpCardValue => ({
  enabled: f.enabled,
  firstAfterMinutes: f.firstAfterMinutes,
  channels: f.channels.join(','),
  minStep: f.minStep,
  catchUpHours: f.catchUpHours,
  phoneGapDays: f.phoneGapDays,
  offer: f.offer.enabled,
  offerAfterHours: f.offer.afterHours,
  offerCode: f.offer.couponCode,
});

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

const viewWhere = (view: IncompleteView, me: string | null): Prisma.CheckoutDraftWhereInput =>
  view === 'handled' ? { handledAt: { not: null } } : view === 'mine' ? { handledAt: null, assignedToId: me ?? '00000000-0000-0000-0000-000000000000' } : { handledAt: null };

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
export async function incompleteOverview(deps: IncompleteDeps, me: string | null, rawView: unknown): Promise<IncompleteOverview> {
  const view = viewOf(rawView);
  const now = deps.now?.() ?? new Date();
  const card = await cardOf(deps);
  const base = windowWhere(card, now);
  const [open, mine, handled, drafts, staff, followUpCard] = await Promise.all([
    deps.db.checkoutDraft.count({ where: { ...base, ...viewWhere('open', me) } }),
    deps.db.checkoutDraft.count({ where: { ...base, ...viewWhere('mine', me) } }),
    deps.db.checkoutDraft.count({ where: { ...base, ...viewWhere('handled', me) } }),
    deps.db.checkoutDraft.findMany({ where: { ...base, ...viewWhere(view, me) }, orderBy: { lastActivityAt: 'desc' }, take: ROWS_SHOWN }),
    staffOf(deps.db),
    followUpCardOf(deps),
  ]);
  const since = new Date(now.getTime() - card.value.keepDays * DAY);
  const [sentFollowUps, recovered, sentToRows] = await Promise.all([
    deps.db.recoveryMessage.count({ where: { storeId: S, kind: FOLLOW_UP_KIND, sentAt: { gte: since } } }),
    deps.db.recoveryMessage.findMany({ where: { storeId: S, kind: FOLLOW_UP_KIND, sentAt: { gte: since }, recoveredOrderId: { not: null } }, distinct: ['checkoutDraftId'], select: { checkoutDraftId: true } }),
    drafts.length ? deps.db.recoveryMessage.findMany({ where: { storeId: S, kind: FOLLOW_UP_KIND, checkoutDraftId: { in: drafts.map((d) => d.id) }, sentAt: { not: null } }, orderBy: { sentAt: 'asc' }, select: { checkoutDraftId: true, sentAt: true, channel: true, offerCouponId: true } }) : [],
  ]);
  const followUpsOf = new Map<string, IncompleteRow['followUps']>();
  for (const f of sentToRows) {
    const k = f.checkoutDraftId!;
    followUpsOf.set(k, { sent: (followUpsOf.get(k)?.sent ?? 0) + 1, last: { at: f.sentAt!.toISOString(), channel: f.channel, offer: !!f.offerCouponId } });
  }

  const cartIds = [...new Set(drafts.map((d) => d.cartId).filter((x): x is string => !!x))];
  const lines = cartIds.length
    ? await deps.db.cartItem.findMany({
        where: { storeId: S, cartId: { in: cartIds }, removedAt: null, savedForLater: false },
        orderBy: { createdAt: 'asc' },
        select: { cartId: true, variantId: true, quantity: true, unitPriceMinor: true, comboGroupKey: true, setPriceMinor: true, source: true },
      })
    : [];
  const variantIds = [...new Set(lines.map((l) => l.variantId))];
  const variants = new Map(
    (variantIds.length ? await deps.db.productVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, product: { select: { nameEn: true, nameBn: true } }, size: { select: { label: true } }, colour: { select: { nameEn: true, nameBn: true } } } }) : []).map((v) => [v.id, v]),
  );
  const byCart = new Map<string, typeof lines>();
  for (const l of lines) byCart.set(l.cartId, [...(byCart.get(l.cartId) ?? []), l]);
  const people = new Map(staff.map((p) => [p.id, p.name]));
  const others = [...new Set(drafts.flatMap((d) => [d.assignedToId, d.handledById]).filter((x): x is string => !!x && !people.has(x)))];
  if (others.length) for (const p of await deps.db.staffUser.findMany({ where: { id: { in: others } }, select: { id: true, displayName: true } })) people.set(p.id, p.displayName);

  const rows = hotFirst(
    drafts.map((d) => {
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
        channel: channelOf(d.data, bag.some((l) => (l.source ?? '').startsWith(LANDING_LINE_SOURCE))),
        customerId: d.customerId,
        assignedTo: d.assignedToId ? { id: d.assignedToId, name: people.get(d.assignedToId) ?? '' } : null,
        handled: d.handledAt ? { at: d.handledAt.toISOString(), by: d.handledById ? (people.get(d.handledById) ?? null) : null, note: d.handledNote } : null,
        followUps: followUpsOf.get(d.id) ?? { sent: 0, last: null },
      };
      return { stage: row.stage, lastAt: d.lastActivityAt, row };
    }),
  ).map((x) => x.row);

  return { view, capture: card.value.capture, counts: { open, mine, handled }, rows, unpaid: await unpaidOf(deps, card, now), noPhone: await noPhoneOf(deps, card, now), staff, card, followUp: { card: followUpCard, sent: sentFollowUps, recovered: recovered.length, ceiling: FOLLOW_UP_CEILING } };
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

/** Open bags left in the window whose checkout never kept a phone number: how many, and their worth at bag prices. */
async function noPhoneOf(deps: IncompleteDeps, card: IncompleteCard, now: Date): Promise<{ bags: number; valueMinor: number }> {
  const leftBefore = new Date(now.getTime() - card.value.leftAfterMinutes * MINUTE);
  const since = new Date(now.getTime() - card.value.keepDays * DAY);
  const [r] = await deps.db.$queryRaw<{ bags: number; value: bigint | null }[]>`
    SELECT count(DISTINCT c."id")::int AS "bags", sum(i."quantity" * i."unitPriceMinor")::bigint AS "value"
    FROM "Cart" c JOIN "CartItem" i ON i."cartId" = c."id" AND i."removedAt" IS NULL AND i."savedForLater" = false
    WHERE c."storeId" = ${S} AND c."status" = 'ACTIVE' AND c."lastActivityAt" < ${leftBefore} AND c."lastActivityAt" >= ${since}
      AND NOT EXISTS (SELECT 1 FROM "CheckoutDraft" d WHERE d."cartId" = c."id" AND d."phone" IS NOT NULL)`;
  return { bags: r?.bags ?? 0, valueMinor: Number(r?.value ?? 0) };
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
  throw new IncompleteError('INVALID_INPUT', 400, ['action']);
}

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
  const parsed = registry['orders.followUp'].schema.safeParse({
    enabled: v.enabled,
    firstAfterMinutes: v.firstAfterMinutes,
    channels: order,
    minStep: v.minStep,
    catchUpHours: v.catchUpHours,
    phoneGapDays: v.phoneGapDays,
    offer: { enabled: v.offer, afterHours: v.offerAfterHours, couponCode: typeof v.offerCode === 'string' ? v.offerCode : undefined },
  });
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
      const o = await incompleteOverview(d, g.actor.staffUserId ?? null, new URL(request.url).searchParams.get('view'));
      return json({ ok: true, ...o, cards: { incomplete: o.card, followUp: o.followUp.card } });
    }
    if (method === 'PUT' && b.key === 'followUp') return json({ ok: true, cards: { followUp: await saveFollowUpCard(d, who, b) } });
    if (method === 'PUT') return json({ ok: true, cards: { incomplete: await saveIncompleteCard(d, who, b) } });
    return json({ ok: true, ...(await incompleteAction(d, who, b)) });
  } catch (e) {
    return answer(e);
  }
}

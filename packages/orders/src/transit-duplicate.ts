// S06 · PR 556 — the in-transit duplicate notice. The moment the phone number at checkout is whole, the shop looks for
// an order of this customer that is already on its way (handed to the courier or in transit; with the owner's choice,
// any open order) holding the very piece in the bag — the same product, colour and size (the same variant). Found, the
// checkout shows the notice: the piece's picture, the earlier order's number and its tracking link, "it has already
// reached your area, there is no need to order again", and two buttons — take it out of the bag, or "no, I want another
// one" (the second one is sometimes a real sale). Nothing is cancelled, held or blocked; the customer decides.
//
// "This customer" is the number in any of its forms, and (SIM-F-015: never the number alone) the signed-in account,
// this browser's bag id and its device id. A stranger who types someone else's number must not learn about their
// order: the order's number and tracking link are shown only when the earlier order is tied to this browser or
// account; a match by the number alone shows nothing — or, with the owner's `byPhoneAlone`, the notice without the
// order's number or link. Each look-up counts against the IP like phone-first recognition (PR 555), and past that
// limit the check simply answers nothing (it never stops the form).
//
// Every firing is kept (DuplicateNoticeEvent, append-only): the piece, the earlier order, the campaign that brought the
// customer (as the page saw it), then what he chose — so a campaign that brings many duplicates can have its frequency
// cap cut (the owner's report, `transitDuplicateReport`).
//
// PR 557 (`sizeExchange`, off as shipped): the same product and colour in ANOTHER size already on its way is a size
// worry, not forgetfulness. The notice then says so ("not sure about the size?") and offers to exchange that parcel for
// the size in the bag when it arrives — one exchange instead of a second parcel plus a refusal. The very same piece
// still wins (that notice comes first). Taking the line out puts a line on the earlier order's timeline
// (`order.exchangeIntent`, with the size he wants) so the team and the rider know an exchange may be asked at the door;
// nothing on the order itself changes. The earlier size shows only when that order is tied to this browser or account.
import { z } from 'zod';
import type { Prisma } from '@extas/db/client';
import { phoneNormalizeBD } from '@extas/delivery';
import { allow, nowOf, parse, setting, TX, type OrdersDeps, type Who } from './context';
import { OrdersError } from './errors';
import { OPEN_STATES } from './pure';
import { phoneForms } from './phone-history';
import { eventRow, lockOrder, systemBy } from './service';

/** The SecurityEvent kind of a look-up (the IP only, never the number). */
export const TRANSIT_LOOKUP_EVENT = 'checkout.transit.lookup';
/** The states of an order "already on its way" (`include: 'shipped'`). */
export const ON_ITS_WAY = ['HANDED_OVER', 'IN_TRANSIT'] as const;
/** What the customer did with the notice (DuplicateNoticeEvent.action). */
export const NOTICE_ACTIONS = ['shown', 'removed', 'kept'] as const;
export type NoticeAction = (typeof NOTICE_ACTIONS)[number];
/** PR 557: the earlier order's timeline line when he takes out the other size to exchange on arrival. */
export const EXCHANGE_INTENT_EVENT = 'order.exchangeIntent';
/** The notice: the very same piece, or (PR 557) the same product and colour in another size. */
export type NoticeKind = 'same' | 'size';

const campaignSchema = z
  .object({
    source: z.string().trim().max(100).optional(),
    medium: z.string().trim().max(100).optional(),
    campaign: z.string().trim().max(200).optional(),
  })
  .strict();

export const transitCheckInput = z
  .object({
    phone: z.string().max(40),
    /** The campaign that brought him, as the page kept it from his landing (utm_*). */
    campaign: campaignSchema.optional(),
  })
  .strict();

export interface TransitContext {
  storeId: number;
  cartId: string | null;
  visitorId: string | null;
  deviceId: string | null;
  customerId: string | null;
  ip: string | null;
}

export interface TransitNotice {
  /** The firing (the answer names it). */
  eventId: string;
  /** The bag line holding the piece. */
  lineId: string;
  variantId: string;
  /** The earlier order — only when it is tied to this browser or account; null for a match by the number alone. */
  number: string | null;
  /** The shop's own page of that order (its tracking), same rule. */
  href: string | null;
  /** PR 557: 'size' — the earlier order holds this product and colour in another size. */
  kind: NoticeKind;
  /** 'size': the earlier order's size — only when that order is tied to this browser or account. */
  had: string | null;
  /** 'size': the size in the bag. */
  want: string | null;
}

export interface TransitCheck {
  enabled: boolean;
  notices: TransitNotice[];
}

const clean = (v: string | undefined) => (v && v.length ? v : null);
/** One firing per number, order and piece within this time (technical de-duplication, not a policy). */
const SAME_FIRING_MS = 3_600_000; // hardcode-ok: technical de-duplication window (one hour)

/** Counts the look-up against its IP; false past phone-first's own limit (then the check answers nothing). */
async function withinLimit(deps: OrdersDeps, storeId: number, ip: string | null): Promise<boolean> {
  const [limit, windowSeconds] = await Promise.all([setting(deps, storeId, 'delivery.phoneFirst.rateLimit'), setting(deps, storeId, 'delivery.phoneFirst.rateWindowSeconds')]);
  const now = nowOf(deps);
  const key = ip ?? 'unknown';
  await deps.db.securityEvent.create({ data: { storeId, kind: TRANSIT_LOOKUP_EVENT, severity: 'info', details: { ip: key }, createdAt: now } });
  const since = new Date(now.getTime() - windowSeconds * 1000);
  const n = await deps.db.securityEvent.count({ where: { storeId, kind: TRANSIT_LOOKUP_EVENT, createdAt: { gt: since }, details: { path: ['ip'], equals: key } } });
  return n <= limit;
}

/** The phone check at checkout: the bag's pieces already on their way to this customer, each recorded as shown. */
export async function transitDuplicateCheck(deps: OrdersDeps, ctx: TransitContext, input: unknown): Promise<TransitCheck> {
  const d = parse(transitCheckInput, input, 'check');
  const cfg = await setting(deps, ctx.storeId, 'checkout.transitDuplicate');
  if (!cfg.enabled) return { enabled: false, notices: [] };
  const none: TransitCheck = { enabled: true, notices: [] };
  const phone = phoneNormalizeBD(d.phone);
  if (!phone.ok || !ctx.cartId) return none;
  if (!(await withinLimit(deps, ctx.storeId, ctx.ip))) return none;
  // the bag's own items (a piece of a set is taken out only with its set, so it is not offered here)
  const lines = await deps.db.cartItem.findMany({
    where: { storeId: ctx.storeId, cartId: ctx.cartId, removedAt: null, savedForLater: false, comboGroupKey: null },
    select: { id: true, variantId: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!lines.length) return none;
  // PR 557: the same product and colour in the other sizes ("siblings") of each bag piece
  const mine = cfg.sizeExchange
    ? await deps.db.productVariant.findMany({ where: { storeId: ctx.storeId, id: { in: lines.map((l) => l.variantId) } }, select: { id: true, productId: true, colourId: true, sizeId: true, size: { select: { label: true } } } })
    : [];
  const siblings = mine.length
    ? await deps.db.productVariant.findMany({
        where: { storeId: ctx.storeId, id: { notIn: mine.map((v) => v.id) }, OR: mine.map((v) => ({ productId: v.productId, colourId: v.colourId })) },
        select: { id: true, productId: true, colourId: true, sizeId: true, size: { select: { label: true } } },
      })
    : [];
  const siblingsOf = (variantId: string) => {
    const v = mine.find((m) => m.id === variantId);
    return v ? siblings.filter((s) => s.productId === v.productId && s.colourId === v.colourId && s.sizeId !== v.sizeId) : [];
  };
  const sizeOf = (variantId: string) => mine.find((m) => m.id === variantId)?.size?.label ?? siblings.find((s) => s.id === variantId)?.size?.label ?? null;
  const now = nowOf(deps);
  const who: Prisma.OrderWhereInput[] = [{ phone: { in: phoneForms(phone.e164) } }];
  if (ctx.customerId) who.push({ customerId: ctx.customerId });
  if (ctx.visitorId) who.push({ visitorId: ctx.visitorId });
  if (ctx.deviceId) who.push({ deviceId: ctx.deviceId });
  const orders = await deps.db.order.findMany({
    where: {
      storeId: ctx.storeId,
      status: { in: [...(cfg.include === 'open' ? OPEN_STATES : ON_ITS_WAY)] },
      placedAt: { gte: new Date(now.getTime() - cfg.windowDays * 86_400_000) },
      OR: who,
      items: { some: { status: 'ACTIVE', variantId: { in: [...lines.map((l) => l.variantId), ...siblings.map((s) => s.id)] } } },
    },
    orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
    select: { id: true, number: true, visitorId: true, deviceId: true, customerId: true, items: { where: { status: 'ACTIVE' }, select: { variantId: true, productId: true } } },
  });
  const tiedTo = (o: (typeof orders)[number]) => (!!ctx.visitorId && o.visitorId === ctx.visitorId) || (!!ctx.deviceId && o.deviceId === ctx.deviceId) || (!!ctx.customerId && o.customerId === ctx.customerId);
  const utm = d.campaign ? { source: clean(d.campaign.source), medium: clean(d.campaign.medium), campaign: clean(d.campaign.campaign) } : null;
  const campaignRef = utm?.campaign ?? utm?.source ?? null;
  const notices: TransitNotice[] = [];
  // the newest order holding one of these variants, a tied one first (by the number alone only with the owner's choice)
  const pick = (variantIds: string[]) => {
    const holding = orders.filter((o) => o.items.some((i) => !!i.variantId && variantIds.includes(i.variantId)));
    return holding.find(tiedTo) ?? (cfg.byPhoneAlone ? holding[0] : undefined);
  };
  for (const line of lines) {
    // the very same piece first; then (PR 557) the same product and colour in another size
    let kind: NoticeKind = 'same';
    let o = pick([line.variantId]);
    let held = line.variantId;
    if (!o && cfg.sizeExchange) {
      const other = siblingsOf(line.variantId).map((s) => s.id);
      o = other.length ? pick(other) : undefined;
      if (o) {
        kind = 'size';
        held = o.items.find((i) => !!i.variantId && other.includes(i.variantId))?.variantId ?? line.variantId;
      }
    }
    if (!o) continue;
    const tied = tiedTo(o);
    const productId = o.items.find((i) => i.variantId === held)?.productId ?? null;
    const differentSize = kind === 'size';
    // the same number, order and piece seen again within the hour (the number typed again) is the same firing
    const again = await deps.db.duplicateNoticeEvent.findFirst({
      where: { storeId: ctx.storeId, phone: phone.e164, existingOrderId: o.id, variantId: line.variantId, differentSize, action: 'shown', createdAt: { gte: new Date(now.getTime() - SAME_FIRING_MS) } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    const ev =
      again ??
      (await deps.db.duplicateNoticeEvent.create({
        data: { storeId: ctx.storeId, phone: phone.e164, existingOrderId: o.id, productId, variantId: line.variantId, differentSize, action: 'shown', campaignRef, utm: utm ?? undefined, createdAt: now },
        select: { id: true },
      }));
    notices.push({
      eventId: ev.id,
      lineId: line.id,
      variantId: line.variantId,
      number: tied ? o.number : null,
      href: tied ? `/account/orders/${encodeURIComponent(o.number)}` : null,
      kind,
      had: differentSize && tied ? sizeOf(held) : null,
      want: differentSize ? sizeOf(line.variantId) : null,
    });
  }
  return { enabled: true, notices };
}

export const transitAnswerInput = z.object({ eventId: z.uuid(), action: z.enum(['removed', 'kept']) }).strict();

/** What he chose on the notice: one more row beside the firing (the same piece, order and campaign). PR 557: taking out
 *  another size puts `order.exchangeIntent` (the size he wants) on the earlier order's timeline, in the same step. */
export async function transitDuplicateAnswer(deps: OrdersDeps, storeId: number, input: unknown): Promise<{ action: NoticeAction }> {
  const d = parse(transitAnswerInput, input, 'answer');
  const shown = await deps.db.duplicateNoticeEvent.findFirst({ where: { storeId, id: d.eventId, action: 'shown' } });
  if (!shown) throw new OrdersError('NOT_FOUND', 'no such notice', ['eventId']);
  const answered = await deps.db.duplicateNoticeEvent.findFirst({ where: { storeId, phone: shown.phone, existingOrderId: shown.existingOrderId, variantId: shown.variantId, action: { in: ['removed', 'kept'] }, createdAt: { gte: shown.createdAt } }, select: { action: true } });
  if (answered) return { action: answered.action as NoticeAction };
  const row = {
    storeId,
    phone: shown.phone,
    existingOrderId: shown.existingOrderId,
    productId: shown.productId,
    variantId: shown.variantId,
    differentSize: shown.differentSize,
    action: d.action,
    campaignRef: shown.campaignRef,
    utm: shown.utm === null ? undefined : (shown.utm as Prisma.InputJsonValue),
    createdAt: nowOf(deps),
  };
  const intent = shown.differentSize && d.action === 'removed' && shown.existingOrderId;
  if (!intent) {
    await deps.db.duplicateNoticeEvent.create({ data: row });
    return { action: d.action };
  }
  const want = shown.variantId ? await deps.db.productVariant.findFirst({ where: { storeId, id: shown.variantId }, select: { size: { select: { label: true } } } }) : null;
  await deps.db.$transaction(async (tx) => {
    // the lock keeps the line in order with the order's commands on the timeline
    const o = await lockOrder(tx, storeId, intent);
    await tx.duplicateNoticeEvent.create({ data: row });
    await eventRow(tx, systemBy('transit-notice'), { storeId, orderId: o.id, type: EXCHANGE_INTENT_EVENT, data: { size: want?.size?.label ?? null, variantId: shown.variantId, noticeId: shown.id } });
  }, TX);
  return { action: d.action };
}

export const transitReportQuery = z.object({ days: z.coerce.number().int().min(1).max(365).optional() }).strict();

export interface TransitReportRow {
  /** The campaign (utm_campaign, else utm_source); null: no campaign seen. */
  campaign: string | null;
  shown: number;
  removed: number;
  kept: number;
  /** PR 557: of the shown, those for another size (the exchange offer). */
  size: number;
}

/** The owner's report: the notices of the last `days` days by campaign, most shown first. */
export async function transitDuplicateReport(deps: OrdersDeps, who: Who, query: unknown = {}): Promise<{ days: number; rows: TransitReportRow[] }> {
  await allow(deps, who, 'risk.report');
  const q = parse(transitReportQuery, query, 'query');
  const days = q.days ?? (await setting(deps, who.storeId, 'checkout.transitDuplicate')).reportDays;
  const since = new Date(nowOf(deps).getTime() - days * 86_400_000);
  const groups = await deps.db.duplicateNoticeEvent.groupBy({ by: ['campaignRef', 'action', 'differentSize'], where: { storeId: who.storeId, createdAt: { gte: since } }, _count: { _all: true } });
  const by = new Map<string | null, TransitReportRow>();
  for (const g of groups) {
    const row = by.get(g.campaignRef) ?? { campaign: g.campaignRef, shown: 0, removed: 0, kept: 0, size: 0 };
    if (g.action === 'shown' || g.action === 'removed' || g.action === 'kept') row[g.action] += g._count._all;
    if (g.action === 'shown' && g.differentSize) row.size += g._count._all;
    by.set(g.campaignRef, row);
  }
  return { days, rows: [...by.values()].sort((a, b) => b.shown - a.shown || String(a.campaign).localeCompare(String(b.campaign))) };
}

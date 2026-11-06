// S13 · PR 532 (Blueprint C6, §59.2) — the deep conversion feed's rules and its enrichment.
//
// - Which order states make each feed step (handed to the courier, came back, the qualified sale), when an order
//   becomes a qualified sale (delivered at once; with the courier after the owner's hours, untouched) and what holds it
//   back (cancelled, an order flag the owner ticked as bad, a number on the blocklist). Pure, tested in feed.test.ts.
// - The enrichment of every order event at its send: the courier outcome (what happened, the courier, the days since
//   the order, the payment kind) and the visitor's intent (channel, medium and campaign of the visit, an ad click, a
//   landing page, a returning customer, the products seen, bag adds and checkouts before the order). Never a name, an
//   address, a phone or an e-mail. Read at the send, so switching enrichment off stops it for what still waits.
import { Prisma, type PrismaClient } from '@extas/db/client';
import type { ConversionFeedSettings } from '@extas/settings';
import type { OrderState as OrderStatus } from '@extas/orders/pure';
import { hashId, type FeedTrackingEvent } from './model';

/** The order states that make each feed step (the first time the order reached one of them). */
export const FEED_STATES: Record<FeedTrackingEvent, readonly OrderStatus[]> = {
  shipped: ['HANDED_OVER'],
  returned: ['RETURNED'],
  qualified: ['HANDED_OVER', 'IN_TRANSIT', 'DELIVERED', 'PARTIALLY_DELIVERED'],
};
const DELIVERED_STATES: readonly OrderStatus[] = ['DELIVERED', 'PARTIALLY_DELIVERED'];
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/**
 * When an order became a qualified sale (§59.2), from the first time it reached a qualifying state: a delivery counts
 * at once; with the courier it counts once it stayed there untouched for `holdHours`. Null: not yet.
 */
export function qualifiedAt(first: { toStatus: OrderStatus | null; createdAt: Date }, holdHours: number, now: Date): Date | null {
  if (first.toStatus && DELIVERED_STATES.includes(first.toStatus)) return first.createdAt;
  const at = new Date(first.createdAt.getTime() + holdHours * HOUR_MS);
  return at.getTime() <= now.getTime() ? at : null;
}

export type HeldBack = 'cancelled' | 'flag' | 'blocked';

/** What holds an order back from the qualified sale (§59.2: only cancelled or marked bad), or null. */
export function heldBackOf(o: { status: OrderStatus; internalFlags: readonly string[]; flags: readonly string[]; blocked: boolean }, heldFlags: readonly string[], holdBlocked: boolean, blocklistFlag: string): HeldBack | null {
  if (o.status === 'CANCELLED') return 'cancelled';
  if (o.internalFlags.some((f) => heldFlags.includes(f))) return 'flag';
  if (holdBlocked && (o.blocked || o.flags.includes(blocklistFlag))) return 'blocked';
  return null;
}

/** The outcome word an order event carries (what the courier did with it, as of the event). */
export function outcomeOf(name: string, o: { status: OrderStatus; deliveredAt: Date | null }, at: Date): string | null {
  switch (name) {
    case 'purchase':
      return 'placed';
    case 'confirmed':
      return 'confirmed';
    case 'shipped':
      return 'with_courier';
    case 'returned':
      return 'returned';
    case 'delivered':
      return o.status === 'PARTIALLY_DELIVERED' ? 'partly_delivered' : 'delivered';
    case 'qualified':
      return o.deliveredAt && o.deliveredAt.getTime() <= at.getTime() ? (o.status === 'PARTIALLY_DELIVERED' ? 'partly_delivered' : 'delivered') : 'with_courier';
    default:
      return null;
  }
}

export type Extra = Record<string, string | number | boolean>;

export interface ExtraOrder {
  placedAt: Date;
  status: OrderStatus;
  deliveredAt: Date | null;
  paymentMethod: string | null;
  courier: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  adPlatform: string | null;
  adCampaignId: string | null;
  landingPageId: string | null;
  referrer: string | null;
}

/** The courier outcome of one event (pure). */
export function courierExtra(name: string, at: Date, o: ExtraOrder): Extra {
  const outcome = outcomeOf(name, o, at);
  if (!outcome) return {};
  const out: Extra = { outcome };
  if (o.courier && name !== 'purchase' && name !== 'confirmed') out.courier = o.courier;
  if (name !== 'purchase') out.days_to_outcome = Math.max(0, Math.round(((at.getTime() - o.placedAt.getTime()) / DAY_MS) * 10) / 10);
  if (o.paymentMethod) out.payment = o.paymentMethod.toLowerCase();
  return out;
}

export interface IntentCounts {
  views: number;
  bagAdds: number;
  checkouts: number;
}

/** The visitor's intent behind one order (pure). */
export function intentExtra(o: ExtraOrder, counts: IntentCounts, returning: boolean): Extra {
  const out: Extra = {
    channel: (o.utmSource ?? o.adPlatform ?? (o.referrer ? 'referral' : 'direct')).toLowerCase(),
    ad_click: Boolean(o.adPlatform || o.adCampaignId),
    landing_page: Boolean(o.landingPageId),
    returning_customer: returning,
    views: counts.views,
    bag_adds: counts.bagAdds,
    checkouts: counts.checkouts,
  };
  if (o.utmMedium) out.medium = o.utmMedium.toLowerCase();
  if (o.utmCampaign) out.campaign = o.utmCampaign;
  return out;
}

/** The shopper events the intent counts, by their stored names. */
const INTENT_EVENTS = { view: 'views', addToBag: 'bagAdds', checkout: 'checkouts' } as const;

/**
 * The enrichment of each order event row (row id → extra), read in one go for a send batch. Rows without an order, test
 * rows and everything while both enrichments are off get nothing.
 */
export async function feedExtras(db: PrismaClient, storeId: number, rows: readonly { id: string; name: string; orderId: string | null; test: boolean; occurredAt: Date }[], feed: ConversionFeedSettings): Promise<Map<string, Extra>> {
  const out = new Map<string, Extra>();
  if (!feed.enrich.courier && !feed.enrich.intent) return out;
  const mine = rows.filter((r) => r.orderId && !r.test);
  if (!mine.length) return out;
  const orders = await db.order.findMany({
    where: { storeId, id: { in: [...new Set(mine.map((r) => r.orderId!))] } },
    select: {
      id: true,
      placedAt: true,
      status: true,
      deliveredAt: true,
      paymentMethod: true,
      customerId: true,
      visitorId: true,
      utmSource: true,
      utmMedium: true,
      utmCampaign: true,
      adPlatform: true,
      adCampaignId: true,
      landingPageId: true,
      referrer: true,
      courierAccountId: true,
    },
  });
  const byId = new Map(orders.map((o) => [o.id, o]));
  // when each order was first delivered by its own timeline (the outcome as of each event)
  const firstAtDoor = new Map(
    feed.enrich.courier
      ? (await db.orderEvent.groupBy({ by: ['orderId'], where: { storeId, orderId: { in: orders.map((o) => o.id) }, toStatus: { in: [...DELIVERED_STATES] } }, _min: { createdAt: true } })).map((g) => [g.orderId, g._min.createdAt])
      : [],
  );
  const courierIds = [...new Set(orders.map((o) => o.courierAccountId).filter((x): x is string => !!x))];
  const couriers = new Map(feed.enrich.courier && courierIds.length ? (await db.courierAccount.findMany({ where: { id: { in: courierIds } }, select: { id: true, providerKey: true } })).map((c) => [c.id, c.providerKey]) : []);

  // the intent: the visitor's (or the customer's) shopper events in the days before the order, and an earlier delivery
  const counts = new Map<string, IntentCounts>();
  const returning = new Map<string, boolean>();
  if (feed.enrich.intent) {
    const extsOf = (o: (typeof orders)[number]) => [o.visitorId, o.customerId].filter((x): x is string => !!x).map(hashId);
    const exts = [...new Set(orders.flatMap(extsOf))];
    if (exts.length) {
      const from = new Date(Math.min(...orders.map((o) => o.placedAt.getTime())) - feed.intentDays * DAY_MS);
      const to = new Date(Math.max(...orders.map((o) => o.placedAt.getTime())));
      const seen = await db.$queryRaw<{ ext: string; name: string; at: Date }[]>`
        SELECT "userData"->>'ext' AS ext, name, "occurredAt" AS at FROM "TrackedEvent"
        WHERE "storeId" = ${storeId} AND test = false AND name IN (${Prisma.join(Object.keys(INTENT_EVENTS))})
          AND "occurredAt" >= ${from} AND "occurredAt" <= ${to} AND "userData"->>'ext' = ANY(${exts}::text[])`;
      for (const o of orders) {
        const mineExt = new Set(extsOf(o));
        const lo = o.placedAt.getTime() - feed.intentDays * DAY_MS;
        const c: IntentCounts = { views: 0, bagAdds: 0, checkouts: 0 };
        for (const s of seen) if (mineExt.has(s.ext) && s.at.getTime() >= lo && s.at.getTime() <= o.placedAt.getTime()) c[INTENT_EVENTS[s.name as keyof typeof INTENT_EVENTS]] += 1;
        counts.set(o.id, c);
      }
    }
    const customers = [...new Set(orders.map((o) => o.customerId).filter((x): x is string => !!x))];
    const firstDelivered = new Map(
      customers.length ? (await db.order.groupBy({ by: ['customerId'], where: { storeId, customerId: { in: customers }, deliveredAt: { not: null } }, _min: { deliveredAt: true } })).map((g) => [g.customerId, g._min.deliveredAt]) : [],
    );
    for (const o of orders) {
      const first = o.customerId ? firstDelivered.get(o.customerId) : null;
      returning.set(o.id, Boolean(first && first.getTime() < o.placedAt.getTime()));
    }
  }

  for (const r of mine) {
    const o = byId.get(r.orderId!);
    if (!o) continue;
    const eo: ExtraOrder = { ...o, deliveredAt: firstAtDoor.get(o.id) ?? o.deliveredAt, courier: o.courierAccountId ? (couriers.get(o.courierAccountId) ?? null) : null };
    const extra: Extra = {
      ...(feed.enrich.courier ? courierExtra(r.name, r.occurredAt, eo) : {}),
      ...(feed.enrich.intent ? intentExtra(eo, counts.get(o.id) ?? { views: 0, bagAdds: 0, checkouts: 0 }, returning.get(o.id) ?? false) : {}),
    };
    if (Object.keys(extra).length) out.set(r.id, extra);
  }
  return out;
}

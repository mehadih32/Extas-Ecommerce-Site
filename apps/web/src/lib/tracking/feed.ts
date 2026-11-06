// S13 · PR 532 (Blueprint C6 "deep conversion feed with courier outcomes", §59.2) — the courier's side of an order and
// the qualified sale, as server events.
//
// - Builds on PR 258: the same order timeline (OrderEvent), the same order sources, look-back and clock
//   (`ads.deliveredPurchase`), the same once-only event ids (`shipped-<number>`, `returned-<number>`,
//   `qualified-<number>`), the same user data (the order's purchase event's browser facts; contact hashes only while
//   matching is on, a gift's never) and the same "nothing to match it to = left out" rule.
// - shipped: the order was handed to the courier; returned: it came back (refused at the door or returned), valued at
//   its pieces; both go to every ticked platform under their own custom names.
// - qualified (§59.2, "the Facebook feed is generous"): delivered, or with the courier untouched for the owner's
//   `holdHours`; held back only when the order is cancelled or marked bad (an order flag ticked in `holdFlags`, or a
//   number on the blocklist while `holdBlocked`). It goes only to the platforms ticked as generous, where it is the
//   purchase (model `adNameOf`). Valued at the pieces with the courier, or kept at the door.
// - Off as it ships (`ads.conversionFeed`, riding on `ads.tracking` and `ads.deliveredPurchase`). No money moves, no
//   order changes, no budget changes.
import { BLOCKLIST_FLAG } from '@extas/orders';
import { FEED_TRACKING_EVENTS, heldFlags, tickedPlatforms, tickedSources } from '@extas/settings';
import { FEED_STATES, heldBackOf, qualifiedAt, type HeldBack } from './feed-extras';
import type { FeedTrackingEvent, StoredItem } from './model';
import { IDENTITY, keptOf, STEP_SCAN_MAX, stepEventId, stepUser, type StepRun } from './orders';
import { recordEvent, sendEvents, type TrackingDeps } from './service';

export interface FeedRun extends StepRun {
  /** Orders held back from the qualified sale, by reason. */
  held?: Partial<Record<HeldBack, number>>;
  /** Qualified sales still inside the owner's hours (the next run looks again). */
  notYet?: number;
}

/** Reads the store's order timeline of the look-back and records each new courier step and qualified sale. */
export async function recordFeedSteps(deps: TrackingDeps, storeId: number, o: { send?: boolean } = {}): Promise<FeedRun> {
  const at = { storeId };
  const [t, dp, feed] = await Promise.all([deps.resolver.value('ads.tracking', at), deps.resolver.value('ads.deliveredPurchase', at), deps.resolver.value('ads.conversionFeed', at)]);
  if (!t.on || !dp.on || !feed.on) return { scanned: 0, recorded: 0, skipped: 'off' };
  const generous = tickedPlatforms(t).filter((p) => feed.generous[p]);
  // a qualified sale with no generous platform ticked would go nowhere: it is not recorded
  const steps = FEED_TRACKING_EVENTS.filter((s) => feed.steps[s] && (s !== 'qualified' || generous.length > 0));
  const sources = tickedSources(dp);
  if (!steps.length || !sources.length) return { scanned: 0, recorded: 0, skipped: 'nothing-ticked' };
  const now = deps.now ? deps.now() : new Date();
  const states = [...new Set(steps.flatMap((s) => [...FEED_STATES[s]]))];
  const timeline = await deps.db.orderEvent.findMany({
    where: { storeId, toStatus: { in: states }, createdAt: { gte: new Date(now.getTime() - dp.lookbackHours * 3_600_000), lte: now }, order: { source: { in: sources } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: STEP_SCAN_MAX,
    select: { orderId: true, toStatus: true, createdAt: true, data: true },
  });
  if (!timeline.length) return { scanned: 0, recorded: 0 };
  const orders = new Map(
    (
      await deps.db.order.findMany({
        where: { storeId, id: { in: [...new Set(timeline.map((e) => e.orderId))] } },
        select: {
          id: true,
          number: true,
          currency: true,
          phone: true,
          email: true,
          isGift: true,
          customerId: true,
          status: true,
          flags: true,
          internalFlags: true,
          items: { select: { id: true, productId: true, sku: true, productName: true, colourName: true, sizeLabel: true, quantity: true, unitPriceMinor: true, lineTotalMinor: true, status: true } },
        },
      })
    ).map((x) => [x.id, x]),
  );
  // the first time each order reached each step
  const firsts = new Map<string, (typeof timeline)[number] & { step: FeedTrackingEvent }>();
  for (const e of timeline) {
    const order = orders.get(e.orderId);
    if (!order || !e.toStatus) continue;
    for (const step of steps) {
      if (!FEED_STATES[step].includes(e.toStatus)) continue;
      const id = stepEventId(step, order.number);
      if (!firsts.has(id)) firsts.set(id, { ...e, step });
    }
  }
  const had = new Set((await deps.db.trackedEvent.findMany({ where: { storeId, eventId: { in: [...firsts.keys()] } }, select: { eventId: true } })).map((r) => r.eventId));
  const todo = [...firsts.entries()].filter(([id]) => !had.has(id));
  if (!todo.length) return { scanned: timeline.length, recorded: 0 };
  const orderIds = [...new Set(todo.map(([, e]) => e.orderId))];
  const bought = new Map((await deps.db.trackedEvent.findMany({ where: { storeId, name: 'purchase', test: false, orderId: { in: orderIds } }, select: { orderId: true, url: true, userData: true } })).map((r) => [r.orderId, r]));
  const phones = [...new Set(orderIds.map((id) => orders.get(id)!.phone).filter((p): p is string => !!p))];
  const blocked = new Set(feed.holdBlocked && phones.length ? (await deps.db.riskBlock.findMany({ where: { storeId, phone: { in: phones }, undoneAt: null }, select: { phone: true } })).map((b) => b.phone) : []);
  const pids = [...new Set(orderIds.flatMap((id) => orders.get(id)!.items.map((i) => i.productId)).filter((x): x is string => !!x))];
  const cats = new Map((pids.length ? await deps.db.product.findMany({ where: { storeId, id: { in: pids } }, select: { id: true, category: { select: { nameEn: true } } } }) : []).map((p) => [p.id, p.category?.nameEn ?? null]));
  const flagsHeld = heldFlags(feed);

  const run: FeedRun = { scanned: timeline.length, recorded: 0 };
  for (const [eventId, e] of todo) {
    const order = orders.get(e.orderId)!;
    let when = e.createdAt;
    if (e.step === 'qualified') {
      const held = heldBackOf({ ...order, blocked: !!order.phone && blocked.has(order.phone) }, flagsHeld, feed.holdBlocked, BLOCKLIST_FLAG);
      if (held) {
        (run.held ??= {})[held] = (run.held[held] ?? 0) + 1;
        continue;
      }
      const q = qualifiedAt(e, feed.holdHours, now);
      if (!q) {
        run.notYet = (run.notYet ?? 0) + 1;
        continue;
      }
      when = q;
    }
    const user = stepUser(t, bought.get(order.id)?.userData, order);
    if (!IDENTITY.some((k) => user[k])) {
      run.unmatched = (run.unmatched ?? 0) + 1;
      continue;
    }
    const kept = e.toStatus === 'PARTIALLY_DELIVERED' ? keptOf(e.data) : null;
    const lines = order.items.filter((i) => (kept ? kept.includes(i.id) : i.status === 'ACTIVE'));
    const items: StoredItem[] = lines.map((i) => ({ id: i.productId ?? i.sku, sku: i.sku, name: i.productName, category: i.productId ? (cats.get(i.productId) ?? null) : null, colour: i.colourName, size: i.sizeLabel, quantity: i.quantity, priceMinor: i.unitPriceMinor }));
    const r = await recordEvent(deps, {
      storeId,
      name: e.step,
      eventId,
      url: bought.get(order.id)?.url ?? null,
      items,
      valueMinor: lines.reduce((n, i) => n + i.lineTotalMinor, 0),
      currency: order.currency,
      orderId: order.id,
      shopper: {},
      user,
      occurredAt: when,
      sendLater: true,
      ...(e.step === 'qualified' ? { platforms: generous } : {}),
    });
    if (r.recorded) run.recorded += 1;
  }
  if (o.send !== false && run.recorded) await sendEvents(deps, { storeId });
  return run;
}

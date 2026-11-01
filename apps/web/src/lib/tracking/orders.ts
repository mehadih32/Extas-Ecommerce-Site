// S13 · PR 258 (Blueprint C6.2 point 1) — delivered-purchase optimisation: the order's own steps as server events.
//
// - For a COD shop the sale is the parcel the customer accepted. The order timeline (OrderEvent) already says when a
//   person confirmed an order and when the courier or a person marked it delivered; this reader turns each of those
//   into one TrackedEvent — `confirmed-<number>` and `delivered-<number>` — so a step is never counted twice, however
//   often the reader runs or however many server processes run it.
// - The value is what the customer kept: the order's active lines, or on a partial delivery only the lines kept at the
//   door (the timeline's `keptItemIds`), each at its own line total. No delivery charge, nothing from the browser.
// - The shopper's browser facts come from the order's own purchase event (its platform cookies, browser name and the
//   hashed shop id), so the platform can tie the delivery to the ad click; without one the step goes as the order's own
//   (system-generated). The contact leaves as hashes, only while matching is allowed, and a gift's never.
// - Only orders from the ticked sources (the shop and its landing pages as shipped), only steps inside the owner's
//   look-back. Off as it ships (`ads.deliveredPurchase`, riding on `ads.tracking`). No money moves, no order changes.
// - Runs every `everyMinutes` in the server process (startOrderTracking, from instrumentation.ts) and on the admin's
//   "Send waiting now"; each run records first and sends the whole batch once.
import { tickedSources, type DeliveredPurchaseSettings, type TrackingSettings } from '@extas/settings';
import type { AdUser } from '@extas/adapters';
import type { OrderState as OrderStatus } from '@extas/orders/pure';
import { recordEvent, sendEvents, trackingDeps, userDataOf, type TrackingDeps } from './service';
import type { OrderTrackingEvent, StoredItem } from './model';

/** The order states that make each step. */
export const STEP_STATES: Record<OrderTrackingEvent, readonly OrderStatus[]> = { confirmed: ['CONFIRMED'], delivered: ['DELIVERED', 'PARTIALLY_DELIVERED'] };
/** Timeline rows read in one run (the rest wait for the next run). */
export const STEP_SCAN_MAX = 500; // hardcode-ok: a batch size, not a business number

const stepOf = (status: OrderStatus | null): OrderTrackingEvent | null => {
  for (const [step, states] of Object.entries(STEP_STATES) as [OrderTrackingEvent, readonly OrderStatus[]][]) if (status && states.includes(status)) return step;
  return null;
};
/** The step's event id: one per order and step. */
export const stepEventId = (step: OrderTrackingEvent, orderNumber: string): string => `${step}-${orderNumber.replace(/[^A-Za-z0-9_.:-]/g, '-')}`;

/** The user data a platform can match a person by (the browser name alone is not one). */
const IDENTITY = ['ext', 'em', 'ph', 'phPlus', 'fbp', 'fbc', 'ttp', 'gaClientId'] as const;

const keptOf = (data: unknown): string[] | null => {
  const k = data && typeof data === 'object' ? (data as { keptItemIds?: unknown }).keptItemIds : undefined;
  return Array.isArray(k) && k.every((x) => typeof x === 'string') ? (k as string[]) : null;
};

export interface StepRun {
  /** Timeline rows read. */
  scanned: number;
  /** New step events recorded. */
  recorded: number;
  /** Steps left out: nothing a platform could match them to. */
  unmatched?: number;
  /** Why nothing was read: the switches are off, or no step or source is ticked. */
  skipped?: 'off' | 'nothing-ticked';
}

/** Reads the store's order timeline of the look-back and records each new confirmed / delivered step. */
export async function recordOrderSteps(deps: TrackingDeps, storeId: number, o: { send?: boolean } = {}): Promise<StepRun> {
  const at = { storeId };
  const [t, dp] = await Promise.all([deps.resolver.value('ads.tracking', at), deps.resolver.value('ads.deliveredPurchase', at)]);
  if (!t.on || !dp.on) return { scanned: 0, recorded: 0, skipped: 'off' };
  const steps = (Object.keys(STEP_STATES) as OrderTrackingEvent[]).filter((s) => dp.events[s]);
  const sources = tickedSources(dp);
  if (!steps.length || !sources.length) return { scanned: 0, recorded: 0, skipped: 'nothing-ticked' };
  const now = deps.now ? deps.now() : new Date();
  const timeline = await deps.db.orderEvent.findMany({
    where: { storeId, toStatus: { in: steps.flatMap((s) => [...STEP_STATES[s]]) }, createdAt: { gte: new Date(now.getTime() - dp.lookbackHours * 3_600_000), lte: now }, order: { source: { in: sources } } },
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
          items: { select: { id: true, productId: true, sku: true, productName: true, colourName: true, sizeLabel: true, quantity: true, unitPriceMinor: true, lineTotalMinor: true, status: true } },
        },
      })
    ).map((x) => [x.id, x]),
  );
  // the first time each order reached each step; a step already recorded is left alone
  const firsts = new Map<string, (typeof timeline)[number] & { step: OrderTrackingEvent }>();
  for (const e of timeline) {
    const step = stepOf(e.toStatus);
    const order = orders.get(e.orderId);
    if (!step || !order) continue;
    const id = stepEventId(step, order.number);
    if (!firsts.has(id)) firsts.set(id, { ...e, step });
  }
  const had = new Set((await deps.db.trackedEvent.findMany({ where: { storeId, eventId: { in: [...firsts.keys()] } }, select: { eventId: true } })).map((r) => r.eventId));
  const todo = [...firsts.entries()].filter(([id]) => !had.has(id));
  const bought = new Map(
    (todo.length ? await deps.db.trackedEvent.findMany({ where: { storeId, name: 'purchase', test: false, orderId: { in: [...new Set(todo.map(([, e]) => e.orderId))] } }, select: { orderId: true, url: true, userData: true } }) : []).map((r) => [r.orderId, r]),
  );
  const pids = [...new Set(todo.flatMap(([, e]) => orders.get(e.orderId)!.items.map((i) => i.productId)).filter((x): x is string => !!x))];
  const cats = new Map((pids.length ? await deps.db.product.findMany({ where: { storeId, id: { in: pids } }, select: { id: true, category: { select: { nameEn: true } } } }) : []).map((p) => [p.id, p.category?.nameEn ?? null]));
  let recorded = 0;
  let unmatched = 0;
  for (const [eventId, e] of todo) {
    const order = orders.get(e.orderId)!;
    const user = stepUser(t, bought.get(order.id)?.userData, order);
    // nothing a platform could match it to (a guest order typed by staff, matching off): Meta refuses an event with
    // no user data at all, and its refusal would hold up the good events of the same batch
    if (!IDENTITY.some((k) => user[k])) {
      unmatched += 1;
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
      occurredAt: e.createdAt,
      sendLater: true,
    });
    if (r.recorded) recorded += 1;
  }
  if (o.send !== false && recorded) await sendEvents(deps, { storeId });
  return { scanned: timeline.length, recorded, ...(unmatched ? { unmatched } : {}) };
}

/** The step's user data: the purchase event's browser facts, with the order's own id and (matching on, no gift) contact. */
function stepUser(t: TrackingSettings, stored: unknown, order: { customerId: string | null; phone: string | null; email: string | null; isGift: boolean }): AdUser {
  const fromPurchase = (stored && typeof stored === 'object' ? stored : {}) as AdUser;
  const own = userDataOf(t, { customerId: order.customerId, ...(order.isGift ? {} : { phone: order.phone, email: order.email }) });
  return { ...fromPurchase, ...own };
}

// --- the server process's own clock -------------------------------------------------------------------------------

/** How often the clock looks whether a store's run is due (the run itself follows the owner's `everyMinutes`). */
const TICK_MS = 60_000; // hardcode-ok: a technical polling period, not a business number
const G = globalThis as unknown as { __extasOrderTracking?: { timer: ReturnType<typeof setInterval> } };

/** One tick: each store whose delivered-purchase is on and due is read; quiet on any error. */
export async function orderTrackingTick(deps: TrackingDeps, last: Map<number, number>, now = Date.now()): Promise<number> {
  let ran = 0;
  for (const { id } of await deps.db.store.findMany({ select: { id: true }, orderBy: { id: 'asc' } })) {
    try {
      const dp: DeliveredPurchaseSettings = await deps.resolver.value('ads.deliveredPurchase', { storeId: id });
      if (!dp.on || now - (last.get(id) ?? 0) < dp.everyMinutes * 60_000) continue;
      last.set(id, now);
      await recordOrderSteps(deps, id);
      ran += 1;
    } catch (e) {
      console.warn(`tracking order steps: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
    }
  }
  return ran;
}

/** Starts the clock once per server process (instrumentation.ts); without a database it does nothing. */
export function startOrderTracking(): void {
  if (G.__extasOrderTracking || process.env.NEXT_PHASE === 'phase-production-build') return;
  const base = trackingDeps();
  if (!base) return;
  // no `after`: the clock runs outside any request, so the sends run in the tick itself
  const deps: TrackingDeps = { db: base.db, resolver: base.resolver, vault: base.vault };
  const last = new Map<number, number>();
  let busy = false;
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    void orderTrackingTick(deps, last)
      .catch(() => 0)
      .finally(() => {
        busy = false;
      });
  }, TICK_MS);
  timer.unref?.();
  G.__extasOrderTracking = { timer };
}

// S06 · PR 562 — the flag outcome report (Reports › Flag outcomes): "of the customers flagged: how many paid the advance,
// how many abandoned. This is the number that tunes the parameter. If most of them walk away, the threshold is costing
// more than it saves, and the owner can see that in a week rather than guessing for a year."
//
// Two kinds of flag are read for the last `risk.flagReport.days` days (off as shipped: the report says so and reads
// nothing, and the checkout keeps nothing new):
//   - at checkout, per layer of the owner's Parameter for Checkout (PR 558, 560): every bag a layer asked to pay ahead is
//     one SHOWN flag event (kept once per bag by @extas/checkout `noteFlagShown`, only while this report is on), and every
//     order placed with the ask is one ASKED flag event (always, PR 560). A bag never ordered "left the checkout"; a bag
//     ordered without the ask (the details changed) "ordered without the ask".
//   - after ordering, per way it was asked (PR 542): the team's "Request advance", the owner's auto option, or a risk
//     level — the order service's `order.awaitAdvance` rows (the checkout's own ask, level `checkout`, is the first kind).
// Each placed order with an ask ends as: paid (the advance came in), still waiting, cancelled unpaid (walked away), or
// sent on without it (a person let it go). What the paid ones became (delivered, refused at the door) and the advance
// collected are counted too. A layer flagged at least `minFlags` times that loses at least `warnLeftPercent` of them (left
// the checkout or cancelled unpaid; null: never) is pointed out — the ask may cost more than it saves. The report only
// reads and points out: no layer, price, charge or Cash on Delivery changes by itself, and nobody is blocked (rule 6).
import { allow, nowOf, setting, type OrdersDeps, type Who } from './context';
import { outcomeOfStatus } from './stop-report';

/** The flag event outcomes (the same words as @extas/checkout FLAG_OUTCOMES). */
export const FLAG_SHOWN = 'SHOWN';
export const FLAG_ASKED = 'ASKED';
/** The level the checkout's own ask is kept under on the order's timeline (checkout-risk.ts askCheckoutAdvance). */
export const CHECKOUT_ASK_LEVEL = 'checkout';
const ASK_EVENT = 'order.awaitAdvance';
const PAID_EVENT = 'order.recordAdvance';

/**
 * What became of one flagged customer: paid the advance; still waiting; walked away after ordering (cancelled unpaid);
 * left the checkout (never ordered from that bag); ordered without the ask (the bag became an order the layer did not
 * ask for — the details changed); sent on without the advance (a person let it go).
 */
export const FLAG_OUTCOME_KINDS = ['paid', 'waiting', 'walked', 'left', 'dodged', 'waived'] as const;
export type FlagOutcome = (typeof FLAG_OUTCOME_KINDS)[number];

/** Statuses of an order that has not moved on yet (still waiting for its advance or for the team). */
const WAITING: readonly string[] = ['DRAFT', 'PLACED', 'AWAITING_ADVANCE', 'ON_HOLD'];

export interface AskedOrderFacts {
  status: string;
  paidMinor: number;
  advanceRequiredMinor: number | null;
  /** The order service recorded the advance as met (`order.recordAdvance`). */
  advancePaid: boolean;
}

/** The outcome of an order placed with an ask (pure). */
export function askedOutcome(o: AskedOrderFacts): FlagOutcome {
  const required = o.advanceRequiredMinor ?? 0;
  if (o.advancePaid || (required > 0 && o.paidMinor >= required)) return 'paid';
  if (o.status === 'CANCELLED') return 'walked';
  return WAITING.includes(o.status) ? 'waiting' : 'waived';
}

/** The advance collected from a paid order: what was asked, at most what came in. */
export const collectedOf = (o: Pick<AskedOrderFacts, 'paidMinor' | 'advanceRequiredMinor'>): number => Math.max(0, Math.min(o.paidMinor, o.advanceRequiredMinor ?? o.paidMinor));

/** One flagged customer as the tally reads it. */
export interface FlagUnit {
  /** The layer's id (checkout), or the way it was asked after ordering: `team.<kind>`, `auto.<kind>`, `level.<code>`. */
  key: string;
  /** The layer's name (checkout only; null after ordering). */
  name: string | null;
  outcome: FlagOutcome;
  /** For a paid one: delivered, refused at the door, cancelled after paying, or not ended yet. */
  after: 'delivered' | 'refused' | 'cancelled' | 'open' | null;
  collectedMinor: number;
}

export interface FlagTally {
  key: string;
  name: string | null;
  flagged: number;
  paid: number;
  waiting: number;
  walked: number;
  left: number;
  dodged: number;
  waived: number;
  /** Of the paid ones. */
  paidDelivered: number;
  paidRefused: number;
  collectedMinor: number;
  /** Left the checkout or cancelled unpaid, of all flagged (0–1). */
  lostShare: number;
  /** Pointed out: at least `minFlags` flags and at least `warnLeftPercent` lost. */
  warn: boolean;
}

export interface FlagReport {
  enabled: boolean;
  from: string;
  to: string;
  days: number;
  /** More flags than one report reads: only the newest were read. */
  cut: boolean;
  warnLeftPercent: number | null;
  minFlags: number;
  /** Every flagged customer of the period (key `all`). */
  total: FlagTally;
  checkout: FlagTally[];
  order: FlagTally[];
}

const empty = (key: string, name: string | null): FlagTally => ({ key, name, flagged: 0, paid: 0, waiting: 0, walked: 0, left: 0, dodged: 0, waived: 0, paidDelivered: 0, paidRefused: 0, collectedMinor: 0, lostShare: 0, warn: false });

/** Adds one unit to a tally. */
function add(t: FlagTally, u: FlagUnit): void {
  t.flagged += 1;
  t[u.outcome] += 1;
  if (u.outcome === 'paid') {
    if (u.after === 'delivered') t.paidDelivered += 1;
    if (u.after === 'refused') t.paidRefused += 1;
    t.collectedMinor += u.collectedMinor;
  }
}

/** Fills in the share lost and the pointer (pure). */
function finish(t: FlagTally, opts: { warnLeftPercent: number | null; minFlags: number }): FlagTally {
  const lost = t.walked + t.left;
  return { ...t, lostShare: t.flagged ? lost / t.flagged : 0, warn: opts.warnLeftPercent !== null && t.flagged >= opts.minFlags && lost * 100 >= opts.warnLeftPercent * t.flagged };
}

/** The tally per layer or way (pure): most flagged first. */
export function tallyFlags(units: readonly FlagUnit[], opts: { warnLeftPercent: number | null; minFlags: number }): FlagTally[] {
  const out = new Map<string, FlagTally>();
  for (const u of units) {
    const t = out.get(u.key) ?? empty(u.key, u.name);
    if (!t.name && u.name) t.name = u.name;
    add(t, u);
    out.set(u.key, t);
  }
  return [...out.values()].map((t) => finish(t, opts)).sort((a, b) => b.flagged - a.flagged || a.key.localeCompare(b.key));
}

/** Every unit as one total (pure); never pointed out by itself. */
export function totalOf(units: readonly FlagUnit[]): FlagTally {
  const t = empty('all', null);
  for (const u of units) add(t, u);
  return finish(t, { warnLeftPercent: null, minFlags: 1 });
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** The way an after-order ask was made: the team's request, the owner's auto option, or a risk level. */
export function askKeyOf(e: { reasonCode: string | null; actorType: string; data: unknown }): string {
  const code = e.reasonCode ?? 'unknown';
  if (obj(e.data).request !== true) return `level.${code}`;
  return `${e.actorType === 'STAFF' ? 'team' : 'auto'}.${code}`;
}

/** Reports › Flag outcomes (`risk.report`). Off: says so and reads nothing. */
export async function flagReport(deps: OrdersDeps, who: Who): Promise<FlagReport> {
  await allow(deps, who, 'risk.report');
  const cfg = await setting(deps, who.storeId, 'risk.flagReport');
  const to = nowOf(deps);
  const from = new Date(to.getTime() - cfg.days * 86_400_000);
  const opts = { warnLeftPercent: cfg.warnLeftPercent, minFlags: cfg.minFlags };
  const base = { enabled: cfg.enabled, from: from.toISOString(), to: to.toISOString(), days: cfg.days, ...opts };
  if (!cfg.enabled) return { ...base, cut: false, total: totalOf([]), checkout: [], order: [] };
  const storeId = who.storeId;
  const when = { gte: from, lte: to };
  const [flags, asks] = await Promise.all([
    deps.db.checkoutFlagEvent.findMany({
      where: { storeId, createdAt: when, outcome: { in: [FLAG_SHOWN, FLAG_ASKED] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: cfg.maxRows + 1,
      select: { layerId: true, orderId: true, outcome: true, explanation: true, layer: { select: { name: true } } },
    }),
    deps.db.orderEvent.findMany({
      // the checkout's own ask is counted with its layer
      where: { storeId, type: ASK_EVENT, createdAt: when, OR: [{ reasonCode: null }, { reasonCode: { not: CHECKOUT_ASK_LEVEL } }] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: cfg.maxRows + 1,
      select: { orderId: true, reasonCode: true, actorType: true, data: true },
    }),
  ]);
  const cut = flags.length > cfg.maxRows || asks.length > cfg.maxRows;
  const flagRows = flags.slice(0, cfg.maxRows);
  const askRows = asks.slice(0, cfg.maxRows);

  // the bags shown the ask (once each), and the order each became
  const shown = new Map<string, (typeof flagRows)[number]>();
  for (const r of flagRows) {
    const cartId = r.outcome === FLAG_SHOWN ? str(obj(r.explanation).cartId) : null;
    if (cartId && !shown.has(cartId)) shown.set(cartId, r);
  }
  const carts = shown.size ? await deps.db.cart.findMany({ where: { storeId, id: { in: [...shown.keys()] } }, select: { id: true, convertedOrderId: true } }) : [];
  const orderOfCart = new Map(carts.map((c) => [c.id, c.convertedOrderId]));
  const askedAt = new Map<string, (typeof flagRows)[number]>();
  for (const r of flagRows) if (r.outcome === FLAG_ASKED && r.orderId && !askedAt.has(r.orderId)) askedAt.set(r.orderId, r);
  const askedAfter = new Map<string, (typeof askRows)[number]>();
  for (const e of askRows) if (!askedAfter.has(e.orderId)) askedAfter.set(e.orderId, e);

  const orderIds = [...new Set([...askedAt.keys(), ...askedAfter.keys(), ...[...orderOfCart.values()].filter((x): x is string => !!x)])];
  const orders = orderIds.length
    ? await deps.db.order.findMany({
        where: { storeId, id: { in: orderIds } },
        select: { id: true, status: true, paidMinor: true, advanceRequiredMinor: true, advanceRequirement: true, isGift: true, events: { where: { type: PAID_EVENT }, select: { id: true }, take: 1 } },
      })
    : [];
  const byId = new Map(orders.map((o) => [o.id, o]));
  const unitOf = (key: string, name: string | null, o: (typeof orders)[number]): FlagUnit => {
    const outcome = askedOutcome({ status: o.status, paidMinor: o.paidMinor, advanceRequiredMinor: o.advanceRequiredMinor, advancePaid: o.events.length > 0 });
    return { key, name, outcome, after: outcome === 'paid' ? outcomeOfStatus(o.status) : null, collectedMinor: outcome === 'paid' ? collectedOf(o) : 0 };
  };
  const nameOf = (r: (typeof flagRows)[number]) => r.layer?.name ?? str(obj(r.explanation).layer);

  const checkoutUnits: FlagUnit[] = [];
  const counted = new Set<string>();
  for (const [orderId, r] of askedAt) {
    const o = byId.get(orderId);
    if (!o) continue;
    counted.add(orderId);
    checkoutUnits.push(unitOf(r.layerId ?? 'unknown', nameOf(r), o));
  }
  for (const [cartId, r] of shown) {
    const key = r.layerId ?? 'unknown';
    const orderId = orderOfCart.get(cartId) ?? null;
    if (orderId && counted.has(orderId)) continue;
    const o = orderId ? byId.get(orderId) : undefined;
    if (!o) {
      checkoutUnits.push({ key, name: nameOf(r), outcome: 'left', after: null, collectedMinor: 0 });
      continue;
    }
    counted.add(o.id);
    // the order kept the ask (its ASKED row is past what this report read) — or the details changed and it did not
    checkoutUnits.push(o.advanceRequirement !== 'NONE' ? unitOf(key, nameOf(r), o) : { key, name: nameOf(r), outcome: 'dodged', after: null, collectedMinor: 0 });
  }
  const orderUnits: FlagUnit[] = [];
  for (const [orderId, e] of askedAfter) {
    const o = byId.get(orderId);
    // a gift's advance is the gift's own (PR 605), not a flag; an order the checkout asked is counted with its layer
    if (!o || o.isGift || counted.has(orderId)) continue;
    orderUnits.push(unitOf(askKeyOf(e), null, o));
  }
  return { ...base, cut, total: totalOf([...checkoutUnits, ...orderUnits]), checkout: tallyFlags(checkoutUnits, opts), order: tallyFlags(orderUnits, opts) };
}

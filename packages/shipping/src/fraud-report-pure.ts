// S06 · PR 164 (CN-014 idea 8, SIM-F-027 of CN-017) — the fraud report's rules without a database.
//
// - `outcomeOf`: what became of an order — delivered (also partly), refused at the door (returned), cancelled, or still
//   open.
// - `tallyCaught`: the orders the risk steps caught, by the step that caught them (a watch mark, the blocklist, the repeat
//   refuser terms, a review the risk or duplicate rules opened, an advance asked), each with its outcomes, and "any".
//   "Wrong" is a caught order that was delivered all the same; its rate is out of the caught orders that reached the
//   door (delivered or refused). "Stopped" is a caught order cancelled before the courier had it, for a risk reason.
// - `avoidedOf`: the cost the stopped orders probably saved, as an estimate and never as money that moved: "up to" (each
//   stopped order would have come back, at the average real cost of a returned parcel in the period) and "likely" (the
//   same, times the share of caught orders that reached the door and were refused). Only parcels whose cost is complete
//   set the average; with none, there is no estimate.
// - `groupRto`: the real returned parcels' cost summed by district, campaign, product, courier and reason, the costliest
//   first. A parcel with several products counts once under each, its cost split evenly so the sums still add up.
import type { RtoRow } from './rto';

export const FRAUD_CATCHES = ['watch', 'blocklist', 'refuser', 'review', 'advance'] as const;
export type FraudCatch = (typeof FRAUD_CATCHES)[number];

export const ORDER_OUTCOMES = ['delivered', 'refused', 'cancelled', 'open'] as const;
export type OrderOutcome = (typeof ORDER_OUTCOMES)[number];

export const RTO_GROUPS = ['district', 'campaign', 'product', 'courier', 'reason'] as const;
export type RtoGroup = (typeof RTO_GROUPS)[number];

/** The cancel reasons (order service `CANCEL_CODES`) that mean the risk steps stopped the order. */
export const STOPPED_CANCEL_CODES = ['RISK_DECLINED', 'DUPLICATE_ORDER', 'ADVANCE_NOT_PAID', 'NOT_ORDERED'] as const;

export function outcomeOf(status: string): OrderOutcome {
  if (status === 'DELIVERED' || status === 'PARTIALLY_DELIVERED') return 'delivered';
  if (status === 'RETURNED') return 'refused';
  if (status === 'CANCELLED') return 'cancelled';
  return 'open';
}

export interface Outcomes {
  orders: number;
  delivered: number;
  refused: number;
  cancelled: number;
  open: number;
}

const none = (): Outcomes => ({ orders: 0, delivered: 0, refused: 0, cancelled: 0, open: 0 });

/** One caught order as the report reads it. */
export interface CaughtOrder {
  status: string;
  catches: readonly FraudCatch[];
  /** The courier had it (handed over at some point). */
  handedOver: boolean;
  cancelReasonCode: string | null;
  advancePaid: boolean;
}

export interface CaughtTally {
  caught: Record<FraudCatch | 'any', Outcomes>;
  wrong: { orders: number; rate: number | null };
  stopped: number;
  advancePaid: number;
}

export function tallyCaught(orders: readonly CaughtOrder[]): CaughtTally {
  const caught = Object.fromEntries([...FRAUD_CATCHES, 'any'].map((k) => [k, none()])) as Record<FraudCatch | 'any', Outcomes>;
  let stopped = 0;
  let advancePaid = 0;
  const stopCodes: readonly string[] = STOPPED_CANCEL_CODES;
  for (const o of orders) {
    if (!o.catches.length) continue;
    const out = outcomeOf(o.status);
    for (const k of [...new Set(o.catches), 'any'] as const) {
      caught[k].orders += 1;
      caught[k][out] += 1;
    }
    if (out === 'cancelled' && !o.handedOver && o.cancelReasonCode !== null && stopCodes.includes(o.cancelReasonCode)) stopped += 1;
    if (o.advancePaid) advancePaid += 1;
  }
  const atDoor = caught.any.delivered + caught.any.refused;
  return { caught, wrong: { orders: caught.any.delivered, rate: atDoor ? caught.any.delivered / atDoor : null }, stopped, advancePaid };
}

export interface Avoided {
  /** The average real cost of one returned parcel in the period, from the parcels whose cost is complete. */
  perParcelMinor: number | null;
  /** How many parcels set that average. */
  basisParcels: number;
  upToMinor: number | null;
  likelyMinor: number | null;
}

export function avoidedOf(stopped: number, rows: readonly Pick<RtoRow, 'cost'>[], any: Outcomes): Avoided {
  const complete = rows.filter((r) => r.cost.complete);
  const perParcelMinor = complete.length ? Math.round(complete.reduce((s, r) => s + r.cost.knownMinor, 0) / complete.length) : null;
  const upToMinor = perParcelMinor === null ? null : stopped * perParcelMinor;
  const atDoor = any.delivered + any.refused;
  const likelyMinor = upToMinor === null || !atDoor ? null : Math.round((upToMinor * any.refused) / atDoor);
  return { perParcelMinor, basisParcels: complete.length, upToMinor, likelyMinor };
}

/** What the report knows about the order behind a returned parcel. */
export interface ParcelFacts {
  district: { key: string; name: string; nameBn: string | null } | null;
  campaign: string | null;
  products: { key: string; name: string }[];
  reason: string | null;
}

export interface RtoGroupRow {
  /** The district's or product's id, the campaign, the courier's name or the reason key; null: not known. */
  key: string | null;
  name: string | null;
  nameBn: string | null;
  parcels: number;
  knownMinor: number;
  incomplete: number;
}

/** `total` split into `n` whole parts that add up to it (the first ones take the remainder). */
export function splitEven(total: number, n: number): number[] {
  if (n < 1) return [];
  const base = Math.floor(total / n);
  const rest = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
}

export function groupRto(rows: readonly Pick<RtoRow, 'orderId' | 'courier' | 'cost'>[], facts: ReadonlyMap<string, ParcelFacts>): Record<RtoGroup, RtoGroupRow[]> {
  const maps = Object.fromEntries(RTO_GROUPS.map((g) => [g, new Map<string, RtoGroupRow>()])) as Record<RtoGroup, Map<string, RtoGroupRow>>;
  const add = (g: RtoGroup, key: string | null, name: string | null, nameBn: string | null, minor: number, incomplete: boolean) => {
    const id = key ?? '';
    const row = maps[g].get(id) ?? { key, name, nameBn, parcels: 0, knownMinor: 0, incomplete: 0 };
    row.parcels += 1;
    row.knownMinor += minor;
    if (incomplete) row.incomplete += 1;
    maps[g].set(id, row);
  };
  for (const r of rows) {
    const f = facts.get(r.orderId);
    const minor = r.cost.knownMinor;
    const inc = !r.cost.complete;
    add('district', f?.district?.key ?? null, f?.district?.name ?? null, f?.district?.nameBn ?? null, minor, inc);
    add('campaign', f?.campaign ?? null, f?.campaign ?? null, null, minor, inc);
    add('courier', r.courier, r.courier, null, minor, inc);
    add('reason', f?.reason ?? null, null, null, minor, inc);
    const products = f?.products.length ? f.products : [];
    if (!products.length) add('product', null, null, null, minor, inc);
    const parts = splitEven(minor, products.length);
    products.forEach((p, i) => add('product', p.key, p.name, null, parts[i]!, inc));
  }
  const order = (a: RtoGroupRow, b: RtoGroupRow) => b.knownMinor - a.knownMinor || b.parcels - a.parcels || (a.name ?? a.key ?? '').localeCompare(b.name ?? b.key ?? '');
  return Object.fromEntries(RTO_GROUPS.map((g) => [g, [...maps[g].values()].sort(order)])) as Record<RtoGroup, RtoGroupRow[]>;
}

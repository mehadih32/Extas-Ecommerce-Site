// The KPI definition itself (PR 155, CN-022, owner decision 23 Oct) and the arithmetic on rows, without a database:
// which orders count as "Sales" and which as "Ordered value", on which day, and how order lines add up. The database
// functions (metrics.ts) and the guard test read these constants, so the rule is written exactly once.
//
//   Sales          = orders whose status is DELIVERED, counted on the day they were delivered (Order.deliveredAt).
//   Ordered value  = every placed order (any status except DRAFT), counted on the day it was placed (Order.placedAt).
//
// An archived order (Order.archivedAt, the soft delete) counts in neither. An order that is placed but not delivered
// (PLACED, CONFIRMED, … IN_TRANSIT) is in Ordered value only. A cancelled or returned order stays in Ordered value
// (it was ordered) and is never in Sales. PARTIALLY_DELIVERED is not in Sales yet: what part of it was delivered is
// decided with the order state machine, which waits for the owner's approval of the architecture draft (CN-022).
// Days are the shop's own calendar days in its time zone, never the server's.

/** The order statuses that are "Sales" (delivered orders only). */
export const SALES_STATUSES = ['DELIVERED'] as const;
/** The order statuses that were never placed, so they are not in Ordered value either. */
export const NOT_PLACED_STATUSES = ['DRAFT'] as const;
/** Order lines that count (a removed, held or exchanged line is not part of the order's goods). */
export const COUNTED_LINE_STATUS = 'ACTIVE' as const;

/** Which figure: Sales (delivered) or Ordered value (placed). */
export type Basis = 'sales' | 'ordered';
export const BASES: readonly Basis[] = ['ordered', 'sales'];

/** For each figure: the moment that decides its day, and its status rule. */
export const BASIS_RULE: Readonly<Record<Basis, { at: 'deliveredAt' | 'placedAt'; statuses: readonly string[]; include: boolean }>> = {
  sales: { at: 'deliveredAt', statuses: SALES_STATUSES, include: true },
  ordered: { at: 'placedAt', statuses: NOT_PLACED_STATUSES, include: false },
};

/** Does an order with this status count in the figure? (The same rule the SQL applies.) */
export function counts(basis: Basis, status: string): boolean {
  const r = BASIS_RULE[basis];
  return r.statuses.includes(status) === r.include;
}

/** A half-open span of time: from ≤ t < to. */
export interface Period {
  from: Date;
  to: Date;
}

/** The shop's calendar day (YYYY-MM-DD) that a moment falls on. */
export function ymdIn(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
  const v = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${v('year')}-${v('month')}-${v('day')}`;
}

/** How far the time zone is ahead of UTC at that moment, in milliseconds. */
function offsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(at);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const local = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
  return local - Math.floor(at.getTime() / 1000) * 1000;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** The moment a shop day starts (local midnight) as a UTC instant. */
export function dayStart(ymd: string, timeZone: string): Date {
  if (!YMD.test(ymd)) throw new RangeError(`not a day: ${ymd}`);
  const guess = Date.parse(`${ymd}T00:00:00Z`);
  // Twice, so a day whose offset differs from the guess's (a clock change) still lands on its own midnight.
  let t = guess - offsetMs(new Date(guess), timeZone);
  t = guess - offsetMs(new Date(t), timeZone);
  return new Date(t);
}

/** The day after a YYYY-MM-DD day. */
export function nextDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** Shop days `from` … `to` (both included) as one period. */
export function daysPeriod(from: string, to: string, timeZone: string): Period {
  if (to < from) throw new RangeError(`the period ends (${to}) before it starts (${from})`);
  return { from: dayStart(from, timeZone), to: dayStart(nextDay(to), timeZone) };
}

/** The last `days` shop days, today included: the window every "last N days" report shows. */
export function lastDays(days: number, now: Date, timeZone: string): { from: string; to: string; period: Period } {
  if (!Number.isInteger(days) || days < 1) throw new RangeError(`days must be a whole number from 1: ${days}`);
  const to = ymdIn(now, timeZone);
  let from = to;
  for (let i = 1; i < days; i++) from = ymdIn(new Date(dayStart(from, timeZone).getTime() - 1), timeZone);
  return { from, to, period: daysPeriod(from, to, timeZone) };
}

/** Every day from `from` to `to`, both included, oldest first. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = nextDay(d)) out.push(d);
  return out;
}

/** Orders and their money, as stored on the order (Order.totalMinor: goods after discounts + delivery − rewards). */
export interface OrderFigure {
  orders: number;
  /** Σ Order.totalMinor. */
  valueMinor: number;
  /** Σ (subtotal − discount): the goods alone. */
  itemsMinor: number;
  /** Σ delivery charge. */
  deliveryMinor: number;
}

export const NO_ORDERS: OrderFigure = Object.freeze({ orders: 0, valueMinor: 0, itemsMinor: 0, deliveryMinor: 0 }); // hardcode-ok: the empty figure (nothing counted yet), not a charge

/** One order line that counts in a figure (metrics.ts `lines`). */
export interface LineRow {
  orderId: string;
  productId: string | null;
  comboId: string | null;
  comboGroupKey: string | null;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  /** The shop day the line counts on (placed day for Ordered value, delivered day for Sales). */
  day: string;
}

/** Order lines added up: the goods' part of a figure, for a product, a combo or any group of lines. */
export interface LineFigure {
  /** Distinct orders. */
  orders: number;
  units: number;
  /** Σ line totals (what was charged for the goods, after line and set discounts). */
  valueMinor: number;
  /** Σ unit price × quantity (the regular price of the same goods). */
  regularMinor: number;
  /** What customers saved on these lines (regular − charged, never below 0 per line). */
  savedMinor: number;
}

export const NO_LINES: LineFigure = Object.freeze({ orders: 0, units: 0, valueMinor: 0, regularMinor: 0, savedMinor: 0 });

/** The one place order lines are added up into money. */
export function sumLines(rows: readonly LineRow[]): LineFigure {
  const orders = new Set<string>();
  let units = 0;
  let valueMinor = 0;
  let regularMinor = 0;
  let savedMinor = 0;
  for (const r of rows) {
    orders.add(r.orderId);
    units += r.quantity;
    valueMinor += r.lineTotalMinor;
    regularMinor += r.unitPriceMinor * r.quantity;
    savedMinor += Math.max(0, r.unitPriceMinor * r.quantity - r.lineTotalMinor);
  }
  return { orders: orders.size, units, valueMinor, regularMinor, savedMinor };
}

/** Rows grouped by a key (a combo, a product, a day); rows without a key are left out. */
export function groupLines(rows: readonly LineRow[], key: (r: LineRow) => string | null): Map<string, LineRow[]> {
  const out = new Map<string, LineRow[]>();
  for (const r of rows) {
    const k = key(r);
    if (k === null) continue;
    const list = out.get(k);
    if (list) list.push(r);
    else out.set(k, [r]);
  }
  return out;
}

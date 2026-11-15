// parity F4 · PR 848 (prototype Rules › More options › "Try on last 30 days' orders") — what a rule's numbers would have done to the
// shop's own orders of the last days. READ ONLY: it counts orders and never changes an order, a setting or any money; the numbers
// it tries are the ones typed on the screen (not saved), set beside the saved ones. Three rows can be tried: free delivery (how many
// orders would have got it and the delivery charge they would not have paid), duplicate orders (how many orders came from a number
// that ordered within the look-back days before) and merging (the same look at its own look-back days).
const getPath = (v: unknown, k: string): unknown => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>)[k] : undefined);

export const TRY_DAYS = 30; // hardcode-ok: the prototype's own window; a label of the report, shown in the words
const DAY_MS = 86_400_000; // hardcode-ok: milliseconds in a day

export const TRYABLE_ROWS = ['free', 'dup', 'merge'] as const;
export type TryableRow = (typeof TRYABLE_ROWS)[number];
export const isTryable = (id: string): id is TryableRow => (TRYABLE_ROWS as readonly string[]).includes(id);

export interface TryOrder {
  /** Items less discount, minor units. */
  goodsMinor: number;
  chargeMinor: number;
  phone: string | null;
  at: Date;
}

export interface TryResult {
  row: TryableRow;
  days: number;
  total: number;
  /** Orders the saved numbers catch (free delivery / a repeat order). */
  now: number;
  /** Orders the typed numbers would catch. */
  tried: number;
  /** Free delivery only: the delivery charge of the orders the typed number frees, minor units. */
  waivedMinor: number | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Orders from a number that ordered before within `lookback` days (the earlier order is not counted again). */
export function repeatCount(orders: readonly TryOrder[], lookback: number): number {
  const by = new Map<string, number[]>();
  let n = 0;
  for (const o of [...orders].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    if (!o.phone) continue;
    const seen = by.get(o.phone) ?? [];
    if (seen.some((t) => o.at.getTime() - t <= lookback * DAY_MS)) n++;
    seen.push(o.at.getTime());
    by.set(o.phone, seen);
  }
  return n;
}

/** The result of trying one row's typed `values` (by field path) against the saved value `saved`. */
export function tryRow(id: TryableRow, saved: unknown, values: Record<string, unknown>, orders: readonly TryOrder[], days: number = TRY_DAYS): TryResult {
  const total = orders.length;
  if (id === 'free') {
    const was = num(saved);
    const typed = Object.prototype.hasOwnProperty.call(values, '') ? values[''] : saved;
    const will = num(typed);
    const catches = (limit: number | null) => (limit === null ? [] : orders.filter((o) => o.goodsMinor >= limit));
    const freed = catches(will);
    return { row: id, days, total, now: catches(was).length, tried: freed.length, waivedMinor: freed.reduce((a, o) => a + o.chargeMinor, 0) };
  }
  const path = id === 'dup' ? 'lookbackDays' : 'lookBackDays';
  const was = num(getPath(saved, path)) ?? 0;
  const will = num(values[path]) ?? was;
  const onPath = getPath(saved, 'enabled');
  const on = typeof values.enabled === 'boolean' ? values.enabled : onPath !== false;
  return { row: id, days, total, now: onPath === false ? 0 : repeatCount(orders, was), tried: on ? repeatCount(orders, will) : 0, waivedMinor: null };
}

// S08 · PR 179, 181 — follow-up 439: the print run's own filter — by courier, by category — read from the page's
// address (?courier=<courier account id>&cat=<category>), checked against what the run holds now (a value the run does
// not hold is no filter), and the choices for the two boxes. The page then prints only the parcels shown: the main
// press, the ticks and "picking list for these" all act on them. Pure: no database, no words.

/** The `cat` value for parcels without a category (a category's own name is never this). */
export const NO_CATEGORY = '-';

export interface PrintFilterRow {
  courierAccountId: string;
  courierName: string;
  category: { en: string; bn: string | null };
}

export interface PrintFilter {
  courier: string | null;
  category: string | null;
}

export interface PrintFilterChoices {
  couriers: { id: string; name: string }[];
  /** In packing order (the run's own order); `value` is what goes in the address. */
  categories: { value: string; en: string; bn: string | null }[];
}

const catValue = (c: PrintFilterRow['category']) => c.en || NO_CATEGORY;
const one = (v: string | string[] | undefined): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** The boxes' choices: each courier and each category the run holds now. */
export function printFilterChoices(rows: readonly PrintFilterRow[]): PrintFilterChoices {
  const couriers = new Map<string, string>();
  const categories = new Map<string, PrintFilterRow['category']>();
  for (const r of rows) {
    if (!couriers.has(r.courierAccountId)) couriers.set(r.courierAccountId, r.courierName);
    if (!categories.has(catValue(r.category))) categories.set(catValue(r.category), r.category);
  }
  return {
    couriers: [...couriers.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    categories: [...categories.entries()].map(([value, c]) => ({ value, en: c.en, bn: c.bn })),
  };
}

/** The filter the address asks for, kept only where the run holds it. */
export function printFilterOf(search: Record<string, string | string[] | undefined>, rows: readonly PrintFilterRow[]): PrintFilter {
  const c = printFilterChoices(rows);
  const courier = one(search.courier);
  const category = one(search.cat);
  return {
    courier: courier && c.couriers.some((x) => x.id === courier) ? courier : null,
    category: category && c.categories.some((x) => x.value === category) ? category : null,
  };
}

/** The rows the filter shows, in the run's order. */
export function filterPrintRows<R extends PrintFilterRow>(rows: readonly R[], f: PrintFilter): R[] {
  return rows.filter((r) => (!f.courier || r.courierAccountId === f.courier) && (!f.category || catValue(r.category) === f.category));
}

/** The orders behind some parcels, each once, in their order (for "picking list for these"). */
export function ordersOf(rows: readonly { orderId: string }[]): string[] {
  return [...new Set(rows.map((r) => r.orderId))];
}

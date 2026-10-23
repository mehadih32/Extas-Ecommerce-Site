// PR 67 — the rows at the foot of the product page (demo 30-product.js pdp_rowCats / pdp_pairsSection /
// pdp_recentSection, owner review P5 in 89x-owner-b.js), as plain functions: which categories pair with a product,
// the desktop's one slider, the phone's list of recently viewed products, and the desktop grid that is never empty.
// The numbers and lists are the `pdp.rows` setting; nothing here names a category.
import type { PdpRowsSettings } from '@extas/settings';

export type GarmentGroup = 'top' | 'bottom' | 'other';

/** The cookie that remembers the products this phone opened: product ids only, newest first, nothing else. */
export const RECENT_COOKIE = 'extas_rv';

/** A product's kind: the size-chart diagram says bottom; else the setting's own map; any other garment is a top. */
export function garmentGroup(garment: string | null, diagramFor: Readonly<Record<string, string>>, groupOf: PdpRowsSettings['groupOf']): GarmentGroup {
  if (!garment) return 'other';
  if (groupOf[garment]) return groupOf[garment];
  return diagramFor[garment] === 'bottom' ? 'bottom' : 'top';
}

/**
 * The categories of the pairing rows, in order: the owner's own pairing for the product's category first, then the
 * list of its kind; never its own category, never one without products (`count`). When there are fewer than the rows
 * wanted, the product's own category closes the list (when it holds another product), like the demo.
 */
export function pairCategories(
  set: Pick<PdpRowsSettings, 'pairRows' | 'order' | 'byCategory'>,
  own: { slug: string | null; group: GarmentGroup },
  count: (slug: string) => number,
): string[] {
  const wanted = [...(own.slug ? (set.byCategory[own.slug] ?? []) : []), ...set.order[own.group]];
  const out: string[] = [];
  for (const slug of wanted) {
    if (out.length >= set.pairRows) break;
    if (slug !== own.slug && !out.includes(slug) && count(slug) > 0) out.push(slug);
  }
  if (out.length < set.pairRows && own.slug && count(own.slug) > 1 && !out.includes(own.slug)) out.push(own.slug);
  return out;
}

/** The desktop's one slider (P5): the rows' products taken in turn, each once, never the product itself. */
export function mergeRows<T extends { id: string }>(rows: readonly (readonly T[])[], max: number, skip: string): T[] {
  const lists = rows.map((r) => [...r]);
  const seen = new Set<string>([skip]);
  const out: T[] = [];
  for (let i = 0; out.length < max && lists.some((l) => l.length); i++) {
    const x = lists[i % lists.length]!.shift();
    if (x && !seen.has(x.id)) {
      seen.add(x.id);
      out.push(x);
    }
  }
  return out;
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The remembered ids from the cookie's value: well-formed, each once, at most `keep`. */
export function readRecent(value: string | undefined, keep: number): string[] {
  if (!value) return [];
  const out: string[] = [];
  for (const id of decodeURIComponent(value).split('.')) {
    if (ID.test(id) && !out.includes(id)) out.push(id);
    if (out.length >= keep) break;
  }
  return out;
}

/** The cookie's next value after opening a product: it goes first, the oldest fall off. */
export function pushRecent(value: string | undefined, id: string, keep: number): string {
  if (!ID.test(id)) return readRecent(value, keep).join('.');
  return [id, ...readRecent(value, keep).filter((x) => x !== id)].slice(0, keep).join('.');
}

/** Which title the desktop grid wears: all recent, recent and similar styles, or similar styles only. */
export type RecentKind = 'recent' | 'mix' | 'fill';

/**
 * The desktop grid of 4 (P5), never empty: the recently viewed first (the caller leaves out the product itself), then
 * similar styles that are not in `skipFill` (the product, its pairing rows); whole pages of `cols`, at most three.
 */
export function recentPool<T extends { id: string }>(recent: readonly T[], fill: readonly T[], skipFill: readonly string[], cols: number): { list: T[]; kind: RecentKind } {
  const seen = new Set<string>();
  const take = (l: readonly T[]) => l.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
  const r = take(recent);
  for (const id of skipFill) seen.add(id);
  const pool = [...r, ...take(fill)];
  const need = Math.max(cols, Math.ceil(Math.min(pool.length, cols * 3) / cols) * cols);
  const kind: RecentKind = r.length >= cols ? 'recent' : r.length ? 'mix' : 'fill';
  return { list: pool.slice(0, Math.min(need, pool.length)), kind };
}

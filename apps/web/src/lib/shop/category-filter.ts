// PR 46 — the category filters (demo 21-category.js cat_apply, cat_options, cat_filtersHTML, cat_chipList, K1 price
// bands). Owner, 19 Oct 18:38: every filter is built from the category's own products — only the sizes that exist (in
// the shop's size order, S … 5XL and waists), only the colours listed in the category with their counts, only the fits
// present, price bands from the category's own cheapest and dearest style. Nothing fixed.
// The counts are live: each option counts the styles the shopper would get if he ticked it, with his other filters on.
// An option that would give nothing is dimmed (a size is crossed out, never hidden — CN-017 SIM-F-035's rule) or left
// out (`category.filters.zero`). Pure: no React, no DB.
import type { CategoryFilterGroup, CategoryFilters, CategoryToolbar, ShopLabel } from '@extas/settings';
import { PRICE_BAND_IDS, type Band, type CatItem, type CatState, type FlagGroup, type ListGroup } from './category-model';

type Pred = (p: CatItem) => boolean;
const ANY: Pred = () => true;

// ---- K1 · price bands from the category's own prices ----

/** The rounding step for an amount (demo cat_priceStep; the steps are `category.filters.priceSteps`). */
export function priceStep(v: number, steps: CategoryFilters['priceSteps']): number {
  for (const s of steps) if (s.below === null || v < s.below) return s.step;
  return steps[steps.length - 1]?.step ?? 1;
}

/** An amount rounded to a number a shopper recognises (demo cat_priceRound). */
export function priceRound(v: number, steps: CategoryFilters['priceSteps']): number {
  const st = priceStep(v, steps);
  return Math.max(st, Math.round(v / st) * st);
}

/** The two cut points for a list of prices, or none (one price, or everything at one price). Demo cat_priceCutsCalc. */
export function priceCuts(prices: readonly (number | null)[], steps: CategoryFilters['priceSteps']): number[] {
  const p = prices.filter((v): v is number => typeof v === 'number' && v > 0);
  if (p.length < 2) return [];
  const lo = Math.min(...p);
  const hi = Math.max(...p);
  if (hi - lo < priceStep(lo, steps)) return [];
  let a = priceRound(lo + (hi - lo) / 3, steps);
  let b = priceRound(lo + ((hi - lo) * 2) / 3, steps);
  if (b <= a) b = a + priceStep(a, steps);
  if (a <= lo) a = lo + priceStep(lo, steps);
  if (b >= hi) b = Math.max(a + priceStep(a, steps), priceRound(hi - priceStep(hi, steps) / 2, steps));
  return b > a && a > lo && a < hi ? [a, b] : [];
}

/** The category's cut points: the owner's own (two, or none at all) or the computed ones. */
export function cutsFor(slug: string, items: readonly CatItem[], f: CategoryFilters): number[] {
  const own = f.priceCuts[slug];
  return own ? [...own] : priceCuts(items.map((p) => p.price), f.priceSteps);
}

/** Which band a price falls in (demo cat_priceBand): under the first cut, up to the second, over it. */
export function bandOf(price: number | null, cuts: readonly number[]): Band | null {
  if (price == null || cuts.length < 2) return null;
  return price < cuts[0]! ? 'lo' : price <= cuts[1]! ? 'mid' : 'hi';
}

// ---- the filter itself ----

/** On sale: a struck price the honesty rule allows (PR 38 / CN-009). No struck price, no sale. */
export const onSale = (p: Pick<CatItem, 'price' | 'was'>) => p.price != null && p.was != null && p.was > p.price;

/** A size counts when it can be bought now in one of the chosen colours (any colour when none is chosen). */
export function sizeInStock(p: CatItem, size: string, colours: readonly string[]): boolean {
  return p.stock.some((v) => v.size === size && v.inStock && (!colours.length || (v.colour != null && colours.includes(v.colour))));
}

export interface FilterCtx {
  cuts: readonly number[];
  /** The test of each owner chip with a filter of its own (price under / over, tag), by chip id. */
  chipTests: ReadonlyMap<string, Pred>;
}

type Group = 'sizes' | 'colours' | 'fits' | 'prices' | 'chips' | 'sale' | 'stock';

function preds(s: CatState, ctx: FilterCtx): Record<Group, Pred> {
  return {
    sizes: s.sizes.length ? (p) => s.sizes.some((z) => sizeInStock(p, z, s.colours)) : ANY,
    colours: s.colours.length ? (p) => p.colours.some((c) => s.colours.includes(c)) : ANY,
    fits: s.fits.length ? (p) => p.fit != null && s.fits.includes(p.fit) : ANY,
    prices: s.prices.length ? (p) => {
      const b = bandOf(p.price, ctx.cuts);
      return b != null && s.prices.includes(b);
    } : ANY,
    chips: s.chips.length ? (p) => s.chips.every((id) => (ctx.chipTests.get(id) ?? ANY)(p)) : ANY,
    sale: s.sale ? onSale : ANY,
    stock: s.stock ? (p) => p.inStock : ANY,
  };
}

/** The styles that pass every filter of the state (in the list's own order). */
export function filterItems(items: readonly CatItem[], s: CatState, ctx: FilterCtx): CatItem[] {
  const all = Object.values(preds(s, ctx));
  return items.filter((p) => all.every((f) => f(p)));
}

function countWith(items: readonly CatItem[], s: CatState, ctx: FilterCtx): number {
  const all = Object.values(preds(s, ctx));
  let n = 0;
  for (const p of items) if (all.every((f) => f(p))) n++;
  return n;
}

/** How many styles the shopper would get with one value of a group ticked as well (a live count). */
export function liveCount(items: readonly CatItem[], s: CatState, ctx: FilterCtx, group: ListGroup | FlagGroup, value?: string): number {
  if (group === 'sale' || group === 'stock') return countWith(items, { ...s, [group]: true }, ctx);
  return countWith(items, { ...s, [group]: [value] } as CatState, ctx);
}

// ---- the options, built from the category's own products ----

export interface SizeMeta {
  key: string;
  label: string;
  order: number;
}

export interface FacetOpt {
  value: string;
  count: number;
  on: boolean;
  /** Nothing would be left with it (and it is not on): dimmed, a size crossed out. */
  off: boolean;
}

export interface Facets {
  stock: (FacetOpt & { shown: boolean }) | null;
  sale: FacetOpt;
  sizes: { letters: FacetOpt[]; waists: FacetOpt[] };
  colours: FacetOpt[];
  fits: FacetOpt[];
  prices: FacetOpt[];
  cuts: number[];
}

const isWaist = (label: string) => /^\d+$/.test(label.trim());

/**
 * Every option of every group for this category and this state. `sizeMeta` is the shop's size list (key → label and
 * order); a size that no product here carries is not offered. A group the owner switched off has no options.
 */
export function facets(items: readonly CatItem[], s: CatState, ctx: FilterCtx, f: CategoryFilters, sizeMeta: ReadonlyMap<string, SizeMeta>): Facets {
  const on = new Set<CategoryFilterGroup>(f.groups.filter((g) => g.on).map((g) => g.id));
  const keep = (o: FacetOpt) => o.on || !o.off || f.zero === 'dim';
  const opt = (group: ListGroup, value: string): FacetOpt => {
    const count = liveCount(items, s, ctx, group, value);
    const ticked = (s[group] as string[]).includes(value);
    return { value, count, on: ticked, off: !ticked && count === 0 };
  };

  // sizes: only those a product here carries, in the shop's order
  const present = new Set(items.flatMap((p) => p.stock.map((v) => v.size)));
  const sizes = on.has('size')
    ? [...present].sort((a, b) => (sizeMeta.get(a)?.order ?? 1e6) - (sizeMeta.get(b)?.order ?? 1e6) || a.localeCompare(b)).map((z) => opt('sizes', z)).filter(keep)
    : [];
  const label = (k: string) => sizeMeta.get(k)?.label ?? k;

  // colours: those listed here, the most-carried first (demo cat_options)
  const seen: string[] = [];
  const carried = new Map<string, number>();
  for (const p of items) for (const c of p.colours) {
    if (!carried.has(c)) seen.push(c);
    carried.set(c, (carried.get(c) ?? 0) + 1);
  }
  const colours = on.has('colour')
    ? [...seen].sort((a, b) => carried.get(b)! - carried.get(a)! || seen.indexOf(a) - seen.indexOf(b)).map((c) => opt('colours', c)).filter(keep)
    : [];

  // fits: those present; one fit alone is no choice (demo: shown from two up, or while one is ticked)
  const fitList = [...new Set(items.map((p) => p.fit).filter((x): x is string => !!x))];
  const fits = on.has('fit') && (fitList.length > 1 || s.fits.length) ? fitList.map((x) => opt('fits', x)).filter(keep) : [];

  // price: the category's own bands; a band no style here falls in is not offered at all
  const prices = on.has('price') && ctx.cuts.length === 2
    ? PRICE_BAND_IDS.filter((b) => s.prices.includes(b) || items.some((p) => bandOf(p.price, ctx.cuts) === b)).map((b) => opt('prices', b)).filter(keep)
    : [];

  const flag = (g: FlagGroup): FacetOpt => {
    const count = liveCount(items, s, ctx, g);
    return { value: '1', count, on: s[g], off: !s[g] && count === 0 };
  };
  const sold = items.some((p) => !p.inStock);
  const stockOpt = flag('stock');
  return {
    // "in stock only" means something only where a style here is sold out
    stock: on.has('stock') ? { ...stockOpt, shown: sold || s.stock } : null,
    sale: flag('sale'),
    sizes: { letters: sizes.filter((o) => !isWaist(label(o.value))), waists: sizes.filter((o) => isWaist(label(o.value))) },
    colours,
    fits,
    prices,
    cuts: [...ctx.cuts],
  };
}

// ---- 14.3 · the quick chips the owner ticked (demo cat_chipList) ----

export interface ChipView {
  /** A stable key for the row. */
  key: string;
  group: ListGroup | FlagGroup;
  value?: string;
  /** The owner's words, or what the chip says by itself. */
  label: ShopLabel | { text: string };
  on: boolean;
}

export interface ChipWords {
  sale: string;
  stock: string;
  band: (b: Band) => string;
  under: (minor: number) => string;
  over: (minor: number) => string;
  colour: (key: string) => string;
  size: (key: string) => string;
}

/** The toolbar of one category: the base settings with that category's own switches over them. */
export function toolbarFor(t: CategoryToolbar, slug: string): { topOn: boolean; items: CategoryToolbar['top']['items']; chipsOn: boolean; chosen: string[] } {
  const own = t.perCategory[slug];
  return {
    topOn: own?.top?.on ?? t.top.on,
    items: t.top.items.filter((i) => i.on),
    chipsOn: own?.chips?.on ?? t.chips.on,
    chosen: own?.chips?.chosen ?? t.chips.chosen,
  };
}

/** The tests behind owner chips with a filter of their own, by chip id (they travel in the address as `chip`). */
export function chipTests(t: CategoryToolbar): Map<string, Pred> {
  const m = new Map<string, Pred>();
  for (const c of t.chips.library) {
    if (c.kind === 'priceUnder' && c.max != null) m.set(c.id, (p) => p.price != null && p.price <= c.max!);
    else if (c.kind === 'priceOver' && c.min != null) m.set(c.id, (p) => p.price != null && p.price >= c.min!);
    else if (c.kind === 'tag' && c.value) m.set(c.id, (p) => p.tags.includes(c.value!));
  }
  return m;
}

/**
 * The chips to draw for this category and state. A chip whose filter would match every style here or none is left out
 * — unless it is on, then it stays so it can be undone. "My size" and "set price" wait for the features that know.
 */
export function chipList(t: CategoryToolbar, slug: string, items: readonly CatItem[], s: CatState, ctx: FilterCtx, words: ChipWords): ChipView[] {
  const bar = toolbarFor(t, slug);
  if (!bar.chipsOn) return [];
  const lib = new Map(t.chips.library.map((c) => [c.id, c]));
  const out: ChipView[] = [];
  const own = (l: ShopLabel | undefined, text: string): ChipView['label'] => l ?? { text };
  for (const id of bar.chosen) {
    const c = lib.get(id);
    if (!c) continue;
    switch (c.kind) {
      case 'sale':
        out.push({ key: id, group: 'sale', label: own(c.label, words.sale), on: s.sale });
        break;
      case 'stock':
        out.push({ key: id, group: 'stock', label: own(c.label, words.stock), on: s.stock });
        break;
      case 'priceBands':
      case 'priceBand':
        if (ctx.cuts.length === 2) for (const b of PRICE_BAND_IDS) {
          if (c.kind === 'priceBand' && b !== c.band) continue;
          out.push({ key: `${id}:${b}`, group: 'prices', value: b, label: c.kind === 'priceBand' ? own(c.label, words.band(b)) : { text: words.band(b) }, on: s.prices.includes(b) });
        }
        break;
      case 'fits':
      case 'fit': {
        const fits = c.kind === 'fit' ? [c.value!] : [...new Set(items.map((p) => p.fit).filter((x): x is string => !!x))];
        for (const x of fits) out.push({ key: `${id}:${x}`, group: 'fits', value: x, label: c.kind === 'fit' ? own(c.label, x) : { text: x }, on: s.fits.includes(x) });
        break;
      }
      case 'colour':
        out.push({ key: id, group: 'colours', value: c.value!, label: own(c.label, words.colour(c.value!)), on: s.colours.includes(c.value!) });
        break;
      case 'size':
        out.push({ key: id, group: 'sizes', value: c.value!, label: own(c.label, words.size(c.value!)), on: s.sizes.includes(c.value!) });
        break;
      case 'priceUnder':
      case 'priceOver':
      case 'tag': {
        const text = c.kind === 'priceUnder' ? words.under(c.max!) : c.kind === 'priceOver' ? words.over(c.min!) : c.value!;
        out.push({ key: id, group: 'chips', value: id, label: own(c.label, text), on: s.chips.includes(id) });
        break;
      }
      // 'mine' (Find My Size, PR 58) and 'setOnly' (sets, S03): nothing to filter by yet, so no chip
      default:
        break;
    }
  }
  const total = items.length;
  return out.filter((ch) => {
    if (ch.on) return true;
    // the chip alone, on this category's styles: it must narrow the list without emptying it
    const alone = { sizes: [], colours: [], fits: [], prices: [], chips: [], sale: false, stock: false, sort: s.sort, page: 1 } as CatState;
    const n = liveCount(items, alone, ctx, ch.group, ch.value);
    return n > 0 && n < total;
  });
}

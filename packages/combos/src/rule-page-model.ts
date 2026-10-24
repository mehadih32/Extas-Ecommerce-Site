// PR 572–574 — a rule's pairs as the shop reads them, pure (browser and server; demo 42-combo-auto.js ca_filtered,
// ca_sort, ca_grid, ca_offerStrip, ca_findBy, ca_sizeLine, ca_mxCommon). The server (rule-page.ts) hands over every pair
// an auto rule makes that has its combo row on sale, with its sizes, stock and set price; these functions are the
// rules the category page (L1–L5), the pair page (P1–P5) and the bag (B3) draw with, so a filter, an order, "See all"
// and "which pair are these colours" are one decision everywhere. No price is worked out here: each pair carries the
// set price the one price rule gave it, and `pairPrice` only looks a mix of piece prices up in the rule's price table.
import { priceKeyOf, type PriceCell } from './page-model';

/** One piece of a pair: a product in one colour. */
export interface ListPiece {
  productId: string;
  colourId: string;
}

export interface ListSize {
  key: string;
  label: string;
  /** Every piece has enough sellable stock in this size. */
  ok: boolean;
  /** Whole sets of this size that can be sold now. */
  sets: number;
  /** The pieces (by index in `pieces`) that are short of stock in this size. */
  out: number[];
}

export interface ListPair {
  comboId: string;
  /** The pair's own page (`/combo/<slug>`). */
  slug: string;
  pieceKey: string;
  /** The pieces in the rule's order (colour order). */
  pieces: ListPiece[];
  /** The pieces in the combo's slot order — the order the bag's choices go in (same piece twice side by side). */
  slots: ListPiece[];
  sameProduct: boolean;
  /** The style the pair belongs to (one product, or one style group); `mix` for a pair across styles. */
  styleKey: string;
  sizes: ListSize[];
  /** Sizes open now (0 = sold out). */
  openSizes: number;
  price: PriceCell;
  isNew: boolean;
  pinned: boolean;
  pairSales: number;
  colourSales: number;
  /** The owner's colour order of the pieces (the "colour order" sort). */
  colourOrder: string;
  /** Place in the rule's own order (0 = first). */
  rank: number;
}

export const LIST_SORTS = ['best', 'sizes', 'new', 'price'] as const;
export type ListSort = (typeof LIST_SORTS)[number];

export interface ListFilter {
  /** Colour ids every shown pair must have. */
  has: readonly string[];
  /** A size key every piece must be open in. */
  size: string | null;
  /** Only this style's pairs (L2's style card opens L1 on one style). */
  style: string | null;
  sort: ListSort;
}

export const NO_FILTER: ListFilter = { has: [], size: null, style: null, sort: 'best' };

const byRank = (a: ListPair, b: ListPair) => a.rank - b.rank;

/** The shop's orders (demo ca_sort): best selling is the rule's own order; the others put it second. */
export function sortListing(list: readonly ListPair[], sort: ListSort): ListPair[] {
  const out = [...list];
  if (sort === 'sizes') return out.sort((a, b) => b.openSizes - a.openSizes || byRank(a, b));
  if (sort === 'new') return out.sort((a, b) => Number(b.isNew) - Number(a.isNew) || byRank(a, b));
  if (sort === 'price') return out.sort((a, b) => (a.price.pay ?? Number.MAX_SAFE_INTEGER) - (b.price.pay ?? Number.MAX_SAFE_INTEGER) || byRank(a, b));
  return out.sort(byRank);
}

/** The pairs a filter leaves (sold-out pairs are never listed), in its order (demo ca_filtered). */
export function filterPairs(pairs: readonly ListPair[], f: ListFilter): ListPair[] {
  const list = pairs.filter(
    (p) =>
      p.openSizes > 0 &&
      (!f.style || p.styleKey === f.style) &&
      f.has.every((c) => p.pieces.some((x) => x.colourId === c)) &&
      (!f.size || p.sizes.some((s) => s.key === f.size && s.ok)),
  );
  return sortListing(list, f.sort);
}

/** The prices differ between pairs (then "Price: low to high" is offered, demo ca_filterBar). */
export const pricesVary = (pairs: readonly ListPair[]) => new Set(pairs.map((p) => p.price.pay)).size > 1;

/** How many cards show, and whether "See all N" is offered (demo ca_grid: past `over` pairs, the first `first`). */
export function shownCount(total: number, all: boolean, s: { over: number; first: number }): { shown: number; more: boolean } {
  if (all || total <= s.over) return { shown: total, more: false };
  const shown = Math.min(total, s.first);
  return { shown, more: shown < total };
}

/** The sizes in short words for a card (demo ca_sizeLine): sold out, all, a run, the few left — or, for pieces sized
 * one by one (no size in common, `open` > 0), "a size for each piece". */
export function sizeLine(sizes: readonly Pick<ListSize, 'label' | 'ok'>[], open = 0): { kind: 'soldOut' | 'all' | 'range' | 'some' | 'each'; from?: string; to?: string; labels?: string[]; few?: boolean } {
  if (!sizes.length) return { kind: open > 0 ? 'each' : 'soldOut' };
  const ok = sizes.filter((s) => s.ok);
  if (!ok.length) return { kind: 'soldOut' };
  if (ok.length === sizes.length) return { kind: 'all', from: sizes[0]!.label, to: sizes[sizes.length - 1]!.label };
  const idx = ok.map((s) => sizes.indexOf(s));
  if (ok.length >= 3 && idx[idx.length - 1]! - idx[0]! === idx.length - 1) return { kind: 'range', from: ok[0]!.label, to: ok[ok.length - 1]!.label };
  return { kind: 'some', labels: ok.map((s) => s.label), few: ok.length <= 3 };
}

/** The offer strip's numbers (demo ca_offerStrip): one price for every pair, or "from"; the first pair's saving. */
export function offerNumbers(pairs: readonly ListPair[]): { one: boolean; payMinor: number; regularMinor: number | null; savingMinor: number; first: ListPair } | null {
  const priced = pairs.filter((p) => p.price.pay !== null);
  const first = priced.find((p) => p.openSizes > 0) ?? priced[0];
  if (!first) return null;
  const pays = priced.map((p) => p.price.pay!);
  const one = Math.min(...pays) === Math.max(...pays);
  const regs = priced.flatMap((p) => (p.price.regular === null ? [] : [p.price.regular]));
  return { one, payMinor: one ? first.price.pay! : Math.min(...pays), regularMinor: one ? first.price.regular : regs.length ? Math.min(...regs) : null, savingMinor: first.price.offer ? first.price.saving : 0, first };
}

/** The colours the shown pairs use, in the products' own colour order (the "Has:" chips). */
export function filterColours(pairs: readonly ListPair[], colourOrder: readonly string[]): string[] {
  const used = new Set(pairs.filter((p) => p.openSizes > 0).flatMap((p) => p.pieces.map((x) => x.colourId)));
  return [...new Set(colourOrder)].filter((c) => used.has(c));
}

/** The pairs by style, in the rule's order (L2's style cards, demo ca_styleGroups). */
export function styleGroups(pairs: readonly ListPair[]): { key: string; pairs: ListPair[] }[] {
  const out = new Map<string, ListPair[]>();
  for (const p of [...pairs].sort(byRank)) if (p.openSizes > 0) out.set(p.styleKey, [...(out.get(p.styleKey) ?? []), p]);
  return [...out.entries()].map(([key, list]) => ({ key, pairs: list }));
}

const multiset = (pieces: readonly ListPiece[]) =>
  pieces
    .map((p) => `${p.productId}|${p.colourId}`)
    .sort()
    .join(',');

/** The pair made of exactly these pieces (in any order), or null (demo ca_findBy). */
export function findPair(pairs: readonly ListPair[], pieces: readonly ListPiece[]): ListPair | null {
  const want = multiset(pieces);
  return pairs.find((p) => multiset(p.pieces) === want) ?? null;
}

/** The pairs with the same products as this one (its colours are what changes): the pair page's other pairs. */
export function siblingsOf(pairs: readonly ListPair[], me: Pick<ListPair, 'pieces'>): ListPair[] {
  const products = me.pieces.map((p) => p.productId).sort().join();
  return pairs.filter((p) => p.pieces.map((x) => x.productId).sort().join() === products);
}

/** The colours every piece of the pair comes in whose all-same set is on sale (P3's "Set colour", demo ca_mxCommon). */
export function commonColours(pairs: readonly ListPair[], me: Pick<ListPair, 'pieces'>, coloursOf: (productId: string) => readonly string[]): string[] {
  const lists = me.pieces.map((p) => coloursOf(p.productId));
  return (lists[0] ?? []).filter((c) => lists.every((l) => l.includes(c)) && (findPair(pairs, me.pieces.map((p) => ({ productId: p.productId, colourId: c })))?.openSizes ?? 0) > 0);
}

/** What a piece needs and has: a variant with its stock and own price. */
export interface ListVariant {
  id: string;
  colourId: string | null;
  sizeId: string | null;
  sellable: number;
  priceMinor: number | null;
}

/** Pieces that can still be had of a variant after the bag's own (`inBag`, by variant id). */
export const freeOf = (v: ListVariant | undefined, inBag: Readonly<Record<string, number>>) => (v && v.priceMinor !== null ? Math.max(0, v.sellable - (inBag[v.id] ?? 0)) : 0);

/** How many of this (product, colour) the pieces hold (two of the same piece need two). */
export const needOf = (pieces: readonly ListPiece[], i: number) => pieces.filter((x) => x.productId === pieces[i]!.productId && x.colourId === pieces[i]!.colourId).length;

/** A rule's price table key: the pieces' own prices in any order (the one price rule does not care about order). */
export const ruleKeyOf = (prices: readonly (number | null)[]) => priceKeyOf([...prices].sort((a, b) => (a ?? -1) - (b ?? -1)));

/** The set price of a pair in these variants: the rule's price table, else the pair's first price. */
export function pairPrice(pair: Pick<ListPair, 'price'>, variantPrices: readonly (number | null)[] | null, table: Readonly<Record<string, PriceCell>> | null): PriceCell {
  if (!variantPrices || variantPrices.some((p) => p === null) || !table) return pair.price;
  return table[ruleKeyOf(variantPrices)] ?? pair.price;
}

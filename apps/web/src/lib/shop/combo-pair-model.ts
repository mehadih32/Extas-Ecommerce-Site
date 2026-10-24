// PR 573 — the combo product page templates P1–P5 (demo 42-combo-auto.js ca_P1 … ca_P5, ca_mx*), the pure part (no
// server imports; unit-tested). A pair an auto rule made opens in the template its combo, its rule or the shop chose
// ("current" keeps the page PR 91–95 built). Everything a template decides lives here so the page, its sticky bar and
// its tests agree: which sizes are open for the pieces (stock minus what the bag already holds), what the button adds
// (the pair, the 3-piece set of "Make it 3 pcs", the pair the picked colours make), what is still missing (the button
// says it, and a tap scrolls to it), and the choices the bag gets for each slot. Prices are the rule's (its price table).
import { findPair, freeOf, needOf, pairPrice, type ListPair, type ListPiece, type ListVariant } from '@extas/combos/rule-page-model';
import type { PriceCell } from '@extas/combos/page-model';
import type { ImageSource } from '@extas/media';
import type { ShopLang } from './lang';

export const PAIR_TEMPLATES = ['P1', 'P2', 'P3', 'P4', 'P5'] as const;
export type PairTemplate = (typeof PAIR_TEMPLATES)[number];

export interface PairColour {
  id: string;
  key: string;
  name: string;
  hex: string;
}

export interface PairProduct {
  id: string;
  name: string;
  /** The product's own page. */
  href: string | null;
  garment: string | null;
  colours: PairColour[];
  sizes: { id: string; key: string; label: string }[];
  variants: ListVariant[];
  /** The owner's front photo of each colour (by colour id), else none (the drawing shows). */
  photos: Record<string, ImageSource | null>;
  /** The measurements by size id, with the chart's field names, or null. */
  chart: { fields: string[]; rows: Record<string, { inch: (number | null)[]; cm: (number | null)[] }> } | null;
}

export interface PairSide {
  rule: { key: string; pieces: number; pairing: 'STYLE' | 'ACROSS' | 'ANY'; title: string; href: string };
  pairs: ListPair[];
  prices: Record<string, PriceCell> | null;
}

export interface PairEnv {
  tpl: PairTemplate;
  lang: ShopLang;
  bnDigits: boolean;
  currency: string;
  /** The pair this page was opened on. */
  me: ListPair;
  side: PairSide;
  /** The 2 ↔ 3 piece rule of the same products (P1's "Make it 3 pcs", P2's piece switch), on sale, or null. */
  companion: PairSide | null;
  products: PairProduct[];
  /** Pieces the bag already holds, by variant id (a set being changed does not count). */
  inBag: Record<string, number>;
  /** The set in the bag this page changes (`?from=`): the button puts the new pair in its place. */
  editGroupKey: string | null;
  /** `ctpl.*` and the few `combo.*` words the page uses, in its language, {slots} open. */
  words: Record<string, string>;
  hrefs: { bag: string; checkout: string; combo: string; rule: string; query: string };
  behaviour: 'sheet' | 'toast' | 'page';
  whatsapp: string | null;
  store: string;
  trust: { cod: boolean; freeOverMinor: number | null; exchangeHours: string | null };
  /** `combos.pairPage`. */
  otherPairs: number;
  packSwatches: number;
  upsell: boolean;
}

/** The template a pair page shows: a preview (`?tpl=`, while previews are on), the builder card's "pick your colours"
 * (`?pick=1`), else the page's own. Anything else keeps the page's own. */
export function pairTemplateOf(own: string, q: { tpl: string | null; pick: boolean }, previewOn: boolean): string {
  if (q.tpl && previewOn && (q.tpl === 'current' || (PAIR_TEMPLATES as readonly string[]).includes(q.tpl))) return q.tpl;
  if (q.pick) return 'P2';
  return own;
}

/** A word of the page, its {slots} filled. */
export const wordIn = (words: Readonly<Record<string, string>>, key: string, vars: Readonly<Record<string, string | number>> = {}): string =>
  (words[key] ?? key).replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

export const productOf = (env: Pick<PairEnv, 'products'>, id: string) => env.products.find((p) => p.id === id);
export const colourOf = (env: Pick<PairEnv, 'products'>, piece: ListPiece) => productOf(env, piece.productId)?.colours.find((c) => c.id === piece.colourId);

/** The variant of a piece in a size (by size key). */
export function variantOf(env: Pick<PairEnv, 'products'>, piece: ListPiece, sizeKey: string | null): ListVariant | undefined {
  const p = productOf(env, piece.productId);
  const size = sizeKey === null ? null : (p?.sizes.find((s) => s.key === sizeKey)?.id ?? 'none');
  return p?.variants.find((v) => v.colourId === piece.colourId && (size === null ? v.sizeId === null : v.sizeId === size));
}

/** Piece i of these pieces can be had in this size (two of the same piece need two, after the bag's own). */
export function pieceOk(env: Pick<PairEnv, 'products' | 'inBag'>, pieces: readonly ListPiece[], i: number, sizeKey: string): boolean {
  return freeOf(variantOf(env, pieces[i]!, sizeKey), env.inBag) >= needOf(pieces, i);
}

/** Pieces left in a size for piece i ("Only 2 left"), after the bag's own. */
export const leftOf = (env: Pick<PairEnv, 'products' | 'inBag'>, piece: ListPiece, sizeKey: string) => freeOf(variantOf(env, piece, sizeKey), env.inBag);

/** The sizes all pieces share (by key, in the first piece's order), each open when every piece has it. */
export function bothSizes(env: Pick<PairEnv, 'products' | 'inBag'>, pieces: readonly ListPiece[]): { key: string; label: string; ok: boolean; out: number[] }[] {
  const lists = pieces.map((p) => productOf(env, p.productId)?.sizes ?? []);
  const first = lists[0] ?? [];
  return first
    .filter((s) => lists.every((l) => l.some((x) => x.key === s.key)))
    .map((s) => {
      const out = pieces.flatMap((_, i) => (pieceOk(env, pieces, i, s.key) ? [] : [i]));
      return { key: s.key, label: s.label, ok: out.length === 0, out };
    });
}

/** The size of each slot of a pair: the size of the piece it is (slots and pieces hold the same pieces, maybe in
 * another order); a slot with no piece of its own (the 3rd piece of "Make it 3 pcs") takes the first piece's size. */
export function slotSizes(pair: Pick<ListPair, 'slots'>, pieces: readonly ListPiece[], sizes: readonly (string | null)[]): (string | null)[] {
  const used = new Set<number>();
  return pair.slots.map((s) => {
    const j = pieces.findIndex((p, k) => !used.has(k) && p.productId === s.productId && p.colourId === s.colourId);
    if (j < 0) return sizes[0] ?? null;
    used.add(j);
    return sizes[j] ?? null;
  });
}

/** What the bag gets: each slot's colour and size id, in slot order. */
export function choicesFor(env: Pick<PairEnv, 'products'>, pair: Pick<ListPair, 'slots'>, sizes: readonly (string | null)[]): { colourId: string; sizeId: string | null }[] {
  return pair.slots.map((s, i) => {
    const key = sizes[i] ?? null;
    return { colourId: s.colourId, sizeId: key === null ? null : (productOf(env, s.productId)?.sizes.find((z) => z.key === key)?.id ?? null) };
  });
}

/** The pair's set price in these sizes (each piece's own price may differ by size): the rule's price table. */
export function priceIn(env: Pick<PairEnv, 'products'>, side: Pick<PairSide, 'prices'>, pair: ListPair, slotKeys: readonly (string | null)[] | null): PriceCell {
  if (!slotKeys || slotKeys.some((k) => k === null)) return pair.price;
  const prices = pair.slots.map((s, i) => variantOf(env, s, slotKeys[i]!)?.priceMinor ?? null);
  return pairPrice(pair, prices, side.prices);
}

/** P1 "Make it 3 pcs" (demo ca_upsell): the 3rd colours whose 3-piece set of the same product is on sale, with it. */
export function upsellOptions(env: Pick<PairEnv, 'products' | 'companion' | 'me'>): { colourId: string; pair: ListPair }[] {
  const c = env.companion;
  const me = env.me;
  if (!c || c.rule.pieces !== me.pieces.length + 1 || !me.sameProduct) return [];
  const product = productOf(env, me.pieces[0]!.productId);
  if (!product) return [];
  const mine = new Set(me.pieces.map((p) => p.colourId));
  return product.colours.flatMap((col) => {
    if (mine.has(col.id)) return [];
    const pair = findPair(c.pairs, [...me.pieces, { productId: product.id, colourId: col.id }]);
    return pair && pair.openSizes > 0 ? [{ colourId: col.id, pair }] : [];
  });
}

/** P3 / P4 (demo ca_mxColours): the colours offered for piece i, given the others' colours; open when that mix's
 * combo is on sale and has a size open. */
export function mixColours(env: Pick<PairEnv, 'products'>, pairs: readonly ListPair[], pieces: readonly ListPiece[], i: number): { id: string; ok: boolean }[] {
  const p = productOf(env, pieces[i]!.productId);
  return (p?.colours ?? []).map((c) => {
    const x = findPair(
      pairs,
      pieces.map((q, k) => (k === i ? { productId: q.productId, colourId: c.id } : q)),
    );
    return { id: c.id, ok: Boolean(x && x.openSizes > 0) };
  });
}

/** P4's "Same size for all tops": the pieces that share one size list (the biggest such group of two or more). */
export function sameSizeGroup(env: Pick<PairEnv, 'products'>, pieces: readonly ListPiece[]): number[] {
  const keyOf = (i: number) =>
    (productOf(env, pieces[i]!.productId)?.sizes ?? [])
      .map((s) => s.key)
      .join('|');
  const groups = new Map<string, number[]>();
  pieces.forEach((_, i) => groups.set(keyOf(i), [...(groups.get(keyOf(i)) ?? []), i]));
  const best = [...groups.values()].sort((a, b) => b.length - a.length)[0] ?? [];
  return best.length >= 2 ? best : [];
}

/** The noun of each piece's row ("Hoodie", or "Polo 1" / "Polo 2" when a product repeats; demo ca_mxNoun). */
export function pieceNouns(names: readonly string[], num: (n: number) => string): string[] {
  const count = new Map<string, number>();
  for (const n of names) count.set(n, (count.get(n) ?? 0) + 1);
  const seen = new Map<string, number>();
  return names.map((n) => {
    if ((count.get(n) ?? 0) < 2) return n;
    const k = (seen.get(n) ?? 0) + 1;
    seen.set(n, k);
    return `${n} ${num(k)}`;
  });
}

/** P2 (demo ca_p2Resolve): the picked pieces, how many the pack needs and the pair they make (null until complete). */
export function resolvePicks(side: Pick<PairSide, 'pairs' | 'rule'>, picks: readonly string[]): { pieces: ListPiece[]; need: number; pair: ListPair | null } {
  const pieces = picks.map((k) => {
    const [productId, colourId] = k.split('|');
    return { productId: productId!, colourId: colourId! };
  });
  const need = side.rule.pieces;
  return { pieces, need, pair: pieces.length === need ? findPair(side.pairs, pieces) : null };
}

/** The colours each P2 group picks from: one group of the pair's product (pick N), or one per piece across styles. */
export function pickGroups(env: Pick<PairEnv, 'products'>, side: Pick<PairSide, 'rule' | 'pairs'>, me: ListPair): { productId: string; pick: number; colours: string[] }[] {
  const open = (productId: string) => {
    const used = new Set(side.pairs.filter((p) => p.openSizes > 0).flatMap((p) => p.pieces.filter((x) => x.productId === productId).map((x) => x.colourId)));
    return (productOf(env, productId)?.colours ?? []).map((c) => c.id).filter((c) => used.has(c));
  };
  if (side.rule.pairing === 'ACROSS') return me.pieces.map((p) => ({ productId: p.productId, pick: 1, colours: open(p.productId) }));
  return [{ productId: me.pieces[0]!.productId, pick: side.rule.pieces, colours: open(me.pieces[0]!.productId) }];
}

/** P2: a colour tapped (an ACROSS group swaps its one pick; a pack adds it, or takes it off, up to N). */
export function togglePick(picks: readonly string[], key: string, group: number, across: boolean, need: number): string[] {
  if (across) {
    const out = [...picks];
    out[group] = key;
    return out;
  }
  const i = picks.indexOf(key);
  if (i >= 0) return picks.filter((_, k) => k !== i);
  return picks.length >= need ? [...picks.slice(1), key] : [...picks, key];
}

/** The pieces of another pair with the same products (its colours are what changes), up to `max`: P1's "Other pairs". */
export function otherPairsOf(pairs: readonly ListPair[], me: ListPair, max: number): ListPair[] {
  const products = (p: ListPair) =>
    p.pieces
      .map((x) => x.productId)
      .sort()
      .join();
  const mine = products(me);
  return pairs.filter((p) => p.openSizes > 0 && products(p) === mine && p.styleKey === me.styleKey).slice(0, max);
}

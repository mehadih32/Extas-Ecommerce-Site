// PR 98, 100 — "Build your own set", what the page draws (pure, browser and server; demo 41-set.js): the page's data
// for its one client part, the headline and the status lines in the shop's words, and each card's colour, size and
// price. Every set price is @extas/combos' (`tierQuote` through `checkBuild`); nothing here works one out.
import type { BuildVariant, PricedTier, TierQuote } from '@extas/combos/pure';
import type { ShopLang } from './lang';
import type { PdpShot } from './product-model';

export const BUILD_VIEWS = ['front', 'back', 'detail'] as const;
export type BuildView = (typeof BUILD_VIEWS)[number];

export interface BuildColour {
  id: string;
  key: string;
  name: string;
  hex: string;
}

export interface BuildCard {
  id: string;
  name: string;
  garment: string | null;
  colours: BuildColour[];
  sizes: { id: string; label: string }[];
  variants: BuildVariant[];
  /** Each colour's picture per view (by colour id, '*' for a product without colours). */
  shots: Record<string, Record<BuildView, PdpShot>>;
}

export interface BuildEnv {
  lang: ShopLang;
  bnDigits: boolean;
  currency: string;
  ruleId: string;
  ruleName: string;
  tiers: PricedTier[];
  cards: BuildCard[];
  /** Pieces of each variant the bag holds already. */
  inBag: Record<string, number>;
  maxPerLine: number;
  /** "৳X per item" under each tier. */
  perItem: boolean;
  /** The separate prices' sum may show struck (the owner's switch, CN-009). */
  showWas: boolean;
  /** Every `build.*` word in the page's language, {slots} left open. */
  words: Record<string, string>;
  hrefs: { bag: string };
}

type W = (key: string, vars?: Record<string, string | number>) => string;
type Fmt = (n: number) => string;

/** "Any 2 ৳1,500 · Any 3 ৳2,100". */
export function headline(tiers: readonly PricedTier[], w: W, money: Fmt, num: Fmt): string {
  return tiers.map((t, i) => w(i === 0 ? 'headFirst' : 'headMore', { n: num(t.quantity), price: money(t.priceMinor) })).join(w('headJoin'));
}

/** A group's tab line: "2 for ৳1,500 · 3 for ৳2,100" (the smallest and the largest set). */
export function tabLine(tiers: readonly PricedTier[], w: W, money: Fmt, num: Fmt): string {
  const a = tiers[0];
  const b = tiers[tiers.length - 1];
  if (!a) return '';
  return b && b !== a ? w('tabTwo', { n: num(a.quantity), price: money(a.priceMinor), m: num(b.quantity), price2: money(b.priceMinor) }) : w('tabOne', { n: num(a.quantity), price: money(a.priceMinor) });
}

/** The two status lines (demo bs_status): what the picks cost, and what the next step brings. */
export function statusOf(q: TierQuote, w: W, money: Fmt, num: Fmt): { line: string; sub: string } {
  const first = q.tiers[0];
  if (!first) return { line: '', sub: '' };
  if (q.count < first.quantity) {
    return {
      line: w('status.atLeast', { n: num(first.quantity) }),
      sub: q.count ? w('status.unlock', { more: num(first.quantity - q.count), price: money(first.priceMinor) }) : w('status.first', { n: num(first.quantity), price: money(first.priceMinor) }),
    };
  }
  return {
    line: q.savingMinor > 0 ? w('status.lineSave', { n: num(q.count), price: money(q.payMinor), saving: money(q.savingMinor) }) : w('status.line', { n: num(q.count), price: money(q.payMinor) }),
    sub: q.next ? w('status.next', { more: num(q.next.more), n: num(q.next.quantity), price: money(q.next.priceMinor) }) : w('status.best'),
  };
}

/** The variant of a colour and size (a product without sizes: its colour's one variant). */
export function variantOf(card: Pick<BuildCard, 'variants'>, colourId: string | null, sizeId: string | null): BuildVariant | undefined {
  return card.variants.find((v) => v.colourId === colourId && v.sizeId === sizeId);
}

/** Can anything of this colour be had (stock and a price)? */
export const colourOpen = (card: Pick<BuildCard, 'variants'>, colourId: string | null) => card.variants.some((v) => v.colourId === colourId && v.sellable > 0 && v.priceMinor !== null);

/** The colour a card opens on: the first in the owner's order that can be had, else the first. */
export function firstColour(card: Pick<BuildCard, 'variants' | 'colours'>): string | null {
  return card.colours.find((c) => colourOpen(card, c.id))?.id ?? card.colours[0]?.id ?? null;
}

/** The card's price: the picked size's own, else the lowest of the colour, else the lowest of the product. */
export function cardPrice(card: Pick<BuildCard, 'variants'>, colourId: string | null, sizeId: string | null): number | null {
  const own = sizeId ? variantOf(card, colourId, sizeId)?.priceMinor : undefined;
  if (own != null) return own;
  const low = (vs: readonly BuildVariant[]) => vs.reduce<number | null>((m, v) => (v.priceMinor === null ? m : m === null ? v.priceMinor : Math.min(m, v.priceMinor)), null);
  return low(card.variants.filter((v) => v.colourId === colourId)) ?? low(card.variants);
}

/** A product without sizes needs no size pick (its one variant per colour). */
export const sizeless = (card: Pick<BuildCard, 'sizes'>) => card.sizes.length === 0;

/** A word of the page (`build.<key>`, the key without its prefix), its {slots} filled; a missing word shows its key. */
export const buildWord = (words: Readonly<Record<string, string>>, key: string, vars: Readonly<Record<string, string | number>> = {}): string =>
  (words[key] ?? `build.${key}`).replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

/** The next picture view (a picture tap turns it in place: front → back → detail). */
export const nextView = (v: BuildView): BuildView => BUILD_VIEWS[(BUILD_VIEWS.indexOf(v) + 1) % BUILD_VIEWS.length]!;

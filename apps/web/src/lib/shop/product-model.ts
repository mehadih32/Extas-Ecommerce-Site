// PR 49 — the product page's model, shared by the server page and its small client parts: what the page knows about one
// product (its colours, sizes, variants with their sellable stock, the prices already written in the page's language,
// the photos of each colour) and the pure rules that turn a choice (a colour, a size) into what the page says. Nothing
// here reads the database or the settings; product.ts builds the model, the components draw it. Client-safe: no server
// imports, only types from the media package.
import type { ImageSource } from '@extas/media';
import type { GarmentView } from './garment-art';

/** What one photo shows (ProductMedia.role), or a view of the drawing while the colour has no photo. */
export type PdpShotKind = 'front' | 'back' | 'detail' | 'model' | 'flat' | 'fabric' | 'trueColour' | 'set' | 'other';

export interface PdpShot {
  id: string;
  kind: PdpShotKind;
  /** The owner's photo; null = the garment drawing in the colour's hex (`draw` = which view of it). */
  photo: ImageSource | null;
  draw: GarmentView;
}

export interface PdpColour {
  key: string;
  /** In the page's language. */
  name: string;
  hex: string;
  /** The colour's own note ("Deep navy, can look almost black in low light"), in the page's language. */
  note: string | null;
}

export interface PdpSize {
  key: string;
  label: string;
}

export interface PdpVariant {
  id: string;
  colour: string | null;
  size: string | null;
  /** Pieces that can be sold now (0 when the variant is not in stock). */
  stock: number;
  /** Index into PdpModel.prices. */
  price: number;
}

/** A price as the page writes it (formatted on the server, in the page's language and digits). */
export interface PdpPrice {
  minor: number;
  now: string;
  /** The struck price, only when the honesty rule allows one (PR 38). */
  was: string | null;
  /** "−20%" and "Save ৳ 240", with `was` only. */
  pct: string | null;
  save: string | null;
}

export interface PdpChartField {
  key: string;
  label: string;
  /** "How to measure" for this field, in the page's language. */
  howTo: string | null;
}

export interface PdpChart {
  name: string;
  /** Only the measurements the chart has a value for (D3.8: an empty measurement never renders). */
  fields: PdpChartField[];
  /** One row per size of the product that the chart covers, in the shop's size order. */
  rows: { size: string; inch: (number | null)[]; cm: (number | null)[] }[];
}

export interface PdpModel {
  productId: string;
  name: string;
  garment: string | null;
  colours: PdpColour[];
  sizes: PdpSize[];
  variants: PdpVariant[];
  prices: PdpPrice[];
  /** The photos of each colour (by colour key), in the owner's order; '*' when the product has no colours. */
  shots: Record<string, PdpShot[]>;
  chart: PdpChart | null;
  /** The product is on sale (published, not archived). A ghost page shows everything sold out. */
  onSale: boolean;
}

export interface PdpChoice {
  colour: string | null;
  size: string | null;
}

/** The colour key of the "no colour" product. */
export const NO_COLOUR = '*';

// ---- the product's address ----

/**
 * The product page an address names, or null: `<prefix>/<slug>` or (D3.7, `pdp.page.colourPaths`) the colour's own
 * address `<prefix>/<slug>/<colour>`. Anything deeper is not a product page.
 */
export function productRoute(path: string, prefix: string): { slug: string; colour: string | null } | null {
  const base = prefix.replace(/\/+$/, '');
  const p = path.replace(/\/+$/, '');
  if (!base || !p.startsWith(`${base}/`)) return null;
  const parts = p.slice(base.length + 1).split('/');
  if (!parts.length || parts.length > 2 || parts.some((x) => !x)) return null;
  const dec = (s: string) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return null;
    }
  };
  const slug = dec(parts[0]!);
  const colour = parts[1] !== undefined ? dec(parts[1]) : null;
  if (!slug || (parts[1] !== undefined && !colour)) return null;
  return { slug, colour };
}

/** The colour's own address (`/p/<slug>/<colour>`). */
export function colourPath(productPath: string, colourKey: string): string {
  return `${productPath.replace(/\/+$/, '')}/${encodeURIComponent(colourKey)}`;
}

// ---- the choice ----

export const colourKeyOf = (v: Pick<PdpVariant, 'colour'>) => v.colour ?? NO_COLOUR;

/** Pieces of a colour (every size), or of a colour in one size. */
export function stockOf(m: Pick<PdpModel, 'variants'>, colour: string | null, size?: string | null): number {
  const c = colour ?? NO_COLOUR;
  return m.variants.filter((v) => colourKeyOf(v) === c && (size === undefined || v.size === size)).reduce((s, v) => s + v.stock, 0);
}

/** The colour the page opens on: the one asked for (`?color=` or the colour's address), else the first in stock, else the first. */
export function openingColour(m: Pick<PdpModel, 'colours' | 'variants'>, asked: string | null | undefined): string | null {
  if (!m.colours.length) return null;
  if (asked && m.colours.some((c) => c.key === asked)) return asked;
  return (m.colours.find((c) => stockOf(m, c.key) > 0) ?? m.colours[0]!).key;
}

/** A one-size product (no chart or a single size): the size is chosen for the shopper (demo pdp_isOne). */
export function isOneSize(m: Pick<PdpModel, 'sizes'>): boolean {
  return m.sizes.length <= 1;
}

/** The size to keep after a colour change: none when it is sold out in the new colour (demo pdp_state). */
export function keepSize(m: Pick<PdpModel, 'variants' | 'sizes'>, colour: string | null, size: string | null): string | null {
  if (isOneSize(m)) return m.sizes[0]?.key ?? null;
  return size && stockOf(m, colour, size) > 0 ? size : null;
}

/** The variant a choice buys, when it can be bought. */
export function variantFor(m: Pick<PdpModel, 'variants' | 'sizes' | 'onSale'>, choice: PdpChoice): PdpVariant | null {
  if (!m.onSale) return null;
  const c = choice.colour ?? NO_COLOUR;
  const size = isOneSize(m) ? (m.sizes[0]?.key ?? null) : choice.size;
  const v = m.variants.find((x) => colourKeyOf(x) === c && x.size === size);
  return v && v.stock > 0 ? v : null;
}

/** The price the page shows: the chosen variant's, else the lowest in the colour, else the lowest of the product. */
export function priceFor(m: Pick<PdpModel, 'variants' | 'prices' | 'sizes' | 'onSale'>, choice: PdpChoice): PdpPrice | null {
  const v = variantFor(m, choice) ?? m.variants.find((x) => colourKeyOf(x) === (choice.colour ?? NO_COLOUR) && x.size === choice.size);
  if (v) return m.prices[v.price] ?? null;
  const pool = m.variants.filter((x) => colourKeyOf(x) === (choice.colour ?? NO_COLOUR));
  const list = (pool.length ? pool : m.variants).map((x) => m.prices[x.price]).filter((p): p is PdpPrice => !!p);
  return list.sort((a, b) => a.minor - b.minor)[0] ?? null;
}

// ---- the words of the head ----

/** The title split before its last word, so the heart rides right after it (D3.5 round 15). */
export function nameParts(name: string): [string, string] {
  const s = name.trim();
  const i = s.lastIndexOf(' ');
  return i > 0 ? [s.slice(0, i + 1), s.slice(i + 1)] : ['', s];
}

/** Fill `{slots}` (the client parts get the dictionary's words with their slots still in them). */
export function fillWords(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** A number in the page's digits. */
export function digitsOf(n: number | string, bn: boolean): string {
  return bn ? String(n).replace(/[0-9]/g, (d) => String.fromCharCode(0x09e6 + Number(d))) : String(n);
}

/**
 * Words with their bold parts: the dictionary marks them `**like this**`, so each language puts the stress where its
 * own word order needs it ("**72-hour** size swap", "**৭২ ঘণ্টায়** সাইজ বদল").
 */
export function boldParts(text: string): { text: string; b: boolean }[] {
  return text
    .split('**')
    .map((t, i) => ({ text: t, b: i % 2 === 1 }))
    .filter((p) => p.text);
}

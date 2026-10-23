// PR 91–95, 102, 103 — the combo pages' model, shared by the server pages and the combo page's client part: what the
// client part is handed (ComboEnv: the pieces with their colours, sizes, measurements and pictures, the slots and live
// variants, the price table, the words in the page's language) and the small pure rules the pages draw with — which
// picture each gallery view shows, the WhatsApp question, the landing page's rows (demo ca_L3, D-038 packing) and the
// product page's set offer line. No server imports; the picking rules themselves are @extas/combos/page-model.
import type { PickState, PriceCell, SetCard, SetCardRule, SetSlot, VariantStock } from '@extas/combos/page-model';
import type { PdpShot } from './product-model';
import type { GarmentView } from './garment-art';
import type { ShopLang } from './lang';

/** The gallery's views (demo cb_gallery VIEWS): the whole set, then the chosen piece from each side and in daylight. */
export const COMBO_VIEWS = ['set', 'front', 'back', 'detail', 'flat'] as const;
export type ComboView = (typeof COMBO_VIEWS)[number];
export type PieceView = Exclude<ComboView, 'set'>;

export interface ComboColour {
  id: string;
  key: string;
  name: string;
  hex: string;
  /** The owner's note on the colour ("Deep navy, can look almost black in low light"). */
  note: string | null;
  /** Some allowed size is in stock in it. */
  open: boolean;
}

export interface ComboPiece {
  slot: number;
  productId: string;
  name: string;
  /** The product's own page (a picture tap stays on this page; the name is not a way out, demo R16). */
  href: string | null;
  garment: string | null;
  fit: string | null;
  /** "Polo", "Chino", "Polo 2" — the step's name (C2). */
  label: string;
  colours: ComboColour[];
  sizes: { id: string; label: string }[];
  /** The chosen size's measurements (by size id), with the chart's field names, or null. */
  chart: { fields: string[]; rows: Record<string, { inch: (number | null)[]; cm: (number | null)[] }> } | null;
  /** Each colour's picture per view (by colour id): the owner's photo, else the drawing of that view. */
  shots: Record<string, Record<PieceView, PdpShot>>;
}

export interface ComboEnv {
  lang: ShopLang;
  bnDigits: boolean;
  currency: string;
  layout: 'C1' | 'C2';
  comboId: string;
  slug: string;
  name: string;
  needsMix: boolean;
  onSale: boolean;
  autoApply: boolean;
  slots: SetSlot[];
  variants: VariantStock[];
  prices: Record<string, PriceCell> | null;
  /** The first draw's price (the summary's), until the picks have their own. */
  firstPrice: PriceCell;
  inBag: Record<string, number>;
  editGroupKey: string | null;
  initial: PickState;
  pieces: ComboPiece[];
  pairs: { colourIds: string[]; href: string | null }[];
  /** `combo.*` words in the page's language, {slots} left open. */
  words: Record<string, string>;
  /** What a set still needs (@extas/combos set words), in the page's language. */
  problems: Record<string, string>;
  itemWords: string;
  hrefs: { bag: string; checkout: string };
  /** `bag.addBehaviour`: the phone keeps its message (demo D-028) unless the shop goes straight to the bag. */
  behaviour: 'sheet' | 'toast' | 'page';
  /** The shop's WhatsApp number (`contact.whatsapp`), or null: no WhatsApp button. */
  whatsapp: string | null;
  store: string;
  parts: { summary: boolean; whatsapp: boolean; itemPrices: boolean };
  /** "Only N left" from this many down (`bag.lowStockAt`). */
  lowStockAt: number;
}

/** A word of the page (`combo.<key>`), its {slots} filled. */
export const wordOf = (words: Readonly<Record<string, string>>, key: string, vars: Readonly<Record<string, string | number>> = {}): string =>
  (words[`combo.${key}`] ?? `combo.${key}`).replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

/** The colour names of the picks, "Navy + Khaki". */
export function colourNames(pieces: readonly Pick<ComboPiece, 'colours'>[], colours: readonly (string | null)[]): string {
  return pieces.map((p, i) => p.colours.find((c) => c.id === colours[i])?.name ?? '').filter(Boolean).join(' + ');
}

/** Which of a colour's pictures each view shows: its own photo of that side, else the drawing of that view. */
export function viewShots(colourKey: string, shots: readonly PdpShot[]): Record<PieceView, PdpShot> {
  const pick = (kinds: readonly PdpShot['kind'][], draw: GarmentView): PdpShot => shots.find((s) => s.photo && kinds.includes(s.kind)) ?? { id: `draw-${colourKey}-${draw}`, kind: kinds[0]!, photo: null, draw };
  return {
    front: shots.find((s) => s.photo && s.kind === 'front') ?? shots.find((s) => s.photo && s.kind !== 'back') ?? { id: `draw-${colourKey}-front`, kind: 'front', photo: null, draw: 'front' },
    back: pick(['back'], 'back'),
    detail: pick(['detail', 'fabric'], 'detail'),
    flat: pick(['trueColour', 'flat'], 'flat'),
  };
}

/** The step names: the piece's own label, numbered when it repeats ("Polo 1", "Polo 2"). */
export function stepLabels(labels: readonly string[], num: (n: number) => string): string[] {
  const count = new Map<string, number>();
  for (const l of labels) count.set(l, (count.get(l) ?? 0) + 1);
  const seen = new Map<string, number>();
  return labels.map((l) => {
    if ((count.get(l) ?? 0) < 2) return l;
    const k = (seen.get(l) ?? 0) + 1;
    seen.set(l, k);
    return `${l} ${num(k)}`;
  });
}

/** A whole-number percentage of a saving (the price box's "(12%)"), 0 without a regular price. */
export const savePct = (saving: number, regular: number | null): number => (regular && regular > 0 && saving > 0 ? Math.round((saving / regular) * 100) : 0);

// ---------------------------------------------------------------------------------------------------------------
// PR 103 · the sets landing page's rows (demo ca_L3) and their desktop packing (D-038, ca_railPack)
// ---------------------------------------------------------------------------------------------------------------

export type RailKind = 'packs' | 'topBottom';

export interface HubGroup {
  key: string;
  ruleId: string | null;
  cards: SetCard[];
}

export interface HubRail<T> {
  key: string;
  kind: RailKind;
  /** For `packs`: the pieces in each pack. */
  pieces: number;
  items: T[];
}

/**
 * The landing page's rows, in the demo's order: one row of packs per piece count (one product, or a rule pairing
 * the same style), then the top + bottom and mixed sets (a rule pairing across styles, or a fixed set of different
 * products). A season shows the rules of that season and every set without one.
 */
export function hubRails(groups: readonly HubGroup[], rules: readonly SetCardRule[], season: string | null): HubRail<HubGroup>[] {
  const ruleOf = new Map(rules.map((r) => [r.id, r]));
  const packs = new Map<number, HubGroup[]>();
  const mixed: HubGroup[] = [];
  for (const g of groups) {
    const rule = g.ruleId ? ruleOf.get(g.ruleId) : undefined;
    if (season && rule?.season && rule.season !== season) continue;
    const first = g.cards[0]!;
    const one = new Set(first.productIds).size === 1;
    if (rule ? rule.pairing !== 'ACROSS' && one : one) packs.set(first.productIds.length, [...(packs.get(first.productIds.length) ?? []), g]);
    else mixed.push(g);
  }
  return [
    ...[...packs.entries()].sort((a, b) => a[0] - b[0]).map(([n, items]) => ({ key: `packs-${n}`, kind: 'packs' as const, pieces: n, items })),
    ...(mixed.length ? [{ key: 'topBottom', kind: 'topBottom' as const, pieces: 0, items: mixed }] : []),
  ];
}

/** The seasons that have a rule of their own (the tabs show only when there are two or more). */
export function hubSeasons(groups: readonly HubGroup[], rules: readonly SetCardRule[], keys: readonly string[]): string[] {
  const used = new Set(groups.flatMap((g) => (g.ruleId ? [rules.find((r) => r.id === g.ruleId)?.season ?? null] : [])).filter(Boolean));
  return keys.filter((k) => used.has(k));
}

export interface Packed {
  key: string;
  /** Columns of the four the row takes on a computer. */
  span: number;
  order: number;
  /** More than four cards: the row scrolls sideways four at a time. */
  many: boolean;
  n: number;
}

/**
 * D-038 · on a computer the rows share lines of four columns: a later row that fits the room left in a line moves up
 * into it, and a line with room still left lets its last row's cards stretch to the edge. The phone ignores it.
 */
export function packRails(rails: readonly { key: string; count: number }[], columns = 4): Packed[] {
  const queue = rails.map((r) => ({ key: r.key, n: Math.min(r.count, columns), many: r.count > columns }));
  const lines: { free: number; items: (typeof queue)[number][] }[] = [];
  while (queue.length) {
    const first = queue.shift()!;
    const line = { free: columns - first.n, items: [first] };
    for (let i = 0; i < queue.length && line.free > 0; ) {
      if (queue[i]!.n <= line.free) {
        line.free -= queue[i]!.n;
        line.items.push(queue.splice(i, 1)[0]!);
      } else i++;
    }
    lines.push(line);
  }
  const out: Packed[] = [];
  let order = 0;
  for (const line of lines) {
    line.items.forEach((r, i) => out.push({ key: r.key, n: r.n, many: r.many, span: r.n + (i === line.items.length - 1 ? line.free : 0), order: order++ }));
  }
  return rails.map((r) => out.find((p) => p.key === r.key)!);
}

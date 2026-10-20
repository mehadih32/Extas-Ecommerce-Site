// PR 89 — the combo model, pure (no database): what a combo is made of, when it is on sale, and what a set costs.
//
// A combo is a set of pieces sold together for one set price:
//   - a FIXED combo (PR 89, 90) is put together by hand: its slots name a product (and the colours a customer may pick
//     for it, or one fixed variant), how many of it, and the set price;
//   - a generated combo (PR 571, the owner's model) is one pair (or triple) an auto colour-pair rule made; its price
//     comes from the rule: a fixed amount a pack, or a share off the regular total.
// The words and the price are one decision: what a combo says it costs is what this module works out, and every place
// (admin preview, combo page, bag, checkout) asks this same code, so the same pieces always cost the same.
//
// The price rules (owner, CN-009 and audit R16):
//   - the regular total is the sum of the pieces' own prices; a piece without a price makes the set unsellable;
//   - a set is never charged above its regular total: a set price at or above it is no offer — the customer pays the
//     regular total and no saving or set price shows anywhere;
//   - a "% off" price is rounded by the store's rounding step and direction (settings `combos.price.*`);
//   - the struck "was" price is only ever the regular total, and only through the honesty guard (summary.ts).
// Money is integer minor units (paisa) throughout.
import { z } from 'zod';

// ---------------------------------------------------------------------------------------------------------------
// When a combo is on sale
// ---------------------------------------------------------------------------------------------------------------

/** The status as stored (ComboStatus). RUNNING = switched on; PAUSED = switched off; ENDED = ended by hand. */
export const COMBO_STATUSES = ['DRAFT', 'RUNNING', 'PAUSED', 'SOLD_OUT', 'ENDED'] as const;
export type ComboStatusName = (typeof COMBO_STATUSES)[number];

/**
 * The state customers and the admin see (demo ca_stateOf, owner 11:51):
 *   live  — on sale; soon — switched on, before its start; ended — after its end, or ended by hand;
 *   off   — switched off (exactly like ended for customers); draft — never switched on yet.
 * Ended and off sit in the admin's Archive; their pages still open in the ended state (no link dies).
 */
export type ComboState = 'live' | 'soon' | 'ended' | 'off' | 'draft';

export interface Windowed {
  status: ComboStatusName;
  startsAt: Date | null;
  endsAt: Date | null;
}

export function comboState(c: Windowed, now: Date): ComboState {
  if (c.status === 'DRAFT') return 'draft';
  if (c.status === 'PAUSED') return 'off';
  if (c.status === 'ENDED') return 'ended';
  if (c.startsAt && c.startsAt > now) return 'soon';
  // The end is exclusive: the admin's "Ends" date is stored as the start of the next day in the store's time zone,
  // so the end date itself still sells.
  if (c.endsAt && c.endsAt <= now) return 'ended';
  return 'live';
}

export const isArchivedState = (s: ComboState) => s === 'ended' || s === 'off';

// ---------------------------------------------------------------------------------------------------------------
// Days in the store's time zone (the admin types dates; the database keeps instants)
// ---------------------------------------------------------------------------------------------------------------

export const ymdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'a date like 2026-10-20' });

/** The offset (ms) of a time zone at an instant. */
function zoneOffset(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(at);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour') % 24, n('minute'), n('second')) - Math.floor(at.getTime() / 1000) * 1000;
}

/** 00:00 of the day in the time zone, as an instant. */
export function dayStart(ymd: string, timeZone: string): Date {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d);
  const first = guess - zoneOffset(new Date(guess), timeZone);
  return new Date(guess - zoneOffset(new Date(first), timeZone));
}

/** The calendar day (YYYY-MM-DD) of an instant in the time zone. */
export function ymdIn(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
  const v = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${v('year')}-${v('month')}-${v('day')}`;
}

export const nextDay = (ymd: string): string => {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

/** The admin's "Starts" and "Ends" days as the stored window: from the start of the first day to the start of the day after the last. */
export function windowFromDays(startsOn: string | null | undefined, endsOn: string | null | undefined, timeZone: string): { startsAt: Date | null; endsAt: Date | null } {
  return { startsAt: startsOn ? dayStart(startsOn, timeZone) : null, endsAt: endsOn ? dayStart(nextDay(endsOn), timeZone) : null };
}

/** And back: the days the admin shows for a stored window. */
export function daysFromWindow(w: { startsAt: Date | null; endsAt: Date | null }, timeZone: string): { startsOn: string | null; endsOn: string | null } {
  return { startsOn: w.startsAt ? ymdIn(w.startsAt, timeZone) : null, endsOn: w.endsAt ? ymdIn(new Date(w.endsAt.getTime() - 1), timeZone) : null };
}

// ---------------------------------------------------------------------------------------------------------------
// What a set costs
// ---------------------------------------------------------------------------------------------------------------

export type Rounding = 'down' | 'nearest' | 'up';

export interface RoundingRule {
  stepMinor: number;
  direction: Rounding;
}

/** A combo's price rule: a fixed set price, or a share off the regular total (auto rules). */
export type PriceRule = { mode: 'FIXED'; setMinor: number | null } | { mode: 'PERCENT'; percentOff: number | null };

export type PricingReason =
  /** A real offer: the set costs less than its pieces. */
  | 'OFFER'
  /** The set price is at or above the regular total: the regular total is charged, no saving shown (R16 (5)). */
  | 'NOT_LOWER'
  /** No set price (or share) set yet. */
  | 'NO_SET_PRICE'
  /** A piece has no price: the set cannot be sold. */
  | 'PIECE_NO_PRICE';

export interface SetPricing {
  /** Sum of the pieces' own prices; null when a piece has none. */
  regularMinor: number | null;
  /** What the customer pays for the set; null = not sellable. */
  payMinor: number | null;
  /** regular − pay (0 when there is no offer). */
  savingMinor: number;
  /** The saving as a whole percentage of the regular total, rounded down (never overstated). */
  savingPercent: number;
  offer: boolean;
  reason: PricingReason;
}

/** Nothing saved. */
const NONE = 0;

export function roundMinor(v: number, r: RoundingRule): number {
  const step = Math.max(1, Math.trunc(r.stepMinor));
  const q = v / step;
  const n = r.direction === 'down' ? Math.floor(q) : r.direction === 'up' ? Math.ceil(q) : Math.round(q);
  return n * step;
}

/** The regular total of pieces: each piece's own price × its quantity; null when any piece has no price. */
export function regularOf(pieces: readonly { priceMinor: number | null; quantity: number }[]): number | null {
  if (!pieces.length || pieces.some((p) => p.priceMinor === null || p.priceMinor < 0)) return null;
  return pieces.reduce((s, p) => s + p.priceMinor! * p.quantity, 0);
}

/** The one place a set price is worked out (every screen and the bag call this). */
export function setPricing(rule: PriceRule, pieces: readonly { priceMinor: number | null; quantity: number }[], rounding: RoundingRule): SetPricing {
  const regular = regularOf(pieces);
  if (regular === null) return { regularMinor: null, payMinor: null, savingMinor: NONE, savingPercent: NONE, offer: false, reason: 'PIECE_NO_PRICE' };
  let set: number | null;
  if (rule.mode === 'FIXED') set = rule.setMinor;
  else set = rule.percentOff === null || rule.percentOff <= 0 ? null : roundMinor((regular * (100 - rule.percentOff)) / 100, rounding);
  if (set === null || set <= 0) return { regularMinor: regular, payMinor: null, savingMinor: NONE, savingPercent: NONE, offer: false, reason: 'NO_SET_PRICE' };
  if (set >= regular) return { regularMinor: regular, payMinor: regular, savingMinor: NONE, savingPercent: NONE, offer: false, reason: 'NOT_LOWER' };
  const saving = regular - set;
  return { regularMinor: regular, payMinor: set, savingMinor: saving, savingPercent: Math.floor((saving * 100) / regular), offer: true, reason: 'OFFER' };
}

/** "৳X each" on cards and tier boxes: the set price over its pieces, rounded down (display only — the order keeps the real piece prices and one set discount line, never an even split). */
export const eachMinor = (payMinor: number, pieces: number): number => Math.floor(payMinor / Math.max(1, pieces));

// ---------------------------------------------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------------------------------------------

export const comboSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'small letters, digits and single dashes' });

const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const money = z.int().min(1).max(100_000_000);

export const FIXED_COMBO_TYPES = ['FIXED_SET', 'TOP_BOTTOM', 'MIXED_SET', 'FIXED_COLOUR_PACK', 'COLOUR_PAIR'] as const;
export const LIST_TEMPLATES = ['L1', 'L2', 'L3', 'L4', 'L5'] as const;
export const PAGE_TEMPLATES = ['auto', 'P1', 'P2', 'P3', 'P4', 'P5'] as const;
export const BAG_TEMPLATES = ['current', 'B1', 'B2', 'B3', 'B4', 'B5'] as const;

const templateOf = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values).nullish().transform((v) => v ?? null);

export const comboItemInputSchema = z
  .object({
    productId: z.uuid(),
    /** The colours a customer may pick for this slot; empty = any colour of the product. */
    colourIds: z.array(z.uuid()).max(40).default([]),
    /** The sizes allowed; empty = any size of the product. */
    sizeIds: z.array(z.uuid()).max(40).default([]),
    /** One exact variant (a fixed colour and size); then no choice is offered. */
    fixedVariantId: z.uuid().nullish().transform((v) => v ?? null),
    quantity: z.int().min(1).max(10).default(1),
    labelEn: optText(60),
    labelBn: optText(60),
  })
  .strict();
export type ComboItemInput = z.input<typeof comboItemInputSchema>;

export const fixedComboInputSchema = z
  .object({
    slug: comboSlugSchema,
    nameEn: text(120).min(1),
    nameBn: optText(120),
    descriptionEn: optText(300),
    descriptionBn: optText(300),
    type: z.enum(FIXED_COMBO_TYPES).default('FIXED_SET'),
    items: z.array(comboItemInputSchema).min(1).max(8),
    /** The set price (owner data; needs `combos.prices`). Null = not priced yet. */
    setPriceMinor: money.nullish().transform((v) => v ?? null),
    autoApply: z.boolean().default(false),
    sameColour: z.boolean().default(false),
    startsOn: ymdSchema.nullish().transform((v) => v ?? null),
    endsOn: ymdSchema.nullish().transform((v) => v ?? null),
    listTemplateKey: templateOf(LIST_TEMPLATES),
    pageTemplateKey: templateOf(PAGE_TEMPLATES),
    bagTemplateKey: templateOf(BAG_TEMPLATES),
    isFeatured: z.boolean().default(false),
  })
  .strict()
  .refine((v) => v.items.reduce((s, i) => s + i.quantity, 0) >= 2, { message: 'a combo has at least two pieces', path: ['items'] })
  .refine((v) => !v.startsOn || !v.endsOn || v.endsOn >= v.startsOn, { message: 'the end is before the start', path: ['endsOn'] });
export type FixedComboInput = z.input<typeof fixedComboInputSchema>;
export type FixedComboData = z.output<typeof fixedComboInputSchema>;

/** Total pieces of a combo's slots. */
export const pieceCountOf = (items: readonly { quantity: number }[]) => items.reduce((s, i) => s + i.quantity, 0);

/** Why a combo cannot go on sale (empty = it can): the codes the admin turns into text. */
export function readiness(c: { setPriceMinor: number | null; items: readonly { productId: string | null; quantity: number }[]; pieces: readonly { priceMinor: number | null }[] }): string[] {
  const out: string[] = [];
  if (pieceCountOf(c.items) < 2) out.push('NO_PIECES');
  if (c.items.some((i) => !i.productId)) out.push('NO_PRODUCT');
  if (c.setPriceMinor === null) out.push('NO_SET_PRICE');
  c.pieces.forEach((p, i) => {
    if (p.priceMinor === null) out.push(`PIECE_NO_PRICE@${i + 1}`);
  });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// PR 571 · an auto colour-pair rule (the owner's model)
// ---------------------------------------------------------------------------------------------------------------

export const RULE_PAIRINGS = ['STYLE', 'ACROSS', 'ANY'] as const;
export const RULE_SORTS = ['BESTSELLERS', 'COLOUR'] as const;
export const PRICE_MODES = ['FIXED', 'PERCENT'] as const;
/** A rule makes pairs or triples (demo: "2-piece" or "3-piece"). */
export const RULE_PIECES = [2, 3] as const;

/** How a pack is priced: a fixed amount a pack, or a share off the regular total (the limit is a setting). */
export const packPriceSchema = z
  .object({
    priceMode: z.enum(PRICE_MODES).default('PERCENT'),
    priceMinor: money.nullish().transform((v) => v ?? null),
    percentOff: z.int().min(1).max(99).nullish().transform((v) => v ?? null),
  })
  .strict();
export type PackPrice = z.output<typeof packPriceSchema>;

/** A rule's combo hub page on the shop (the storefront route, S03 PR 572–573), from its fixed key. */
export const rulePath = (key: string) => `/combos/${key}`;

/** The rule's fields (no cross-field checks: `pick` and `partial` work on it). */
export const autoRuleShape = z
  .object({
    /** The rule's link `/combos/<key>`: fixed once made. */
    key: comboSlugSchema,
    nameEn: text(120).min(1),
    nameBn: optText(120),
    /** The style name on the cards; empty = from the products. */
    titleEn: optText(80),
    titleBn: optText(80),
    categoryIds: z.array(z.uuid()).max(50).default([]),
    productIds: z.array(z.uuid()).max(200).default([]),
    pieces: z.union([z.literal(2), z.literal(3)]).default(2),
    pairing: z.enum(RULE_PAIRINGS).default('STYLE'),
    sameColour: z.boolean().default(false),
    excludeColourIds: z.array(z.uuid()).max(300).default([]),
    priceMode: z.enum(PRICE_MODES).default('PERCENT'),
    priceMinor: money.nullish().transform((v) => v ?? null),
    percentOff: z.int().min(1).max(99).nullish().transform((v) => v ?? null),
    sortMode: z.enum(RULE_SORTS).default('BESTSELLERS'),
    pinnedKeys: z.array(z.string().min(1).max(600)).max(50).default([]),
    season: z.string().trim().max(40).nullish().transform((v) => v || null),
    listTemplateKey: templateOf(LIST_TEMPLATES),
    pageTemplateKey: templateOf(PAGE_TEMPLATES),
    bagTemplateKey: templateOf(BAG_TEMPLATES),
    noSinglePiece: z.boolean().default(true),
    startsOn: ymdSchema.nullish().transform((v) => v ?? null),
    endsOn: ymdSchema.nullish().transform((v) => v ?? null),
    /** "Add 1 more → 3 pcs" (2-piece rules): the 3-piece rule's price and name; null = not offered. */
    upsell: packPriceSchema
      .extend({ nameEn: text(120).min(1), nameBn: optText(120) })
      .nullish()
      .transform((v) => v ?? null),
  })
  .strict();

export const autoRuleInputSchema = autoRuleShape
  .refine((v) => v.categoryIds.length + v.productIds.length > 0, { message: 'choose at least one category or product', path: ['categoryIds'] })
  .refine((v) => !v.startsOn || !v.endsOn || v.endsOn >= v.startsOn, { message: 'the end is before the start', path: ['endsOn'] })
  .refine((v) => !v.upsell || v.pieces === 2, { message: '"add 1 more" is for 2-piece rules', path: ['upsell'] });
export type AutoRuleInput = z.input<typeof autoRuleInputSchema>;
export type AutoRuleData = z.output<typeof autoRuleInputSchema>;

/** The price rule of a pack price. */
export const packRule = (p: { priceMode: 'FIXED' | 'PERCENT'; priceMinor: number | null; percentOff: number | null }): PriceRule =>
  p.priceMode === 'FIXED' ? { mode: 'FIXED', setMinor: p.priceMinor } : { mode: 'PERCENT', percentOff: p.percentOff };

/** A pack price is set (FIXED with an amount, PERCENT with a share). */
export const packPriced = (p: { priceMode: 'FIXED' | 'PERCENT'; priceMinor: number | null; percentOff: number | null }) => (p.priceMode === 'FIXED' ? p.priceMinor !== null : p.percentOff !== null);

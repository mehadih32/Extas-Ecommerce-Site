// CN-018 (4) · PR 89 follow-up (registry version 98, lane C's range; SIM-F-051) — sets "Fixed" or "Flexible": what
// happens at the door, on a return and on the courier's sticker when only some pieces of a set stay with the customer.
// - A **Fixed set** is kept or returned whole: a partial delivery or a return that splits it is refused, and the
//   sticker and booking note tell the rider "deliver whole".
// - A **Flexible set** may split; its split-price rule decides what the kept pieces cost: PRO_RATA (their share of the
//   set price, as before this setting) or OWN_PRICE (each kept piece at its own price, the set saving lost); and,
//   when `chargeUnderFreeLimit` is on, a free-delivery order whose kept part falls under the free-delivery limit owes
//   the delivery charge too. Both are only the rider's expected amount on a door record that a person approves.
// Each set may override the store's mode and rule (Combo.splitMode / splitPriceRule, migration 0073; null = the store's
// default). Off as shipped: nothing changes until the owner switches it on (CLAUDE.md rule 6, CN-018 standing rule).
// Labels: messages/combo-split.<lang>.json.
import { z } from 'zod';
import { setting } from './define';

const V89F = 98;

export const SET_SPLIT_MODES = ['FIXED', 'FLEXIBLE'] as const;
export type SetSplitMode = (typeof SET_SPLIT_MODES)[number];
export const SET_SPLIT_PRICE_RULES = ['PRO_RATA', 'OWN_PRICE'] as const;
export type SetSplitPriceRule = (typeof SET_SPLIT_PRICE_RULES)[number];

export const comboSplitSchema = z
  .object({
    enabled: z.boolean(),
    /** The mode of a set that has none of its own. */
    defaultMode: z.enum(SET_SPLIT_MODES),
    /** The split-price rule of a flexible set that has none of its own. */
    priceRule: z.enum(SET_SPLIT_PRICE_RULES),
    /** A free-delivery order whose kept part falls under the free-delivery limit owes the delivery charge. */
    chargeUnderFreeLimit: z.boolean(),
  })
  .strict();
export type ComboSplitSettings = z.output<typeof comboSplitSchema>;

export const comboSplitSettings = {
  'combos.split': setting({
    scope: 'store',
    group: 'combos',
    valueType: 'JSON',
    isOwnerData: false,
    isPublic: false,
    schema: comboSplitSchema,
    default: { enabled: false, defaultMode: 'FLEXIBLE', priceRule: 'PRO_RATA', chargeUnderFreeLimit: false },
    labelKey: 'combos.split.label',
    helpKey: 'combos.split.help',
    sortOrder: 270,
    version: V89F,
  }),
};

/** One set's own choice (null = the store's default). */
export interface SetSplitRow {
  splitMode: string | null;
  splitPriceRule: string | null;
}

/** How one set splits, after the store's defaults; null while the owner's setting is off (today's pro-rata split). */
export interface SetSplit {
  mode: SetSplitMode;
  priceRule: SetSplitPriceRule;
  chargeUnderFreeLimit: boolean;
}

const isMode = (v: string | null): v is SetSplitMode => !!v && (SET_SPLIT_MODES as readonly string[]).includes(v);
const isRule = (v: string | null): v is SetSplitPriceRule => !!v && (SET_SPLIT_PRICE_RULES as readonly string[]).includes(v);

/** The set's mode and rule: its own where it has one, else the store's; null while `combos.split` is off. */
export function setSplitOf(row: SetSplitRow, s: ComboSplitSettings): SetSplit | null {
  if (!s.enabled) return null;
  return { mode: isMode(row.splitMode) ? row.splitMode : s.defaultMode, priceRule: isRule(row.splitPriceRule) ? row.splitPriceRule : s.priceRule, chargeUnderFreeLimit: s.chargeUnderFreeLimit };
}

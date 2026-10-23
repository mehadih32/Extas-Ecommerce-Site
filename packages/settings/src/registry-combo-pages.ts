// S03 · the combo storefront — PR 91–95, 102, 103 (Blueprint D8.1–D8.4; demo 40-combo.js, 42-combo-auto.js ca_L3,
// 30-product.js pdp_nudges). Registry version 30 (the customer accounts took 29). Labels: messages/combo-pages.<lang>.json.
// Every word the pages show is in the shop dictionary (apps/web/messages/shop-combo.<lang>.json, `combo.*`), editable
// in both languages through `language.labels`.
//
// Nothing here holds money or a perk: the set prices are the owner's, per combo or per rule (`combos.prices`), and a
// struck price is only ever the separate prices' sum, behind `rules.discount.showWasPrice` (CN-009). These settings
// only say how the pages look and how much they show, with the demo's own defaults. A claim about the shop's policy
// that the demo makes ("Exchange one item or the whole set — the set price stays") ships off until the owner says so
// (CN-018).
import { z } from 'zod';
import { setting } from './define';

const V = 30;

/** PR 91, 92 — the combo page's picker: C1 one card per piece (the demo's default), C2 step by step. */
export const comboLayoutSchema = z.enum(['C1', 'C2']);

/** PR 94 — popular pairs on a set of one product: on, how many (three to a row: 1, 2, 3 or 6), learned from picks. */
export const comboPopularPairsSchema = z
  .object({
    on: z.boolean(),
    max: z.int().min(1).max(6),
    /** Put the pairs customers really picked first (PopularPair, PR 104). */
    learn: z.boolean(),
    /** Picks a pair needs before it counts as popular. */
    minPicks: z.int().min(1).max(10_000),
  })
  .strict();

/** PR 91 — the parts of the combo page beside the pickers. */
export const comboPagePartsSchema = z
  .object({
    /** "Set summary" on a computer (the demo hides it on a phone). */
    summary: z.boolean(),
    /** "Ask about this set on WhatsApp" (only when the shop has a WhatsApp number). */
    whatsapp: z.boolean(),
    /** The Size exchange · Delivery · Cash on Delivery card (each line only when that rule is on). */
    rules: z.boolean(),
    /** The line "Exchange one item or the whole set — the set price stays": a promise only the owner can make. */
    exchangeLine: z.boolean(),
    /** "Regular price of each item" in the price box (a computer; the phone hides it, as in the demo). */
    itemPrices: z.boolean(),
  })
  .strict();

/** PR 103 — "More sets" under a combo page: on, and how many cards. */
export const comboMoreSetsSchema = z.object({ on: z.boolean(), max: z.int().min(1).max(24) }).strict();

/** PR 103 — the sets landing page /combos (the demo's hub): on, the season tabs, cards per row of sets. */
export const comboLandingSchema = z.object({ on: z.boolean(), seasonTabs: z.boolean(), perRail: z.int().min(1).max(24) }).strict();

/** PR 102 — the matching set offer on the product page: on, and how many sets it names. */
export const comboPdpOfferSchema = z.object({ on: z.boolean(), max: z.int().min(1).max(6) }).strict();

const base = { scope: 'store', isOwnerData: false, isPublic: true, group: 'combos', version: V } as const;

export const comboPageSettings = {
  'combos.page.layout': setting({
    ...base,
    schema: comboLayoutSchema,
    default: 'C1',
    valueType: 'ENUM',
    labelKey: 'combos.page.layout.label',
    helpKey: 'combos.page.layout.help',
    sortOrder: 200,
  }),
  'combos.page.popularPairs': setting({
    ...base,
    schema: comboPopularPairsSchema,
    default: { on: true, max: 6, learn: true, minPicks: 3 },
    valueType: 'JSON',
    labelKey: 'combos.page.popularPairs.label',
    helpKey: 'combos.page.popularPairs.help',
    sortOrder: 210,
  }),
  'combos.page.parts': setting({
    ...base,
    schema: comboPagePartsSchema,
    default: { summary: true, whatsapp: true, rules: true, exchangeLine: false, itemPrices: true },
    valueType: 'JSON',
    labelKey: 'combos.page.parts.label',
    helpKey: 'combos.page.parts.help',
    sortOrder: 220,
  }),
  'combos.page.moreSets': setting({
    ...base,
    schema: comboMoreSetsSchema,
    default: { on: true, max: 12 },
    valueType: 'JSON',
    labelKey: 'combos.page.moreSets.label',
    helpKey: 'combos.page.moreSets.help',
    sortOrder: 230,
  }),
  'combos.landing': setting({
    ...base,
    schema: comboLandingSchema,
    default: { on: true, seasonTabs: true, perRail: 8 },
    valueType: 'JSON',
    labelKey: 'combos.landing.label',
    helpKey: 'combos.landing.help',
    sortOrder: 240,
  }),
  'combos.pdpOffer': setting({
    ...base,
    schema: comboPdpOfferSchema,
    default: { on: true, max: 2 },
    valueType: 'JSON',
    labelKey: 'combos.pdpOffer.label',
    helpKey: 'combos.pdpOffer.help',
    sortOrder: 250,
  }),
};

// S04 · PR 105–114 — the bag (Sawdagor, Shilpi). The bag's lines are rows (Cart, CartItem); its prices, set tiers,
// coupons and free delivery are the Smart Rules' and the combos' (the owner's, with his OK). These settings only hold
// how the bag behaves and what it shows: how long a bag is kept, what a second tap on "Add to bag" does, the
// added-to-bag panel's look and its recommendation fill rule (CN-012), the "take more, pay less" tier box's switch,
// dates and size, the two-sizes card, the code box, the free-delivery progress line and the "Goes well with your bag"
// row. Every word the bag shows is in the shop dictionary (apps/web/messages/shop.<lang>.json, `bag.*`), editable in
// both languages through `language.labels`. Labels: messages/bag.<lang>.json. Registry version 18.
//
// CN-018: nothing here makes a claim on its own. A line that needs a fact (low stock, secure payment, "100% original")
// is off until the owner switches it on, and a line whose data is missing (no live tier, no free-delivery rule, no COD,
// no exchange) is hidden, never invented. No money sits here: every amount comes from the rules and combos engines.
import { z } from 'zod';
import { setting } from './define';

const V = 18;

/** A second tap on "Add to bag" for a variant already in the bag: refuse it ("already in your bag") or add one more. */
export const bagDuplicateSchema = z.enum(['block', 'qty']);
/** What "Add to bag" opens: the added-to-bag panel (phone sheet, desktop drawer), a short toast, or the bag page. */
export const bagAddBehaviourSchema = z.enum(['sheet', 'toast', 'page']);
/** The added-to-bag panel's look (CN-012): the plain panel, or style B (the bag's lines with the new one marked). */
export const bagPanelStyleSchema = z.enum(['default', 'B']);
/** The panel's recommendations (CN-012): as many as fit under the buttons, a fixed number, or none. */
export const bagPanelFillSchema = z.enum(['fit', 'fixed', 'off']);
/** The "Goes well with your bag" row on a desktop: the tier ladder beside the cards ('side'), or the plain row. */
export const bagUpsellStyleSchema = z.enum(['side', 'current']);
/** A calendar day, `YYYY-MM-DD` (read in the store's time zone). */
const daySchema = z.iso.date();

const base = { scope: 'store', isOwnerData: false, group: 'bag', version: V } as const;

export const bagSettings = {
  // ---- PR 105 · the bag itself ----
  'bag.keepDays': setting({
    ...base,
    schema: z.int().min(1).max(365),
    default: 30,
    valueType: 'INT',
    labelKey: 'bag.keepDays.label',
    helpKey: 'bag.keepDays.help',
    sortOrder: 10,
  }),
  'bag.duplicateAdd': setting({
    ...base,
    schema: bagDuplicateSchema,
    default: 'block',
    valueType: 'ENUM',
    labelKey: 'bag.duplicateAdd.label',
    helpKey: 'bag.duplicateAdd.help',
    sortOrder: 20,
  }),
  'bag.repeatGuardMs': setting({
    ...base,
    schema: z.int().min(0).max(10_000),
    default: 1000,
    valueType: 'INT',
    labelKey: 'bag.repeatGuardMs.label',
    helpKey: 'bag.repeatGuardMs.help',
    sortOrder: 30,
  }),
  // ---- PR 106 · the added-to-bag panel (CN-012) ----
  'bag.addBehaviour': setting({
    ...base,
    schema: bagAddBehaviourSchema,
    default: 'sheet',
    valueType: 'ENUM',
    labelKey: 'bag.addBehaviour.label',
    helpKey: 'bag.addBehaviour.help',
    sortOrder: 40,
  }),
  'bag.panel.style': setting({
    ...base,
    schema: bagPanelStyleSchema,
    default: 'B',
    valueType: 'ENUM',
    labelKey: 'bag.panel.style.label',
    helpKey: 'bag.panel.style.help',
    sortOrder: 50,
  }),
  'bag.panel.maxLines': setting({
    ...base,
    schema: z.int().min(0).max(20),
    // 0 = as many as fit; the rest are counted in "+N more items · View bag".
    default: 0,
    valueType: 'INT',
    labelKey: 'bag.panel.maxLines.label',
    helpKey: 'bag.panel.maxLines.help',
    sortOrder: 60,
  }),
  'bag.panel.fill': setting({
    ...base,
    schema: bagPanelFillSchema,
    default: 'fit',
    valueType: 'ENUM',
    labelKey: 'bag.panel.fill.label',
    helpKey: 'bag.panel.fill.help',
    sortOrder: 70,
  }),
  'bag.panel.picks': setting({
    ...base,
    schema: z.int().min(1).max(24),
    default: 12,
    valueType: 'INT',
    labelKey: 'bag.panel.picks.label',
    helpKey: 'bag.panel.picks.help',
    sortOrder: 80,
  }),
  'bag.panel.gapPx': setting({
    ...base,
    schema: z.int().min(0).max(64),
    default: 12,
    valueType: 'INT',
    labelKey: 'bag.panel.gapPx.label',
    helpKey: 'bag.panel.gapPx.help',
    sortOrder: 90,
  }),
  // ---- PR 107 · the bag page ----
  'bag.saved.enabled': setting({
    ...base,
    schema: z.boolean(),
    default: true,
    valueType: 'BOOLEAN',
    labelKey: 'bag.saved.enabled.label',
    helpKey: 'bag.saved.enabled.help',
    sortOrder: 100,
  }),
  'bag.undoMs': setting({
    ...base,
    schema: z.int().min(2000).max(30_000),
    default: 6000,
    valueType: 'INT',
    labelKey: 'bag.undoMs.label',
    helpKey: 'bag.undoMs.help',
    sortOrder: 110,
  }),
  'bag.lowStockAt': setting({
    ...base,
    schema: z.int().min(0).max(50),
    // 0 = off (CN-018): "Only 2 left" shows only when the owner picks a number.
    default: 0,
    valueType: 'INT',
    labelKey: 'bag.lowStockAt.label',
    helpKey: 'bag.lowStockAt.help',
    sortOrder: 120,
  }),
  'bag.trust.securePayment': setting({
    ...base,
    schema: z.boolean(),
    default: false,
    valueType: 'BOOLEAN',
    labelKey: 'bag.trust.securePayment.label',
    helpKey: 'bag.trust.securePayment.help',
    sortOrder: 130,
  }),
  'bag.whatsappHelp': setting({
    ...base,
    schema: z.boolean(),
    default: false,
    valueType: 'BOOLEAN',
    labelKey: 'bag.whatsappHelp.label',
    helpKey: 'bag.whatsappHelp.help',
    sortOrder: 140,
  }),
  // ---- PR 109 · the one offer slot and the "take more, pay less" tiers ----
  'bag.offerSlot.enabled': setting({
    ...base,
    schema: z.boolean(),
    default: true,
    valueType: 'BOOLEAN',
    labelKey: 'bag.offerSlot.enabled.label',
    helpKey: 'bag.offerSlot.enabled.help',
    sortOrder: 150,
  }),
  'bag.tiers.enabled': setting({
    ...base,
    schema: z.boolean(),
    default: true,
    valueType: 'BOOLEAN',
    labelKey: 'bag.tiers.enabled.label',
    helpKey: 'bag.tiers.enabled.help',
    sortOrder: 160,
  }),
  'bag.tiers.startsOn': setting({
    ...base,
    schema: daySchema.nullable(),
    default: null,
    valueType: 'STRING',
    labelKey: 'bag.tiers.startsOn.label',
    helpKey: 'bag.tiers.startsOn.help',
    sortOrder: 170,
  }),
  'bag.tiers.endsOn': setting({
    ...base,
    schema: daySchema.nullable(),
    default: null,
    valueType: 'STRING',
    labelKey: 'bag.tiers.endsOn.label',
    helpKey: 'bag.tiers.endsOn.help',
    sortOrder: 180,
  }),
  'bag.tiers.max': setting({
    ...base,
    schema: z.int().min(1).max(4),
    default: 3,
    valueType: 'INT',
    labelKey: 'bag.tiers.max.label',
    helpKey: 'bag.tiers.max.help',
    sortOrder: 190,
  }),
  'bag.tiers.phonePreview': setting({
    ...base,
    schema: z.boolean(),
    default: false,
    valueType: 'BOOLEAN',
    labelKey: 'bag.tiers.phonePreview.label',
    helpKey: 'bag.tiers.phonePreview.help',
    sortOrder: 200,
  }),
  // ---- PR 110 · two sizes of the same product ----
  'bag.twoSizes.enabled': setting({
    ...base,
    schema: z.boolean(),
    default: true,
    valueType: 'BOOLEAN',
    labelKey: 'bag.twoSizes.enabled.label',
    helpKey: 'bag.twoSizes.enabled.help',
    sortOrder: 210,
  }),
  // ---- PR 112 · the code box ----
  'bag.code.enabled': setting({
    ...base,
    schema: z.boolean(),
    default: true,
    valueType: 'BOOLEAN',
    labelKey: 'bag.code.enabled.label',
    helpKey: 'bag.code.enabled.help',
    sortOrder: 220,
  }),
  // ---- PR 113 · free-delivery progress ----
  'bag.freeProgress.enabled': setting({
    ...base,
    schema: z.boolean(),
    default: true,
    valueType: 'BOOLEAN',
    labelKey: 'bag.freeProgress.enabled.label',
    helpKey: 'bag.freeProgress.enabled.help',
    sortOrder: 230,
  }),
  // ---- PR 114 · "Goes well with your bag" ----
  'bag.upsell.enabled': setting({
    ...base,
    schema: z.boolean(),
    default: true,
    valueType: 'BOOLEAN',
    labelKey: 'bag.upsell.enabled.label',
    helpKey: 'bag.upsell.enabled.help',
    sortOrder: 240,
  }),
  'bag.upsell.count': setting({
    ...base,
    schema: z.int().min(1).max(12),
    default: 6,
    valueType: 'INT',
    labelKey: 'bag.upsell.count.label',
    helpKey: 'bag.upsell.count.help',
    sortOrder: 250,
  }),
  'bag.upsell.style': setting({
    ...base,
    schema: bagUpsellStyleSchema,
    default: 'side',
    valueType: 'ENUM',
    labelKey: 'bag.upsell.style.label',
    helpKey: 'bag.upsell.style.help',
    sortOrder: 260,
  }),
  'bag.upsell.reasons': setting({
    ...base,
    schema: z.boolean(),
    default: true,
    valueType: 'BOOLEAN',
    labelKey: 'bag.upsell.reasons.label',
    helpKey: 'bag.upsell.reasons.help',
    sortOrder: 270,
  }),
  'bag.upsell.originalLine': setting({
    ...base,
    schema: z.boolean(),
    default: false,
    valueType: 'BOOLEAN',
    labelKey: 'bag.upsell.originalLine.label',
    helpKey: 'bag.upsell.originalLine.help',
    sortOrder: 280,
  }),
};

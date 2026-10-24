// S08 · exchanges, returns and refused parcels (PR 185–191). Registry version 57. Labels: messages/returns.<lang>.json
// (the Orders group; the admin's place is Orders → Returns & exchanges, ORD-05 of docs/BACKEND-ARCHITECTURE.md §5.3, on
// the new admin shell). The starting lists are under `defaults.orders` there, in both languages; the owner edits them.
//
// The exchange policy itself — on or off, the window in hours from the courier's delivered mark, exchanges per item and
// the excluded categories — stays where it always was (`policy.exchange.*`) and in the live Smart Rules exchange rule
// (PR 211), which wins when it is on. These keys only steer how the engine works.
//
// PR 185 (`orders.exchange.tiers`, `orders.exchange.engine`, `orders.exchange.rootCauses`; Blueprint B1.8): the four
// tiers of what may be offered instead, strictly in order (the first tier with something in stock is the only one
// shown); how many options; the exchange's own number; how many pieces one exchange takes; when a photo is needed for
// "our mistake"; and why a wrong item went out (SIM-F-022: a wrong-item case carries its root cause).
//
// PR 187 (`orders.returns.qc`, `orders.returns.lossReasons`; §6.5.4 D4): Receive & QC — whether a piece that is not the
// SKU expected may be recorded (with a note; what is scanned is what is restocked), whether a "not sellable" piece needs
// a photo, and the reasons a piece cannot be sold again (its loss is recorded at its cost, never sent to ERP stock).
//
// Nothing here moves money, changes a price, a discount or COD, or blocks anyone (CLAUDE.md rule 6). A difference in
// the customer's favour becomes a wallet-credit REQUEST after QC passes; a difference he owes is collected as Cash on
// Delivery on the linked exchange order.
import { z } from 'zod';
import { setting } from './define';
import { ordersDictionaryDefault } from './registry-orders';
import { dictionarySchema } from './schemas';

const V = 57;

const base = { scope: 'store', isOwnerData: false, isPublic: false, group: 'orders', version: V } as const;

const list = dictionarySchema.refine((l) => l.length > 0, { message: 'at least one entry' });

/**
 * PR 185 (B1.8) — the replacement tiers, offered strictly in order (the customer cannot skip one). `sameColour`: tier 1,
 * the same product and colour in the needed size. `otherColours`: tier 2, the same product in other colours.
 * `sameCategory`: tier 3, the same category in the needed size, the same collection first when `collectionFirst`.
 * `otherCategories`: tier 4, other categories, only when the category has nothing. `maxOptions`: how many pieces are
 * offered at most.
 */
export const exchangeTiersSchema = z
  .object({ sameColour: z.boolean(), otherColours: z.boolean(), sameCategory: z.boolean(), collectionFirst: z.boolean(), otherCategories: z.boolean(), maxOptions: z.int().min(1).max(60) })
  .strict();

/** When a photo is needed with "our mistake" (defect, damage, wrong item): never, only when the customer asks (PR 186), or always. */
export const OUR_MISTAKE_PHOTO = ['never', 'customer', 'always'] as const;

/**
 * PR 185 — the engine. `numberPrefix`, `numberStart`: the exchange's own number (the linked exchange order takes the
 * shop's next order number). `maxPieces`: pieces in one exchange. `ourMistakePhoto`: when "our mistake" needs a photo.
 * `rootCauseForWrong`: a wrong item needs its root cause (SIM-F-022). `autoConfirm`: the linked exchange order is
 * confirmed (and sent to the ERP) the moment the exchange is approved, instead of waiting in the confirm queue.
 */
export const exchangeEngineSchema = z
  .object({
    numberPrefix: z
      .string()
      .trim()
      .min(1)
      .max(10)
      .regex(/^[A-Z0-9-]+$/, { message: 'capital letters, digits and hyphens only' }),
    numberStart: z.int().min(1).max(1_000_000_000),
    maxPieces: z.int().min(1).max(50),
    ourMistakePhoto: z.enum(OUR_MISTAKE_PHOTO),
    rootCauseForWrong: z.boolean(),
    autoConfirm: z.boolean(),
  })
  .strict();

/**
 * PR 187 (§6.5.4, D4; SIM-F-022) — Receive & QC. `acceptOtherSku`: a piece whose scanned SKU is not the one expected
 * may still be recorded, with a note (the SKU scanned is what is restocked); off, it is refused until a person fixes the
 * case. `photoForLoss`: a "not sellable" piece needs a photo.
 */
export const returnsQcSchema = z.object({ acceptOtherSku: z.boolean(), photoForLoss: z.boolean() }).strict();

export const returnsSettings = {
  'orders.exchange.tiers': setting({
    ...base,
    valueType: 'JSON',
    schema: exchangeTiersSchema,
    default: { sameColour: true, otherColours: true, sameCategory: true, collectionFirst: true, otherCategories: true, maxOptions: 12 },
    labelKey: 'orders.exchange.tiers.label',
    helpKey: 'orders.exchange.tiers.help',
    sortOrder: 400,
  }),
  'orders.exchange.engine': setting({
    ...base,
    valueType: 'JSON',
    schema: exchangeEngineSchema,
    default: { numberPrefix: 'XC-', numberStart: 1001, maxPieces: 10, ourMistakePhoto: 'customer', rootCauseForWrong: true, autoConfirm: false },
    labelKey: 'orders.exchange.engine.label',
    helpKey: 'orders.exchange.engine.help',
    sortOrder: 401,
  }),
  'orders.exchange.rootCauses': setting({
    ...base,
    valueType: 'JSON',
    schema: list,
    default: ordersDictionaryDefault('exchangeRootCauses'),
    labelKey: 'orders.exchange.rootCauses.label',
    helpKey: 'orders.exchange.rootCauses.help',
    sortOrder: 402,
  }),
  'orders.returns.qc': setting({
    ...base,
    valueType: 'JSON',
    schema: returnsQcSchema,
    default: { acceptOtherSku: true, photoForLoss: false },
    labelKey: 'orders.returns.qc.label',
    helpKey: 'orders.returns.qc.help',
    sortOrder: 403,
  }),
  'orders.returns.lossReasons': setting({
    ...base,
    valueType: 'JSON',
    schema: list,
    default: ordersDictionaryDefault('returnLossReasons'),
    labelKey: 'orders.returns.lossReasons.label',
    helpKey: 'orders.returns.lossReasons.help',
    sortOrder: 404,
  }),
};

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
// PR 189 (`orders.returns.handling`; §6.5.0, §6.5.4): return handling. The owner's policy is that there are no returns
// after receipt (`policy.returns.afterDelivery`, off); this key only says whether the shop's own mistake (a defect, a
// wrong item) may still come back when that policy is off — off by default — and how long after the courier's
// delivered mark (empty = the exchange window).
//
// PR 190 (`orders.exchange.charge`, `orders.exchange.swap`; CN-018 (5), CN-014e, SIM-F-021): who pays the second
// delivery. The customer for his own size choice (the exchange rule's charge for his band, else the fallback figure —
// empty: nothing collected), unless the owner says the shop pays; "your mistake" claims need a photo; which refusal
// reasons allow a linked re-ship in another size after a try-on (and whether that re-ship is free, a perk, off); the
// one-trip size swap (off; its price and areas). Staff waivers are a permission (`returns.waive`), never a setting.
//
// PR 191 (`orders.refused.list`; Blueprint C6 item 4): the refused-parcel list ad audiences leave out (PR 264). Off by
// default; when on, a number whose refusals (not the shop's fault, not re-shipped after a try-on) reach `minRefusals` is
// PROPOSED, and a person decides every entry. Nothing blocks an order, turns COD off or asks for an advance.
//
// Nothing here moves money, changes a price, a discount or COD, or blocks anyone (CLAUDE.md rule 6). A difference in
// the customer's favour becomes a wallet-credit REQUEST after QC passes; a difference he owes is collected as Cash on
// Delivery on the linked exchange order.
import { z } from 'zod';
import { setting } from './define';
import { ordersDictionaryDefault } from './registry-orders';
import { dictionaryKeySchema, dictionarySchema, moneyMinorSchema } from './schemas';

const V = 57;

const base = { scope: 'store', isOwnerData: false, isPublic: false, group: 'orders', version: V } as const;

/** PR 186 (lane C's range): the exchange request from the customer's own account. */
const V186 = 92;

/**
 * PR 186 (`orders.exchange.account`) — the customer asks for the exchange himself, from his order in My account, within
 * the window and the owner's exchange policy (the same engine and checks as staff). Off by default: then the order page
 * shows no exchange button and staff open exchanges as before. `claim`: on a size exchange he may say the shop sent the
 * wrong size, with a note (and a photo when `orders.exchange.charge.claimPhoto` is on); staff decide it. `maxPhotos` and
 * `photoMaxMb`: the photos he may add (a faulty, damaged or wrong item, or a claim).
 */
export const exchangeAccountSchema = z
  .object({ enabled: z.boolean(), claim: z.boolean(), maxPhotos: z.int().min(1).max(10), photoMaxMb: z.int().min(1).max(20) })
  .strict();
export type ExchangeAccountSettings = z.output<typeof exchangeAccountSchema>;

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

/**
 * PR 189 (§6.5.4) — return handling. `ourFaultReturns`: a defect or a wrong item may be sent back after receipt even
 * though returns after delivery are off (`policy.returns.afterDelivery`); off by default. `windowHours`: how long after
 * the courier's delivered mark a return after receipt may be opened; empty = the exchange window
 * (`policy.exchange.windowHours`).
 */
export const returnsHandlingSchema = z.object({ ourFaultReturns: z.boolean(), windowHours: z.int().min(1).max(8_760).nullable() }).strict();

/**
 * PR 190 (CN-018 (5), SIM-F-021) — who pays the second delivery charge. `sizePays`: the customer (his own size choice)
 * or the shop. `fallbackMinor`: the charge when the exchange rule has none for his band (empty: not set, nothing is
 * collected). `claimPhoto`: a "your mistake" claim needs a photo. `reshipRefusals`: refusal reasons (keys of
 * `orders.refusal.reasons`) after which a refused parcel may be re-shipped in another size, linked to the refused order
 * (a try-on); empty = no re-ship. `reshipFree`: that re-ship's delivery is free (a perk, off).
 */
export const exchangeChargeSchema = z
  .object({
    sizePays: z.enum(['customer', 'store']),
    fallbackMinor: moneyMinorSchema.nullable(),
    claimPhoto: z.boolean(),
    reshipRefusals: z.array(dictionaryKeySchema).max(50),
    reshipFree: z.boolean(),
  })
  .strict();

/**
 * PR 190 (CN-014e, idea 17) — the one-trip size swap: the rider brings the new size and takes the old piece in the same
 * trip, at its own price, in the bands listed. Off by default; `chargeMinor` empty = not set (nothing collected).
 */
export const exchangeSwapSchema = z
  .object({ enabled: z.boolean(), chargeMinor: moneyMinorSchema.nullable(), bandKeys: z.array(z.string().trim().min(1).max(60)).max(100) })
  .strict();

/** PR 191 — the refused-parcel list: on or off (off), and how many counted refusals propose a number for it. */
export const refusedListSchema = z.object({ enabled: z.boolean(), minRefusals: z.int().min(1).max(20) }).strict();

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
  'orders.returns.handling': setting({
    ...base,
    valueType: 'JSON',
    schema: returnsHandlingSchema,
    default: { ourFaultReturns: false, windowHours: null },
    labelKey: 'orders.returns.handling.label',
    helpKey: 'orders.returns.handling.help',
    sortOrder: 405,
  }),
  'orders.exchange.charge': setting({
    ...base,
    valueType: 'JSON',
    schema: exchangeChargeSchema,
    default: { sizePays: 'customer', fallbackMinor: null, claimPhoto: true, reshipRefusals: ['size-fit'], reshipFree: false },
    labelKey: 'orders.exchange.charge.label',
    helpKey: 'orders.exchange.charge.help',
    sortOrder: 406,
  }),
  'orders.exchange.swap': setting({
    ...base,
    valueType: 'JSON',
    schema: exchangeSwapSchema,
    default: { enabled: false, chargeMinor: null, bandKeys: [] },
    labelKey: 'orders.exchange.swap.label',
    helpKey: 'orders.exchange.swap.help',
    sortOrder: 407,
  }),
  'orders.refused.list': setting({
    ...base,
    valueType: 'JSON',
    schema: refusedListSchema,
    default: { enabled: false, minRefusals: 2 },
    labelKey: 'orders.refused.list.label',
    helpKey: 'orders.refused.list.help',
    sortOrder: 408,
  }),
  'orders.exchange.account': setting({
    ...base,
    version: V186,
    valueType: 'JSON',
    schema: exchangeAccountSchema,
    default: { enabled: false, claim: true, maxPhotos: 3, photoMaxMb: 5 },
    labelKey: 'orders.exchange.account.label',
    helpKey: 'orders.exchange.account.help',
    sortOrder: 409,
  }),
};

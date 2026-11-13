// S28 · Admin v5 · the Order flow rules (docs/demo/admin-proto-v5/DECISIONS.md "Order flow"). Registry version 300 (PR 664);
// PR 665 and PR 669 add their own keys to this file at their own versions. Labels: messages/order-flow.<lang>.json (Orders
// group; the Rules page of PR 676 shows them under "Order flow"). Every switch ships OFF and every number is empty until
// the owner sets it (CN-018): nothing here is decided in code.
//
// PR 664 — `orders.priceAdjust`: take money off an open order before it is booked (a taka amount, a percent, the customer's
// wallet, or the delivery charge), with a reason from the owner's list. Off as shipped. A role not listed in `roleLimits` has
// a limit of nothing (every adjustment it asks for waits for someone who may approve); a listed role's `null` is "no limit".
// An adjustment is a new ledger line (never an edit) and money or price changes need the owner's PIN above the asker's limit.
import { z } from 'zod';
import { setting } from './define';
import { dictionarySchema } from './schemas';

const V664 = 300;
const V665 = 301;
const V669 = 302;

/** Role keys are lower-case words and dots or hyphens (`order-manager`). */
const roleKeySchema = z
  .string()
  .max(60)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/, { message: 'not a role key' });

/** What one role may take off by itself: a taka amount (minor units) and a percent; `null` is no limit on that side. */
export const priceAdjustLimitSchema = z
  .object({
    amountMinor: z.int().min(0).max(1_000_000_000).nullable(),
    percent: z.int().min(0).max(100).nullable(),
  })
  .strict();
export type PriceAdjustLimit = z.output<typeof priceAdjustLimitSchema>;

export const priceAdjustSchema = z
  .object({
    /** Staff may adjust the price of an open order (off: the buttons are not shown and the service refuses). */
    enabled: z.boolean(),
    /** The reasons the staff pick from (a note is needed with the one keyed `other`). */
    reasons: dictionarySchema.refine((l) => l.length > 0, { message: 'at least one reason' }),
    /** Limits per role key; a role not listed here may take off nothing without approval. */
    roleLimits: z.record(roleKeySchema, priceAdjustLimitSchema),
  })
  .strict();
export type PriceAdjustRule = z.output<typeof priceAdjustSchema>;

export const PRICE_ADJUST_DEFAULT: PriceAdjustRule = {
  enabled: true, // owner's written OK, 13 Nov 2026 (BLOCKED 32): ON; limits stay empty until the owner sets them
  reasons: [
    { key: 'customer-asked', en: 'Customer asked on the call', bn: 'কাস্টমার কলে চেয়েছেন' },
    { key: 'price-match', en: 'Price match', bn: 'দাম মিলিয়ে দেওয়া' },
    { key: 'service-sorry', en: 'Service problem, sorry gesture', bn: 'সার্ভিসে সমস্যা, দুঃখপ্রকাশ' },
    { key: 'loyal-customer', en: 'Loyal customer', bn: 'নিয়মিত কাস্টমার' },
    { key: 'other', en: 'Other', bn: 'অন্য কারণ' },
  ],
  roleLimits: {},
};

/** The key of the reason that asks for a note. */
export const PRICE_ADJUST_OTHER_KEY = 'other';

// PR 665 — `orders.mergeOrders`: fold one open order of a customer into another (the "Merge" button on a Merge-needed row).
// Off as shipped. `lookBackDays` is how many days before the kept order another order may have been placed (5 as shipped);
// `autoMerge` (off) lets the system do it the moment an order lands, only when the addresses match; `differentAddress` is what
// happens when they do not: "ask" (a person confirms the kept order's address) or "refuse". An order that is Packed or with a
// courier is never merged (fixed, not a setting): only orders still open can be.
export const mergeOrdersSchema = z
  .object({
    enabled: z.boolean(),
    lookBackDays: z.int().min(1).max(60),
    autoMerge: z.boolean(),
    differentAddress: z.enum(['ask', 'refuse']),
  })
  .strict();
export type MergeOrdersRule = z.output<typeof mergeOrdersSchema>;

export const MERGE_ORDERS_DEFAULT: MergeOrdersRule = { enabled: false, lookBackDays: 5, autoMerge: false, differentAddress: 'ask' };

// PR 669 — `returns.replacement`: a defective, damaged or wrong piece is sent again free (the same piece, no price difference,
// no refund, no wallet credit) and the old piece comes back. Its own rule, apart from the exchange rule: `hours` after the
// courier's delivered mark it can be opened (168 as shipped), `oldPieceDays` how many days the old piece has to come back
// (shown on the board, never billed by itself), `reasons` which of defect, damage and wrong open one. Off as shipped.
export const REPLACEMENT_REASONS = ['defect', 'damage', 'wrong'] as const;
export const replacementSchema = z
  .object({
    enabled: z.boolean(),
    hours: z.int().min(1).max(8_760),
    oldPieceDays: z.int().min(1).max(90),
    reasons: z.array(z.enum(REPLACEMENT_REASONS)).min(1).max(3),
  })
  .strict();
export type ReplacementRule = z.output<typeof replacementSchema>;

export const REPLACEMENT_DEFAULT: ReplacementRule = { enabled: false, hours: 168, oldPieceDays: 7, reasons: ['defect', 'damage', 'wrong'] };

const base = { scope: 'store', isOwnerData: false, isPublic: false, group: 'orders' } as const;

export const orderFlowSettings = {
  'orders.priceAdjust': setting({
    ...base,
    version: V664,
    schema: priceAdjustSchema,
    default: PRICE_ADJUST_DEFAULT,
    valueType: 'JSON',
    labelKey: 'orders.priceAdjust.label',
    helpKey: 'orders.priceAdjust.help',
    sortOrder: 340,
  }),
  'orders.mergeOrders': setting({
    ...base,
    version: V665,
    schema: mergeOrdersSchema,
    default: MERGE_ORDERS_DEFAULT,
    valueType: 'JSON',
    labelKey: 'orders.mergeOrders.label',
    helpKey: 'orders.mergeOrders.help',
    sortOrder: 341,
  }),
  'returns.replacement': setting({
    ...base,
    version: V669,
    schema: replacementSchema,
    default: REPLACEMENT_DEFAULT,
    valueType: 'JSON',
    labelKey: 'returns.replacement.label',
    helpKey: 'returns.replacement.help',
    sortOrder: 342,
  }),
} as const;

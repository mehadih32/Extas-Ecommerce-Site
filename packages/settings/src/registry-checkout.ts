// S04 · PR 115–126 — the checkout (Sawdagor, Shilpi). The order and its money are rows (Order, OrderItem, Payment);
// prices, offers, free delivery and COD are the Smart Rules' and the owner's; the delivery charge is the band's figure
// from the delivery-zone engine (S06). These settings only hold how the checkout behaves and what it shows (CN-012:
// the field order, the try-on line …). Every word the checkout shows is in the shop dictionary
// (apps/web/messages/shop.<lang>.json, `checkout.*`), editable in both languages through `language.labels`. Labels:
// messages/checkout.<lang>.json. Registry version 20.
//
// CN-018: nothing here makes a claim on its own, and every optional feature ships off. No money sits here as a default:
// an amount the owner fixes has no default (null) and needs his OK.
import { z } from 'zod';
import { setting } from './define';

const V = 20;

/** A field of "Delivery details". */
export const checkoutFieldSchema = z.enum(['name', 'phone', 'address']);

/** PR 120 — the mobile wallets and the card types the payment step can list (each has its mark in the shop). */
export const MOBILE_WALLETS = ['bkash', 'nagad', 'rocket', 'upay'] as const;
export const CARD_TYPES = ['visa', 'mastercard', 'amex', 'bank'] as const;
/** PR 120 (CN-018 (1)) — what paying before delivery earns: free delivery, an amount off, or a percentage off. */
export const PREPAID_REWARD_TYPES = ['freeDelivery', 'amount', 'percent'] as const;
export const PREPAID_REWARD_FALLBACKS = ['amount', 'percent'] as const;
/** PR 124 (demo #42) — an unfinished form: the button asks inside the field (the owner's way), or it waits switched off. */
export const CONFIRM_STYLES = ['ask', 'disable'] as const;

const listOf = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .array(z.enum(values))
    .min(1)
    .max(values.length)
    .refine((a) => new Set(a).size === a.length, { message: 'each one once' });

const base = { scope: 'store', isOwnerData: false, group: 'checkout', version: V } as const;
/** The owner's own decisions (money): no value until he sets one, and each change needs his OK (CLAUDE.md rule 6). */
const owner = { ...base, isOwnerData: true, requiresOwnerOk: true } as const;

export const checkoutSettings = {
  // ---- PR 115 · the page ----
  'checkout.fieldOrder': setting({
    ...base,
    schema: z.array(checkoutFieldSchema).min(1).max(3),
    default: ['name', 'phone', 'address'],
    valueType: 'JSON',
    labelKey: 'checkout.fieldOrder.label',
    helpKey: 'checkout.fieldOrder.help',
    sortOrder: 10,
  }),
  'checkout.tryOn.enabled': setting({
    ...base,
    schema: z.boolean(),
    default: false,
    valueType: 'BOOLEAN',
    labelKey: 'checkout.tryOn.enabled.label',
    helpKey: 'checkout.tryOn.enabled.help',
    sortOrder: 20,
  }),
  'checkout.help.enabled': setting({
    ...base,
    schema: z.boolean(),
    default: true,
    valueType: 'BOOLEAN',
    labelKey: 'checkout.help.enabled.label',
    helpKey: 'checkout.help.enabled.help',
    sortOrder: 30,
  }),

  // ---- PR 116 · name, phone and address: the shortest name and address the order takes (letters, not bytes) ----
  'checkout.form.nameMin': setting({
    ...base,
    schema: z.int().min(1).max(20),
    default: 2,
    valueType: 'INT',
    labelKey: 'checkout.form.nameMin.label',
    helpKey: 'checkout.form.nameMin.help',
    sortOrder: 40,
  }),
  'checkout.form.addressMin': setting({
    ...base,
    schema: z.int().min(4).max(60),
    default: 8,
    valueType: 'INT',
    labelKey: 'checkout.form.addressMin.label',
    helpKey: 'checkout.form.addressMin.help',
    sortOrder: 50,
  }),

  // ---- PR 120 · payment methods (CN-012: Cash on Delivery opens by itself; mobile, card and online open on a tap).
  // Whether Cash on Delivery is offered at all is the owner's `payment.cod.enabled` and the Smart Rules' COD rule. ----
  'checkout.pay.mobile.enabled': setting({
    ...base,
    schema: z.boolean(),
    default: true,
    valueType: 'BOOLEAN',
    labelKey: 'checkout.pay.mobile.enabled.label',
    helpKey: 'checkout.pay.mobile.enabled.help',
    sortOrder: 60,
  }),
  'checkout.pay.mobile.list': setting({
    ...base,
    schema: listOf(MOBILE_WALLETS),
    default: ['bkash', 'nagad', 'rocket'],
    valueType: 'JSON',
    labelKey: 'checkout.pay.mobile.list.label',
    helpKey: 'checkout.pay.mobile.list.help',
    sortOrder: 61,
  }),
  'checkout.pay.card.enabled': setting({
    ...base,
    schema: z.boolean(),
    default: true,
    valueType: 'BOOLEAN',
    labelKey: 'checkout.pay.card.enabled.label',
    helpKey: 'checkout.pay.card.enabled.help',
    sortOrder: 62,
  }),
  'checkout.pay.card.list': setting({
    ...base,
    schema: listOf(CARD_TYPES),
    default: ['visa', 'mastercard', 'amex', 'bank'],
    valueType: 'JSON',
    labelKey: 'checkout.pay.card.list.label',
    helpKey: 'checkout.pay.card.list.help',
    sortOrder: 63,
  }),
  'checkout.pay.online.enabled': setting({
    ...base,
    schema: z.boolean(),
    default: true,
    valueType: 'BOOLEAN',
    labelKey: 'checkout.pay.online.enabled.label',
    helpKey: 'checkout.pay.online.enabled.help',
    sortOrder: 64,
  }),

  // ---- PR 121 · the quantity at checkout: three or more of one size says sizes can be mixed (demo #41) ----
  'checkout.manyOfOne.enabled': setting({
    ...base,
    schema: z.boolean(),
    default: true,
    valueType: 'BOOLEAN',
    labelKey: 'checkout.manyOfOne.enabled.label',
    helpKey: 'checkout.manyOfOne.enabled.help',
    sortOrder: 65,
  }),
  'checkout.manyOfOne.min': setting({
    ...base,
    schema: z.int().min(2).max(20),
    default: 3,
    valueType: 'INT',
    labelKey: 'checkout.manyOfOne.min.label',
    helpKey: 'checkout.manyOfOne.min.help',
    sortOrder: 66,
  }),

  // ---- PR 122 · the customer's wallet at checkout (his own money: shown whenever he has a balance) ----
  'checkout.wallet.enabled': setting({
    ...base,
    schema: z.boolean(),
    default: true,
    valueType: 'BOOLEAN',
    labelKey: 'checkout.wallet.enabled.label',
    helpKey: 'checkout.wallet.enabled.help',
    sortOrder: 67,
  }),

  // ---- PR 123 · marketing opt-in: one tick per channel, stored separately (B5.7), with the way out in its words ----
  'checkout.consent.enabled': setting({
    ...base,
    schema: z.boolean(),
    default: true,
    valueType: 'BOOLEAN',
    labelKey: 'checkout.consent.enabled.label',
    helpKey: 'checkout.consent.enabled.help',
    sortOrder: 68,
  }),
  'checkout.consent.sms.default': setting({
    ...base,
    schema: z.boolean(),
    default: true,
    valueType: 'BOOLEAN',
    labelKey: 'checkout.consent.sms.default.label',
    helpKey: 'checkout.consent.sms.default.help',
    sortOrder: 69,
  }),
  'checkout.consent.whatsapp.default': setting({
    ...base,
    schema: z.boolean(),
    default: false,
    valueType: 'BOOLEAN',
    labelKey: 'checkout.consent.whatsapp.default.label',
    helpKey: 'checkout.consent.whatsapp.default.help',
    sortOrder: 69,
  }),

  // ---- PR 124 · the Confirm button while the form is not finished (demo #42: 'ask' is the owner's version) ----
  'checkout.confirm.style': setting({
    ...base,
    schema: z.enum(CONFIRM_STYLES),
    default: 'ask',
    valueType: 'ENUM',
    labelKey: 'checkout.confirm.style.label',
    helpKey: 'checkout.confirm.style.help',
    sortOrder: 69,
  }),

  // ---- PR 120 · the prepaid reward (CN-018 (1)): nothing set (off), and no amount, until the owner decides. Any payment but Cash on
  // Delivery earns it; when delivery is already free a free-delivery reward falls back to the amount or the percentage.
  'checkout.prepaidReward.enabled': setting({
    ...owner,
    schema: z.boolean().nullable(),
    default: null,
    valueType: 'BOOLEAN',
    labelKey: 'checkout.prepaidReward.enabled.label',
    helpKey: 'checkout.prepaidReward.enabled.help',
    sortOrder: 70,
  }),
  'checkout.prepaidReward.type': setting({
    ...owner,
    schema: z.enum(PREPAID_REWARD_TYPES).nullable(),
    default: null,
    valueType: 'ENUM',
    labelKey: 'checkout.prepaidReward.type.label',
    helpKey: 'checkout.prepaidReward.type.help',
    sortOrder: 71,
  }),
  'checkout.prepaidReward.fallback': setting({
    ...owner,
    schema: z.enum(PREPAID_REWARD_FALLBACKS).nullable(),
    default: null,
    valueType: 'ENUM',
    labelKey: 'checkout.prepaidReward.fallback.label',
    helpKey: 'checkout.prepaidReward.fallback.help',
    sortOrder: 72,
  }),
  'checkout.prepaidReward.amountMinor': setting({
    ...owner,
    schema: z.int().min(1).max(100_000_000).nullable(),
    default: null,
    valueType: 'MONEY_MINOR',
    labelKey: 'checkout.prepaidReward.amountMinor.label',
    helpKey: 'checkout.prepaidReward.amountMinor.help',
    sortOrder: 73,
  }),
  'checkout.prepaidReward.percent': setting({
    ...owner,
    schema: z.int().min(1).max(90).nullable(),
    default: null,
    valueType: 'INT',
    labelKey: 'checkout.prepaidReward.percent.label',
    helpKey: 'checkout.prepaidReward.percent.help',
    sortOrder: 74,
  }),
  'checkout.prepaidReward.maxMinor': setting({
    ...owner,
    schema: z.int().min(1).max(100_000_000).nullable(),
    default: null,
    valueType: 'MONEY_MINOR',
    labelKey: 'checkout.prepaidReward.maxMinor.label',
    helpKey: 'checkout.prepaidReward.maxMinor.help',
    sortOrder: 75,
  }),
};

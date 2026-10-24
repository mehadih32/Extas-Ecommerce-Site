// S07 · payments. Registry version 47. Labels: messages/payments.<lang>.json (the "payment" group; the admin's place is
// Money → Payments, MNY of docs/BACKEND-ARCHITECTURE.md §5.3, built on the new admin shell).
//
// PR 165 (`payments.manual`, `payments.mismatch.reasons`): money received outside the checkout (a customer sends bKash
// to the merchant number, a bank transfer) is recorded by a permitted staff member with the amount confirmed (F-040) —
// a new feature, so off until the owner switches it on (CN-018); and the words of every mismatch reason code
// (SIM-F-028: a mismatch never comes without a reason; the codes are fixed, the words are the owner's).
//
// Nothing here moves money, refunds anything, or changes a price, a charge, a discount or Cash on Delivery (CLAUDE.md
// rule 6): these settings only say what may be recorded and how a difference is named.
import { z } from 'zod';
import { setting } from './define';
import { lookup, messages } from './messages';

const V = 47;

const base = { scope: 'store', isOwnerData: false, isPublic: false, group: 'payment', version: V } as const;

/** The ways money reaches the shop outside the checkout that a person may record (Prisma PaymentMethod values). */
export const MANUAL_PAYMENT_METHODS = ['BKASH', 'NAGAD', 'ROCKET', 'UPAY', 'BANK_TRANSFER', 'CASH'] as const;
export type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number];

/**
 * PR 165 — every mismatch reason code (fixed, so reports can count them; @extas/payments keeps the same list in
 * pure.ts and its test checks they agree). A payment's, a door collection's and a settlement line's.
 */
export const PAYMENT_MISMATCH_CODES = [
  'AMOUNT_DIFFERS',
  'CURRENCY_DIFFERS',
  'PAID_AFTER_CLOSE',
  'DUPLICATE_PAYMENT',
  'ORDER_CLOSED',
  'OVER_COLLECTED',
  'SHORT_COLLECTED',
  'PAID_ORDER_COLLECTED',
  'PARTIAL_DELIVERY',
  'CHARGE_PAID_RETURN',
  'UNKNOWN_PARCEL',
  'DOUBLE_LINE',
  'DOUBLE_CHARGE',
  'CHARGE_DIFFERS',
  'SHORT_PAID',
  'OVER_PAID',
  'RETURN_AS_DELIVERED',
  'NOT_COLLECTED',
  'LATE_SETTLEMENT',
  'MISSING',
] as const;
export type PaymentMismatchCode = (typeof PAYMENT_MISMATCH_CODES)[number];

const label = z.string().trim().min(1).max(120);

/** PR 165 — recording money received outside the checkout: the switch and the methods a person may pick. */
export const manualPaymentsSchema = z
  .object({ enabled: z.boolean(), methods: z.array(z.enum(MANUAL_PAYMENT_METHODS)).min(1).max(MANUAL_PAYMENT_METHODS.length) })
  .strict()
  .refine((v) => new Set(v.methods).size === v.methods.length, { message: 'every method once' });

/** PR 165 — the words of each fixed mismatch code, in both languages; every code once and all of them there. */
export const mismatchReasonsSchema = z
  .array(z.object({ code: z.enum(PAYMENT_MISMATCH_CODES), en: label, bn: label }).strict())
  .length(PAYMENT_MISMATCH_CODES.length)
  .refine((l) => new Set(l.map((x) => x.code)).size === l.length, { message: 'every code once' });

function text(lang: 'en' | 'bn', path: string): string {
  const v = lookup(messages[lang], `defaults.payments.${path}`);
  if (!v) throw new Error(`payments message "defaults.payments.${path}" is missing in ${lang}`);
  return v;
}

export const paymentSettings = {
  'payments.manual': setting({
    ...base,
    schema: manualPaymentsSchema,
    default: { enabled: false, methods: [...MANUAL_PAYMENT_METHODS] },
    valueType: 'JSON',
    labelKey: 'payments.manual.label',
    helpKey: 'payments.manual.help',
    sortOrder: 100,
  }),
  'payments.mismatch.reasons': setting({
    ...base,
    schema: mismatchReasonsSchema,
    default: PAYMENT_MISMATCH_CODES.map((code) => ({ code, en: text('en', `mismatch.${code}`), bn: text('bn', `mismatch.${code}`) })),
    valueType: 'JSON',
    labelKey: 'payments.mismatch.reasons.label',
    helpKey: 'payments.mismatch.reasons.help',
    sortOrder: 110,
  }),
};

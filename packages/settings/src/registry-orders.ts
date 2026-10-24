// S05 · the order core — PR 138, 144, 145, 147, 153 (BACKEND-ARCHITECTURE §5.3 ORD-10, §6.5; CN-020 (5), CN-022).
// Registry version 32 (31 is the invoice's). Labels: messages/orders.<lang>.json; the reason and flag lists' starting
// words are under `defaults.orders` there, in both languages, and the owner edits them in the admin.
//
// Nothing here moves money or changes a price, a discount or COD. Every timer only hands an order to a person (a call
// task) and never cancels or blocks anything by itself (CN-018, F-043). The customer's own cancel follows the owner's
// answer CN-020 (5): one tap until the order is confirmed, then a request until the courier is booked.
import { z } from 'zod';
import { setting } from './define';
import { lookup, messages } from './messages';
import { dictionarySchema, type Dictionary } from './schemas';

const V = 32;

/** PR 144 — the cancel reason codes (fixed, so reports can count them; BACKEND-ARCHITECTURE §6.5.0). @extas/orders keeps the same list. */
export const ORDER_CANCEL_CODES = [
  'CUSTOMER_BEFORE_CONFIRM',
  'CUSTOMER_AFTER_CONFIRM',
  'CUSTOMER_CHANGE_AFTER_BOOKING',
  'ADVANCE_NOT_PAID',
  'RISK_DECLINED',
  'OUT_OF_STOCK',
  'DUPLICATE_ORDER',
  'ADDRESS_UNREACHABLE',
  // PR 142 (SIM-F-038, registry v37): the phone's owner never ordered (someone else used his number); never a risk signal
  'NOT_ORDERED',
  'OTHER',
] as const;

const label = z.string().trim().min(1).max(120);

/** PR 144 — the words of each fixed cancel code, in both languages; every code once, "OTHER" always there. */
export const cancelReasonsSchema = z
  .array(z.object({ code: z.enum(ORDER_CANCEL_CODES), en: label, bn: label }).strict())
  .min(1)
  .max(ORDER_CANCEL_CODES.length)
  .refine((l) => new Set(l.map((x) => x.code)).size === l.length, { message: 'every code once' })
  .refine((l) => l.some((x) => x.code === 'OTHER'), { message: '"OTHER" is always on the list' });

/** CN-020 (5) — until when the customer cancels with one tap; after it, a request until booking (when `requests`). */
export const customerCancelSchema = z.object({ cutoff: z.enum(['off', 'placed', 'confirmed', 'packed']), requests: z.boolean() }).strict();

/** PR 145 — the duplicate-order check (Blueprint B1.12; F2 question 44: five days back). */
export const duplicatesSchema = z
  .object({
    enabled: z.boolean(),
    lookbackDays: z.int().min(1).max(60),
    /** The lowest match that waits in the review queue (and holds the confirm); below it the order only shows a note. */
    reviewFrom: z.enum(['low', 'medium', 'high']),
    /** A high match goes on hold by itself, with the reason "possible duplicate". */
    autoHold: z.boolean(),
  })
  .strict();

const hours = z.int().min(0).max(24 * 60);

/** A starting list from `defaults.orders.<path>` in messages/orders.<lang>.json, in file order, both languages. */
export function ordersDictionaryDefault(path: string): Dictionary {
  const node = lookupTree(path);
  return Object.keys(node).map((key) => ({ key, en: text('en', `${path}.${key}`), bn: text('bn', `${path}.${key}`) }));
}
function lookupTree(path: string): Record<string, unknown> {
  let node: unknown = messages.en;
  for (const part of `defaults.orders.${path}`.split('.')) node = node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined;
  if (!node || typeof node !== 'object') throw new Error(`orders messages have no list at "defaults.orders.${path}"`);
  return node as Record<string, unknown>;
}
function text(lang: 'en' | 'bn', path: string): string {
  const v = lookup(messages[lang], `defaults.orders.${path}`);
  if (!v) throw new Error(`orders message "defaults.orders.${path}" is missing in ${lang}`);
  return v;
}

const base = { scope: 'store', isOwnerData: false, isPublic: false, group: 'orders', version: V } as const;

export const ordersSettings = {
  'orders.cancel.reasons': setting({
    ...base,
    // ~~version: V~~ 37: PR 142 added NOT_ORDERED to the codes (SIM-F-038), so the default changed
    version: 37,
    schema: cancelReasonsSchema,
    default: ORDER_CANCEL_CODES.map((code) => ({ code, en: text('en', `cancelReasons.${code}`), bn: text('bn', `cancelReasons.${code}`) })),
    valueType: 'JSON',
    labelKey: 'orders.cancel.reasons.label',
    helpKey: 'orders.cancel.reasons.help',
    sortOrder: 100,
  }),
  'orders.cancel.customer': setting({
    ...base,
    isPublic: true,
    schema: customerCancelSchema,
    default: { cutoff: 'confirmed', requests: true },
    valueType: 'JSON',
    labelKey: 'orders.cancel.customer.label',
    helpKey: 'orders.cancel.customer.help',
    sortOrder: 110,
  }),
  'orders.cancel.customerReasons': setting({
    ...base,
    isPublic: true,
    schema: dictionarySchema.refine((l) => l.length > 0, { message: 'at least one reason' }),
    default: ordersDictionaryDefault('customerReasons'),
    valueType: 'JSON',
    labelKey: 'orders.cancel.customerReasons.label',
    helpKey: 'orders.cancel.customerReasons.help',
    sortOrder: 120,
  }),
  'orders.hold.reasons': setting({
    ...base,
    schema: dictionarySchema.refine((l) => l.length > 0, { message: 'at least one reason' }),
    default: ordersDictionaryDefault('holdReasons'),
    valueType: 'JSON',
    labelKey: 'orders.hold.reasons.label',
    helpKey: 'orders.hold.reasons.help',
    sortOrder: 130,
  }),
  'orders.hold.reviewHours': setting({
    ...base,
    schema: hours,
    default: 0,
    valueType: 'INT',
    labelKey: 'orders.hold.reviewHours.label',
    helpKey: 'orders.hold.reviewHours.help',
    sortOrder: 140,
  }),
  'orders.advance.waitHours': setting({
    ...base,
    schema: hours,
    default: 0,
    valueType: 'INT',
    labelKey: 'orders.advance.waitHours.label',
    helpKey: 'orders.advance.waitHours.help',
    sortOrder: 150,
  }),
  'orders.duplicates': setting({
    ...base,
    schema: duplicatesSchema,
    default: { enabled: true, lookbackDays: 5, reviewFrom: 'medium', autoHold: false },
    valueType: 'JSON',
    labelKey: 'orders.duplicates.label',
    helpKey: 'orders.duplicates.help',
    sortOrder: 160,
  }),
  'orders.flags.list': setting({
    ...base,
    schema: dictionarySchema,
    default: ordersDictionaryDefault('flags'),
    valueType: 'JSON',
    labelKey: 'orders.flags.list.label',
    helpKey: 'orders.flags.list.help',
    sortOrder: 170,
  }),
  'orders.notes.maxChars': setting({
    ...base,
    schema: z.int().min(100).max(10_000),
    default: 2_000,
    valueType: 'INT',
    labelKey: 'orders.notes.maxChars.label',
    helpKey: 'orders.notes.maxChars.help',
    sortOrder: 180,
  }),
  'orders.list.pageSize': setting({
    ...base,
    schema: z.int().min(1).max(100),
    default: 50,
    valueType: 'INT',
    labelKey: 'orders.list.pageSize.label',
    helpKey: 'orders.list.pageSize.help',
    sortOrder: 190,
  }),
  'orders.commands.replayHours': setting({
    ...base,
    schema: z.int().min(1).max(24 * 7),
    default: 24,
    valueType: 'INT',
    labelKey: 'orders.commands.replayHours.label',
    helpKey: 'orders.commands.replayHours.help',
    sortOrder: 200,
  }),
};

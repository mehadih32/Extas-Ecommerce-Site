// S22 · PR 430 (CN-031 lane C; Blueprint B4.6 bullets 3–5 and 7, B4.14 item 6; SIM-F-024) — selling from the chat: the
// mini-cart beside a conversation and one-press order creation with the channel kept. Registry version 158 (lane C's
// range). Labels: messages/support-cart.<lang>.json; the admin's place is Support → Support settings
// (docs/ADMIN-ARCHITECTURE.md §4.7).
//
// `support.cart` (per store):
// - `enabled`: the "Chat bag" card beside a conversation — the employee drops products into a small bag (from the
//   catalogue drawer), the shop's own combo prices and offers apply exactly as on the site, then "Create order" fills the
//   name, phone and address from the customer (or what was typed), runs the same stock and delivery checks as the
//   checkout and places the order with the chat's channel as its source (WhatsApp / Messenger / Live chat). The owner's
//   own Parameter for Checkout decides the fraud gate: a checkout it flags gets no Cash on Delivery order — the button
//   becomes "Take advance", the order waits for that advance and its pay link goes into the chat. Off as it ships
//   (CN-018: a new optional feature is off until the owner switches it on).
// - `payLinkWords`: the chat message that carries the pay link, in both languages; only {number} (the order), {amount}
//   (the advance, in the shop's money) and {link} may be used, and {link} must be there.
//
// Nothing here changes a price, a discount, COD, a charge or the risk rules: the bag is priced by the shop's own engines
// and the gate is the owner's own layer; the pay link asks only what that layer asks. Nothing is owner data.
import { z } from 'zod';
import { setting } from './define';
import { templateTextSchema, tokensOf } from './schemas';

const VID = 158;

/** The tokens the pay link message may use. */
export const PAY_LINK_TOKENS = ['number', 'amount', 'link'] as const;

export const supportCartSchema = z
  .object({
    enabled: z.boolean(),
    payLinkWords: templateTextSchema(PAY_LINK_TOKENS, 400).refine((v) => tokensOf(v.en).includes('link') && tokensOf(v.bn).includes('link'), { message: 'the message must carry {link}' }),
  })
  .strict();
export type SupportCartSettings = z.output<typeof supportCartSchema>;

export const supportCartSettings = {
  'support.cart': setting({
    scope: 'store',
    group: 'support',
    valueType: 'JSON',
    isOwnerData: false,
    isPublic: false,
    schema: supportCartSchema,
    default: {
      enabled: false,
      payLinkWords: {
        en: 'Your order {number} is ready. Please pay the advance of {amount} here: {link}',
        bn: 'আপনার অর্ডার {number} তৈরি। {amount} অগ্রিম এখানে দিন: {link}',
      },
    },
    labelKey: 'support.cart.label',
    helpKey: 'support.cart.help',
    sortOrder: 53,
    version: VID,
  }),
};

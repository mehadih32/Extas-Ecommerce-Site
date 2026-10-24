// S06 · PR 542 — the one-click advance request from the order (registry version 54). Labels: messages/orders.<lang>.json
// (the Orders group; the admin's place is Orders → Risk rules, under the Levels card, and the order page's "Request
// advance" button).
//
// A risk level (PR 161) proposes what the customer pays first (the delivery charge, a part, the whole amount, or "no cash
// on delivery for this order"). A person opens the order, presses "Request advance", checks the amount and the channels
// and presses Send: the order waits for its advance (AWAITING_ADVANCE), a pay link is made (`/pay/<token>`), the
// SMS/WhatsApp with the amount and the link goes through the order messages (PR 148) and, with "Call", a call task lands
// in the call queue. Nothing reaches a customer unless a person presses Send — or the owner turns on `auto` here, which
// does the same right after a level proposes an ask (CN-018: off by default).
//
//   auto      — off: the proposal waits for a person. On: the level's ask is requested by itself (same message, same
//               link, the same call task when "Call" is ticked below).
//   channels  — which ways are ticked when the dialog opens (and what `auto` uses): SMS, WhatsApp, a call.
//   provider  — which payment service the link pays with (bKash, Nagad … or "online": the shop's own choice page later).
//               It runs on its practice gateway until the owner's keys pass the Test button (A1.3).
//   template  — the words (Messages › Templates; the default pack's `order.advanceRequest`).
// Nothing here moves money, changes a COD rule, a price or a charge, or blocks anyone (CLAUDE.md rule 6).
import { z } from 'zod';
import { setting } from './define';

const V = 54;

const base = { scope: 'store', isOwnerData: false, isPublic: false, group: 'orders', version: V } as const;

/** The payment services a pay link can use (Payment.provider; each is its practice gateway until its keys pass). */
export const ADVANCE_PROVIDERS = ['bkash', 'nagad', 'rocket', 'upay', 'online'] as const;
export type AdvanceProvider = (typeof ADVANCE_PROVIDERS)[number];

/** The ways an advance request reaches the customer. */
export const ADVANCE_CHANNELS = ['SMS', 'WHATSAPP', 'CALL'] as const;
export type AdvanceChannel = (typeof ADVANCE_CHANNELS)[number];

export const advanceRequestSchema = z
  .object({
    auto: z.boolean(),
    channels: z.object({ SMS: z.boolean(), WHATSAPP: z.boolean(), CALL: z.boolean() }).strict(),
    provider: z.enum(ADVANCE_PROVIDERS),
    template: z.string().regex(/^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)+$/, { message: 'a template key like order.advanceRequest' }),
  })
  .strict();
export type AdvanceRequestSettings = z.output<typeof advanceRequestSchema>;

export const advanceRequestSettings = {
  'orders.advanceRequest': setting({
    ...base,
    schema: advanceRequestSchema,
    default: { auto: false, channels: { SMS: true, WHATSAPP: false, CALL: true }, provider: 'bkash', template: 'order.advanceRequest' },
    valueType: 'JSON',
    labelKey: 'orders.advanceRequest.label',
    helpKey: 'orders.advanceRequest.help',
    sortOrder: 155,
  }),
};

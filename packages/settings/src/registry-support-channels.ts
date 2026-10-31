// S22 · PR 426 (CN-031 lane A) — the Support inbox's channel connectors: Facebook Messenger, WhatsApp and the site's own
// live chat (Blueprint B4.2, B4.10). Registry version 72 (lane A). Labels: messages/support.<lang>.json; the admin's
// place is Support → Support settings (docs/ADMIN-ARCHITECTURE.md §4.7).
//
// - `support.channels` (per store): Meta's rule, kept by design — a reply on Messenger or WhatsApp goes only inside the
//   window after the customer's last message (`replyWindowHours`, Meta's 24 hours as it ships); outside it the reply is
//   kept and marked "not sent" (approved templates for outside the window come with PR 431). `webhookMaxBodyKb`: the
//   largest Messenger webhook body read (the mother store's value: one address serves every store).
// - `support.liveChat` (per store; off as it ships): the chat button on the shop's pages. `pollSeconds`: how often an
//   open chat asks for the team's answers; `maxChars`: the longest message a visitor may send; `perMinute`: how many
//   messages one visitor may send in a minute; `cookieDays`: how long a visitor's chat stays his on that browser.
//
// Nothing here moves money, changes a price, a discount or COD, or blocks anyone; nothing is owner data.
import { z } from 'zod';
import { setting } from './define';

const V = 72;

const base = { scope: 'store', isOwnerData: false, isPublic: false, group: 'support', version: V } as const;

export const supportChannelsSchema = z
  .object({
    replyWindowHours: z.int().min(1).max(168),
    webhookMaxBodyKb: z.int().min(16).max(2048),
  })
  .strict();

export const supportLiveChatSchema = z
  .object({
    enabled: z.boolean(),
    pollSeconds: z.int().min(2).max(60),
    maxChars: z.int().min(50).max(4000),
    perMinute: z.int().min(1).max(60),
    cookieDays: z.int().min(1).max(365),
  })
  .strict();

export const supportChannelSettings = {
  'support.channels': setting({
    ...base,
    valueType: 'JSON',
    schema: supportChannelsSchema,
    default: { replyWindowHours: 24, webhookMaxBodyKb: 256 },
    labelKey: 'support.channels.label',
    helpKey: 'support.channels.help',
    sortOrder: 30,
  }),
  'support.liveChat': setting({
    ...base,
    valueType: 'JSON',
    schema: supportLiveChatSchema,
    default: { enabled: false, pollSeconds: 5, maxChars: 1000, perMinute: 6, cookieDays: 30 },
    labelKey: 'support.liveChat.label',
    helpKey: 'support.liveChat.help',
    sortOrder: 40,
  }),
};

export type SupportChannelSettings = z.output<typeof supportChannelsSchema>;
export type SupportLiveChatSettings = z.output<typeof supportLiveChatSchema>;

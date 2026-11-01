// S22 · PR 427 (CN-031 lane C; Blueprint B4.5 last paragraph, B4.14 item 3) — identity resolution in the Support inbox:
// one person known across channels. Registry version 155 (lane C's range). Labels: messages/support-identity.<lang>.json;
// the admin's place is Support → Support settings (docs/ADMIN-ARCHITECTURE.md §4.7).
//
// `support.identity` (per store; off as it ships):
// - `enabled`: when a message arrives, the inbox works out who wrote it — the number the channel gives (WhatsApp's own
//   number), else (`fromText`) the first Bangladeshi mobile number the customer types in the chat — and links the chat
//   to the customer with that number.
// - `fromText`: take the number from the chat's words (Bengali or English digits, +880 / 880 / 0 forms, spaces or
//   dashes) when the channel gives none (Messenger, the site's chat).
// - `autoLink`: the same number or the same customer on another channel is one person: their chats show together.
//   An employee can always undo it ("not the same person"); a chat set by hand is never changed automatically again.
//
// Nothing here sends a message, changes an order, a price, a discount or COD, or blocks anyone; nothing is owner data.
import { z } from 'zod';
import { setting } from './define';

const VID = 155;

export const supportIdentitySchema = z
  .object({
    enabled: z.boolean(),
    fromText: z.boolean(),
    autoLink: z.boolean(),
  })
  .strict();
export type SupportIdentitySettings = z.output<typeof supportIdentitySchema>;

export const supportIdentitySettings = {
  'support.identity': setting({
    scope: 'store',
    group: 'support',
    valueType: 'JSON',
    isOwnerData: false,
    isPublic: false,
    schema: supportIdentitySchema,
    default: { enabled: false, fromText: true, autoLink: true },
    labelKey: 'support.identity.label',
    helpKey: 'support.identity.help',
    sortOrder: 50,
    version: VID,
  }),
};

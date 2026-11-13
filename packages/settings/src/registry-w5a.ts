// S28 · wave 5 (CN-048; registry versions 360-369) — the settings of the prototype v5's inbox and marketing screens.
// Every switch ships OFF (CN-018) and every number is the owner's to set later in the backend (CN-018: build the system,
// never ask for a number). Labels: messages/w5a.<lang>.json. Nothing here moves money or changes a price.
//
// - `support.savedReplies` (PR 692): Inbox › Quick replies; `maxChars` is the longest text a quick reply may hold.
import { z } from 'zod';
import { setting } from './define';

const V = 360;

const store = { scope: 'store', isOwnerData: false, isPublic: false, version: V } as const;

export const supportSavedRepliesSchema = z.object({ enabled: z.boolean(), maxChars: z.number().int().min(50).max(4000) }).strict();
export type SupportSavedRepliesSettings = z.output<typeof supportSavedRepliesSchema>;

export const w5aSettings = {
  'support.savedReplies': setting({
    ...store,
    group: 'support',
    valueType: 'JSON',
    schema: supportSavedRepliesSchema,
    default: { enabled: false, maxChars: 1000 },
    labelKey: 'support.savedReplies.label',
    helpKey: 'support.savedReplies.help',
    sortOrder: 700,
  }),
};

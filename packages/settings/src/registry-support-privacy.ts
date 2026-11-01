// S22 · PR 434 (CN-031 lane C; Blueprint B4.12, B4.14 item 10) — the block list, employee permissions and customer data
// privacy inside support. Registry versions 185–186 (lane C's range). Labels: messages/support-privacy.<lang>.json; the
// admin's place is Support → Support settings (docs/ADMIN-ARCHITECTURE.md §4.7).
//
// `support.privacy` (per store):
// - `ownChatsOnly`: an employee who may not give chats out (no `support.assign`) sees only the chats given to them and
//   the ones nobody has taken — never another employee's chat. Off as it ships (CN-018): everyone with `support.read`
//   sees every chat.
// - `maskNumbersInText`: the phone numbers customers type into their messages are masked the same way as the chat's own
//   number (`customers.phoneMask`) for anyone without `customers.phone`. Off as it ships.
//
// `support.blockList` (per store):
// - `enabled`: a person with `support.block` (no role has it but the owner's; CLAUDE.md rule 6: blocking anyone is the
//   owner's decision) may put a chat's person on the support block list, with a reason, and take them off again. A
//   blocked person's messages are still kept (nothing is deleted) but leave every working view for the "Blocked" view:
//   no ticket, no follow-up, no reply from the shop. Off as it ships.
//
// Nothing here sends a message, moves money, changes an order, a price or COD, or deletes anything. Nothing is owner
// data.
import { z } from 'zod';
import { setting } from './define';

export const supportPrivacySchema = z.object({ ownChatsOnly: z.boolean(), maskNumbersInText: z.boolean() }).strict();
export type SupportPrivacySettings = z.output<typeof supportPrivacySchema>;

export const supportBlockListSchema = z.object({ enabled: z.boolean() }).strict();
export type SupportBlockListSettings = z.output<typeof supportBlockListSchema>;

/** The longest reason a block may carry. */
export const SUPPORT_BLOCK_REASON_MAX = 300;

export const supportPrivacySettings = {
  'support.privacy': setting({
    scope: 'store',
    group: 'support',
    valueType: 'JSON',
    isOwnerData: false,
    isPublic: false,
    schema: supportPrivacySchema,
    default: { ownChatsOnly: false, maskNumbersInText: false },
    labelKey: 'support.privacy.label',
    helpKey: 'support.privacy.help',
    sortOrder: 60,
    version: 185,
  }),
  'support.blockList': setting({
    scope: 'store',
    group: 'support',
    valueType: 'JSON',
    isOwnerData: false,
    isPublic: false,
    schema: supportBlockListSchema,
    default: { enabled: false },
    labelKey: 'support.blockList.label',
    helpKey: 'support.blockList.help',
    sortOrder: 61,
    version: 186,
  }),
};

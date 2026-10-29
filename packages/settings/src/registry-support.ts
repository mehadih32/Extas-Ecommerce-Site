// S22 · PR 425 — the support core: the inbox and files in a conversation. A customer's number in support is shown the
// way `customers.phoneMask` (PR 284) says, in full only to a person with `customers.phone`: one rule for the whole admin.
// Registry version 63 (shared with PR 407's invoice keys). Labels: messages/support.<lang>.json (the Support group; the
// admin's place is Support → Support settings, docs/ADMIN-ARCHITECTURE.md §4.7).
//
// Nothing here moves money, changes a price, a discount or COD, or blocks anyone. The channel connectors (Messenger,
// WhatsApp, the site's chat — PR 426) bring their own keys; until one is connected a reply is kept in the conversation
// and marked "not sent".
import { z } from 'zod';
import { setting } from './define';

const V = 63;

const base = { scope: 'store', isOwnerData: false, isPublic: false, group: 'support', version: V } as const;

/** PR 425 — the kinds of file the team may attach to a reply (each checked by its first bytes, never its name). */
export const SUPPORT_FILE_KINDS = ['image', 'video', 'pdf'] as const;
export type SupportFileKind = (typeof SUPPORT_FILE_KINDS)[number];

/**
 * PR 425 (B4.4) — the inbox. `pageSize`: how many conversations one page of the list shows; `replyMaxChars`: the
 * longest reply or note; `assignOnReply`: a reply to a conversation nobody has taken makes the person who replied its
 * owner (off: taking it is a separate press); `waitingOnReply`: a reply moves the conversation to "Waiting for the
 * customer" (off: it stays open until someone marks it).
 */
export const supportInboxSchema = z
  .object({
    pageSize: z.int().min(10).max(200),
    replyMaxChars: z.int().min(100).max(4000),
    assignOnReply: z.boolean(),
    waitingOnReply: z.boolean(),
  })
  .strict();

/**
 * PR 425 (B4.2, B4.8) — files in a conversation. `enabled`: the team may attach files to a reply or a note (files the
 * customer sends are always kept); `maxPerMessage`: how many files one message takes; `maxMb`: the largest file;
 * `kinds`: which kinds may be attached.
 */
export const supportAttachmentsSchema = z
  .object({
    enabled: z.boolean(),
    maxPerMessage: z.int().min(1).max(10),
    maxMb: z.int().min(1).max(50),
    kinds: z.object({ image: z.boolean(), video: z.boolean(), pdf: z.boolean() }).strict(),
  })
  .strict();


export const supportSettings = {
  'support.inbox': setting({
    ...base,
    valueType: 'JSON',
    schema: supportInboxSchema,
    default: { pageSize: 50, replyMaxChars: 2000, assignOnReply: false, waitingOnReply: true },
    labelKey: 'support.inbox.label',
    helpKey: 'support.inbox.help',
    sortOrder: 10,
  }),
  'support.attachments': setting({
    ...base,
    valueType: 'JSON',
    schema: supportAttachmentsSchema,
    default: { enabled: true, maxPerMessage: 4, maxMb: 10, kinds: { image: true, video: true, pdf: true } },
    labelKey: 'support.attachments.label',
    helpKey: 'support.attachments.help',
    sortOrder: 20,
  }),
};

export type SupportInboxSettings = z.output<typeof supportInboxSchema>;
export type SupportAttachmentSettings = z.output<typeof supportAttachmentsSchema>;

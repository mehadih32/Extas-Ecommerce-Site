// S28 · wave 5 (CN-048; registry versions 360-369) — the settings of the prototype v5's inbox and marketing screens.
// Every switch ships OFF (CN-018) and every number is the owner's to set later in the backend (CN-018: build the system,
// never ask for a number). Labels: messages/w5a.<lang>.json. Nothing here moves money or changes a price.
//
// - `support.savedReplies` (PR 692): Inbox › Quick replies; `maxChars` is the longest text a quick reply may hold.
// - `support.commentDesk` (PR 693): Inbox › Comments rules. `hidePhone`: a comment that carries a phone number is hidden
//   (others cannot copy it); `hideAbuse`: a comment with one of `abuseWords` is hidden; `autoPrivate`: a comment that asks
//   a price or size (one of `keywords`) gets one private message and one public reply, once. Off as shipped; the words and
//   texts are the owner's own. Hiding and replying go out through the Page's connector (a mock until its keys are in).
import { z } from 'zod';
import { setting } from './define';

const V = 360;

const store = { scope: 'store', isOwnerData: false, isPublic: false, version: V } as const;

export const supportSavedRepliesSchema = z.object({ enabled: z.boolean(), maxChars: z.number().int().min(50).max(4000) }).strict();
export type SupportSavedRepliesSettings = z.output<typeof supportSavedRepliesSchema>;

const word = z.string().trim().min(1).max(40);
const text = z.string().trim().max(500);

export const supportCommentDeskSchema = z
  .object({
    enabled: z.boolean(),
    hidePhone: z.boolean(),
    hideAbuse: z.boolean(),
    autoPrivate: z.boolean(),
    keywords: z.array(word).max(60),
    abuseWords: z.array(word).max(120),
    privateTextEn: text,
    privateTextBn: text,
    publicTextEn: text,
    publicTextBn: text,
  })
  .strict();
export type SupportCommentDeskSettings = z.output<typeof supportCommentDeskSchema>;

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
  'support.commentDesk': setting({
    ...store,
    group: 'support',
    valueType: 'JSON',
    schema: supportCommentDeskSchema,
    default: {
      enabled: false,
      hidePhone: true,
      hideAbuse: true,
      autoPrivate: false,
      keywords: ['price', 'koto', 'dam', 'size', 'ache', 'order', 'inbox', 'দাম', 'কত', 'সাইজ'],
      abuseWords: ['chor', 'fake', 'scam', 'fraud', 'চোর', 'প্রতারক'],
      privateTextEn: 'Hi! Thank you for asking. Please tell us the product, colour and size here and we will help you.',
      privateTextBn: 'হ্যালো! জিজ্ঞেস করার জন্য ধন্যবাদ। প্রোডাক্ট, রং আর সাইজ এখানে বলুন, আমরা সাহায্য করছি।',
      publicTextEn: 'Thank you! We sent you a private message.',
      publicTextBn: 'ধন্যবাদ! আপনাকে প্রাইভেট মেসেজ পাঠিয়েছি।',
    },
    labelKey: 'support.commentDesk.label',
    helpKey: 'support.commentDesk.help',
    sortOrder: 701,
  }),
};

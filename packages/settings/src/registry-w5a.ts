// S28 · wave 5 (CN-048; registry versions 360-369) — the settings of the prototype v5's inbox and marketing screens.
// Every switch ships OFF (CN-018) and every number is the owner's to set later in the backend (CN-018: build the system,
// never ask for a number). Labels: messages/w5a.<lang>.json. Nothing here moves money or changes a price.
//
// - `support.savedReplies` (PR 692): Inbox › Quick replies; `maxChars` is the longest text a quick reply may hold.
// - `support.liveSelling` (PR 694): Inbox › Comments › Live selling. While a live session runs, a comment such as "P1 L 2 pcs"
//   is read as an order line and, on "Make draft", put in that person's chat bag (staff always confirm by call, then
//   "Create order" in the chat). `maxQty`: the most pieces one comment may ask. Off as shipped.
// - `marketing.affiliates` (PR 695): Marketing › Tools › Influencers & affiliates. `commissionPct`: the default commission on
//   the goods value of a DELIVERED order that used a partner's code (a partner may have its own); `holdDays`: days after
//   delivery before it can be paid; `payoutsOn`: the Pay action (owner decision 13 Nov, item 7: not built; off, and it
//   stays off until the owner says so). Off as shipped.
// - `messages.costCeiling` (PR 698): a monthly ceiling per channel (SMS, WhatsApp; minor units, null = none), the share
//   (`warnPct`) at which the owner is warned, and `fallbackToCheapest` (a send that would pass the ceiling goes by the
//   cheapest allowed channel instead). Off as shipped.
// - `marketing.verdicts` (PR 699): delivered sales per Tk 1 of ads at or over `scale` = Scale, `keep` = Keep, `fix` = Fix,
//   else Stop (a campaign's chip). PR 697 has no setting of its own: it lists the sends the Messages campaign pages make and
//   keeps their switches (`customers.winback`, `customers.blast`, the throttle, the consent and the stop line).
// - `marketing.metaFeed` (PR 696): the Facebook and Instagram catalogue feed, /feeds/meta.xml, beside the Google one. Off as
//   shipped. It takes its products, photos, prices and sizes from the same loader as the Google feed and follows the
//   Merchant feed card's choices (most items, sold-out, one item per size and colour, gender, age group).
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

export const supportLiveSellingSchema = z.object({ enabled: z.boolean(), maxQty: z.number().int().min(1).max(50) }).strict();
export type SupportLiveSellingSettings = z.output<typeof supportLiveSellingSchema>;

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

export const marketingAffiliatesSchema = z
  .object({ enabled: z.boolean(), commissionPct: z.number().min(0).max(100), holdDays: z.number().int().min(0).max(90), payoutsOn: z.boolean() })
  .strict();
export type MarketingAffiliatesSettings = z.output<typeof marketingAffiliatesSchema>;

const ceiling = z.number().int().min(0).max(1_000_000_000).nullable(); // hardcode-ok: a technical bound
export const messagesCostCeilingSchema = z
  .object({ enabled: z.boolean(), smsMonthlyMinor: ceiling, whatsappMonthlyMinor: ceiling, warnPct: z.number().int().min(1).max(100), fallbackToCheapest: z.boolean() })
  .strict();
export type MessagesCostCeilingSettings = z.output<typeof messagesCostCeilingSchema>;

const ratio = z.number().min(0).max(1000); // hardcode-ok: a technical bound
export const marketingVerdictsSchema = z.object({ scale: ratio, keep: ratio, fix: ratio }).strict().refine((v) => v.scale >= v.keep && v.keep >= v.fix, { message: 'scale >= keep >= fix' });
export type MarketingVerdictsSettings = z.output<typeof marketingVerdictsSchema>;

export const marketingMetaFeedSchema = z.object({ on: z.boolean() }).strict();
export type MarketingMetaFeedSettings = z.output<typeof marketingMetaFeedSchema>;

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
  'support.liveSelling': setting({
    ...store,
    group: 'support',
    valueType: 'JSON',
    schema: supportLiveSellingSchema,
    default: { enabled: false, maxQty: 10 },
    labelKey: 'support.liveSelling.label',
    helpKey: 'support.liveSelling.help',
    sortOrder: 702,
  }),
  'marketing.affiliates': setting({
    ...store,
    group: 'marketing',
    valueType: 'JSON',
    schema: marketingAffiliatesSchema,
    default: { enabled: false, commissionPct: 5, holdDays: 7, payoutsOn: false },
    labelKey: 'marketing.affiliates.label',
    helpKey: 'marketing.affiliates.help',
    sortOrder: 703,
  }),
  'messages.costCeiling': setting({
    ...store,
    group: 'messages',
    valueType: 'JSON',
    schema: messagesCostCeilingSchema,
    default: { enabled: false, smsMonthlyMinor: null, whatsappMonthlyMinor: null, warnPct: 80, fallbackToCheapest: false },
    labelKey: 'messages.costCeiling.label',
    helpKey: 'messages.costCeiling.help',
    sortOrder: 704,
  }),
  'marketing.verdicts': setting({
    ...store,
    group: 'marketing',
    valueType: 'JSON',
    schema: marketingVerdictsSchema,
    default: { scale: 4, keep: 2.5, fix: 1.5 },
    labelKey: 'marketing.verdicts.label',
    helpKey: 'marketing.verdicts.help',
    sortOrder: 705,
  }),
  'marketing.metaFeed': setting({
    ...store,
    group: 'marketing',
    valueType: 'JSON',
    schema: marketingMetaFeedSchema,
    default: { on: false },
    labelKey: 'marketing.metaFeed.label',
    helpKey: 'marketing.metaFeed.help',
    sortOrder: 707,
  }),
};

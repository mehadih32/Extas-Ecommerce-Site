// S22 · PR 433 (CN-031 lane C; Blueprint B4.7 bullet 3, B4.14 item 9) — follow-ups on chats that did not become an
// order: the bag left in the chat, the products sent and not ordered, and (win-back) an order of the chat that was
// cancelled. Registry versions 183–184 (lane C's range). Labels: messages/support-followup.<lang>.json; the admin's
// place is Support → Support settings (docs/ADMIN-ARCHITECTURE.md §4.7).
//
// `support.followUp` (per store):
// - `enabled`: the inbox gets a "Follow-ups" view and a chat that is due shows a follow-up, written from the store's
//   own words; a person reads it, may change it, and presses Send — or Skip. Nothing is ever sent by itself (the core
//   decision "AI drafts, a person sends"). Off as it ships (CN-018).
// - `rules`: which chats get one — `bag` (the chat's bag has products and no order came), `products` (products were
//   sent in the chat and none was ordered), `cancelled` (win-back: the chat's order was cancelled lately; off).
// - `afterHours`: how long the customer has been quiet after the shop's last answer before a follow-up is due.
// - `maxPerChat`: follow-ups one chat may get in all; `gapDays`: one follow-up per person (one customer, every chat
//   and channel) in this many days; `perDay`: follow-ups put up for the whole store in a day.
// - `windowMarginMinutes`: Messenger and WhatsApp let a shop answer only for a while after the customer's last message
//   (`support.channels.replyWindowHours`); a chat whose window closes sooner than this gets none.
// - `cancelledDays`: a cancelled order counts for win-back this many days.
// - `banglishReply`: the language when the customer wrote Bengali in Latin letters (Bengali letters: Bengali).
// - `offerCode`: empty as it ships. The code of a coupon the owner already made (Marketing → Coupons) that a follow-up
//   may mention while that coupon is live, switched on, open to every customer and not used up. This never makes,
//   changes or widens a discount (CLAUDE.md rule 6): it only quotes the owner's own coupon.
//
// `support.followUpWords` (per store, under "More options"): the words, in both languages; only the listed {tokens}.
//
// Nothing here sends a message by itself, moves money, changes a price, a discount or COD, or blocks anyone. Nothing
// is owner data.
import { z } from 'zod';
import { setting } from './define';
import { templateTextSchema } from './schemas';

/** Which chats get a follow-up, in the order one is chosen. */
export const FOLLOW_UP_RULES = ['bag', 'products', 'cancelled'] as const;
export type FollowUpRule = (typeof FOLLOW_UP_RULES)[number];

/** The follow-up's own texts: one per rule, and the line that mentions the owner's coupon. */
export const FOLLOW_UP_TEXTS = [...FOLLOW_UP_RULES, 'offer'] as const;
export type FollowUpText = (typeof FOLLOW_UP_TEXTS)[number];

/** The tokens a follow-up may use: the greeting, the customer's name, the product last sent, the coupon's code. */
export const FOLLOW_UP_TOKENS = ['hello', 'name', 'product', 'code'] as const;

/** The bounds of every number on the card. */
export const FOLLOW_UP_BOUNDS = {
  afterHours: { min: 1, max: 72 },
  maxPerChat: { min: 1, max: 5 },
  gapDays: { min: 1, max: 90 },
  perDay: { min: 1, max: 500 },
  windowMarginMinutes: { min: 0, max: 720 },
  cancelledDays: { min: 1, max: 30 },
} as const;

const bounded = (k: keyof typeof FOLLOW_UP_BOUNDS) => z.number().int().min(FOLLOW_UP_BOUNDS[k].min).max(FOLLOW_UP_BOUNDS[k].max);

export const supportFollowUpSchema = z
  .object({
    enabled: z.boolean(),
    rules: z.array(z.enum(FOLLOW_UP_RULES)).max(FOLLOW_UP_RULES.length).refine((v) => new Set(v).size === v.length, { message: 'each rule once' }),
    afterHours: bounded('afterHours'),
    maxPerChat: bounded('maxPerChat'),
    gapDays: bounded('gapDays'),
    perDay: bounded('perDay'),
    windowMarginMinutes: bounded('windowMarginMinutes'),
    cancelledDays: bounded('cancelledDays'),
    banglishReply: z.enum(['bn', 'en']),
    offerCode: z.string().trim().max(40),
  })
  .strict();
export type SupportFollowUpSettings = z.output<typeof supportFollowUpSchema>;

export const supportFollowUpWordsSchema = z
  .object(Object.fromEntries(FOLLOW_UP_TEXTS.map((k) => [k, templateTextSchema(FOLLOW_UP_TOKENS, 400)])) as Record<FollowUpText, ReturnType<typeof templateTextSchema>>)
  .strict();
export type SupportFollowUpWordsSettings = z.output<typeof supportFollowUpWordsSchema>;

const pair = (en: string, bn: string) => ({ en, bn });

export const supportFollowUpSettings = {
  'support.followUp': setting({
    scope: 'store',
    group: 'support',
    valueType: 'JSON',
    isOwnerData: false,
    isPublic: false,
    schema: supportFollowUpSchema,
    default: { enabled: false, rules: ['bag', 'products'], afterHours: 4, maxPerChat: 1, gapDays: 7, perDay: 20, windowMarginMinutes: 60, cancelledDays: 3, banglishReply: 'bn', offerCode: '' },
    labelKey: 'support.followUp.label',
    helpKey: 'support.followUp.help',
    sortOrder: 58,
    version: 183,
  }),
  'support.followUpWords': setting({
    scope: 'store',
    group: 'support',
    valueType: 'JSON',
    isOwnerData: false,
    isPublic: false,
    schema: supportFollowUpWordsSchema,
    default: {
      bag: pair('{hello} your bag in this chat is ready. Shall we place the order for you? Just reply here.', '{hello} এই চ্যাটে আপনার ব্যাগ রেডি আছে। অর্ডারটা করে দেব? এখানেই জানান।'),
      products: pair('{hello} did you like the {product} we sent? Tell us your size and we can place the order for you here.', '{hello} যে {product} পাঠিয়েছিলাম, পছন্দ হয়েছে? সাইজ জানালে এখানেই অর্ডার করে দিতে পারি।'),
      cancelled: pair('{hello} we saw your order was cancelled. If you would still like it, or another size or colour, tell us here and we will help.', '{hello} আপনার অর্ডার বাতিল হয়েছিল দেখলাম। এখনও চাইলে, বা অন্য সাইজ বা রং চাইলে, এখানে জানান — আমরা সাহায্য করব।'),
      offer: pair('You can use the code {code} at checkout.', 'চেকআউটে {code} কোডটা ব্যবহার করতে পারেন।'),
    },
    labelKey: 'support.followUpWords.label',
    helpKey: 'support.followUpWords.help',
    sortOrder: 59,
    version: 184,
  }),
};

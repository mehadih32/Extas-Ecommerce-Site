// S22 · PR 432 (CN-031 lane C; Blueprint B4.7, B4.14 item 8; SIM-F-012) — EXTAS AI's draft answers in a support chat.
// Registry versions 180–182 (lane C's range). Labels: messages/support-drafts.<lang>.json; the admin's place is
// Support → Support settings (docs/ADMIN-ARCHITECTURE.md §4.7).
//
// `support.drafts` (per store):
// - `enabled`: above the reply box, a draft answer to what the customer asked last — worked out from what they wrote
//   (cancel > complaint > late > bulk > exchange > size > order status, SIM-F-012's precedence), the chat's order and
//   its parcel, and Find My Size. A person reads it and presses "Use draft"; nothing is sent by itself (the core
//   decision "AI drafts, a person sends"). Off as it ships (CN-018).
// - `banglishReply`: the language of the draft when the customer wrote Bengali in Latin letters (Bengali script is
//   always answered in Bengali).
// - `handover`: the questions the draft marks "for a person" (a complaint, a bulk order for the owner, …).
// - `bulkPieces`: how many pieces in one message make it a bulk question.
//
// `support.draftWords` (per store, under "More options"): the draft's words in both languages; only the listed {tokens}
// may be used. `support.draftKeywords` (per store, under "More options"): the words that tell each question apart
// (comma-separated; Bengali, Banglish and English).
//
// Nothing here sends a message, moves money, changes a price or COD, or blocks anyone: a draft promises no refund, no
// discount and no exchange; it asks for a photo or says a person will look. Nothing is owner data.
import { z } from 'zod';
import { setting } from './define';
import { templateTextSchema } from './schemas';

/** What a customer's message can be about, in the order the draft decides (SIM-F-012). */
export const DRAFT_INTENTS = ['cancel', 'complaint', 'late', 'bulk', 'exchange', 'size', 'status', 'greeting', 'unknown'] as const;
export type DraftIntent = (typeof DRAFT_INTENTS)[number];

/** The kinds of complaint, each with its own words and answer. */
export const DRAFT_COMPLAINTS = ['overcharge', 'wrong', 'damage', 'fade'] as const;
export type DraftComplaint = (typeof DRAFT_COMPLAINTS)[number];

/** The word lists that tell the questions apart (`pieces`: what follows a count in a bulk question, "40 polos"). */
export const DRAFT_WORD_LISTS = ['cancel', ...DRAFT_COMPLAINTS, 'late', 'bulk', 'pieces', 'exchange', 'size', 'status', 'greeting'] as const;
export type DraftWordList = (typeof DRAFT_WORD_LISTS)[number];

/** The draft's own texts. */
export const DRAFT_TEXTS = [
  'hello',
  'helloNoName',
  'cancel',
  ...DRAFT_COMPLAINTS,
  'late',
  'bulk',
  'exchange',
  'size',
  'sizeAsk',
  'statusPreparing',
  'statusShipped',
  'statusDelivered',
  'statusCancelled',
  'noOrder',
  'greeting',
  'unknown',
] as const;
export type DraftText = (typeof DRAFT_TEXTS)[number];

/** The tokens a draft text may use: the greeting, the customer's name, the order, its courier and tracking code, the size, the days since the order. */
export const DRAFT_TOKENS = ['hello', 'name', 'number', 'courier', 'tracking', 'size', 'days'] as const;

/** The bounds of a bulk count. */
export const DRAFT_BULK_PIECES = { min: 2, max: 1000 } as const;

export const supportDraftsSchema = z
  .object({
    enabled: z.boolean(),
    banglishReply: z.enum(['bn', 'en']),
    handover: z.array(z.enum(DRAFT_INTENTS)).max(DRAFT_INTENTS.length).refine((v) => new Set(v).size === v.length, { message: 'each question once' }),
    bulkPieces: z.number().int().min(DRAFT_BULK_PIECES.min).max(DRAFT_BULK_PIECES.max),
  })
  .strict();
export type SupportDraftsSettings = z.output<typeof supportDraftsSchema>;

const wordList = z.string().trim().max(600);

export const supportDraftWordsSchema = z
  .object(Object.fromEntries(DRAFT_TEXTS.map((k) => [k, templateTextSchema(DRAFT_TOKENS, 400)])) as Record<DraftText, ReturnType<typeof templateTextSchema>>)
  .strict();
export type SupportDraftWordsSettings = z.output<typeof supportDraftWordsSchema>;

export const supportDraftKeywordsSchema = z.object(Object.fromEntries(DRAFT_WORD_LISTS.map((k) => [k, wordList])) as Record<DraftWordList, typeof wordList>).strict();
export type SupportDraftKeywordsSettings = z.output<typeof supportDraftKeywordsSchema>;

const pair = (en: string, bn: string) => ({ en, bn });

export const supportDraftsSettings = {
  'support.drafts': setting({
    scope: 'store',
    group: 'support',
    valueType: 'JSON',
    isOwnerData: false,
    isPublic: false,
    schema: supportDraftsSchema,
    default: { enabled: false, banglishReply: 'bn', handover: ['complaint', 'bulk', 'unknown'], bulkPieces: 10 },
    labelKey: 'support.drafts.label',
    helpKey: 'support.drafts.help',
    sortOrder: 55,
    version: 180,
  }),
  'support.draftWords': setting({
    scope: 'store',
    group: 'support',
    valueType: 'JSON',
    isOwnerData: false,
    isPublic: false,
    schema: supportDraftWordsSchema,
    default: {
      hello: pair('Hi {name},', '{name}, আসসালামু আলাইকুম।'),
      helloNoName: pair('Hi,', 'আসসালামু আলাইকুম।'),
      cancel: pair('{hello} we have your request to cancel order {number}. A team member will confirm it here shortly.', '{hello} অর্ডার {number} বাতিলের অনুরোধ পেয়েছি। আমাদের একজন এখানেই একটু পরে নিশ্চিত করবেন।'),
      overcharge: pair('{hello} sorry the rider asked for more than the amount due on order {number}. Please send a photo of the parcel slip or tell us how much you paid; a team member will look into it.', '{hello} অর্ডার {number}-এ রাইডার বেশি টাকা চেয়েছেন, এজন্য দুঃখিত। পার্সেলের স্লিপের ছবি বা কত টাকা দিয়েছেন জানান; আমাদের একজন দেখবেন।'),
      wrong: pair('{hello} sorry you received a different item on order {number}. Please send a photo of what arrived; a team member will check it and reply here.', '{hello} অর্ডার {number}-এ অন্য প্রোডাক্ট গেছে, এজন্য দুঃখিত। যা পেয়েছেন তার একটা ছবি পাঠান; আমাদের একজন দেখে এখানে জানাবেন।'),
      damage: pair('{hello} sorry the item on order {number} arrived damaged. Please send a photo of it; a team member will check it and reply here.', '{hello} অর্ডার {number}-এর প্রোডাক্ট নষ্ট অবস্থায় পৌঁছেছে, এজন্য দুঃখিত। একটা ছবি পাঠান; আমাদের একজন দেখে এখানে জানাবেন।'),
      fade: pair('{hello} sorry about the colour on order {number}. Please send a photo of it; a team member will check it and reply here.', '{hello} অর্ডার {number}-এর রং নিয়ে সমস্যার জন্য দুঃখিত। একটা ছবি পাঠান; আমাদের একজন দেখে এখানে জানাবেন।'),
      late: pair('{hello} sorry, order {number} is taking longer than it should ({days} days so far). It is with {courier}, tracking {tracking}. We are checking with the courier now.', '{hello} দুঃখিত, অর্ডার {number} পৌঁছাতে দেরি হচ্ছে (এ পর্যন্ত {days} দিন)। পার্সেল {courier}-এর কাছে, ট্র্যাকিং {tracking}। আমরা এখনই কুরিয়ারের সাথে কথা বলছি।'),
      bulk: pair('{hello} thank you for your interest in a bulk order. Our owner will contact you about it here.', '{hello} একসাথে বেশি পিস নিতে চাওয়ার জন্য ধন্যবাদ। আমাদের মালিক এখানেই আপনার সাথে কথা বলবেন।'),
      exchange: pair('{hello} we can help with an exchange on order {number}. Please tell us the size or item you want instead; a team member will check and reply here.', '{hello} অর্ডার {number}-এর এক্সচেঞ্জে সাহায্য করছি। কোন সাইজ বা প্রোডাক্ট চান জানান; আমাদের একজন দেখে এখানে জানাবেন।'),
      size: pair('{hello} for your height and weight, size {size} should fit you well.', '{hello} আপনার উচ্চতা আর ওজনে {size} সাইজ ভালো ফিট হবে।'),
      sizeAsk: pair('{hello} please tell us your height and weight and which product you like; we will tell you the right size.', '{hello} আপনার উচ্চতা, ওজন আর কোন প্রোডাক্টটা পছন্দ জানান; আমরা ঠিক সাইজ বলে দেব।'),
      statusPreparing: pair('{hello} order {number} is being prepared and will go to the courier soon.', '{hello} অর্ডার {number} তৈরি হচ্ছে, শিগগিরই কুরিয়ারে যাবে।'),
      statusShipped: pair('{hello} order {number} is on its way with {courier}, tracking {tracking}.', '{hello} অর্ডার {number} {courier}-এর মাধ্যমে আসছে, ট্র্যাকিং {tracking}।'),
      statusDelivered: pair('{hello} order {number} shows as delivered. If anything is not right, please tell us here.', '{hello} অর্ডার {number} ডেলিভারি হয়ে গেছে দেখাচ্ছে। কিছু ঠিক না থাকলে এখানেই জানান।'),
      statusCancelled: pair('{hello} order {number} was cancelled. Would you like to order again?', '{hello} অর্ডার {number} বাতিল হয়েছিল। আবার অর্ডার করতে চান?'),
      noOrder: pair('{hello} please send your order number or the phone number you ordered with, and we will check it.', '{hello} অর্ডার নম্বর বা যে ফোন নম্বরে অর্ডার করেছেন সেটা পাঠান, আমরা দেখে জানাচ্ছি।'),
      greeting: pair('{hello} how can we help you?', '{hello} কীভাবে সাহায্য করতে পারি?'),
      unknown: pair('{hello} thank you for your message. A team member will reply here shortly.', '{hello} মেসেজের জন্য ধন্যবাদ। আমাদের একজন একটু পরে এখানে উত্তর দেবেন।'),
    },
    labelKey: 'support.draftWords.label',
    helpKey: 'support.draftWords.help',
    sortOrder: 56,
    version: 181,
  }),
  'support.draftKeywords': setting({
    scope: 'store',
    group: 'support',
    valueType: 'JSON',
    isOwnerData: false,
    isPublic: false,
    schema: supportDraftKeywordsSchema,
    default: {
      cancel: 'cancel, বাতিল, ক্যানসেল, batil, lagbe na, লাগবে না',
      overcharge: 'beshi chailo, beshi chaise, beshi taka, extra taka, overcharge, বেশি চাইল, বেশি চেয়েছে, বেশি টাকা, বাড়তি টাকা',
      wrong: 'wrong item, wrong product, vul product, bhul product, onno product, pathiyeche, pathaise, পাঠিয়েছে, ভুল প্রোডাক্ট, অন্য প্রোডাক্ট, অন্য রং',
      damage: 'damage, damaged, chera, chira, fata, ফাটা, ছেঁড়া, ছেড়া, নষ্ট, broken',
      fade: 'fade, rong uthe, rong cheriye, রং উঠে, রং চটে, রং ছেড়ে',
      late: 'late, deri, deree, pai nai, paini, ekhono pai, kobe pabo, still not, not received, দেরি, পাইনি, পাই নাই, এখনো পাইনি, কবে পাব',
      bulk: 'bulk, wholesale, paikari, corporate, পাইকারি, বাল্ক, কর্পোরেট',
      pieces: 'pcs, pc, piece, pieces, ta, ti, polo, polos, shirt, shirts, t-shirt, t-shirts, panjabi, pant, pants, টা, টি, পিস, পোলো, শার্ট, প্যান্ট, পাঞ্জাবি',
      exchange: 'exchange, change korte, bodlate, bodle, এক্সচেঞ্জ, বদলাতে, বদলে, পাল্টাতে',
      size: 'size, saiz, height, weight, feet, ft, kg, uchcota, ojon, সাইজ, মাপ, উচ্চতা, ওজন, ফুট, কেজি',
      status: 'order, kothay, kotha, status, track, parcel, অর্ডার, কোথায়, পার্সেল, ট্র্যাক',
      greeting: 'hi, hello, salam, assalamu, hey, হাই, হ্যালো, সালাম, আসসালামু',
    },
    labelKey: 'support.draftKeywords.label',
    helpKey: 'support.draftKeywords.help',
    sortOrder: 57,
    version: 182,
  }),
};

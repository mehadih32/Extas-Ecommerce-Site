// S28 · PR 692 (CN-048) — Inbox › Quick replies, the rules that need no database: what a short name may be, how
// `/name` in a reply box is read, which language's text goes out, and the 8 starter replies every shop starts with (the
// shop edits or archives them; none is a policy: delivery days, prices and rules are the shop's own words to change).
import { z } from 'zod';

/** A short name: one word of lower-case letters and digits. */
export const SHORTCUT = /^[a-z0-9]{1,24}$/; // hardcode-ok: the shape of a typed word, not a business number

/** What a person typed as a short name, made safe ("/Size " becomes "size"); '' when nothing usable is left. */
export function cleanShortcut(raw: string): string {
  return raw.trim().replace(/^\/+/, '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24); // hardcode-ok: same word shape
}

/** `/name` or `/name ` alone in the box is a quick reply; anything else is not. Returns the name or null. */
export function slashShortcut(text: string): string | null {
  const m = /^\/([a-z0-9]{1,24})\s?$/i.exec(text);
  return m ? m[1]!.toLowerCase() : null;
}

export type ReplyLang = 'en' | 'bn';

export interface SavedReplyLike {
  shortcut: string;
  bodyEn: string;
  bodyBn: string;
}

/** The text to put in the box: the chat's language, else the other one when that is empty. */
export function replyBody(r: SavedReplyLike, lang: ReplyLang): string {
  const first = lang === 'bn' ? r.bodyBn : r.bodyEn;
  const second = lang === 'bn' ? r.bodyEn : r.bodyBn;
  return first.trim() ? first : second;
}

export const savedReplyInput = (maxChars: number) =>
  z
    .object({
      shortcut: z.string().transform(cleanShortcut).pipe(z.string().regex(SHORTCUT)),
      bodyEn: z.string().trim().max(maxChars),
      bodyBn: z.string().trim().max(maxChars),
    })
    .strict()
    .refine((v) => v.bodyEn !== '' || v.bodyBn !== '', { message: 'at least one text', path: ['bodyEn'] });

/** The 8 starters. Words only: no amount, day count or rule is fixed by them that the shop cannot edit. */
export const STARTER_REPLIES: readonly SavedReplyLike[] = [
  { shortcut: 'hello', bodyEn: 'Hello! Thank you for writing to us. How can we help you today?', bodyBn: 'আসসালামু আলাইকুম! আমাদের মেসেজ করার জন্য ধন্যবাদ। আপনাকে কীভাবে সাহায্য করতে পারি?' },
  { shortcut: 'size', bodyEn: 'Our size chart is on every product page. Tell us your chest size and we will match the right size for you.', bodyBn: 'প্রতিটা প্রোডাক্টের পাতায় সাইজ চার্ট আছে। আপনার বুকের মাপ বললে সঠিক সাইজ মিলিয়ে দিই।' },
  { shortcut: 'cod', bodyEn: 'Cash on delivery is available. You pay the rider when you receive the parcel.', bodyBn: 'ক্যাশ অন ডেলিভারি আছে। পার্সেল হাতে পেয়ে রাইডারকে টাকা দেবেন।' },
  { shortcut: 'delivery', bodyEn: 'We deliver all over Bangladesh. Please send your full address and phone number.', bodyBn: 'সারা বাংলাদেশে ডেলিভারি দিই। অনুগ্রহ করে পুরো ঠিকানা আর ফোন নম্বর পাঠান।' }, // hardcode-ok: a starter text the shop edits in Inbox › Quick replies
  { shortcut: 'exchange', bodyEn: 'If the size does not fit, you can ask for an exchange. Tell us your order number and we will arrange it.', bodyBn: 'সাইজ না মিললে এক্সচেঞ্জ চাইতে পারেন। অর্ডার নম্বর বলুন, আমরা ব্যবস্থা করছি।' },
  { shortcut: 'track', bodyEn: 'Please send your order number and we will tell you where your parcel is.', bodyBn: 'আপনার অর্ডার নম্বর দিন, পার্সেল কোথায় আছে জানিয়ে দিচ্ছি।' },
  { shortcut: 'stock', bodyEn: 'Please tell us the product, colour and size, and we will check if it is in stock.', bodyBn: 'প্রোডাক্ট, রং আর সাইজ বলুন, স্টকে আছে কিনা দেখে জানাচ্ছি।' },
  { shortcut: 'thanks', bodyEn: 'Thank you for shopping with us! Please tell us when you receive your parcel.', bodyBn: 'আমাদের সাথে কেনাকাটার জন্য ধন্যবাদ! পার্সেল পেলে জানাবেন।' },
];

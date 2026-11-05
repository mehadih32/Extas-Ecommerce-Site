// S18 · PR 623 (CN-034, 1 Nov 2026; customer 360° finding 6, step `account/privacy-request`) — the customer's own
// privacy request from his account. Registry version 221 (lane C's next free number). Labels:
// messages/privacy-customer.<lang>.json; the admin's place is Settings › Privacy & data (PR 382's page and list).
//
// `privacy.customerRequests` (per store): off as it ships, and shown to customers only while PR 382's
// `privacy.erasureRequests` is on too.
// - `enabled`: the switch. Off: no card on My account › Profile and the shop's request answer refuses.
// - `kinds`: what he may ask for — a copy of his data (COPY) and/or its erasure (ERASURE).
// - `copyDays`: how many days an approved copy stays ready to download from his signed-in account.
// - `words`: the card's title, the plain notice of what erasure keeps, and the two buttons, in English and Bengali.
//
// A request changes nothing: it files into PR 382's staff list. A copy is prepared only after staff approve it; an
// erasure is carried out only by the owner with the typed word, never while an order is on its way (PR 382, unchanged).
import { z } from 'zod';
import { setting } from './define';

/** What a customer may ask for. */
export const PRIVACY_REQUEST_KINDS = ['COPY', 'ERASURE'] as const;
export type PrivacyRequestKind = (typeof PRIVACY_REQUEST_KINDS)[number];

/** The words of the card, each in English and Bengali. */
export const PRIVACY_REQUEST_WORDS = ['title', 'notice', 'copy', 'erasure'] as const;
export type PrivacyRequestWord = (typeof PRIVACY_REQUEST_WORDS)[number];

/** The longest a word may be (the notice is a short paragraph). */
export const PRIVACY_REQUEST_WORDS_MAX = 600;

const pair = z.object({ en: z.string().trim().min(1).max(PRIVACY_REQUEST_WORDS_MAX), bn: z.string().trim().min(1).max(PRIVACY_REQUEST_WORDS_MAX) }).strict();

export const privacyCustomerRequestsSchema = z
  .object({
    enabled: z.boolean(),
    kinds: z
      .array(z.enum(PRIVACY_REQUEST_KINDS))
      .min(1)
      .max(PRIVACY_REQUEST_KINDS.length)
      .refine((a) => new Set(a).size === a.length, 'each kind once'),
    copyDays: z.int().min(1).max(30),
    words: z.object(Object.fromEntries(PRIVACY_REQUEST_WORDS.map((k) => [k, pair])) as Record<PrivacyRequestWord, typeof pair>).strict(),
  })
  .strict();
export type PrivacyCustomerRequestsSettings = z.output<typeof privacyCustomerRequestsSchema>;

export const privacyCustomerSettings = {
  'privacy.customerRequests': setting({
    scope: 'store',
    group: 'privacy',
    valueType: 'JSON',
    isOwnerData: false,
    isPublic: false,
    schema: privacyCustomerRequestsSchema,
    default: {
      enabled: false,
      kinds: ['COPY', 'ERASURE'],
      copyDays: 7,
      words: {
        title: { en: 'Your data', bn: 'আপনার তথ্য' },
        notice: {
          en: 'You can ask for a copy of your data, or for it to be erased. Nothing changes when you ask: our team looks at it first. Erasure removes your name, numbers, e-mail, birthday and addresses and closes this account. Your orders stay for the shop’s records, with their money, items and history but without your contact details; the shop’s legal, money and stock records stay too.',
          bn: 'আপনি আপনার তথ্যের একটা কপি চাইতে পারেন, অথবা তথ্য মুছে ফেলতে বলতে পারেন। চাইলেই কিছু বদলায় না: আগে আমাদের টিম দেখে। মুছে ফেললে আপনার নাম, নম্বর, ই-মেইল, জন্মদিন আর ঠিকানা চলে যায়, আর এই অ্যাকাউন্ট বন্ধ হয়। দোকানের হিসাবের জন্য আপনার অর্ডারগুলো থাকে — টাকা, জিনিস আর ইতিহাসসহ, কিন্তু আপনার যোগাযোগের তথ্য ছাড়া; দোকানের আইনি, টাকার আর স্টকের রেকর্ডও থাকে।',
        },
        copy: { en: 'Ask for a copy of my data', bn: 'আমার তথ্যের কপি চাই' },
        erasure: { en: 'Ask to erase my data', bn: 'আমার তথ্য মুছে ফেলতে চাই' },
      },
    },
    labelKey: 'privacy.customerRequests.label',
    helpKey: 'privacy.customerRequests.help',
    sortOrder: 30,
    version: 221,
  }),
};

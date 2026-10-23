// S02 · storefront search — PR 72 (the search panel, the index across products, categories and help pages, prefix and
// synonym matching, Bengali keywords) and PR 73 (the results page with filters and sort). Registry version 24.
// Labels: messages/search.<lang>.json.
//
// The engine (packages/search): Meilisearch when the server has it and its index is current, else the shop's own
// PostgreSQL catalogue (CI, a computer, a server without Meilisearch) — the same answers either way. The word lists
// are the demo's (docs/demo/src/21-category.js SRCH_PHRASES / SRCH_SYNONYMS / SRCH_GENERIC, 07-help-search.js
// HELP_INDEX): general menswear words in English, Banglish and Bengali, no owner data; the owner adds his own later.
// CN-018: every number is a setting with limits; the owner's "popular searches" list ships empty (the panel shows the
// categories instead), so nothing he did not choose is offered as "popular".
import { z } from 'zod';
import { setting } from './define';
import { HELP_PAGES, type HelpSlug } from './registry-shop-more';

const V = 24;

/** A word or short phrase a shopper types (any script; matched after lower-casing). */
const wordSchema = z.string().trim().min(1).max(40);
const wordList = (max: number) => z.array(wordSchema).max(max);

// ---- the engine ----

export const SEARCH_MODES = ['auto', 'postgres'] as const;

export const searchEngineSchema = z
  .object({
    /** 'auto': Meilisearch when the server has it (its address and key) and its index is current, else PostgreSQL;
     * 'postgres': always the shop's own database (Meilisearch is then left alone). */
    mode: z.enum(SEARCH_MODES),
    /** How long one Meilisearch answer may take before the shop asks PostgreSQL instead. */
    timeoutMs: z.int().min(100).max(10_000),
    /** Seconds the shop keeps the word list it searches and the index's freshness before reading them again
     * (a newly published product is found after at most this long; 0 = read on every search). */
    cacheSeconds: z.int().min(0).max(3600),
    /** The most products one search hands to the results page (before its filters). */
    maxResults: z.int().min(20).max(2000),
    /** Index names: `<prefix>-<store>` (one per store) and `<prefix>-meta`. */
    indexPrefix: z.string().regex(/^[a-z][a-z0-9-]{0,30}$/),
    /** Products sent to Meilisearch per request while the worker indexes. */
    batchSize: z.int().min(50).max(5000),
    /** How long the worker waits for Meilisearch to finish one indexing task. */
    taskWaitSeconds: z.int().min(5).max(600),
  })
  .strict();

// ---- matching ----

export const searchMatchSchema = z
  .object({
    /** A word this long or longer may be one letter off ("pollo" → polo, "panjbi" → panjabi). */
    oneTypoAt: z.int().min(3).max(12),
    /** A word this long or longer may be two letters off ("hoodiee" → hoodie). */
    twoTyposAt: z.int().min(4).max(20),
    /** The start of a word finds the whole word ("pol" → polo). Off = whole words only. */
    prefix: z.boolean(),
  })
  .strict()
  .refine((m) => m.oneTypoAt <= m.twoTyposAt, { message: 'two slips need a longer word than one' });

// ---- the word lists (synonyms and Bengali keywords) ----

export const searchWordsSchema = z
  .object({
    /** Read as one word: "t shirt" → tshirt, "polo shirt" → polo. */
    phrases: z
      .array(z.object({ from: wordSchema, to: wordSchema }).strict())
      .max(200),
    /** A word also finds these (one way): গেঞ্জি → tshirt, tee; pant → trouser, chino … */
    synonyms: z
      .array(z.object({ word: wordSchema, alts: wordList(12).min(1) }).strict())
      .max(500)
      .refine((l) => new Set(l.map((s) => s.word.toLowerCase())).size === l.length, { message: 'every word once' }),
    /** Words that only describe ("shirt", "for men", "দাম"): when a search finds nothing with them, it tries without. */
    general: wordList(300),
  })
  .strict();

// ---- the help pages in search ----

export const searchHelpSchema = z
  .object({
    /** Help pages answer in the panel and on the results page. */
    on: z.boolean(),
    /** Words that find each help page (English, Banglish, Bengali, common misspellings), besides its own title. */
    keywords: z.record(z.enum(HELP_PAGES), wordList(120)),
    /** Words too general to decide alone ("policy", "charge"): they still find pages, but a more exact word wins. */
    weak: wordList(60),
  })
  .strict();

// ---- the panel (phone window, desktop panel under the header) ----

export const searchPanelSchema = z
  .object({
    /** Computer: the search icon drops a panel under the header (demo D-014); off = the same window as the phone. */
    desktopPanel: z.boolean(),
    /** Products in the live suggestions: phone list, computer grid. */
    phoneProducts: z.int().min(0).max(12),
    desktopProducts: z.int().min(0).max(12),
    /** Help answers in the live suggestions. */
    help: z.int().min(0).max(6),
    /** Matching categories in the live suggestions (0 = none). */
    categories: z.int().min(0).max(12),
    /** The owner's "popular searches" (empty: the panel offers the categories instead). */
    popular: wordList(12),
    /** Wait after the last key before asking (ms). */
    debounceMs: z.int().min(0).max(2000),
    /** Letters typed before suggestions start. */
    minChars: z.int().min(1).max(5),
  })
  .strict();

// ---- the results page ----

export const searchResultsSchema = z
  .object({
    /** Help answers on top of the results ("Help & policies"). */
    help: z.int().min(0).max(8),
    /** Matching categories as links over the results. */
    categories: z.int().min(0).max(12),
    /** Nothing found: offer the nearest word the shop knows ("Did you mean polo?"). */
    didYouMean: z.boolean(),
    /** Nothing found for every word: show what some of the words find, saying which. */
    partial: z.boolean(),
    /** Nothing found (or nothing typed): this many of the newest styles under the suggestions (0 = none). */
    picks: z.int().min(0).max(12),
    /** "Can't find it? Ask us on WhatsApp" on an empty page (only when the shop has a WhatsApp number). */
    whatsapp: z.boolean(),
  })
  .strict();

const json = { scope: 'store', valueType: 'JSON', isOwnerData: false, isPublic: true, version: V } as const;

/** The demo's help-page words (07-help-search.js HELP_INDEX), grouped by the help page that answers them now. */
const HELP_KEYWORDS: Record<HelpSlug, string[]> = {
  delivery: [
    'delivery', 'delivery charge', 'delivery cost', 'delivery fee', 'delivery time', 'delivery policy', 'shipping', 'shipping charge', 'shipping cost',
    'shipping policy', 'ship', 'charge', 'cost', 'fee', 'time', 'days', 'how many days', 'how long', 'when will i get', 'free delivery', 'free shipping',
    'courier', 'courier charge', 'home delivery', 'inside dhaka', 'outside dhaka', 'parcel', 'delivery koto', 'koto din', 'cod', 'cash on delivery',
    'refuse parcel', 'reject parcel', 'eid delivery', 'before eid', 'delivari', 'delevery', 'dilivery', 'delibery', 'deleviry',
    'ডেলিভারি', 'ডেলিভারী', 'ডেলিভারি চার্জ', 'ডেলিভারি খরচ', 'ডেলিভারি কত', 'ডেলিভারি কতদিন', 'চার্জ', 'খরচ', 'কুরিয়ার', 'কত দিন', 'কতদিন',
    'ফ্রি ডেলিভারি', 'হোম ডেলিভারি', 'ঢাকার ভিতরে', 'ঢাকার বাইরে', 'শিপিং', 'পার্সেল', 'ক্যাশ অন ডেলিভারি', 'ঈদ',
  ],
  exchange: [
    'exchange', 'exchange policy', 'size exchange', 'change size', 'size change', 'swap', 'replace', 'replacement', 'wrong size', 'size problem', 'not fit',
    'does not fit', 'exchange charge', 'return', 'returns', 'return policy', 'refund', 'refund policy', 'money back', 'policy', 'bodlano', 'bodli',
    'exchange korbo', 'ferot', 'taka ferot', 'exchang', 'excange', 'exchenge', 'echange', 'exchnge', 'retun', 'retrun', 'refand', 'refun', 'ritarn',
    'এক্সচেঞ্জ', 'এক্সচেঞ্জ পলিসি', 'সাইজ পরিবর্তন', 'সাইজ চেঞ্জ', 'সাইজ বদল', 'বদল', 'বদলানো', 'পরিবর্তন', 'চেঞ্জ', 'রিটার্ন', 'রিটার্ন পলিসি', 'রিফান্ড',
    'ফেরত', 'টাকা ফেরত', 'পলিসি',
  ],
  faq: [
    'faq', 'faqs', 'question', 'questions', 'help', 'help center', 'original', 'genuine', 'authentic', 'fake', 'colour accurate', 'color accurate',
    'true colour', 'true color', 'shop', 'showroom', 'outlet', 'store address', 'প্রশ্ন', 'সাহায্য', 'অরিজিনাল', 'আসল', 'নকল', 'দোকান', 'শোরুম',
  ],
  contact: [
    'contact', 'contact us', 'phone', 'phone number', 'call', 'hotline', 'helpline', 'whatsapp', 'whats app', 'email', 'customer care', 'customer service',
    'support', 'number', 'mobile number', 'message', 'contuct', 'watsapp', 'whatsap', 'hotlin',
    'যোগাযোগ', 'ফোন', 'হটলাইন', 'হোয়াটসঅ্যাপ', 'কল', 'নাম্বার', 'নম্বর', 'কাস্টমার কেয়ার',
  ],
  privacy: ['privacy', 'privacy policy', 'personal data', 'personal information', 'my data', 'delete my data', 'policy', 'প্রাইভেসি', 'গোপনীয়তা'],
  terms: [
    'terms', 'terms and conditions', 'conditions', 'tnc', 'rules', 'policy', 'payment', 'pay', 'payment method', 'how to pay', 'bkash', 'nagad', 'card',
    'শর্ত', 'শর্তাবলী', 'নিয়ম', 'পেমেন্ট', 'বিকাশ', 'নগদ',
  ],
  story: ['about', 'about us', 'our story', 'story', 'who are you', 'company', 'made in bangladesh', 'আমাদের সম্পর্কে'],
};

export const searchSettings = {
  'search.engine': setting({
    ...json,
    group: 'search',
    schema: searchEngineSchema,
    default: { mode: 'auto', timeoutMs: 800, cacheSeconds: 30, maxResults: 500, indexPrefix: 'shop', batchSize: 500, taskWaitSeconds: 60 },
    labelKey: 'search.engine.label',
    helpKey: 'search.engine.help',
    sortOrder: 10,
  }),
  'search.match': setting({
    ...json,
    group: 'search',
    schema: searchMatchSchema,
    // demo srch_run0 / hs_tokEq: one slip from 4 letters, two from 7; the start of a word finds it
    default: { oneTypoAt: 4, twoTyposAt: 7, prefix: true },
    labelKey: 'search.match.label',
    helpKey: 'search.match.help',
    sortOrder: 20,
  }),
  'search.words': setting({
    ...json,
    group: 'search',
    schema: searchWordsSchema,
    default: {
      phrases: [
        { from: 't shirt', to: 'tshirt' },
        { from: 'tee shirt', to: 'tshirt' },
        { from: 'টি শার্ট', to: 'টিশার্ট' },
        { from: 'polo shirt', to: 'polo' },
        { from: 'polo tshirt', to: 'polo' },
        { from: 'পোলো শার্ট', to: 'পোলো' },
        { from: 'পোলো গেঞ্জি', to: 'পোলো' },
        { from: 'track suit', to: 'tracksuit' },
        { from: 'sweat shirt', to: 'sweatshirt' },
      ],
      synonyms: [
        { word: 'গেঞ্জি', alts: ['tshirt', 'tee'] },
        { word: 'গেঞ্জী', alts: ['tshirt', 'tee'] },
        { word: 'genji', alts: ['tshirt', 'tee'] },
        { word: 'ganji', alts: ['tshirt', 'tee'] },
        { word: 'gengi', alts: ['tshirt', 'tee'] },
        { word: 'genje', alts: ['tshirt', 'tee'] },
        { word: 'tee', alts: ['tshirt'] },
        { word: 'tees', alts: ['tshirt'] },
        { word: 'tshirt', alts: ['tee'] },
        { word: 'টিশার্ট', alts: ['tshirt'] },
        { word: 'পোলো', alts: ['polo'] },
        { word: 'পাঞ্জাবি', alts: ['panjabi'] },
        { word: 'পাঞ্জাবী', alts: ['panjabi'] },
        { word: 'punjabi', alts: ['panjabi'] },
        { word: 'kurta', alts: ['panjabi'] },
        { word: 'pant', alts: ['trouser', 'chino', 'jeans', 'jogger'] },
        { word: 'pants', alts: ['trouser', 'chino', 'jeans', 'jogger'] },
        { word: 'প্যান্ট', alts: ['trouser', 'chino', 'jeans', 'jogger'] },
        { word: 'trousers', alts: ['trouser'] },
        { word: 'জিন্স', alts: ['jeans'] },
        { word: 'denim', alts: ['jeans'] },
        { word: 'hoody', alts: ['hoodie'] },
        { word: 'হুডি', alts: ['hoodie'] },
        { word: 'শার্ট', alts: ['shirt'] },
        { word: 'jacket', alts: ['puffer'] },
        { word: 'জ্যাকেট', alts: ['jacket', 'puffer'] },
        { word: 'sweater', alts: ['knit'] },
        { word: 'সোয়েটার', alts: ['sweater'] },
        { word: 'জগার', alts: ['jogger'] },
        { word: 'sock', alts: ['socks'] },
        { word: 'মোজা', alts: ['socks'] },
        { word: 'বেল্ট', alts: ['belt'] },
      ],
      general: [
        'shirt', 'shirts', 'শার্ট', 'গেঞ্জি', 'গেঞ্জী', 'genji', 'ganji', 'item', 'items', 'dress', 'cloth', 'clothes', 'clothing', 'wear', 'for', 'men', 'mens',
        'man', 'boys', 'boy', 'the', 'a', 'an', 'and', 'with', 'buy', 'price', 'dam', 'new', 'কত', 'দাম', 'ছেলেদের', 'জামা', 'কাপড়',
      ],
    },
    labelKey: 'search.words.label',
    helpKey: 'search.words.help',
    sortOrder: 30,
  }),
  'search.help': setting({
    ...json,
    group: 'search',
    schema: searchHelpSchema,
    default: {
      on: true,
      keywords: HELP_KEYWORDS,
      weak: ['policy', 'policies', 'rules', 'rule', 'charge', 'cost', 'fee', 'time', 'days', 'free', 'number', 'help', 'নিয়ম', 'পলিসি', 'চার্জ', 'খরচ'],
    },
    labelKey: 'search.help.label',
    helpKey: 'search.help.help',
    sortOrder: 40,
  }),
  'search.panel': setting({
    ...json,
    group: 'search',
    schema: searchPanelSchema,
    // demo HELP_MAX_SUGGEST 3, HELP_MAX_PRODUCTS 4, DSK_SEARCH.products 4; the popular words are the owner's (empty)
    default: { desktopPanel: true, phoneProducts: 4, desktopProducts: 4, help: 3, categories: 4, popular: [], debounceMs: 160, minChars: 1 },
    labelKey: 'search.panel.label',
    helpKey: 'search.panel.help',
    sortOrder: 50,
  }),
  'search.results': setting({
    ...json,
    group: 'search',
    schema: searchResultsSchema,
    // demo HELP_MAX_PAGE 4 and its four "Popular right now" cards (here the newest styles: the shop has no popularity
    // figures yet, so it never calls them popular)
    default: { help: 4, categories: 6, didYouMean: true, partial: true, picks: 4, whatsapp: true },
    labelKey: 'search.results.label',
    helpKey: 'search.results.help',
    sortOrder: 60,
  }),
};

export type SearchEngineSettings = z.output<typeof searchEngineSchema>;
export type SearchMatchSettings = z.output<typeof searchMatchSchema>;
export type SearchWordsSettings = z.output<typeof searchWordsSchema>;
export type SearchHelpSettings = z.output<typeof searchHelpSchema>;
export type SearchPanelSettings = z.output<typeof searchPanelSchema>;
export type SearchResultsSettings = z.output<typeof searchResultsSchema>;

// S04 · customer accounts — PR 129–137 (Blueprint D3.13–D3.15; demo 60-account.js, 52-thanks.js). Registry version 29 (the product page templates took 28 and merge first).
// Labels: messages/accounts.<lang>.json. Every word the account pages show is in the shop dictionary
// (apps/web/messages/shop-account.<lang>.json, `account.*`), editable in both languages through `language.labels`.
//
// SIM-F-039 (CN-017): an account made from an order never gets a password; the first sign-in is by a one-time SMS code.
// CN-018: every limit is a setting with bounds; every optional feature and perk ships off, and nothing here holds money
// or a made-up offer: the offer banner lists only the owner's own offers and the customer's real wallet balance.
import { z } from 'zod';
import { setting } from './define';
import { localizedTextSchema, templateStringSchema, templateTextSchema } from './schemas';

const V = 29;
/** PR 136 — the invoice's keys: registry version 31 (the parallel combo pages took 30). */
const V31 = 31;

/** PR 130 — the one-time sign-in code: its length, how long it works, wrong tries, and how often one may be asked for. */
export const accountCodeLimitsSchema = z
  .object({
    length: z.int().min(4).max(8),
    minutes: z.int().min(1).max(60),
    maxTries: z.int().min(1).max(10),
    resendSeconds: z.int().min(10).max(900),
    perPhoneHour: z.int().min(1).max(50),
    perIpHour: z.int().min(1).max(500),
  })
  .strict();

/** PR 131 — the sections of My account (demo 60-account.js ACC_TABS, the owner's order of §58.9). */
export const ACCOUNT_TABS = ['orders', 'foryou', 'rewards', 'wallet', 'wishlist', 'profile'] as const;
export type AccountTab = (typeof ACCOUNT_TABS)[number];

/** PR 131 — which sections show, in this order; My orders always does. */
export const accountTabsSchema = z
  .array(z.enum(ACCOUNT_TABS))
  .min(1)
  .refine((v) => new Set(v).size === v.length, { message: 'each section once' })
  .refine((v) => v.includes('orders'), { message: 'My orders always shows' });

/** PR 131 — how long the lists in My account are (0 = the For you "New in" row is off). */
export const accountListsSchema = z
  .object({
    orders: z.int().min(1).max(100),
    walletEntries: z.int().min(1).max(100),
    newIn: z.int().min(0).max(24),
  })
  .strict();

/** PR 132 — one of the owner's member offers on the banner: his own words, and the coupon code when it needs one. */
export const accountOfferSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,40}$/, { message: 'a short id: a-z, 0-9 and -' }),
    /** Shown only while this coupon really works for the customer (on, in its dates, not for guests only, not used up). */
    code: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{1,40}$/)
      .nullable(),
    title: localizedTextSchema(80),
    note: localizedTextSchema(160).nullable(),
  })
  .strict();

/** PR 132 — the offer banner on My account: off until the owner turns it on; never empty, never made up. */
export const accountOfferBannerSchema = z
  .object({
    enabled: z.boolean(),
    offers: z
      .array(accountOfferSchema)
      .max(6)
      .refine((v) => new Set(v.map((o) => o.id)).size === v.length, { message: 'each offer id once' }),
  })
  .strict();

/** PR 133 — the profile photo: kept only in the customer's own browser, shrunk to a small square before it is saved. */
export const accountPhotoSchema = z
  .object({
    enabled: z.boolean(),
    /** The largest file he may pick. */
    maxMb: z.int().min(1).max(25),
    /** The side of the square it is shrunk to. */
    sizePx: z.int().min(64).max(512),
  })
  .strict();

/** PR 130 — how customers may sign in besides the SMS code. */
export const accountLoginSchema = z
  .object({
    /** A customer who has set a password may sign in with it. */
    password: z.boolean(),
    /** A password sign-in on a device not seen before also asks for the SMS code. */
    newDeviceCode: z.boolean(),
    /** How long a device stays known after a code sign-in. */
    deviceDays: z.int().min(1).max(365),
  })
  .strict();

/** PR 135 (SIM-F-018) — the late flag: an order past its band's promise in hours (plus a grace) and not yet delivered. */
export const accountTrackLateSchema = z
  .object({
    enabled: z.boolean(),
    /** Hours after the promise before the order is called late. */
    graceHours: z.int().min(0).max(168),
  })
  .strict();

/** PR 135 (CN-014 idea 10) — the exact-amount line: what the rider may take at the door, and a way to report more. */
export const accountTrackExactSchema = z
  .object({
    enabled: z.boolean(),
    /** Show "Asked for more? Tell us" with a WhatsApp link (needs the store's WhatsApp number). */
    report: z.boolean(),
  })
  .strict();

/** PR 137 (Blueprint C6.5) — the checkout fills itself: from his account when signed in, from this browser when allowed. */
export const checkoutAutofillSchema = z
  .object({
    /** A signed-in customer's checkout starts with his name, number and default address (or his last order's). */
    account: z.boolean(),
    /** Days this browser remembers the details of his last order for the next checkout; 0 = never. */
    browserDays: z.int().min(0).max(365),
  })
  .strict();

/** PR 136 — the parts of the invoice the owner may leave out (demo 52-thanks.js INVOICE_TPL.show). */
export const INVOICE_BLOCKS = ['shopDetails', 'customer', 'address', 'courier', 'variant', 'sku', 'marks', 'payment', 'returnNote', 'footer'] as const;
export type InvoiceBlock = (typeof INVOICE_BLOCKS)[number];

/**
 * PR 136 (Blueprint B2.1; demo 52-thanks.js §53) — the customer's invoice, made from the order as it is stored: on by
 * default, as in the demo (SHOW('account','invoices')). Every word is in the shop dictionary (`account.invoice.*`);
 * the shop's own details are the owner's settings (`store.name`, `contact.*`, `legal.*`), empty until he fills them in.
 * The full template editor is PR 407/409.
 */
export const accountInvoiceSchema = z
  .object({
    enabled: z.boolean(),
    /** The invoice number from the order's: {number} is the order number, {digits} only its digits. */
    number: templateStringSchema(['number', 'digits'], 40).refine((v) => /\{(number|digits)\}/.test(v), { message: 'needs {number} or {digits}' }),
    blocks: z.object(Object.fromEntries(INVOICE_BLOCKS.map((b) => [b, z.boolean()])) as Record<InvoiceBlock, z.ZodBoolean>).strict(),
    /** The owner's own lines in a box above the footer (none by default). */
    note: localizedTextSchema(400).nullable(),
    /** The owner's own footer line; none = the dictionary's "Computer-generated invoice, no signature needed." */
    footer: localizedTextSchema(300).nullable(),
    /** "Download invoice": the invoice as one file, for a phone that cannot print. */
    download: z.boolean(),
  })
  .strict();

export type AccountInvoiceSettings = z.output<typeof accountInvoiceSchema>;

const base = { scope: 'store', isOwnerData: false, group: 'accounts', version: V } as const;

export const accountSettings = {
  // ---- PR 129 · the account made with the first order ----
  'account.autoCreate.enabled': setting({
    ...base,
    schema: z.boolean(),
    default: true,
    valueType: 'BOOLEAN',
    labelKey: 'account.autoCreate.enabled.label',
    helpKey: 'account.autoCreate.enabled.help',
    sortOrder: 10,
  }),
  'account.thanksCard.enabled': setting({
    ...base,
    schema: z.boolean(),
    default: true,
    valueType: 'BOOLEAN',
    labelKey: 'account.thanksCard.enabled.label',
    helpKey: 'account.thanksCard.enabled.help',
    sortOrder: 20,
  }),

  // ---- PR 130 · signing in: the one-time SMS code, the password, the code on a new device ----
  'account.code.limits': setting({
    ...base,
    schema: accountCodeLimitsSchema,
    default: { length: 6, minutes: 10, maxTries: 5, resendSeconds: 60, perPhoneHour: 5, perIpHour: 20 },
    valueType: 'JSON',
    labelKey: 'account.code.limits.label',
    helpKey: 'account.code.limits.help',
    sortOrder: 30,
  }),
  'account.code.text': setting({
    ...base,
    schema: templateTextSchema(['code', 'store', 'minutes'], 160),
    default: {
      en: '{code} is your {store} login code. It works for {minutes} minutes. Never share it.',
      bn: '{store} লগইন কোড {code}। {minutes} মিনিট কাজ করবে। কাউকে বলবেন না।',
    },
    valueType: 'LOCALIZED_TEXT',
    labelKey: 'account.code.text.label',
    helpKey: 'account.code.text.help',
    sortOrder: 40,
  }),
  'account.login': setting({
    ...base,
    schema: accountLoginSchema,
    default: { password: true, newDeviceCode: true, deviceDays: 90 },
    valueType: 'JSON',
    labelKey: 'account.login.label',
    helpKey: 'account.login.help',
    sortOrder: 50,
  }),

  // ---- PR 131 · My account ----
  'account.tabs': setting({
    ...base,
    schema: accountTabsSchema,
    default: [...ACCOUNT_TABS],
    valueType: 'JSON',
    labelKey: 'account.tabs.label',
    helpKey: 'account.tabs.help',
    sortOrder: 60,
  }),
  'account.addresses.max': setting({
    ...base,
    schema: z.int().min(1).max(10),
    default: 3,
    valueType: 'INT',
    labelKey: 'account.addresses.max.label',
    helpKey: 'account.addresses.max.help',
    sortOrder: 70,
  }),
  'account.lists': setting({
    ...base,
    schema: accountListsSchema,
    default: { orders: 20, walletEntries: 20, newIn: 8 },
    valueType: 'JSON',
    labelKey: 'account.lists.label',
    helpKey: 'account.lists.help',
    sortOrder: 80,
  }),

  // ---- PR 132 · the offer banner (the real wallet balance and the owner's own member offers) ----
  'account.offerBanner': setting({
    ...base,
    schema: accountOfferBannerSchema,
    default: { enabled: false, offers: [] },
    valueType: 'JSON',
    labelKey: 'account.offerBanner.label',
    helpKey: 'account.offerBanner.help',
    sortOrder: 90,
  }),

  // ---- PR 133 · the profile photo (on this device only) ----
  'account.photo': setting({
    ...base,
    schema: accountPhotoSchema,
    default: { enabled: false, maxMb: 8, sizePx: 256 },
    valueType: 'JSON',
    labelKey: 'account.photo.label',
    helpKey: 'account.photo.help',
    sortOrder: 100,
  }),
  // ---- PR 135 · the tracking page: the welcome panel, the late flag (SIM-F-018), the exact-amount line (CN-014) ----
  'account.track.welcome': setting({
    ...base,
    schema: z.boolean(),
    default: true,
    valueType: 'BOOLEAN',
    labelKey: 'account.track.welcome.label',
    helpKey: 'account.track.welcome.help',
    sortOrder: 110,
  }),
  'account.track.late': setting({
    ...base,
    schema: accountTrackLateSchema,
    default: { enabled: true, graceHours: 0 },
    valueType: 'JSON',
    labelKey: 'account.track.late.label',
    helpKey: 'account.track.late.help',
    sortOrder: 120,
  }),
  'account.track.exactAmount': setting({
    ...base,
    schema: accountTrackExactSchema,
    default: { enabled: false, report: true },
    valueType: 'JSON',
    labelKey: 'account.track.exactAmount.label',
    helpKey: 'account.track.exactAmount.help',
    sortOrder: 130,
  }),
  // ---- PR 137 · the checkout fills itself (his account; this browser only when the owner allows it) ----
  'checkout.autofill': setting({
    ...base,
    schema: checkoutAutofillSchema,
    default: { account: true, browserDays: 0 },
    valueType: 'JSON',
    labelKey: 'checkout.autofill.label',
    helpKey: 'checkout.autofill.help',
    sortOrder: 140,
  }),
  // ---- PR 136 · the invoice of an order (account order page, My orders, thank-you page) ----
  'account.invoice': setting({
    ...base,
    version: V31,
    schema: accountInvoiceSchema,
    default: {
      enabled: true,
      number: 'INV-{digits}',
      blocks: { shopDetails: true, customer: true, address: true, courier: true, variant: true, sku: false, marks: true, payment: true, returnNote: true, footer: true },
      note: null,
      footer: null,
      download: true,
    },
    valueType: 'JSON',
    labelKey: 'account.invoice.label',
    helpKey: 'account.invoice.help',
    sortOrder: 150,
  }),
  /** PR 136 — the shop's VAT registration number (BIN) on the invoice. Owner data (prefix `legal.`): no default. */
  'legal.bin': setting({
    schema: z.string().trim().min(1).max(60).nullable(),
    default: null,
    scope: 'store',
    valueType: 'STRING',
    group: 'legal',
    labelKey: 'legal.bin.label',
    helpKey: 'legal.bin.help',
    isOwnerData: true,
    sortOrder: 40,
    version: V31,
  }),
};

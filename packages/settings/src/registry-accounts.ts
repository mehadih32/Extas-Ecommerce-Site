// S04 · customer accounts — PR 129–137 (Blueprint D3.13–D3.15; demo 60-account.js, 52-thanks.js). Registry version 29 (the product page templates took 28 and merge first).
// Labels: messages/accounts.<lang>.json. Every word the account pages show is in the shop dictionary
// (apps/web/messages/shop-account.<lang>.json, `account.*`), editable in both languages through `language.labels`.
//
// SIM-F-039 (CN-017): an account made from an order never gets a password; the first sign-in is by a one-time SMS code.
// CN-018: every limit is a setting with bounds; every optional feature and perk ships off, and nothing here holds money
// or a made-up offer: the offer banner lists only the owner's own offers and the customer's real wallet balance.
import { z } from 'zod';
import { setting } from './define';
import { localizedTextSchema, templateTextSchema } from './schemas';

const V = 29;

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
};

// S04 · customer accounts — PR 129–137 (Blueprint D3.13–D3.15; demo 60-account.js, 52-thanks.js). Registry version 29 (the product page templates took 28 and merge first).
// Labels: messages/accounts.<lang>.json. Every word the account pages show is in the shop dictionary
// (apps/web/messages/shop-account.<lang>.json, `account.*`), editable in both languages through `language.labels`.
//
// SIM-F-039 (CN-017): an account made from an order never gets a password; the first sign-in is by a one-time SMS code.
// CN-018: every limit is a setting with bounds; every optional feature and perk ships off, and nothing here holds money
// or a made-up offer: the offer banner lists only the owner's own offers and the customer's real wallet balance.
import { z } from 'zod';
import { setting } from './define';
import { templateTextSchema } from './schemas';

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
};

// PR 491 — the settings registry: every setting the build knows, declared once in code with its schema and default.
// Adding a setting = adding an entry here (with labels in messages/), bumping nothing else; the deploy runs the
// settings migration (PR 496), which gives every installation the new key with its default.
//
// Only what S00 and the app need today. Business numbers (prices, charges, thresholds) arrive with their own PRs and
// the general default pack (PR 508). Defaults are neutral: owner data (PR 509) has no default at all, so nothing of the
// owner's ever ships to another installation.
import { z } from 'zod';
import { setting, type RegistryShape, type SettingKey, type SettingValue } from './define';

/** A BCP 47 language tag the runtime can format with, e.g. `bn-BD`. */
export const localeSchema = z
  .string()
  .min(2)
  .refine(
    (v) => {
      try {
        return Intl.getCanonicalLocales(v).length === 1 && Intl.NumberFormat.supportedLocalesOf(v).length === 1;
      } catch {
        return false;
      }
    },
    { message: 'not a supported language tag' },
  );

/** An IANA time zone, e.g. `Asia/Dhaka`. */
export const timeZoneSchema = z
  .string()
  .min(1)
  .refine(
    (v) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: v });
        return true;
      } catch {
        return false;
      }
    },
    { message: 'not a known time zone' },
  );

/** An ISO 4217 currency code, e.g. `BDT`. */
export const currencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/)
  .refine((v) => Intl.supportedValuesOf('currency').includes(v), { message: 'not an ISO 4217 currency' });

/** A bare host name (no scheme, no path), lower case. */
export const hostSchema = z
  .string()
  .max(253)
  .regex(/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/, {
    message: 'not a host name',
  });

export const registry = {
  'store.name': setting({
    schema: z.string().trim().min(1).max(120).nullable(),
    default: null,
    scope: 'store',
    valueType: 'STRING',
    group: 'store',
    labelKey: 'store.name.label',
    helpKey: 'store.name.help',
    isOwnerData: true,
    sortOrder: 10,
    version: 1,
  }),
  'store.locale': setting({
    schema: localeSchema,
    default: 'bn-BD',
    scope: 'store',
    valueType: 'STRING',
    group: 'store',
    labelKey: 'store.locale.label',
    helpKey: 'store.locale.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 20,
    version: 1,
  }),
  'store.timeZone': setting({
    schema: timeZoneSchema,
    default: 'Asia/Dhaka',
    scope: 'store',
    valueType: 'STRING',
    group: 'store',
    labelKey: 'store.timeZone.label',
    helpKey: 'store.timeZone.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 30,
    version: 1,
  }),
  'store.currency': setting({
    schema: currencySchema,
    default: 'BDT',
    scope: 'store',
    valueType: 'STRING',
    group: 'store',
    labelKey: 'store.currency.label',
    helpKey: 'store.currency.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 40,
    version: 1,
  }),
  'system.stagingHost': setting({
    schema: hostSchema.nullable(),
    default: null,
    scope: 'installation',
    valueType: 'STRING',
    group: 'system',
    labelKey: 'system.stagingHost.label',
    helpKey: 'system.stagingHost.help',
    isOwnerData: false,
    sortOrder: 10,
    version: 1,
  }),
  // PR 15, 16, 495 — sign-in, sessions, lockout and 2FA (Blueprint B6.5; group `security`). Staff settings are
  // installation-wide (staff span stores); the customer ones may differ per store. 2FA is present and off until the
  // owner switches it on (§59 answer 31).
  'security.staffPasswordMinLength': setting({
    schema: z.number().int().min(8).max(128),
    default: 12,
    scope: 'installation',
    valueType: 'INT',
    group: 'security',
    labelKey: 'security.staffPasswordMinLength.label',
    helpKey: 'security.staffPasswordMinLength.help',
    isOwnerData: false,
    sortOrder: 10,
    version: 2,
  }),
  'security.customerPasswordMinLength': setting({
    schema: z.number().int().min(4).max(128),
    default: 6,
    scope: 'store',
    valueType: 'INT',
    group: 'security',
    labelKey: 'security.customerPasswordMinLength.label',
    helpKey: 'security.customerPasswordMinLength.help',
    isOwnerData: false,
    sortOrder: 20,
    version: 2,
  }),
  'security.passwordMaxLength': setting({
    schema: z.number().int().min(64).max(1024),
    default: 128,
    scope: 'installation',
    valueType: 'INT',
    group: 'security',
    labelKey: 'security.passwordMaxLength.label',
    helpKey: 'security.passwordMaxLength.help',
    isOwnerData: false,
    sortOrder: 30,
    version: 2,
  }),
  'security.blockCommonPasswords': setting({
    schema: z.boolean(),
    default: true,
    scope: 'installation',
    valueType: 'BOOLEAN',
    group: 'security',
    labelKey: 'security.blockCommonPasswords.label',
    helpKey: 'security.blockCommonPasswords.help',
    isOwnerData: false,
    sortOrder: 40,
    version: 2,
  }),
  'security.staffSessionIdleMinutes': setting({
    schema: z.number().int().min(5).max(1440),
    default: 30,
    scope: 'installation',
    valueType: 'INT',
    group: 'security',
    labelKey: 'security.staffSessionIdleMinutes.label',
    helpKey: 'security.staffSessionIdleMinutes.help',
    isOwnerData: false,
    sortOrder: 50,
    version: 2,
  }),
  'security.staffSessionMaxHours': setting({
    schema: z.number().int().min(1).max(720),
    default: 12,
    scope: 'installation',
    valueType: 'INT',
    group: 'security',
    labelKey: 'security.staffSessionMaxHours.label',
    helpKey: 'security.staffSessionMaxHours.help',
    isOwnerData: false,
    sortOrder: 60,
    version: 2,
  }),
  'security.customerSessionDays': setting({
    schema: z.number().int().min(1).max(365),
    default: 30,
    scope: 'store',
    valueType: 'INT',
    group: 'security',
    labelKey: 'security.customerSessionDays.label',
    helpKey: 'security.customerSessionDays.help',
    isOwnerData: false,
    sortOrder: 70,
    version: 2,
  }),
  'security.loginMaxAttempts': setting({
    schema: z.number().int().min(3).max(50),
    default: 5,
    scope: 'installation',
    valueType: 'INT',
    group: 'security',
    labelKey: 'security.loginMaxAttempts.label',
    helpKey: 'security.loginMaxAttempts.help',
    isOwnerData: false,
    sortOrder: 80,
    version: 2,
  }),
  'security.loginLockoutMinutes': setting({
    schema: z.number().int().min(1).max(1440),
    default: 15,
    scope: 'installation',
    valueType: 'INT',
    group: 'security',
    labelKey: 'security.loginLockoutMinutes.label',
    helpKey: 'security.loginLockoutMinutes.help',
    isOwnerData: false,
    sortOrder: 90,
    version: 2,
  }),
  'security.staffTwoFactorRequired': setting({
    schema: z.boolean(),
    default: false,
    scope: 'installation',
    valueType: 'BOOLEAN',
    group: 'security',
    labelKey: 'security.staffTwoFactorRequired.label',
    helpKey: 'security.staffTwoFactorRequired.help',
    isOwnerData: false,
    sortOrder: 100,
    version: 2,
  }),
  'security.twoFactorChallengeMinutes': setting({
    schema: z.number().int().min(1).max(30),
    default: 5,
    scope: 'installation',
    valueType: 'INT',
    group: 'security',
    labelKey: 'security.twoFactorChallengeMinutes.label',
    helpKey: 'security.twoFactorChallengeMinutes.help',
    isOwnerData: false,
    sortOrder: 110,
    version: 2,
  }),
  'security.totpDriftSteps': setting({
    schema: z.number().int().min(0).max(3),
    default: 1,
    scope: 'installation',
    valueType: 'INT',
    group: 'security',
    labelKey: 'security.totpDriftSteps.label',
    helpKey: 'security.totpDriftSteps.help',
    isOwnerData: false,
    sortOrder: 120,
    version: 2,
  }),
  'security.staffLoginAlerts': setting({
    schema: z.boolean(),
    default: true,
    scope: 'installation',
    valueType: 'BOOLEAN',
    group: 'security',
    labelKey: 'security.staffLoginAlerts.label',
    helpKey: 'security.staffLoginAlerts.help',
    isOwnerData: false,
    sortOrder: 130,
    version: 2,
  }),
} satisfies RegistryShape;

export type Registry = typeof registry;
export type Key = SettingKey<Registry>;
export type Value<K extends Key> = SettingValue<Registry, K>;

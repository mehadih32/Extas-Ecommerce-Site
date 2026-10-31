// PR 491 — the settings registry: every setting the build knows, declared once in code with its schema and default.
// Adding a setting = adding an entry here (with labels in messages/), bumping nothing else; the deploy runs the
// settings migration (PR 496), which gives every installation the new key with its default.
//
// Only what S00 and the app need today. Business numbers (prices, charges, thresholds) arrive with their own PRs and
// the general default pack (PR 508). Defaults are neutral: owner data (PR 509) has no default at all, so nothing of the
// owner's ever ships to another installation.
import { z } from 'zod';
import { setting, type RegistryShape, type SettingKey, type SettingValue } from './define';
import { messages, pair, type MessageTree } from './messages';
import { mediaSettings } from './registry-media';
import { publishSettings } from './registry-publish';
import { merchSettings } from './registry-merch';
import { inventorySettings } from './registry-inventory';
import { catalogueToolsSettings } from './registry-catalogue-tools';
import { rulesSettings } from './registry-rules';
import { combosSettings } from './registry-combos';
import { deliverySettings } from './registry-delivery';
import { storefrontSettings } from './registry-storefront';
import { eidSettings } from './registry-eid';
import { categorySettings } from './registry-category';
import { bagSettings } from './registry-bag';
import { productSettings } from './registry-product';
import { checkoutSettings } from './registry-checkout';
import { jobsSettings } from './registry-jobs';
import { shopMoreSettings } from './registry-shop-more';
import { searchSettings } from './registry-search';
import { storefrontFuSettings } from './registry-storefront-fu';
import { pdpTemplateSettings } from './registry-pdp-templates';
import { accountSettings } from './registry-accounts';
import { comboPageSettings } from './registry-combo-pages';
import { motionSettings } from './registry-motion';
import { ordersSettings } from './registry-orders';
import { adminLookSettings } from './registry-admin-look';
import { adminShellSettings } from './registry-admin-shell';
import { checkoutMoreSettings } from './registry-checkout-more';
import { reviewSettings } from './registry-reviews';
import { setBuilderSettings } from './registry-set-builder';
import { orderEditSettings } from './registry-order-edit';
import { supportLaneSettings } from './registry-support-lane';
import { messageSettings } from './registry-messages';
import { messageChannelSettings } from './registry-message-channels';
import { riskSettings } from './registry-risk';
import { riskMoreSettings } from './registry-risk-more';
import { comboTemplateSettings } from './registry-combo-templates';
import { paymentSettings } from './registry-payments';
import { riskRulesSettings } from './registry-risk-rules';
import { shippingSettings } from './registry-shipping';
import { cacheSettings } from './registry-cache';
import { advanceSettings } from './registry-advance';
import { riskLevelSettings } from './registry-risk-levels';
import { advanceRequestSettings } from './registry-advance-request';
import { walletSettings } from './registry-wallet';
import { courierSyncSettings } from './registry-courier-sync';
import { returnsSettings } from './registry-returns';
import { fulfilmentSettings } from './registry-fulfilment';
import { customerSettings } from './registry-customers';
import { seoSettings } from './registry-seo';
import { erpV6Settings } from './registry-erp-v6';
import { invoiceSettings } from './registry-invoice';
import { supportSettings } from './registry-support';
import { erpOrdersV6Settings } from './registry-erp-orders-v6';
import { booksSettings } from './registry-books';
import { returnsV6Settings } from './registry-returns-v6';
import { switchoverSettings } from './registry-switchover';
import { backupsSettings } from './registry-backups';
import { bhandariP1Settings } from './registry-bhandari-p1';
import { booksSummarySettings } from './registry-books-summary';
import { seoReachSettings } from './registry-seo-reach';
import { webSecuritySettings } from './registry-web-security';
import { botCheckSettings } from './registry-bot-check';
import { adminAccessSettings } from './registry-admin-access';
import { erpRetailSettings } from './registry-erp-retail';
import { privacySettings } from './registry-privacy';
import { edgeSettings } from './registry-edge';
import { healthSettings } from './registry-health';
import { supportChannelSettings } from './registry-support-channels';
import {
  bankAccountsSchema,
  dictionaryKeySchema,
  dictionarySchema,
  hoursSchema,
  httpsUrlSchema,
  localizedTextSchema,
  mediaRefSchema,
  moneyMinorSchema,
  namingTokens,
  pathPrefixSchema,
  phoneSchema,
  regexSourceSchema,
  templateStringSchema,
  templateTextSchema,
  walletNumbersSchema,
  type Dictionary,
} from './schemas';

/**
 * A dictionary's shipped default: every entry under `defaults.<path>` in messages/settings.<lang>.json, in file order,
 * with both languages. The owner edits the dictionary in the admin; the files only hold the starting set.
 */
function dictionaryDefault(path: string): Dictionary {
  let node: string | MessageTree | undefined = messages.en;
  for (const part of path.split('.')) node = typeof node === 'object' ? node[part] : undefined;
  if (!node || typeof node !== 'object') throw new Error(`settings messages have no dictionary at "${path}"`);
  return Object.keys(node).map((key) => ({ key, ...pair(messages, `${path}.${key}`) }));
}

const SLUG_TEMPLATE_TOKENS = namingTokens.filter((t) => t !== 'price');

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
  // PR 500 — Keys & connections: how long the Test button waits for a provider, and how long an adapter keeps a
  // decrypted key in memory before reading the vault again (each read is logged, PR 493).
  'system.integrationTestTimeoutSeconds': setting({
    schema: z.number().int().min(3).max(120),
    default: 20,
    scope: 'installation',
    valueType: 'INT',
    group: 'system',
    labelKey: 'system.integrationTestTimeoutSeconds.label',
    helpKey: 'system.integrationTestTimeoutSeconds.help',
    isOwnerData: false,
    sortOrder: 20,
    version: 4,
  }),
  'system.integrationKeyCacheSeconds': setting({
    schema: z.number().int().min(0).max(3600),
    default: 60,
    scope: 'installation',
    valueType: 'INT',
    group: 'system',
    labelKey: 'system.integrationKeyCacheSeconds.label',
    helpKey: 'system.integrationKeyCacheSeconds.help',
    isOwnerData: false,
    sortOrder: 30,
    version: 4,
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
  // ---- PR 509 · brand: the owner's logo and slogan. Owner data: no default, never exported. ----
  'brand.logo': setting({
    schema: mediaRefSchema.nullable(),
    default: null,
    scope: 'store',
    valueType: 'MEDIA_REF',
    group: 'brand',
    labelKey: 'brand.logo.label',
    helpKey: 'brand.logo.help',
    isOwnerData: true,
    sortOrder: 10,
    version: 3,
  }),
  'brand.slogan': setting({
    schema: localizedTextSchema(120).nullable(),
    default: null,
    scope: 'store',
    valueType: 'LOCALIZED_TEXT',
    group: 'brand',
    labelKey: 'brand.slogan.label',
    helpKey: 'brand.slogan.help',
    isOwnerData: true,
    sortOrder: 20,
    version: 3,
  }),

  // ---- PR 509 · contact: phone, WhatsApp, e-mail and address. Owner data (register prefix `contact.`). ----
  'contact.phone': setting({
    schema: phoneSchema.nullable(),
    default: null,
    scope: 'store',
    valueType: 'PHONE',
    group: 'contact',
    labelKey: 'contact.phone.label',
    helpKey: 'contact.phone.help',
    isOwnerData: true,
    sortOrder: 10,
    version: 3,
  }),
  'contact.whatsapp': setting({
    schema: phoneSchema.nullable(),
    default: null,
    scope: 'store',
    valueType: 'PHONE',
    group: 'contact',
    labelKey: 'contact.whatsapp.label',
    helpKey: 'contact.whatsapp.help',
    isOwnerData: true,
    sortOrder: 20,
    version: 3,
  }),
  'contact.email': setting({
    schema: z.email().max(254).nullable(),
    default: null,
    scope: 'store',
    valueType: 'EMAIL',
    group: 'contact',
    labelKey: 'contact.email.label',
    helpKey: 'contact.email.help',
    isOwnerData: true,
    sortOrder: 30,
    version: 3,
  }),
  'contact.address': setting({
    schema: localizedTextSchema(500).nullable(),
    default: null,
    scope: 'store',
    valueType: 'LOCALIZED_TEXT',
    group: 'contact',
    labelKey: 'contact.address.label',
    helpKey: 'contact.address.help',
    isOwnerData: true,
    sortOrder: 40,
    version: 3,
  }),

  // ---- PR 509 · legal: registered name, trade licence, DBID. Owner data (register prefix `legal.`). ----
  'legal.registeredName': setting({
    schema: z.string().trim().min(1).max(200).nullable(),
    default: null,
    scope: 'store',
    valueType: 'STRING',
    group: 'legal',
    labelKey: 'legal.registeredName.label',
    helpKey: 'legal.registeredName.help',
    isOwnerData: true,
    sortOrder: 10,
    version: 3,
  }),
  'legal.tradeLicence': setting({
    schema: z.string().trim().min(1).max(60).nullable(),
    default: null,
    scope: 'store',
    valueType: 'STRING',
    group: 'legal',
    labelKey: 'legal.tradeLicence.label',
    helpKey: 'legal.tradeLicence.help',
    isOwnerData: true,
    sortOrder: 20,
    version: 3,
  }),
  'legal.dbid': setting({
    schema: z.string().trim().min(1).max(60).nullable(),
    default: null,
    scope: 'store',
    valueType: 'STRING',
    group: 'legal',
    labelKey: 'legal.dbid.label',
    helpKey: 'legal.dbid.help',
    isOwnerData: true,
    sortOrder: 30,
    version: 3,
  }),

  // ---- PR 509 · social: the shop's page links. Owner data (register prefix `social.`). ----
  'social.facebook': setting({
    schema: httpsUrlSchema.nullable(),
    default: null,
    scope: 'store',
    valueType: 'URL',
    group: 'social',
    labelKey: 'social.facebook.label',
    isOwnerData: true,
    sortOrder: 10,
    version: 3,
  }),
  'social.instagram': setting({
    schema: httpsUrlSchema.nullable(),
    default: null,
    scope: 'store',
    valueType: 'URL',
    group: 'social',
    labelKey: 'social.instagram.label',
    isOwnerData: true,
    sortOrder: 20,
    version: 3,
  }),
  'social.youtube': setting({
    schema: httpsUrlSchema.nullable(),
    default: null,
    scope: 'store',
    valueType: 'URL',
    group: 'social',
    labelKey: 'social.youtube.label',
    isOwnerData: true,
    sortOrder: 30,
    version: 3,
  }),
  'social.tiktok': setting({
    schema: httpsUrlSchema.nullable(),
    default: null,
    scope: 'store',
    valueType: 'URL',
    group: 'social',
    labelKey: 'social.tiktok.label',
    isOwnerData: true,
    sortOrder: 40,
    version: 3,
  }),

  // ---- PR 509 / 508 · payment: bank and wallet details (owner data, prefixes `payment.bank.`, `payment.wallet.`)
  // and the COD switch (an owner decision, CLAUDE.md rule 6: not set until the owner sets it). ----
  'payment.bank.accounts': setting({
    schema: bankAccountsSchema.nullable(),
    default: null,
    scope: 'store',
    valueType: 'JSON',
    group: 'payment',
    labelKey: 'payment.bank.accounts.label',
    helpKey: 'payment.bank.accounts.help',
    isOwnerData: true,
    sortOrder: 10,
    version: 3,
  }),
  'payment.wallet.numbers': setting({
    schema: walletNumbersSchema.nullable(),
    default: null,
    scope: 'store',
    valueType: 'JSON',
    group: 'payment',
    labelKey: 'payment.wallet.numbers.label',
    helpKey: 'payment.wallet.numbers.help',
    isOwnerData: true,
    sortOrder: 20,
    version: 3,
  }),
  'payment.cod.enabled': setting({
    schema: z.boolean().nullable(),
    default: null,
    scope: 'store',
    valueType: 'BOOLEAN',
    group: 'payment',
    labelKey: 'payment.cod.enabled.label',
    helpKey: 'payment.cod.enabled.help',
    isOwnerData: true,
    requiresOwnerOk: true,
    sortOrder: 30,
    version: 3,
  }),

  // ---- PR 508 · policy: the shapes of the exchange, return and order-edit policies. Values the blueprint marks
  // decided are the defaults (B1.8 exchange only for size, 72 h window; §5 two edits per order); the rest stays
  // empty until the owner sets it. The texts only name {tokens}; every number is read from its own setting. ----
  'policy.exchange.enabled': setting({
    schema: z.boolean(),
    default: true,
    scope: 'store',
    valueType: 'BOOLEAN',
    group: 'policy',
    labelKey: 'policy.exchange.enabled.label',
    helpKey: 'policy.exchange.enabled.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 10,
    version: 3,
  }),
  'policy.exchange.windowHours': setting({
    schema: hoursSchema,
    default: 72,
    scope: 'store',
    valueType: 'INT',
    group: 'policy',
    labelKey: 'policy.exchange.windowHours.label',
    helpKey: 'policy.exchange.windowHours.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 20,
    version: 3,
  }),
  'policy.exchange.perItem': setting({
    schema: z.int().min(1).max(10).nullable(),
    default: null,
    scope: 'store',
    valueType: 'INT',
    group: 'policy',
    labelKey: 'policy.exchange.perItem.label',
    helpKey: 'policy.exchange.perItem.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 30,
    version: 3,
  }),
  'policy.exchange.excludedCategories': setting({
    schema: z.array(z.string().trim().min(1).max(120)).max(200),
    default: [],
    scope: 'store',
    valueType: 'JSON',
    group: 'policy',
    labelKey: 'policy.exchange.excludedCategories.label',
    helpKey: 'policy.exchange.excludedCategories.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 40,
    version: 3,
  }),
  'policy.exchange.summary': setting({
    schema: templateTextSchema(['windowHours']),
    default: pair(messages, 'defaults.policy.exchange.summary'),
    scope: 'store',
    valueType: 'LOCALIZED_TEXT',
    group: 'policy',
    labelKey: 'policy.exchange.summary.label',
    helpKey: 'policy.exchange.summary.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 50,
    version: 3,
  }),
  'policy.returns.afterDelivery': setting({
    schema: z.boolean(),
    default: false,
    scope: 'store',
    valueType: 'BOOLEAN',
    group: 'policy',
    labelKey: 'policy.returns.afterDelivery.label',
    helpKey: 'policy.returns.afterDelivery.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 60,
    version: 3,
  }),
  'policy.returns.summary': setting({
    schema: templateTextSchema([]),
    default: pair(messages, 'defaults.policy.returns.summary'),
    scope: 'store',
    valueType: 'LOCALIZED_TEXT',
    group: 'policy',
    labelKey: 'policy.returns.summary.label',
    helpKey: 'policy.returns.summary.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 70,
    version: 3,
  }),
  'policy.orderEdit.maxEdits': setting({
    schema: z.int().min(0).max(10),
    default: 2,
    scope: 'store',
    valueType: 'INT',
    group: 'policy',
    labelKey: 'policy.orderEdit.maxEdits.label',
    helpKey: 'policy.orderEdit.maxEdits.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 80,
    version: 3,
  }),
  'policy.orderEdit.summary': setting({
    schema: templateTextSchema(['maxEdits']),
    default: pair(messages, 'defaults.policy.orderEdit.summary'),
    scope: 'store',
    valueType: 'LOCALIZED_TEXT',
    group: 'policy',
    labelKey: 'policy.orderEdit.summary.label',
    helpKey: 'policy.orderEdit.summary.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 90,
    version: 3,
  }),

  // ---- PR 508 · delivery: the charge structure. The bands (Dhaka City · sub-area · outside) are rows seeded by the
  // default pack (DeliveryBand, off, no charge); the free-delivery threshold is money: not set until the owner sets it.
  'delivery.freeOverMinor': setting({
    schema: moneyMinorSchema.nullable(),
    default: null,
    scope: 'store',
    valueType: 'MONEY_MINOR',
    group: 'delivery',
    labelKey: 'delivery.freeOverMinor.label',
    helpKey: 'delivery.freeOverMinor.help',
    isOwnerData: true,
    requiresOwnerOk: true,
    sortOrder: 10,
    version: 3,
  }),

  // ---- PR 508 · ai: off until the owner connects a provider (every integration runs on a mock until its key
  // arrives, A1.3); the monthly spend cap is money and the owner's decision (Appendix B.2 #12). ----
  'ai.enabled': setting({
    schema: z.boolean(),
    default: false,
    scope: 'installation',
    valueType: 'BOOLEAN',
    group: 'ai',
    labelKey: 'ai.enabled.label',
    helpKey: 'ai.enabled.help',
    isOwnerData: false,
    sortOrder: 10,
    version: 3,
  }),
  'ai.costSaver': setting({
    schema: z.boolean(),
    default: true,
    scope: 'installation',
    valueType: 'BOOLEAN',
    group: 'ai',
    labelKey: 'ai.costSaver.label',
    helpKey: 'ai.costSaver.help',
    isOwnerData: false,
    sortOrder: 20,
    version: 3,
  }),
  'ai.monthlyCapMinor': setting({
    schema: moneyMinorSchema.nullable(),
    default: null,
    scope: 'installation',
    valueType: 'MONEY_MINOR',
    group: 'ai',
    labelKey: 'ai.monthlyCapMinor.label',
    helpKey: 'ai.monthlyCapMinor.help',
    isOwnerData: true,
    requiresOwnerOk: true,
    sortOrder: 30,
    version: 3,
  }),

  // ---- PR 508 · theme: which complete theme the shop wears (D table: Classic) and the large-text switch (off). The
  // theme's colour and font tokens belong to the design-token file (Shilpi, S02), not to this registry. ----
  'theme.preset': setting({
    schema: z.enum(['classic', 'noir', 'ivory', 'festive']),
    default: 'classic',
    scope: 'store',
    valueType: 'ENUM',
    group: 'theme',
    labelKey: 'theme.preset.label',
    helpKey: 'theme.preset.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 10,
    version: 3,
  }),
  'theme.largeText': setting({
    schema: z.boolean(),
    default: false,
    scope: 'store',
    valueType: 'BOOLEAN',
    group: 'theme',
    labelKey: 'theme.largeText.label',
    helpKey: 'theme.largeText.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 20,
    version: 3,
  }),

  // ---- PR 22, 23, 24, 25, 37 · images and the media library (registry-media.ts, version 6). ----
  ...mediaSettings,
  // ---- PR 21, 26, 29, 35 · the publish checklist, health score, bulk and list sizes (registry-publish.ts, version 8). ----
  ...publishSettings,
  // ---- S01 · catalogue (PR 19, 20, 30, 31; Bhandari). The SKU is the ERP's key (A3.2): the pattern only guards against
  // typing mistakes and can be changed to the ERP's own format. Dictionaries start from messages/ and are the owner's to
  // edit; colours, sizes, categories and fabrics themselves are rows. ----
  'catalogue.skuPattern': setting({
    schema: regexSourceSchema,
    default: '^[A-Z0-9](?:[A-Z0-9._/-]{0,48}[A-Z0-9])?$',
    scope: 'installation',
    valueType: 'STRING',
    group: 'catalogue',
    labelKey: 'catalogue.skuPattern.label',
    helpKey: 'catalogue.skuPattern.help',
    isOwnerData: false,
    sortOrder: 10,
    version: 5,
  }),
  'catalogue.categoryMaxDepth': setting({
    schema: z.int().min(1).max(8),
    default: 4,
    scope: 'store',
    valueType: 'INT',
    group: 'catalogue',
    labelKey: 'catalogue.categoryMaxDepth.label',
    helpKey: 'catalogue.categoryMaxDepth.help',
    isOwnerData: false,
    sortOrder: 20,
    version: 5,
  }),
  'catalogue.reservedSlugs': setting({
    schema: z.array(dictionaryKeySchema).max(200),
    default: ['p', 'bn', 'combos', 'combo', 'collections', 'journal', 'help', 'l', 'search', 'bag', 'cart', 'checkout', 'account', 'admin', 'api', 'track', 'status'],
    scope: 'installation',
    valueType: 'JSON',
    group: 'catalogue',
    labelKey: 'catalogue.reservedSlugs.label',
    helpKey: 'catalogue.reservedSlugs.help',
    isOwnerData: false,
    sortOrder: 30,
    version: 5,
  }),
  'catalogue.colourFamilies': setting({
    schema: dictionarySchema,
    default: dictionaryDefault('defaults.catalogue.colourFamilies'),
    scope: 'store',
    valueType: 'JSON',
    group: 'catalogue',
    labelKey: 'catalogue.colourFamilies.label',
    helpKey: 'catalogue.colourFamilies.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 40,
    version: 5,
  }),
  'catalogue.colourSimilarDistance': setting({
    schema: z.int().min(0).max(442),
    default: 24,
    scope: 'store',
    valueType: 'INT',
    group: 'catalogue',
    labelKey: 'catalogue.colourSimilarDistance.label',
    helpKey: 'catalogue.colourSimilarDistance.help',
    isOwnerData: false,
    sortOrder: 50,
    version: 5,
  }),
  'catalogue.fibres': setting({
    schema: dictionarySchema,
    default: dictionaryDefault('defaults.catalogue.fibres'),
    scope: 'store',
    valueType: 'JSON',
    group: 'catalogue',
    labelKey: 'catalogue.fibres.label',
    helpKey: 'catalogue.fibres.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 60,
    version: 5,
  }),
  'catalogue.fabricConstructions': setting({
    schema: dictionarySchema,
    default: dictionaryDefault('defaults.catalogue.fabricConstructions'),
    scope: 'store',
    valueType: 'JSON',
    group: 'catalogue',
    labelKey: 'catalogue.fabricConstructions.label',
    helpKey: 'catalogue.fabricConstructions.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 70,
    version: 5,
  }),
  'catalogue.careInstructions': setting({
    schema: dictionarySchema,
    default: dictionaryDefault('defaults.catalogue.careInstructions'),
    scope: 'store',
    valueType: 'JSON',
    group: 'catalogue',
    labelKey: 'catalogue.careInstructions.label',
    helpKey: 'catalogue.careInstructions.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 80,
    version: 5,
  }),
  'catalogue.fabricFeatures': setting({
    schema: dictionarySchema,
    default: dictionaryDefault('defaults.catalogue.fabricFeatures'),
    scope: 'store',
    valueType: 'JSON',
    group: 'catalogue',
    labelKey: 'catalogue.fabricFeatures.label',
    helpKey: 'catalogue.fabricFeatures.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 90,
    version: 5,
  }),
  // ---- PR 27, 28, 32, 34, 38 · size charts, collections and tags, CSV, "was" price (registry-merch.ts, version 7). ----
  ...merchSettings,
  // ---- PR 33, 36, 39 · link import, ghost archive, product audit (registry-catalogue-tools.ts, version 9). ----
  ...catalogueToolsSettings,

  // ---- S01 · PR 590 · naming and links (owner 19 Oct 12:04–12:07; demo Settings › Naming & links). Brand names stay;
  // the own-label brand is the store's own-label Brand row. Templates fill every name, link and title the owner leaves
  // empty; a changed link always forwards (301) to the product. The "other brand" note is off by default. ----
  'naming.slugTemplate': setting({
    schema: templateStringSchema(SLUG_TEMPLATE_TOKENS, 200),
    default: '{brand}-{style}',
    scope: 'store',
    valueType: 'STRING',
    group: 'naming',
    labelKey: 'naming.slugTemplate.label',
    helpKey: 'naming.slugTemplate.help',
    isOwnerData: false,
    sortOrder: 10,
    version: 5,
  }),
  'naming.seoTitleTemplate': setting({
    schema: templateTextSchema(namingTokens, 300),
    default: pair(messages, 'defaults.naming.seoTitleTemplate'),
    scope: 'store',
    valueType: 'LOCALIZED_TEXT',
    group: 'naming',
    labelKey: 'naming.seoTitleTemplate.label',
    helpKey: 'naming.seoTitleTemplate.help',
    isOwnerData: false,
    sortOrder: 20,
    version: 5,
  }),
  'naming.metaDescriptionTemplate': setting({
    schema: templateTextSchema(namingTokens, 500),
    default: pair(messages, 'defaults.naming.metaDescriptionTemplate'),
    scope: 'store',
    valueType: 'LOCALIZED_TEXT',
    group: 'naming',
    labelKey: 'naming.metaDescriptionTemplate.label',
    helpKey: 'naming.metaDescriptionTemplate.help',
    isOwnerData: false,
    sortOrder: 30,
    version: 5,
  }),
  'naming.feedTitleTemplate': setting({
    schema: templateStringSchema(namingTokens, 300),
    default: '{brand} {name} {colour}',
    scope: 'store',
    valueType: 'STRING',
    group: 'naming',
    labelKey: 'naming.feedTitleTemplate.label',
    helpKey: 'naming.feedTitleTemplate.help',
    isOwnerData: false,
    sortOrder: 40,
    version: 5,
  }),
  'naming.coloursInTemplate': setting({
    schema: z.int().min(1).max(10),
    default: 3,
    scope: 'store',
    valueType: 'INT',
    group: 'naming',
    labelKey: 'naming.coloursInTemplate.label',
    helpKey: 'naming.coloursInTemplate.help',
    isOwnerData: false,
    sortOrder: 50,
    version: 5,
  }),
  'naming.seoTitleMaxChars': setting({
    schema: z.int().min(10).max(300),
    default: 60,
    scope: 'store',
    valueType: 'INT',
    group: 'naming',
    labelKey: 'naming.seoTitleMaxChars.label',
    helpKey: 'naming.seoTitleMaxChars.help',
    isOwnerData: false,
    sortOrder: 60,
    version: 5,
  }),
  'naming.metaDescriptionMaxChars': setting({
    schema: z.int().min(20).max(1000),
    default: 155,
    scope: 'store',
    valueType: 'INT',
    group: 'naming',
    labelKey: 'naming.metaDescriptionMaxChars.label',
    helpKey: 'naming.metaDescriptionMaxChars.help',
    isOwnerData: false,
    sortOrder: 70,
    version: 5,
  }),
  'naming.feedTitleMaxChars': setting({
    schema: z.int().min(10).max(200),
    default: 150,
    scope: 'store',
    valueType: 'INT',
    group: 'naming',
    labelKey: 'naming.feedTitleMaxChars.label',
    helpKey: 'naming.feedTitleMaxChars.help',
    isOwnerData: false,
    sortOrder: 80,
    version: 5,
  }),
  'naming.slugMaxLength': setting({
    schema: z.int().min(10).max(200),
    default: 70,
    scope: 'store',
    valueType: 'INT',
    group: 'naming',
    labelKey: 'naming.slugMaxLength.label',
    helpKey: 'naming.slugMaxLength.help',
    isOwnerData: false,
    sortOrder: 90,
    version: 5,
  }),
  'naming.slugFallback': setting({
    schema: dictionaryKeySchema,
    default: 'product',
    scope: 'store',
    valueType: 'STRING',
    group: 'naming',
    labelKey: 'naming.slugFallback.label',
    helpKey: 'naming.slugFallback.help',
    isOwnerData: false,
    sortOrder: 100,
    version: 5,
  }),
  'naming.slugAmpersand': setting({
    schema: dictionaryKeySchema,
    default: 'and',
    scope: 'store',
    valueType: 'STRING',
    group: 'naming',
    labelKey: 'naming.slugAmpersand.label',
    helpKey: 'naming.slugAmpersand.help',
    isOwnerData: false,
    sortOrder: 110,
    version: 5,
  }),
  'naming.productPathPrefix': setting({
    schema: pathPrefixSchema,
    default: '/p',
    scope: 'store',
    valueType: 'STRING',
    group: 'naming',
    labelKey: 'naming.productPathPrefix.label',
    helpKey: 'naming.productPathPrefix.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 120,
    version: 5,
  }),
  'naming.redirectStatusCode': setting({
    schema: z.union([z.literal(301), z.literal(308)]),
    default: 301,
    scope: 'store',
    valueType: 'ENUM',
    group: 'naming',
    labelKey: 'naming.redirectStatusCode.label',
    helpKey: 'naming.redirectStatusCode.help',
    isOwnerData: false,
    sortOrder: 130,
    version: 5,
  }),
  'naming.showBrandLine': setting({
    schema: z.boolean(),
    default: true,
    scope: 'store',
    valueType: 'BOOLEAN',
    group: 'naming',
    labelKey: 'naming.showBrandLine.label',
    helpKey: 'naming.showBrandLine.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 140,
    version: 5,
  }),
  'naming.showOwnLabelBrand': setting({
    schema: z.boolean(),
    default: false,
    scope: 'store',
    valueType: 'BOOLEAN',
    group: 'naming',
    labelKey: 'naming.showOwnLabelBrand.label',
    helpKey: 'naming.showOwnLabelBrand.help',
    isOwnerData: false,
    isPublic: true,
    sortOrder: 150,
    version: 5,
  }),
  'naming.otherBrandWarning': setting({
    schema: z.boolean(),
    default: false,
    scope: 'store',
    valueType: 'BOOLEAN',
    group: 'naming',
    labelKey: 'naming.otherBrandWarning.label',
    helpKey: 'naming.otherBrandWarning.help',
    isOwnerData: false,
    sortOrder: 160,
    version: 5,
  }),
  'naming.otherBrandNames': setting({
    schema: z.array(z.string().trim().min(1).max(80)).max(500),
    default: ['Ralph Lauren', 'Polo Ralph Lauren', 'Tommy Hilfiger', 'Lacoste', 'Hugo Boss', 'Boss', 'Calvin Klein', "Levi's", 'Zara', 'H&M', 'Gucci', 'Prada', 'Armani', 'Diesel', 'Nike', 'Adidas', 'Puma', 'Uniqlo'],
    scope: 'store',
    valueType: 'JSON',
    group: 'naming',
    labelKey: 'naming.otherBrandNames.label',
    helpKey: 'naming.otherBrandNames.help',
    isOwnerData: false,
    sortOrder: 170,
    version: 5,
  }),
  'naming.renameReportDays': setting({
    schema: z.int().min(1).max(90),
    default: 14,
    scope: 'store',
    valueType: 'INT',
    group: 'naming',
    labelKey: 'naming.renameReportDays.label',
    helpKey: 'naming.renameReportDays.help',
    isOwnerData: false,
    sortOrder: 180,
    version: 5,
  }),
  'naming.bulkMaxChanges': setting({
    schema: z.int().min(1).max(10000),
    default: 500,
    scope: 'store',
    valueType: 'INT',
    group: 'naming',
    labelKey: 'naming.bulkMaxChanges.label',
    helpKey: 'naming.bulkMaxChanges.help',
    isOwnerData: false,
    sortOrder: 190,
    version: 5,
  }),
  // ---- S09 · PR 194–207, 497–499 · ERP sync, stock locations, holds, pushes, alerts, audits (registry-inventory.ts, versions 10–11). ----
  ...inventorySettings,
  // ---- S10 · PR 208–219 · Smart Rules: text limits, places, simulation, coupons, notices (registry-rules.ts, version 13). ----
  ...rulesSettings,
  // ---- S03 · PR 89–104, 571, 575 · combos and sets: pack price rounding, the generator, seasons, default templates, the bag, the set photo, the report (registry-combos.ts, version 14). ----
  ...combosSettings,
  // ---- S06 · PR 549–553, 555 · the delivery-zone engine (registry-delivery.ts, version 15). ----
  ...deliverySettings,
  // ---- S02 · PR 82, 501, 503, 84, 40, 42 · storefront: themes, brand, shell, language, slider (registry-storefront.ts, version 16). ----
  ...storefrontSettings,
  // ---- S10 · PR 214 follow-up (CN-014 g) · Eid order-by dates per band and district, pre-order (registry-eid.ts, version 16). ----
  ...eidSettings,
  // ---- S02 · PR 45–48 · the category page: grid, filters, sort, sticky bar, SEO text, questions (registry-category.ts, version 17). ----
  ...categorySettings,
  // ---- S04 · PR 105–114 · the bag: keeping it, adding twice, the added-to-bag panel, tiers, two sizes, codes, free delivery, the upsell row (registry-bag.ts, version 18). ----
  ...bagSettings,
  // ---- S02 · PR 49, 54–57, 60–64 · the product page: gallery, colours, sizes, size chart, stock, price, trust, rules, details, buy bars (registry-product.ts, version 19; PR 66's questions block, version 31). ----
  ...productSettings,
  // ---- S04 · PR 115–126 · the checkout: the field order, the try-on line, the form, payment, the wallet, consent, the confirm button, placement, the thank-you page (registry-checkout.ts, version 20). ----
  ...checkoutSettings,
  // ---- PR 6 · the background worker: heartbeat, scheduler leader, retries (registry-jobs.ts, version 22). ----
  ...jobsSettings,
  // ---- S02 · PR 53, 67–71, 74, 75 · first screen, rows, rail, share, WhatsApp button, wishlist, menu, content pages (registry-shop-more.ts, version 23). ----
  ...shopMoreSettings,
  // ---- S02 · PR 72, 73 · storefront search: the engine, matching, word lists, help pages, the panel, the results page (registry-search.ts, version 24). ----
  ...searchSettings,
  // ---- S02 / S04 · the storefront follow-ups: card hover and quick add, structured data, size words, the address
  // suggestions, the thank-you page's next steps (registry-storefront-fu.ts, version 25). ----
  ...storefrontFuSettings,
  // ---- S02 · PR 50–52, 58 · the product page templates and Find My Size (registry-pdp-templates.ts, version 28). ----
  ...pdpTemplateSettings,
  // ---- S04 · PR 129–137 · customer accounts: the account from the first order, sign-in codes, My account, the offer banner, the order page, autofill (registry-accounts.ts, version 29). ----
  ...accountSettings,
  // ---- S03 · PR 91–95, 102, 103 · the combo storefront: the combo page's layout and parts, popular pairs, More sets, the sets landing page, the product page's set offer (registry-combo-pages.ts, version 30). ----
  ...comboPageSettings,
  // ---- S02 · PR 86, 87 · the house motion: the light sweeps' switches and the celebration overlay (registry-motion.ts, version 31). ----
  ...motionSettings,
  // ---- S05 · PR 138, 144, 145, 147, 153 · the order core: cancel reasons and the customer's cancel, hold reasons and the hold check, the advance wait, duplicate orders, internal flags, notes, the order list (registry-orders.ts, version 32). ----
  ...ordersSettings,
  // ---- PR 12, 495 · the admin shell: role start pages, menu badges and search, the Dashboard (registry-admin-shell.ts, version 33). ----
  ...adminShellSettings,
  // ---- S04 · PR 127, 128, 561, 563, 565, 605 · the rest of the customer-side checkout: the address check, the silent backfill, free delivery's exemption, add to this parcel, complete your look, gift mode (registry-checkout-more.ts, version 34). ----
  ...checkoutMoreSettings,
  // ---- S02 · PR 59, 65 · Find My Size learning and product reviews: the size report and the ease model (registry-reviews.ts, version 35). ----
  ...reviewSettings,
  // ---- S03 · PR 98, 100 · "Build your own set": the set builder page, off until the owner turns it on (registry-set-builder.ts, version 36). ----
  ...setBuilderSettings,
  // ---- S05 · PR 142, 143, 146 · order edits: the team's edit reasons and channels, the customer's own edit, the two-size follow-up, the refusal reasons (registry-order-edit.ts, version 37). ----
  ...orderEditSettings,
  // ---- S04 · PR 566, 606 · the support explanation panel and the bulk / corporate lane (registry-support-lane.ts, version 38). ----
  ...supportLaneSettings,
  // ---- S05 · PR 148 · the Messages control centre: the master switch, the order journey, caps, self-confirm, language, quiet hours, the amount lines, the engine's pace (registry-messages.ts, version 40). ----
  ...messageSettings,
  // ---- S14 · PR 291, 292, 298, 505 · the Messages channels: the SMS masking name and part prices (registry-message-channels.ts, version 61). ----
  ...messageChannelSettings,
  // ---- S06 · PR 157, 156 · a number's history (how many orders, the refusals that are our fault, unanswered calls) and the risk score: the signals and their weights, the bands (registry-risk.ts, version 43). ----
  ...riskSettings,
  ...riskMoreSettings,
  // ---- S03 · PR 572–574 · the combo templates: how much a rule's category page (L1–L5), the pair page (P1–P5) and a set in the bag (B1–B5) show, and the template preview links (registry-combo-templates.ts, version 39). ----
  ...comboTemplateSettings,
  // ---- S07 · PR 165 · payments: money received outside the checkout (off), the words of the mismatch reasons (registry-payments.ts, version 47). ----
  ...paymentSettings,
  // ---- S06 · PR 519, 520 · the identity graph and the duplicate & re-order rules (registry-risk-rules.ts, version 48). ----
  ...riskRulesSettings,
  // ---- S08 · PR 175–177 · courier shipping: the RTO cost book (registry-shipping.ts, version 50). ----
  ...shippingSettings,
  // ---- S02 · PR 602 · the four-layer cache: page times, the stock shown, the rare options (registry-cache.ts, version 53). ----
  ...cacheSettings,
  // ---- S04 · PR 558, 560 · the advance-payment checkout mode's one switch (registry-advance.ts, version 53). ----
  ...advanceSettings,
  // ---- S06 · PR 161 · what happens at each risk level: watch, hold, a call, the advance asked (registry-risk-levels.ts, version 54). ----
  ...riskLevelSettings,
  // ---- S06 · PR 542 · the one-click advance request from the order: its channels, pay service, words and auto option (off) (registry-advance-request.ts, version 54). ----
  ...advanceRequestSettings,
  // ---- S07 · PR 171–174 · the wallet ledger and the apology credit, refunds, advances, gateway statements (registry-wallet.ts, version 55). ----
  ...walletSettings,
  // ---- PR 12 (CN-025, CN-026 (b)) · Settings → Admin look: page designs, where the guide opens, the To do drawer, the Dashboard designs' numbers (registry-admin-look.ts, version 51). ----
  ...adminLookSettings,
  // ---- S08 · PR 184, 525, 526 · what the courier tells us after booking: the courier's news on his order page (registry-courier-sync.ts, version 58). ----
  ...courierSyncSettings,
  // ---- S08 · PR 185–191 · exchanges, returns and refused parcels: the exchange tiers and engine, QC, return handling, the exchange charge and the refused-parcel list (registry-returns.ts, version 57). ----
  ...returnsSettings,
  // ---- S08 · PR 182, 183 · the packing step: how each piece is checked, the packing proof photo (off), the parcel's weight (off), the screen's lists, and what a damaged or missing piece does (registry-fulfilment.ts, version 59). ----
  ...fulfilmentSettings,
  // ---- S14 · PR 284–286 · customers: the merge rules, masked phone numbers, the list's views, one customer's page (registry-customers.ts, version 60). ----
  ...customerSettings,
  // ---- S11 · PR 220–222 · the SEO engine: which pages search engines may list, titles and descriptions, the AI drafts and the structured data (registry-seo.ts, version 64). ----
  ...seoSettings,
  // ---- CN-028 · PR 607–618 (CN-029 Phase 0) · Retail and the ERP supplier model: the ERP contract (v5 / v6), the event ledger's pulls, every setting of docs/RETAIL-ERP-MODEL.md §11 (the account hold, the daily summary and fixed costs, the books, exchange and hand-back, B grade and the selling-price floor) (registry-erp-v6.ts, version 62). ----
  ...erpV6Settings,
  // ---- S20 · PR 407 · the customer invoice: its printed copy (paper and roll), its chat picture and issuing (registry-invoice.ts, version 63). ----
  ...invoiceSettings,
  // ---- S22 · PR 425 · the support core: the inbox, files in a conversation, customer numbers (registry-support.ts, version 63). ----
  ...supportSettings,
  // ---- CN-028 · PR 610, 611 (CN-029 Phase 1) · orders to the ERP v6: when a refused order is asked again, and the catch-up of open orders (registry-erp-orders-v6.ts, version 66). ----
  ...erpOrdersV6Settings,
  // ---- CN-028 · PR 615, 616 (CN-029 Phase 1) · the ERP account ledger, the payments to the ERP and the books match (registry-books.ts, version 68). ----
  ...booksSettings,
  // ---- CN-028 · PR 612–614 (CN-029 Phase 1) · returns and exchanges on the ERP model: the old shop QC, restock, write-off and credit-due paths as per-store switches (on while v5; never run in v6), the owner's check window and the pieces kept for regular orders (registry-returns-v6.ts, version 67). ----
  ...returnsV6Settings,
  // ---- CN-029 Phase 1 · PR 609, 620 (Bhandari) · import by style code (the B-grade name), the signed ERP-to-shop calls (registry-bhandari-p1.ts, version 65). ----
  ...bhandariP1Settings,
  // ---- CN-028 · PR 617, 618 (CN-029 Phase 1) · the daily summary and fixed costs to the ERP: how often they are looked for and checked against the ERP's copy, the cost lines a store never has, the Books status card (registry-books-summary.ts, version 69). ----
  ...booksSummarySettings,
  // ---- CN-028 · PR 619, 621 (CN-029 Phase 2, Prohori) · the switch-over and the ERP link page: how fresh the dry run must be, orders still waiting in the old form, the page's list length; the demo ERP the acceptance suite runs against (registry-switchover.ts, version 70). ----
  ...switchoverSettings,
  // ---- S11 · CN-031 lane A · PR 235 · redirects and the 404 report (registry-seo-reach.ts, version 71; later lane-A PRs add theirs). ----
  ...seoReachSettings,
  // ---- S18 · PR 378 · the page protection policy (report only by default), the outside addresses pages may use, the per-address request limits (observe by default) (registry-web-security.ts, version 73). ----
  ...webSecuritySettings,
  // ---- S18 · PR 379 · the quiet bot check on sign-in and checkout: observe only, a note in the security log, never a refusal (registry-bot-check.ts, version 74). ----
  ...botCheckSettings,
  // ---- S18 · PR 380 · the admin address list (off by default), how long new-device sign-ins stay in the notifications, the security events listed (registry-admin-access.ts, version 78). ----
  ...adminAccessSettings,
  // ---- S19 · PR 395, 507 (CN-030) · the backups: the Drive folder and copies kept, the schedule, retention, alerts and the monthly restore drill (registry-backups.ts, versions 75–76). ----
  ...backupsSettings,
  // ---- CN-033 · PR 610, 614, 619, 621 · the shop follows the ERP's retail decisions of 30 Oct 2026: the switch-over way (fresh start or the ERP's list), B-grade order lines closed until the ERP opens them (registry-erp-retail.ts, version 72). ----
  ...erpRetailSettings,
  // ---- S18 · PR 382 · customers' erasure requests (off by default; the owner carries one out), the requests listed (registry-privacy.ts, version 79). ----
  ...privacySettings,
  // ---- S18 · PR 386 · the shop's own rules at Cloudflare, limited to its host names; sent by hand (registry-edge.ts, version 80). ----
  ...edgeSettings,
  // ---- S21 · PR 413 · the Site health hub: when a status line turns yellow (registry-health.ts, version 81). ----
  ...healthSettings,
  // ---- S22 · CN-031 lane A · PR 426 · the Support channel connectors: Meta's reply window and webhook size, the site's live chat (off) (registry-support-channels.ts, version 72). ----
  ...supportChannelSettings,
} satisfies RegistryShape;

export type Registry = typeof registry;
export type Key = SettingKey<Registry>;
export type Value<K extends Key> = SettingValue<Registry, K>;

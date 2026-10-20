// S10 · PR 208–219 — Smart Rules (Gyani). The rules themselves are rows (SmartRule, Notice, Coupon): their texts,
// values, scopes, windows and priorities are the owner's and are typed in on /admin/rules. These settings only hold
// the engine's own limits and lists: how long a customer text may be, where a rule's text can be shown, how far back a
// simulation looks, how long the storefront may reuse what it read, the "was" price honesty window, the coupon code
// shape and the pop-up limits (Blueprint B6.3 "no pop-up on arrival", C11.5 pop-up rules).
// Labels: messages/rules.<lang>.json. Registry version 13.
//
// Money never sits here: charges, thresholds, tier prices and discounts live in the rules, which are created off or as
// a draft and the owner switches them on in the backend (CLAUDE.md rule 6). A struck "was" price follows the owner's
// answer (CN-009): the real MRP on single items where it exists, the sum of the separate prices on sets; never invented.
// It is off until he switches it on (`rules.discount.showWasPrice`).
import { z } from 'zod';
import { setting } from './define';
import { dictionarySchema, regexSourceSchema } from './schemas';

const V = 13;

/** Where a rule's text can be shown (PR 209 "Shown on", PR 215). At least one place; keys are stable. */
export const rulePlacementsSchema = dictionarySchema.refine((d) => d.length >= 1, { message: 'at least one place' });

/** Host names (or their start) that count as a search engine for the pop-up rule (C11.5). */
export const searchHostsSchema = z
  .array(z.string().trim().toLowerCase().min(2).max(60).regex(/^[a-z0-9.-]+$/, { message: 'a host name or its start, like google.' }))
  .max(50);

export const rulesSettings = {
  // ---- PR 209, 215 · customer texts ----
  'rules.text.shortMaxChars': setting({
    schema: z.int().min(20).max(200),
    default: 90,
    scope: 'store',
    valueType: 'INT',
    group: 'rules',
    labelKey: 'rules.text.shortMaxChars.label',
    helpKey: 'rules.text.shortMaxChars.help',
    isOwnerData: false,
    sortOrder: 10,
    version: V,
  }),
  'rules.text.fullMaxChars': setting({
    schema: z.int().min(200).max(10_000),
    default: 2000,
    scope: 'store',
    valueType: 'INT',
    group: 'rules',
    labelKey: 'rules.text.fullMaxChars.label',
    helpKey: 'rules.text.fullMaxChars.help',
    isOwnerData: false,
    sortOrder: 20,
    version: V,
  }),
  'rules.placements': setting({
    schema: rulePlacementsSchema,
    default: [
      { key: 'product', en: 'Product page', bn: 'পণ্যের পাতা' },
      { key: 'bag', en: 'Bag', bn: 'ব্যাগ' },
      { key: 'checkout', en: 'Checkout', bn: 'চেকআউট' },
      { key: 'thank-you', en: 'Thank you', bn: 'ধন্যবাদ পাতা' },
      { key: 'account', en: 'My account', bn: 'আমার অ্যাকাউন্ট' },
      { key: 'messages', en: 'SMS & WhatsApp', bn: 'এসএমএস ও হোয়াটসঅ্যাপ' },
      { key: 'assistant', en: 'AI answers', bn: 'এআই-এর উত্তর' },
      { key: 'faq', en: 'FAQ', bn: 'প্রশ্ন-উত্তর' },
      { key: 'footer', en: 'Footer', bn: 'ফুটার' },
      { key: 'announcement', en: 'Announcement bar', bn: 'ঘোষণার পট্টি' },
      { key: 'build-set', en: 'Build a set', bn: 'সেট বানান' },
    ],
    scope: 'store',
    valueType: 'JSON',
    group: 'rules',
    labelKey: 'rules.placements.label',
    helpKey: 'rules.placements.help',
    isOwnerData: false,
    sortOrder: 30,
    version: V,
  }),
  // ---- PR 217, 218 · conflicts and history ----
  'rules.conflicts.checkOnPublish': setting({
    schema: z.boolean(),
    default: true,
    scope: 'store',
    valueType: 'BOOLEAN',
    group: 'rules',
    labelKey: 'rules.conflicts.checkOnPublish.label',
    helpKey: 'rules.conflicts.checkOnPublish.help',
    isOwnerData: false,
    sortOrder: 40,
    version: V,
  }),
  'rules.history.pageSize': setting({
    schema: z.int().min(5).max(500),
    default: 50,
    scope: 'installation',
    valueType: 'INT',
    group: 'rules',
    labelKey: 'rules.history.pageSize.label',
    helpKey: 'rules.history.pageSize.help',
    isOwnerData: false,
    sortOrder: 50,
    version: V,
  }),
  // ---- PR 219 · simulation ----
  'rules.simulation.defaultDays': setting({
    schema: z.int().min(1).max(365),
    default: 30,
    scope: 'store',
    valueType: 'INT',
    group: 'rules',
    labelKey: 'rules.simulation.defaultDays.label',
    helpKey: 'rules.simulation.defaultDays.help',
    isOwnerData: false,
    sortOrder: 60,
    version: V,
  }),
  'rules.simulation.maxOrders': setting({
    schema: z.int().min(10).max(5000),
    default: 500,
    scope: 'installation',
    valueType: 'INT',
    group: 'rules',
    labelKey: 'rules.simulation.maxOrders.label',
    helpKey: 'rules.simulation.maxOrders.help',
    isOwnerData: false,
    sortOrder: 70,
    version: V,
  }),
  // ---- PR 215 · how long the storefront may reuse the live rules it read ----
  'rules.public.cacheSeconds': setting({
    schema: z.int().min(0).max(3600),
    default: 30,
    scope: 'installation',
    valueType: 'INT',
    group: 'rules',
    labelKey: 'rules.public.cacheSeconds.label',
    helpKey: 'rules.public.cacheSeconds.help',
    isOwnerData: false,
    sortOrder: 80,
    version: V,
  }),
  // ---- PR 213 · discounts, coupons and the "was" price honesty guard (Blueprint D1.7, PR 38) ----
  'rules.discount.maxPercentOff': setting({
    schema: z.int().min(1).max(100),
    default: 90,
    scope: 'store',
    valueType: 'INT',
    group: 'rules',
    labelKey: 'rules.discount.maxPercentOff.label',
    helpKey: 'rules.discount.maxPercentOff.help',
    isOwnerData: false,
    sortOrder: 90,
    version: V,
  }),
  'rules.discount.showWasPrice': setting({
    schema: z.boolean().nullable(),
    default: null,
    scope: 'store',
    valueType: 'BOOLEAN',
    group: 'rules',
    labelKey: 'rules.discount.showWasPrice.label',
    helpKey: 'rules.discount.showWasPrice.help',
    isOwnerData: true,
    requiresOwnerOk: true,
    sortOrder: 100,
    version: V,
  }),
  'rules.discount.wasLookbackDays': setting({
    schema: z.int().min(7).max(180),
    default: 30,
    scope: 'store',
    valueType: 'INT',
    group: 'rules',
    labelKey: 'rules.discount.wasLookbackDays.label',
    helpKey: 'rules.discount.wasLookbackDays.help',
    isOwnerData: false,
    sortOrder: 110,
    version: V,
  }),
  'rules.coupons.codePattern': setting({
    schema: regexSourceSchema,
    default: '^[A-Z0-9][A-Z0-9-]{2,23}$',
    scope: 'store',
    valueType: 'STRING',
    group: 'rules',
    labelKey: 'rules.coupons.codePattern.label',
    helpKey: 'rules.coupons.codePattern.help',
    isOwnerData: false,
    sortOrder: 120,
    version: V,
  }),
  // ---- PR 216 · notices and pop-ups (B6.3: never a pop-up on arrival; C11.5: triggers, caps, Google first screen) ----
  'notices.bar.maxShown': setting({
    schema: z.int().min(1).max(5),
    default: 1,
    scope: 'store',
    valueType: 'INT',
    group: 'notices',
    labelKey: 'notices.bar.maxShown.label',
    helpKey: 'notices.bar.maxShown.help',
    isOwnerData: false,
    sortOrder: 10,
    version: V,
  }),
  'notices.popup.minDelaySeconds': setting({
    schema: z.int().min(3).max(600),
    default: 8,
    scope: 'store',
    valueType: 'INT',
    group: 'notices',
    labelKey: 'notices.popup.minDelaySeconds.label',
    helpKey: 'notices.popup.minDelaySeconds.help',
    isOwnerData: false,
    sortOrder: 20,
    version: V,
  }),
  'notices.popup.minScrollPercent': setting({
    schema: z.int().min(10).max(100),
    default: 30,
    scope: 'store',
    valueType: 'INT',
    group: 'notices',
    labelKey: 'notices.popup.minScrollPercent.label',
    helpKey: 'notices.popup.minScrollPercent.help',
    isOwnerData: false,
    sortOrder: 30,
    version: V,
  }),
  'notices.popup.maxPerVisit': setting({
    schema: z.int().min(1).max(5),
    default: 1,
    scope: 'store',
    valueType: 'INT',
    group: 'notices',
    labelKey: 'notices.popup.maxPerVisit.label',
    helpKey: 'notices.popup.maxPerVisit.help',
    isOwnerData: false,
    sortOrder: 40,
    version: V,
  }),
  'notices.popup.searchHosts': setting({
    schema: searchHostsSchema,
    default: ['google.', 'bing.', 'yahoo.', 'duckduckgo.', 'yandex.'],
    scope: 'installation',
    valueType: 'JSON',
    group: 'notices',
    labelKey: 'notices.popup.searchHosts.label',
    helpKey: 'notices.popup.searchHosts.help',
    isOwnerData: false,
    sortOrder: 50,
    version: V,
  }),
};

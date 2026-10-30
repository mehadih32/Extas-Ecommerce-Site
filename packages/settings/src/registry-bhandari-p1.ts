// CN-028 · CN-029 Phase 1, Bhandari's lane (PR 609, 620). Registry version 65. Labels: messages/bhandari-p1.<lang>.json.
// The §11 keys these PRs read (`catalogue.bGrade.listing`, `catalogue.floor.minMarginPercent`) are in registry-erp-v6.ts
// (Phase 0); this file holds only what the lane adds.
//
// PR 609 (Products group): the words added to a B-grade listing's name when a style is imported from the ERP, and how
// many changed buying prices the import page lists (qa-gate 30 Oct: was a number in the code).
// PR 620 (ERP group): the ERP's own signed calls to the shop (`GET /erp-api/top-products`, `GET /erp-api/customers`,
// docs/erp/site-changes-v6.md §2.7). Off per store until the owner switches them on (they hand his customer list to his
// ERP, live, and the ERP does not keep it); how old a signature may be (the contract's 5 minutes, as for the webhooks);
// the rows a call gets when it does not say (20 products, 50 customers) and the most it may ask for; the longest span
// of days; and how many recent calls the Keys & connections page lists.
// qa-gate (30 Oct): a refused call writes nothing of its own. Refusals are counted in the app and kept as one summary
// row per `erp.siteApi.refusedLogMinutes`; after `erp.siteApi.refusedPerMinute` refused calls in a minute from one
// address (p3 review: per address, and a call signed with a known store secret is never cut off), further unverified
// calls from it are refused at once (429) without looking at any store; the page sums the summaries of the last
// `erp.siteApi.refusedShownDays` days. The longest customer search text is `erp.siteApi.searchMaxChars`.
import { z } from 'zod';
import { setting } from './define';

const V = 65;

const catalogue = { scope: 'store', isOwnerData: false, isPublic: false, group: 'catalogue', version: V } as const;
const erp = { scope: 'installation', isOwnerData: false, isPublic: false, group: 'erp', version: V } as const;

export const bhandariP1Settings = {
  // ---- PR 609 · import by style code ----
  'catalogue.bGrade.nameSuffix': setting({
    ...catalogue,
    // Added to the end of a B-grade listing's name at import (the admin can rename the product afterwards).
    schema: z.string().max(60),
    default: ' (B grade)',
    valueType: 'STRING',
    labelKey: 'catalogue.bGrade.nameSuffix.label',
    helpKey: 'catalogue.bGrade.nameSuffix.help',
    sortOrder: 62,
  }),
  'catalogue.shopPrice.changesShown': setting({
    ...catalogue,
    scope: 'installation',
    schema: z.int().min(1).max(1000),
    default: 100,
    valueType: 'INT',
    labelKey: 'catalogue.shopPrice.changesShown.label',
    helpKey: 'catalogue.shopPrice.changesShown.help',
    sortOrder: 63,
  }),

  // ---- PR 620 · the ERP's signed calls to the shop ----
  'erp.siteApi.enabled': setting({
    ...erp,
    scope: 'store',
    schema: z.boolean(),
    default: false,
    valueType: 'BOOLEAN',
    labelKey: 'erp.siteApi.enabled.label',
    helpKey: 'erp.siteApi.enabled.help',
    sortOrder: 40,
  }),
  'erp.siteApi.maxAgeSeconds': setting({
    ...erp,
    // Contract: a call more than 5 minutes from the shop's clock is refused.
    schema: z.int().min(30).max(3600),
    default: 300,
    valueType: 'INT',
    labelKey: 'erp.siteApi.maxAgeSeconds.label',
    helpKey: 'erp.siteApi.maxAgeSeconds.help',
    sortOrder: 41,
  }),
  'erp.siteApi.topProductsLimit': setting({
    ...erp,
    schema: z.int().min(1).max(500),
    default: 20,
    valueType: 'INT',
    labelKey: 'erp.siteApi.topProductsLimit.label',
    helpKey: 'erp.siteApi.topProductsLimit.help',
    sortOrder: 42,
  }),
  'erp.siteApi.customersPageSize': setting({
    ...erp,
    schema: z.int().min(1).max(500),
    default: 50,
    valueType: 'INT',
    labelKey: 'erp.siteApi.customersPageSize.label',
    helpKey: 'erp.siteApi.customersPageSize.help',
    sortOrder: 43,
  }),
  'erp.siteApi.maxRows': setting({
    ...erp,
    schema: z.int().min(1).max(500),
    default: 100,
    valueType: 'INT',
    labelKey: 'erp.siteApi.maxRows.label',
    helpKey: 'erp.siteApi.maxRows.help',
    sortOrder: 44,
  }),
  'erp.siteApi.maxRangeDays': setting({
    ...erp,
    schema: z.int().min(1).max(3660),
    default: 366,
    valueType: 'INT',
    labelKey: 'erp.siteApi.maxRangeDays.label',
    helpKey: 'erp.siteApi.maxRangeDays.help',
    sortOrder: 45,
  }),
  'erp.siteApi.callsShown': setting({
    ...erp,
    schema: z.int().min(1).max(200),
    default: 20,
    valueType: 'INT',
    labelKey: 'erp.siteApi.callsShown.label',
    helpKey: 'erp.siteApi.callsShown.help',
    sortOrder: 46,
  }),
  'erp.siteApi.refusedPerMinute': setting({
    ...erp,
    // How many refused calls a minute from one address still get a store lookup; past it, that address's unverified
    // calls are refused at once (a call signed with a known store secret still goes on).
    schema: z.int().min(1).max(10000),
    default: 60,
    valueType: 'INT',
    labelKey: 'erp.siteApi.refusedPerMinute.label',
    helpKey: 'erp.siteApi.refusedPerMinute.help',
    sortOrder: 47,
  }),
  'erp.siteApi.refusedLogMinutes': setting({
    ...erp,
    // At most one summary row of refused calls in this many minutes (per running app).
    schema: z.int().min(1).max(1440),
    default: 60,
    valueType: 'INT',
    labelKey: 'erp.siteApi.refusedLogMinutes.label',
    helpKey: 'erp.siteApi.refusedLogMinutes.help',
    sortOrder: 48,
  }),
  'erp.siteApi.refusedShownDays': setting({
    ...erp,
    schema: z.int().min(1).max(366),
    default: 7,
    valueType: 'INT',
    labelKey: 'erp.siteApi.refusedShownDays.label',
    helpKey: 'erp.siteApi.refusedShownDays.help',
    sortOrder: 49,
  }),
  'erp.siteApi.searchMaxChars': setting({
    ...erp,
    schema: z.int().min(1).max(500),
    default: 100,
    valueType: 'INT',
    labelKey: 'erp.siteApi.searchMaxChars.label',
    helpKey: 'erp.siteApi.searchMaxChars.help',
    sortOrder: 50,
  }),
};

// CN-028 · PR 607–618 — Retail and the ERP supplier model (docs/RETAIL-ERP-MODEL.md, docs/erp/site-changes-v6.md).
// Registry version 62. Labels: messages/erp-v6.<lang>.json (the ERP group, Settings → ERP connection; the Books group;
// the exchange and hand-back keys in the Orders group; the catalogue keys in the Products group).
//
// PR 607 (`erp.model`): which ERP contract the shop speaks. `v5` until the ERP announces its switch date and sends the
// final `openapi.yaml`; then `v6` (PR 619 switches it, after a dry run). Everything of CN-028 sits behind it: in `v5`
// nothing changes. In `v6` the shop reads only the ERP's shop price (never `retailPrice` or `avgCost`) and the retired v5
// calls (customer payments, returns, ad spend, shipment events, a delivered or returned status) are never sent.
// PR 608 (`erp.events.*`): how often the shop pulls the ERP's events and applies the stored ones, and how far back
// it asks for courier claims.
// `erp.model` moves no money by itself (the ERP bills by its own contract either way), but switching a store to v6 is
// one-way: every v5 document still queued that v6 retired (a return, a delivered or returned status) becomes RETIRED for
// good, and a retired return is settled as never sent. So it is the owner's decision with his written OK
// (`requiresOwnerOk`, CLAUDE.md rule 6), his own data (`isOwnerData`, never shipped to a new installation) and empty by
// default (empty = v5). Only PR 619's switch-over sets it, on the ERP's switch date after the dry run; setting it back to
// v5 sends nothing retired again (the RETIRED rows stay, for the record).
//
// CN-029 Phase 0 — every setting of docs/RETAIL-ERP-MODEL.md §11, with the defaults it names, so no lane of Phase 1
// changes this file. All are per store (one store = one ERP company, §16) unless marked installation:
// - ERP group: the account hold (`erp.hold.pauseCheckout` on, `erp.hold.warnDays` 15, the ERP's own value shown),
//   how often the account is read (`erp.account.checkMinutes`, PR 610), the daily summary's send time and retries
//   (`erp.summary.sendAt` 00:30, `erp.summary.retry.minutes` 1, 5, 15, 60; PR 617), and the fixed-cost spread
//   (`erp.fixedCosts.spread`, the ERP's rule: by the days of the month; PR 618).
// - Books group (PR 616): the week start (Saturday) and the financial year start (July), how long a timing difference
//   may wait for the pull (120 minutes), how many days an open day is re-sent (14), whether a month closes only when
//   every day matched (on), and when the nightly close runs (01:30, after the ERP's own 01:00 check).
// - Orders group (PR 612, 614): a dearer exchange piece is paid by the customer (`exchange.passPriceRiseToCustomer`
//   on, the exchange terms say so; a cheaper one is never refunded), the old piece's return watch (4 days, the ERP's
//   own value shown), and the sealed-bag photo at hand-back (off).
// - Products group (PR 609): B-grade lines as listings of their own (off) and the selling-price floor over the buying
//   price (`catalogue.floor.minMarginPercent`: empty = off until the owner sets it; a price decision, so owner data that
//   needs his written OK).
import { z } from 'zod';
import { BOOKS_WEEKDAYS, ERP_FIXED_COST_SPREADS } from '@extas/erp-types';
import { setting } from './define';
import { clockTimeSchema } from './registry-eid';

const V = 62;

/** The ERP contract the shop speaks (PR 607). Kept here as plain values: the settings package does not import adapters. */
export const ERP_MODEL_VALUES = ['v5', 'v6'] as const;
/** Empty (null) is v5: the contract until the owner's switch-over. */
export const erpModelSchema = z.enum(ERP_MODEL_VALUES).nullable();

const erp = { scope: 'store', isOwnerData: false, isPublic: false, group: 'erp', version: V } as const;
const books = { scope: 'store', isOwnerData: false, isPublic: false, group: 'books', version: V } as const;
const orders = { scope: 'store', isOwnerData: false, isPublic: false, group: 'orders', version: V } as const;
const catalogue = { scope: 'store', isOwnerData: false, isPublic: false, group: 'catalogue', version: V } as const;

/** `erp.summary.retry.minutes`: the waits between tries of a summary the ERP did not accept, in order (the last repeats). */
export const erpSummaryRetrySchema = z.array(z.int().min(1).max(1440)).min(1).max(10);

export const erpV6Settings = {
  // ---- PR 607 · the ERP contract ----
  'erp.model': setting({
    ...erp,
    isOwnerData: true,
    requiresOwnerOk: true,
    schema: erpModelSchema,
    default: null,
    valueType: 'ENUM',
    labelKey: 'erp.model.label',
    helpKey: 'erp.model.help',
    sortOrder: 5,
  }),

  // ---- PR 608 · the ERP event ledger (webhook and pull) ----
  'erp.events.pullMinutes': setting({
    ...erp,
    scope: 'installation',
    // site-changes-v6 §2.5.4: pull GET /returns (and /exchanges, /returns/claims) every hour and on start-up.
    schema: z.int().min(5).max(1440),
    default: 60,
    valueType: 'INT',
    labelKey: 'erp.events.pullMinutes.label',
    helpKey: 'erp.events.pullMinutes.help',
    sortOrder: 6,
  }),
  'erp.events.applySeconds': setting({
    ...erp,
    scope: 'installation',
    schema: z.int().min(5).max(3600),
    default: 30,
    valueType: 'INT',
    labelKey: 'erp.events.applySeconds.label',
    helpKey: 'erp.events.applySeconds.help',
    sortOrder: 7,
  }),
  'erp.events.applyBatch': setting({
    ...erp,
    scope: 'installation',
    schema: z.int().min(1).max(5000),
    default: 200,
    valueType: 'INT',
    labelKey: 'erp.events.applyBatch.label',
    helpKey: 'erp.events.applyBatch.help',
    sortOrder: 8,
  }),
  'erp.events.maxAttempts': setting({
    ...erp,
    scope: 'installation',
    schema: z.int().min(1).max(100),
    default: 10,
    valueType: 'INT',
    labelKey: 'erp.events.maxAttempts.label',
    helpKey: 'erp.events.maxAttempts.help',
    sortOrder: 9,
  }),
  'erp.events.claimsLookbackDays': setting({
    ...erp,
    scope: 'installation',
    schema: z.int().min(1).max(365),
    default: 30,
    valueType: 'INT',
    labelKey: 'erp.events.claimsLookbackDays.label',
    helpKey: 'erp.events.claimsLookbackDays.help',
    sortOrder: 10,
  }),
  'erp.events.correctionWaitHours': setting({
    ...erp,
    scope: 'installation',
    // A correction whose original never arrives waits this long (the hourly pull has had its chances), then it is
    // FAILED with ORIGINAL_NEVER_CAME and the health panel shows it.
    schema: z.int().min(1).max(24 * 30),
    default: 72,
    valueType: 'INT',
    labelKey: 'erp.events.correctionWaitHours.label',
    helpKey: 'erp.events.correctionWaitHours.help',
    sortOrder: 11,
  }),
  'erp.events.maxChain': setting({
    ...erp,
    scope: 'installation',
    // How deep a chain of corrections (a correction of a correction …) is followed in one go.
    schema: z.int().min(1).max(64),
    default: 8,
    valueType: 'INT',
    labelKey: 'erp.events.maxChain.label',
    helpKey: 'erp.events.maxChain.help',
    sortOrder: 12,
  }),

  // ---- PR 610 · Retail's account at the ERP and its hold ----
  'erp.hold.pauseCheckout': setting({
    ...erp,
    // §8: while the ERP refuses new orders (409 ACCOUNT_ON_HOLD) checkout pauses by itself, because the ERP holds no
    // stock for queued orders; off keeps checkout open and the orders wait for the release.
    schema: z.boolean(),
    default: true,
    valueType: 'BOOLEAN',
    labelKey: 'erp.hold.pauseCheckout.label',
    helpKey: 'erp.hold.pauseCheckout.help',
    sortOrder: 11,
  }),
  'erp.hold.warnDays': setting({
    ...erp,
    // The ERP's own warning window (`warnFromDays`) wins when the ERP sends it; this is the shop's until then.
    schema: z.int().min(0).max(365),
    default: 15,
    valueType: 'INT',
    labelKey: 'erp.hold.warnDays.label',
    helpKey: 'erp.hold.warnDays.help',
    sortOrder: 12,
  }),
  'erp.account.checkMinutes': setting({
    ...erp,
    scope: 'installation',
    schema: z.int().min(5).max(1440),
    default: 60,
    valueType: 'INT',
    labelKey: 'erp.account.checkMinutes.label',
    helpKey: 'erp.account.checkMinutes.help',
    sortOrder: 13,
  }),

  // ---- PR 617, 618 · what Retail sends the ERP ----
  'erp.summary.sendAt': setting({
    ...erp,
    // §5: yesterday's summary goes at 00:30 (the store's time zone), before the ERP's own check at 01:00.
    schema: clockTimeSchema,
    default: '00:30',
    valueType: 'STRING',
    labelKey: 'erp.summary.sendAt.label',
    helpKey: 'erp.summary.sendAt.help',
    sortOrder: 14,
  }),
  'erp.summary.retry.minutes': setting({
    ...erp,
    schema: erpSummaryRetrySchema,
    default: [1, 5, 15, 60],
    valueType: 'JSON',
    labelKey: 'erp.summary.retry.minutes.label',
    helpKey: 'erp.summary.retry.minutes.help',
    sortOrder: 15,
  }),
  'erp.fixedCosts.spread': setting({
    ...erp,
    // The ERP's rule (§3.3): by the days of the month, exact to the paisa, the remainder on the last day. The shop's
    // own view uses the same rule, so the two always agree.
    schema: z.enum(ERP_FIXED_COST_SPREADS),
    default: 'daysOfMonth',
    valueType: 'ENUM',
    labelKey: 'erp.fixedCosts.spread.label',
    helpKey: 'erp.fixedCosts.spread.help',
    sortOrder: 16,
  }),

  // ---- PR 616 · the books match (Books group) ----
  'books.week.start': setting({
    ...books,
    schema: z.enum(BOOKS_WEEKDAYS),
    default: 'saturday',
    valueType: 'ENUM',
    labelKey: 'books.week.start.label',
    helpKey: 'books.week.start.help',
    sortOrder: 1,
  }),
  'books.fiscalYear.startMonth': setting({
    ...books,
    schema: z.int().min(1).max(12),
    default: 7,
    valueType: 'INT',
    labelKey: 'books.fiscalYear.startMonth.label',
    helpKey: 'books.fiscalYear.startMonth.help',
    sortOrder: 2,
  }),
  'books.timing.maxMinutes': setting({
    ...books,
    // §4.2: the only allowed wait. A difference the ERP's rows explain stays PENDING while the pull fetches it, then
    // must resolve or becomes MISMATCH. Tolerance itself is zero and is not a setting.
    schema: z.int().min(5).max(1440),
    default: 120,
    valueType: 'INT',
    labelKey: 'books.timing.maxMinutes.label',
    helpKey: 'books.timing.maxMinutes.help',
    sortOrder: 3,
  }),
  'books.resend.days': setting({
    ...books,
    schema: z.int().min(0).max(90),
    default: 14,
    valueType: 'INT',
    labelKey: 'books.resend.days.label',
    helpKey: 'books.resend.days.help',
    sortOrder: 4,
  }),
  'books.close.requireMatched': setting({
    ...books,
    // §4.4: a month closes only when every day matched; the owner's override (reason and PIN) is logged and shown.
    schema: z.boolean(),
    default: true,
    valueType: 'BOOLEAN',
    labelKey: 'books.close.requireMatched.label',
    helpKey: 'books.close.requireMatched.help',
    sortOrder: 5,
  }),
  'books.close.runAt': setting({
    ...books,
    // §4.2: the nightly close of yesterday, after the ERP's own 01:00 check.
    schema: clockTimeSchema,
    default: '01:30',
    valueType: 'STRING',
    labelKey: 'books.close.runAt.label',
    helpKey: 'books.close.runAt.help',
    sortOrder: 6,
  }),

  // ---- PR 612, 614 · returns and exchanges through the ERP (Orders group) ----
  'exchange.passPriceRiseToCustomer': setting({
    ...orders,
    // §6.3: the exchange terms say the customer pays the difference when the new piece is dearer; a cheaper one is
    // never refunded (Retail's gain through the ERP's adjustment). Off: the shop absorbs a rise.
    schema: z.boolean(),
    default: true,
    valueType: 'BOOLEAN',
    labelKey: 'exchange.passPriceRiseToCustomer.label',
    helpKey: 'exchange.passPriceRiseToCustomer.help',
    sortOrder: 90,
  }),
  'exchange.returnWatch.days': setting({
    ...orders,
    // §6.5: the ERP keeps this window (the ERP's own value is shown beside it when it sends one).
    schema: z.int().min(1).max(30),
    default: 4,
    valueType: 'INT',
    labelKey: 'exchange.returnWatch.days.label',
    helpKey: 'exchange.returnWatch.days.help',
    sortOrder: 91,
  }),
  'returns.handback.photo': setting({
    ...orders,
    schema: z.boolean(),
    default: false,
    valueType: 'BOOLEAN',
    labelKey: 'returns.handback.photo.label',
    helpKey: 'returns.handback.photo.help',
    sortOrder: 92,
  }),

  // ---- PR 609 · import by style code, B grade and the selling-price floor (Products group) ----
  'catalogue.bGrade.listing': setting({
    ...catalogue,
    // Off: a style's B-grade SKUs are left out of the import. On: they become a listing of their own (§2.1).
    schema: z.boolean(),
    default: false,
    valueType: 'BOOLEAN',
    labelKey: 'catalogue.bGrade.listing.label',
    helpKey: 'catalogue.bGrade.listing.help',
    sortOrder: 60,
  }),
  'catalogue.floor.minMarginPercent': setting({
    ...catalogue,
    // Empty (off) until the owner sets it: a selling price, coupon, combo or discount below
    // buying price × (100 + this) / 100 is refused. A price decision: the owner's own data and his written OK.
    schema: z.int().min(0).max(1000).nullable(),
    default: null,
    valueType: 'INT',
    labelKey: 'catalogue.floor.minMarginPercent.label',
    helpKey: 'catalogue.floor.minMarginPercent.help',
    isOwnerData: true,
    requiresOwnerOk: true,
    sortOrder: 61,
  }),
};

// S15 · PR 581 (register "তীরন্দাজ Tirondaj — the seventh agent, ads specialist … Guardrails enforced by code, not
// by the AI: target sales, max cost per purchase, daily/monthly budget ceilings, auto-decrease allowed, any budget
// increase only after the owner's approval, kill switch, every change logged"; Blueprint C10.1, C10.2) —
// Tirondaj's own guardrails on Marketing › Ad platforms › Ads guardrails (registry version 581).
//
// - `ads.guardrails`: off as it ships — every ceiling and the CPA cap are 0 (off), `killSwitch` is off, and
//   `autoDecreaseAllowed` is off, so nothing here changes how campaign control (PR 268/531) or the growth agent
//   (PR 269) already behave until the owner sets a number.
// - `on`: turns on the budget-ceiling and CPA-cap checks `lib/marketing/campaign-control.ts` runs before it ever
//   lets an increase (resume, a higher daily budget, a schedule, a new launch) through — even one the owner has
//   already approved. Off, those two numbers are shown as targets only and nothing is blocked by them.
// - `killSwitch` is a separate, always-live emergency stop: on, every increase is refused regardless of `on`, and
//   turning it on pauses every active campaign at once (lib/marketing/ads-guardrails.ts `saveGuardrailsCard`).
// - `dailyBudgetCeiling` / `monthlyBudgetCeiling`: whole store-currency numbers, the same "whole currency, not
//   minor units" choice PR 269's own `noDeliveredSpend` already made. 0 = no ceiling. Checked (scaled to minor
//   units by the store currency's own digits) against, respectively, the sum of every active campaign's own daily
//   budget, and the shop's actual ad spend over the trailing 30 days (CLAUDE.md "plans and progress … never in
//   days or hours" aside, this is a rolling window ending now, the same idea PR 578's reports already use, not a
//   literal calendar month).
// - `maxCostPerPurchase`: 0 = off. Checked per campaign, against its own cost per delivered order over the
//   trailing 30 days (@extas/metrics `adDeliveredReturn`, the same figure PR 269's growth agent already reads).
// - `targetSales` / `targetPurchases`: 0 = off. Shown as progress against the trailing 30 days' delivered sales and
//   delivered orders — information only, never a block (CLAUDE.md "never invent a number": these are the owner's
//   own target, not a measured fact).
// - `autoDecreaseAllowed`: off by default. On, the page's "Decrease now" button lowers the daily budget of every
//   campaign over the cost-per-purchase cap by `decreaseStepPercent`, sent at once (a decrease never needs the
//   owner's approval, the same rule campaign-control.ts already applies to every budget change).
import { z } from 'zod';
import { setting } from './define';

const V581 = 581; // the register PR number: 330-332 are taken by wave 1 and 333 by PR 582 in this bundle
/** The highest money figure the guardrails form takes, in whole store currency (the same bound PR 269's own
 * `noDeliveredSpend` uses for a spend figure typed the same way). */
export const GUARDRAILS_MONEY_MAX = 10_000_000; // hardcode-ok: technical bound, matching GROWTH_SPEND_MAX
/** The highest purchase-count target the form takes. */
export const GUARDRAILS_COUNT_MAX = 1_000_000; // hardcode-ok: technical bound

export const adsGuardrailsSchema = z
  .object({
    /** Off: the ceiling and cost-per-purchase numbers below are shown as targets only and never block anything. */
    on: z.boolean(),
    /** Sum of every active campaign's own daily budget may never cross this (whole store currency). 0 = off. */
    dailyBudgetCeiling: z.number().int().min(0).max(GUARDRAILS_MONEY_MAX),
    /** The shop's ad spend over the trailing 30 days may never cross this (whole store currency). 0 = off. */
    monthlyBudgetCeiling: z.number().int().min(0).max(GUARDRAILS_MONEY_MAX),
    /** A campaign's own cost per delivered order (trailing 30 days) over this blocks any further increase. 0 = off. */
    maxCostPerPurchase: z.number().int().min(0).max(GUARDRAILS_MONEY_MAX),
    /** The owner's own monthly delivered-sales target, shown as progress only. 0 = off. */
    targetSales: z.number().int().min(0).max(GUARDRAILS_MONEY_MAX),
    /** The owner's own monthly delivered-purchase target, shown as progress only. 0 = off. */
    targetPurchases: z.number().int().min(0).max(GUARDRAILS_COUNT_MAX),
    /** Lets the page's "Decrease now" button lower a campaign over the cost-per-purchase cap. Off by default. */
    autoDecreaseAllowed: z.boolean(),
    /** How much "Decrease now" lowers a daily budget by, in percent. */
    decreaseStepPercent: z.number().int().min(1).max(90), // hardcode-ok: a percentage below a full cut
    /** On: every increase is refused and every active campaign is paused at once. Always live, independent of `on`. */
    killSwitch: z.boolean(),
  })
  .strict();
export type AdsGuardrailsSettings = z.output<typeof adsGuardrailsSchema>;

export const adsGuardrailsSettings = {
  'ads.guardrails': setting({
    scope: 'store',
    schema: adsGuardrailsSchema,
    // off; every ceiling, the cap and the two targets at 0 (off); no auto-decrease; 20 % steps; kill switch off
    default: { on: false, dailyBudgetCeiling: 0, monthlyBudgetCeiling: 0, maxCostPerPurchase: 0, targetSales: 0, targetPurchases: 0, autoDecreaseAllowed: false, decreaseStepPercent: 20, killSwitch: false }, // hardcode-ok: the shipped defaults
    valueType: 'JSON',
    group: 'ads',
    labelKey: 'ads.guardrails.label',
    helpKey: 'ads.guardrails.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 28,
    version: V581,
  }),
};

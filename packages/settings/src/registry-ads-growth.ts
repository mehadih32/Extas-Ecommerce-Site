// S13 · PR 269 (register "AI growth agent — reads performance, proposes changes, waits for approval"; Blueprint C3.1 row
// 8; demo 93-admin-ads.js, Tirondaj's suggestions) — the growth agent on Marketing › Ad platforms › Growth agent
// (registry version 175, lane B's reserved run).
//
// - `ads.growthAgent`: off as it ships (no daily run; "Run now" on the page still reads and proposes). The agent reads
//   delivered ROAS (delivered sales ÷ ad spend) by campaign, product and district over the last `days` days and turns
//   the owner's own limits into proposals that wait for his approval: pause a campaign that spent over `noDeliveredSpend`
//   with no delivered order, lower the daily budget of one under `poorRoasPercent`, raise the daily budget of one at or
//   over `goodRoasPercent` (by `stepPercent`), refresh the creative of one whose ROAS fell by more than `fatiguePercent`
//   against the days before, and build an audience from a product or a district at or over `goodRoasPercent`. A limit
//   of 0 means that kind of proposal is off; ROAS-based ones need `minDelivered` delivered orders. A proposal not
//   decided within `approvalHours` runs out. Nothing changes until a person approves it (CLAUDE.md rule 6).
import { z } from 'zod';
import { setting } from './define';

const V269 = 175;
/** The longest look-back (a quarter). */
export const GROWTH_DAYS_MAX = 90; // hardcode-ok: technical bound on the window the agent reads
/** The highest ROAS limit the form takes (in percent: 5000 = fifty taka back per taka spent). */
export const GROWTH_ROAS_MAX = 5000; // hardcode-ok: technical bound
/** The longest a proposal may wait (30 days in hours). */
export const GROWTH_APPROVAL_HOURS_MAX = 720; // hardcode-ok: technical bound
/** The most proposals one run may make. */
export const GROWTH_PROPOSALS_MAX = 50; // hardcode-ok: technical bound on one run's list
/** The highest "no delivered order" spend the form takes, in whole store currency. */
export const GROWTH_SPEND_MAX = 10_000_000; // hardcode-ok: technical bound

export const adsGrowthAgentSchema = z
  .object({
    /** On: the agent runs once a day right after the daily spend import. Off: only "Run now". */
    on: z.boolean(),
    /** The days it reads, today included; the days before them (as many) are the comparison for a tired creative. */
    days: z.number().int().min(1).max(GROWTH_DAYS_MAX),
    /** Delivered orders a campaign, product or district needs before its ROAS is judged. */
    minDelivered: z.number().int().min(1).max(1000), // hardcode-ok: technical bound
    /** ROAS at or over this (percent) → raise the daily budget / build an audience. 0 = off. */
    goodRoasPercent: z.number().int().min(0).max(GROWTH_ROAS_MAX),
    /** ROAS under this (percent) → lower the daily budget. 0 = off. */
    poorRoasPercent: z.number().int().min(0).max(GROWTH_ROAS_MAX),
    /** How much a proposal raises or lowers a daily budget, in percent. */
    stepPercent: z.number().int().min(1).max(90), // hardcode-ok: a percentage below a full cut
    /** Spend (whole store currency) over which a campaign with no delivered order is proposed for a pause. 0 = off. */
    noDeliveredSpend: z.number().int().min(0).max(GROWTH_SPEND_MAX),
    /** ROAS fallen by more than this percent against the days before → refresh the creative. 0 = off. */
    fatiguePercent: z.number().int().min(0).max(100), // hardcode-ok: a percentage
    /** Hours a proposal waits for the owner before it runs out. */
    approvalHours: z.number().int().min(1).max(GROWTH_APPROVAL_HOURS_MAX),
    /** The most proposals one run makes. */
    maxProposals: z.number().int().min(1).max(GROWTH_PROPOSALS_MAX),
  })
  .strict();
export type AdsGrowthAgentSettings = z.output<typeof adsGrowthAgentSchema>;

export const adsGrowthSettings = {
  'ads.growthAgent': setting({
    scope: 'store',
    schema: adsGrowthAgentSchema,
    // off; a week; 3 delivered orders before judging; every proposal kind off until the owner types a limit; 20 % steps; two days to decide; 10 a run
    default: { on: false, days: 7, minDelivered: 3, goodRoasPercent: 0, poorRoasPercent: 0, stepPercent: 20, noDeliveredSpend: 0, fatiguePercent: 0, approvalHours: 48, maxProposals: 10 }, // hardcode-ok: the shipped defaults (every kind off)
    valueType: 'JSON',
    group: 'ads',
    labelKey: 'ads.growthAgent.label',
    helpKey: 'ads.growthAgent.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 26,
    version: V269,
  }),
};

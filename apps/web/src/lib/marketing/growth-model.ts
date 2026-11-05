// S13 · PR 269 (register "AI growth agent — reads performance, proposes changes, waits for approval"; Blueprint C3.1 row
// 8) — the growth agent's thinking, with no database: the delivered-ROAS figures (@extas/metrics `adDeliveredReturn`) of
// the owner's last days and of the days before them, held against his limits (`ads.growthAgent`, registry v175), give a
// short list of proposals, most urgent first:
//   1. pause — a running campaign spent more than `noDeliveredSpend` and not one of its orders was delivered;
//   2. lowerBudget — delivered ROAS under `poorRoasPercent` (by `stepPercent`);
//   3. refreshCreative — delivered ROAS fell by more than `fatiguePercent` against the days before;
//   4. raiseBudget — delivered ROAS at or over `goodRoasPercent` (by `stepPercent`; it still waits for the owner);
//   5. buildAudience — a product or a district at or over `goodRoasPercent`.
// A limit of 0 keeps its kind off; ROAS is judged only with `minDelivered` delivered orders; a campaign whose spend is not
// known yet (a dollar day with no rate) or that is paused is never judged; a budget proposal needs a daily budget.
// `flagged` lists every campaign that spent with no delivered order whatever the limits (the Blueprint's flag).
import type { AdReturn, AdReturnRow } from '@extas/metrics';
import type { AdsGrowthAgentSettings } from '@extas/settings';

export const PROPOSAL_TYPES = ['pause', 'lowerBudget', 'refreshCreative', 'raiseBudget', 'buildAudience'] as const;
export type ProposalType = (typeof PROPOSAL_TYPES)[number];
export type ProposalTarget = 'AdCampaign' | 'Product' | 'GeoArea';

export interface GrowthCampaign {
  id: string;
  paused: boolean;
  dailyBudgetMinor: number | null;
}

export interface Proposal {
  type: ProposalType;
  refType: ProposalTarget;
  /** The campaign, product or district ('' never: an order with no district is never proposed). */
  refId: string;
  spendMinor: number | null;
  delivered: number;
  deliveredSalesMinor: number;
  roasPercent: number | null;
  /** The days before (refreshCreative only). */
  beforeRoasPercent: number | null;
  /** Budget proposals: the daily budget now and the one proposed (the campaign's own currency). */
  fromDailyMinor: number | null;
  toDailyMinor: number | null;
}

const PCT = 100; // hardcode-ok: percent

/** The daily budget after a step up or down (at least 1 minor unit). */
export function stepped(dailyMinor: number, stepPercent: number, up: boolean): number {
  return Math.max(1, Math.round((dailyMinor * (PCT + (up ? stepPercent : -stepPercent))) / PCT));
}

/** The campaigns that spent in the period and had no delivered order (unknown spend included). */
export const flagged = (now: AdReturn): AdReturnRow[] => now.campaigns.filter((r) => r.delivered === 0 && (r.spendMinor === null || r.spendMinor > 0));

/** The proposals for one run (at most `maxProposals`), most urgent first. `scale` turns whole store currency into minor units. */
export function growthProposals(o: { settings: AdsGrowthAgentSettings; now: AdReturn; before: AdReturn; campaigns: ReadonlyMap<string, GrowthCampaign>; scale: number }): Proposal[] {
  const s = o.settings;
  const out: Proposal[] = [];
  const base = (r: AdReturnRow, type: ProposalType, refType: ProposalTarget): Proposal => ({ type, refType, refId: r.key, spendMinor: r.spendMinor, delivered: r.delivered, deliveredSalesMinor: r.deliveredSalesMinor, roasPercent: r.roasPercent, beforeRoasPercent: null, fromDailyMinor: null, toDailyMinor: null });
  const judged = (r: AdReturnRow) => r.delivered >= s.minDelivered && r.roasPercent !== null;
  for (const r of o.now.campaigns) {
    const c = o.campaigns.get(r.key);
    if (!c || c.paused || r.spendMinor === null) continue;
    if (s.noDeliveredSpend > 0 && r.delivered === 0 && r.spendMinor > s.noDeliveredSpend * o.scale) out.push(base(r, 'pause', 'AdCampaign'));
    if (!judged(r)) continue;
    const roas = r.roasPercent!;
    const budget = c.dailyBudgetMinor;
    if (s.poorRoasPercent > 0 && roas < s.poorRoasPercent && budget !== null) out.push({ ...base(r, 'lowerBudget', 'AdCampaign'), fromDailyMinor: budget, toDailyMinor: stepped(budget, s.stepPercent, false) });
    const before = o.before.campaigns.find((b) => b.key === r.key);
    if (s.fatiguePercent > 0 && before && judged(before) && before.roasPercent! > 0 && roas * PCT < before.roasPercent! * (PCT - s.fatiguePercent)) out.push({ ...base(r, 'refreshCreative', 'AdCampaign'), beforeRoasPercent: before.roasPercent });
    if (s.goodRoasPercent > 0 && roas >= s.goodRoasPercent && budget !== null && !(s.poorRoasPercent > 0 && roas < s.poorRoasPercent)) out.push({ ...base(r, 'raiseBudget', 'AdCampaign'), fromDailyMinor: budget, toDailyMinor: stepped(budget, s.stepPercent, true) });
  }
  if (s.goodRoasPercent > 0) {
    for (const r of o.now.products) if (judged(r) && r.roasPercent! >= s.goodRoasPercent) out.push(base(r, 'buildAudience', 'Product'));
    for (const r of o.now.districts) if (r.key && judged(r) && r.roasPercent! >= s.goodRoasPercent) out.push(base(r, 'buildAudience', 'GeoArea'));
  }
  const rank = (p: Proposal) => PROPOSAL_TYPES.indexOf(p.type);
  return out.sort((a, b) => rank(a) - rank(b) || (b.spendMinor ?? 0) - (a.spendMinor ?? 0) || b.deliveredSalesMinor - a.deliveredSalesMinor || a.refId.localeCompare(b.refId)).slice(0, s.maxProposals);
}

/** One proposal's place in the queue: the same kind for the same thing waits only once. */
export const proposalKey = (p: { type: string; refId: string }) => `${p.type}:${p.refId}`;

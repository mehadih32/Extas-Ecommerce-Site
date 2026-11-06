// S13 · PR 268 (register "Pause and budget change from the dashboard, with a confirm step"; demo 93-admin-ads.js
// "Raise budget — needs your approval") — a platform campaign paused, started again, or given a new daily budget. One
// platform-neutral writer (`CampaignWriter`) beside the read-only `AdsReader`.
//
// - What each platform would be sent is built here (pure, tested): Meta the campaign's `status` / `daily_budget` (the
//   account currency's minor unit), TikTok `operation_status` / `budget` (major unit), Google the campaign's `status`
//   and its budget's `amountMicros`.
// - Practice only for now (A1.3, CN-031 lane B, the owner's rule 6): the practice writer keeps what it would have sent in
//   this process and sends nothing anywhere, so no real budget or campaign changes. The live writer (a token with
//   ads_management / campaign-write rights in Keys & connections) comes with its own test later. Whether a change may
//   happen at all (the confirm step, the owner's approval for an increase) is decided by the caller, never here.
// - PR 531 (register "Full campaign control from the dashboard — create, run, duplicate, schedule and re-budget a
//   campaign"): a campaign's schedule (start and end) and a new campaign (or a copy of one) on the platform. The caller
//   only sends these after the owner approved them (a start is more spend, CLAUDE.md rule 6).
import type { AdsPlatform, AdsRead } from './meta-ads';
import { minorDigitsOf } from './spend';

/** A schedule is two instants (ISO, UTC); null = from now / until stopped. */
export type CampaignChange = { kind: 'pause' } | { kind: 'resume' } | { kind: 'budget'; dailyBudgetMinor: number } | { kind: 'schedule'; startAt: string | null; endAt: string | null };

/** What a new campaign is for, in the shop's words (each platform has its own word for it). */
export const CAMPAIGN_OBJECTIVES = ['sales', 'traffic', 'awareness', 'leads'] as const;
export type CampaignObjective = (typeof CAMPAIGN_OBJECTIVES)[number];
/** Each platform's word for an objective (Meta ODAX outcomes, TikTok objective types, Google channel types). */
export const OBJECTIVE_WORDS: Record<AdsPlatform, Record<CampaignObjective, string>> = {
  meta: { sales: 'OUTCOME_SALES', traffic: 'OUTCOME_TRAFFIC', awareness: 'OUTCOME_AWARENESS', leads: 'OUTCOME_LEADS' },
  tiktok: { sales: 'PRODUCT_SALES', traffic: 'TRAFFIC', awareness: 'REACH', leads: 'LEAD_GENERATION' },
  google: { sales: 'PERFORMANCE_MAX', traffic: 'SEARCH', awareness: 'DISPLAY', leads: 'SEARCH' },
};
/** The shop's objective of a platform word (a duplicate keeps it); unknown words read as sales. */
export function objectiveOf(platform: AdsPlatform, word: string | null): CampaignObjective {
  const hit = CAMPAIGN_OBJECTIVES.find((k) => OBJECTIVE_WORDS[platform][k] === word);
  return hit ?? 'sales';
}

export interface CampaignCreateInput {
  accountExternalId: string;
  currency: string;
  name: string;
  objective: CampaignObjective;
  dailyBudgetMinor: number;
  startAt: string | null;
  endAt: string | null;
  /** A copy of this platform campaign (its ad sets and ads with it), where the platform can copy. */
  copyOfExternalId: string | null;
}

export interface CampaignChangeInput {
  campaignExternalId: string;
  /** The ad account's id on the platform (TikTok's advertiser, Google's customer). */
  accountExternalId: string;
  /** The account currency (the budget is in its minor unit). */
  currency: string;
  change: CampaignChange;
}

export interface CampaignWriter {
  provider: string;
  platform: AdsPlatform;
  /** A practice copy: nothing leaves the server and the shop keeps no change from it. */
  practice: boolean;
  change(o: CampaignChangeInput): Promise<AdsRead<{ done: true }>>;
  /** PR 531: a new campaign (or a copy); answers the platform's id of it. A writer without it cannot create. */
  create?(o: CampaignCreateInput): Promise<AdsRead<{ externalId: string }>>;
}

const major = (minor: number, currency: string) => minor / 10 ** minorDigitsOf(currency);
const MICROS = 1_000_000; // hardcode-ok: Google's micros per major unit (a unit of the API)

/** Meta: POST /{campaign-id} with these fields. */
export function metaCampaignPayload(o: CampaignChangeInput) {
  const c = o.change;
  if (c.kind === 'schedule') return { path: `/${o.campaignExternalId}`, body: { start_time: c.startAt, stop_time: c.endAt } };
  return { path: `/${o.campaignExternalId}`, body: c.kind === 'budget' ? { daily_budget: c.dailyBudgetMinor } : { status: c.kind === 'pause' ? 'PAUSED' : 'ACTIVE' } };
}

/** TikTok: /campaign/status/update/ for pause and resume, /campaign/update/ for the budget (major unit). */
export function tiktokCampaignPayload(o: CampaignChangeInput) {
  const c = o.change;
  // TikTok keeps the schedule on the ad groups: the live writer sends this to each ad group of the campaign
  if (c.kind === 'schedule') return { path: '/adgroup/update/', body: { advertiser_id: o.accountExternalId, campaign_id: o.campaignExternalId, schedule_type: c.endAt ? 'SCHEDULE_START_END' : 'SCHEDULE_FROM_NOW', schedule_start_time: c.startAt, schedule_end_time: c.endAt } };
  return c.kind === 'budget'
    ? { path: '/campaign/update/', body: { advertiser_id: o.accountExternalId, campaign_id: o.campaignExternalId, budget_mode: 'BUDGET_MODE_DAY', budget: major(c.dailyBudgetMinor, o.currency) } }
    : { path: '/campaign/status/update/', body: { advertiser_id: o.accountExternalId, campaign_ids: [o.campaignExternalId], operation_status: c.kind === 'pause' ? 'DISABLE' : 'ENABLE' } };
}

/** Google: campaigns:mutate for the status; campaignBudgets:mutate for the amount (the live writer reads the budget's name first). */
export function googleCampaignPayload(o: CampaignChangeInput) {
  const c = o.change;
  const customer = o.accountExternalId.replace(/-/g, '');
  if (c.kind === 'schedule') return { path: `/customers/${customer}/campaigns:mutate`, body: { operations: [{ update: { resourceName: `customers/${customer}/campaigns/${o.campaignExternalId}`, startDate: c.startAt?.slice(0, 10) ?? null, endDate: c.endAt?.slice(0, 10) ?? null }, updateMask: 'start_date,end_date' }] } };
  return c.kind === 'budget'
    ? { path: `/customers/${customer}/campaignBudgets:mutate`, body: { campaign: `customers/${customer}/campaigns/${o.campaignExternalId}`, amountMicros: String(Math.round(major(c.dailyBudgetMinor, o.currency) * MICROS)) } }
    : { path: `/customers/${customer}/campaigns:mutate`, body: { operations: [{ update: { resourceName: `customers/${customer}/campaigns/${o.campaignExternalId}`, status: c.kind === 'pause' ? 'PAUSED' : 'ENABLED' }, updateMask: 'status' }] } };
}

/** Meta: a copy (POST /{campaign-id}/copies, then its name and budget as a change) or POST /act_{account}/campaigns. */
export function metaCreatePayload(o: CampaignCreateInput) {
  if (o.copyOfExternalId) return { path: `/${o.copyOfExternalId}/copies`, body: { deep_copy: true, status_option: 'ACTIVE', start_time: o.startAt, end_time: o.endAt }, then: { name: o.name, daily_budget: o.dailyBudgetMinor } };
  const account = o.accountExternalId.startsWith('act_') ? o.accountExternalId : `act_${o.accountExternalId}`;
  return { path: `/${account}/campaigns`, body: { name: o.name, objective: OBJECTIVE_WORDS.meta[o.objective], status: 'ACTIVE', daily_budget: o.dailyBudgetMinor, start_time: o.startAt, stop_time: o.endAt, special_ad_categories: [] } };
}

/** TikTok: /campaign/create/ (no copy on the platform: the same settings; the schedule goes to its ad groups). */
export function tiktokCreatePayload(o: CampaignCreateInput) {
  return { path: '/campaign/create/', body: { advertiser_id: o.accountExternalId, campaign_name: o.name, objective_type: OBJECTIVE_WORDS.tiktok[o.objective], budget_mode: 'BUDGET_MODE_DAY', budget: major(o.dailyBudgetMinor, o.currency), operation_status: 'ENABLE' } };
}

/** Google: a budget, then campaigns:mutate create with it (no copy on the platform: the same settings). */
export function googleCreatePayload(o: CampaignCreateInput) {
  const customer = o.accountExternalId.replace(/-/g, '');
  return {
    path: `/customers/${customer}/campaigns:mutate`,
    budget: { path: `/customers/${customer}/campaignBudgets:mutate`, amountMicros: String(Math.round(major(o.dailyBudgetMinor, o.currency) * MICROS)) },
    body: { operations: [{ create: { name: o.name, status: 'ENABLED', advertisingChannelType: OBJECTIVE_WORDS.google[o.objective], startDate: o.startAt?.slice(0, 10) ?? null, endDate: o.endAt?.slice(0, 10) ?? null } }] },
  };
}
const BUILD_NEW: Record<AdsPlatform, (o: CampaignCreateInput) => unknown> = { meta: metaCreatePayload, tiktok: tiktokCreatePayload, google: googleCreatePayload };

const BUILD: Record<AdsPlatform, (o: CampaignChangeInput) => unknown> = { meta: metaCampaignPayload, tiktok: tiktokCampaignPayload, google: googleCampaignPayload };

// --- the practice writer -------------------------------------------------------------------------------------------

export interface MockCampaignSend {
  at: Date;
  platform: AdsPlatform;
  campaignExternalId: string;
  change: CampaignChange | { kind: 'create'; name: string };
  /** What the live writer would have sent (no token). */
  payload: unknown;
}

const G = globalThis as unknown as { __extasMockCampaignChanges?: MockCampaignSend[] };
const outbox = (): MockCampaignSend[] => (G.__extasMockCampaignChanges ??= []);
/** The practice writer keeps this many sends (the newest). */
const MOCK_KEEP = 50; // hardcode-ok: an in-memory practice list, not a business number

/** What the practice writers were asked to send in this process (tests). */
export const mockCampaignOutbox = {
  all: (): readonly MockCampaignSend[] => [...outbox()],
  clear: (): void => {
    outbox().length = 0;
  },
};

export const CAMPAIGN_WRITER_PROVIDER: Record<AdsPlatform, string> = { meta: 'metaCampaigns', google: 'googleCampaigns', tiktok: 'tiktokCampaigns' };

/** The practice writer of a platform: answers like the platform would and sends nothing. */
export function practiceCampaignWriter(platform: AdsPlatform): CampaignWriter {
  return {
    provider: CAMPAIGN_WRITER_PROVIDER[platform],
    platform,
    practice: true,
    async change(o) {
      const all = outbox();
      all.push({ at: new Date(), platform, campaignExternalId: o.campaignExternalId, change: o.change, payload: BUILD[platform](o) });
      if (all.length > MOCK_KEEP) all.splice(0, all.length - MOCK_KEEP);
      return { ok: true, value: { done: true } };
    },
    async create(o) {
      const all = outbox();
      all.push({ at: new Date(), platform, campaignExternalId: o.copyOfExternalId ?? '', change: { kind: 'create', name: o.name }, payload: BUILD_NEW[platform](o) });
      if (all.length > MOCK_KEEP) all.splice(0, all.length - MOCK_KEEP);
      return { ok: true, value: { externalId: `practice-${all.length}` } };
    },
  };
}

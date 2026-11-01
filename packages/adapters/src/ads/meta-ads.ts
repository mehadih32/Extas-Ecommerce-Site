// S13 · PR 259 — Facebook and Instagram ads behind the adapter: Meta's Marketing API, read only.
//
// - One platform-neutral reader (`AdsReader`): the ad account (name, currency, state), its campaigns (status,
//   objective, daily or lifetime budget in the account currency's minor unit, start and end) and their ad sets (with
//   targeting). Google (PR 261) and TikTok (PR 260) get their own reader of the same shape.
// - Read only. Nothing here pauses a campaign or changes a budget: that is PR 268, behind a confirm and the owner's
//   approval for any increase (A1 rule 6). The token needs `ads_read` only.
// - Until the owner types the token into Keys & connections and its test (reading the account) passes, the mock
//   answers with a practice account: the shop shows it as a practice copy and saves nothing (A1.3).
// - No key ever appears in an address or an error: the token travels in a header, and Meta's own words are cleaned.
import { z } from 'zod';
import { defineAdapter, requireSecret } from '../define';
import { META_DEFAULT_API_VERSION, META_DEFAULT_BASE_URL } from './index';

export type AdsPlatform = 'meta' | 'google' | 'tiktok';

export interface AdsAccountFacts {
  externalId: string;
  name: string;
  currency: string;
  /** The platform's own word for the account's state (Meta: 1 active, 2 disabled, …). */
  status: string;
}

export interface AdsCampaignFacts {
  externalId: string;
  name: string;
  /** The platform's own status word (ACTIVE, PAUSED, ARCHIVED, …). */
  status: string;
  objective: string | null;
  /** In the account currency's minor unit, as the platform states it. */
  dailyBudgetMinor: number | null;
  lifetimeBudgetMinor: number | null;
  startAt: Date | null;
  stopAt: Date | null;
}

export interface AdsSetFacts {
  externalId: string;
  campaignExternalId: string;
  name: string;
  status: string;
  dailyBudgetMinor: number | null;
  /** The platform's targeting as it gave it (countries, ages, custom audiences …). */
  targeting: unknown;
}

export type AdsRead<T> = { ok: true; value: T } | { ok: false; error: string };

/** Read-only access to one ad account. */
export interface AdsReader {
  provider: string;
  platform: AdsPlatform;
  /** A practice copy: what it returns is an example, never saved. */
  practice: boolean;
  account(): Promise<AdsRead<AdsAccountFacts>>;
  campaigns(): Promise<AdsRead<AdsCampaignFacts[]>>;
  adSets(): Promise<AdsRead<AdsSetFacts[]>>;
}

export const META_ADS_PROVIDER = 'metaAds';
/** Pages followed per list (Meta pages its lists); the rest waits for the next read. */
export const META_ADS_MAX_PAGES = 20; // hardcode-ok: a paging guard, not a business number
const PAGE_SIZE = 200; // hardcode-ok: Meta's page size per call, a technical number

export const metaAdsConfig = z.object({
  /** The ad account id from Ads Manager (with or without `act_`). */
  adAccountId: z
    .string()
    .trim()
    .regex(/^(act_)?\d{5,20}$/, { message: 'the ad account id is a number, like act_1234567890' }),
  apiVersion: z.string().trim().regex(/^v\d{1,3}\.\d{1,2}$/, { message: 'like v21.0' }).optional(),
  baseUrl: z.url({ protocol: /^https$/, message: 'not an https address' }).max(500).optional(),
});
export type MetaAdsConfig = z.output<typeof metaAdsConfig>;

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' && /^\d{1,15}$/.test(v) ? Number(v) : typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;
  return n !== null && n > 0 ? n : null;
};
const when = (v: unknown): Date | null => {
  if (typeof v !== 'string') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const str = (v: unknown, max = 300): string => (typeof v === 'string' ? v.slice(0, max) : typeof v === 'number' ? String(v) : '');

/** Meta's campaign row in our shape. */
export function metaCampaign(r: Record<string, unknown>): AdsCampaignFacts {
  return {
    externalId: str(r.id, 40),
    name: str(r.name) || str(r.id, 40),
    status: str(r.effective_status, 40) || str(r.status, 40) || 'UNKNOWN',
    objective: str(r.objective, 60) || null,
    dailyBudgetMinor: num(r.daily_budget),
    lifetimeBudgetMinor: num(r.lifetime_budget),
    startAt: when(r.start_time),
    stopAt: when(r.stop_time),
  };
}

/** Meta's ad set row in our shape. */
export function metaAdSet(r: Record<string, unknown>): AdsSetFacts {
  return {
    externalId: str(r.id, 40),
    campaignExternalId: str(r.campaign_id, 40),
    name: str(r.name) || str(r.id, 40),
    status: str(r.effective_status, 40) || str(r.status, 40) || 'UNKNOWN',
    dailyBudgetMinor: num(r.daily_budget),
    targeting: r.targeting && typeof r.targeting === 'object' ? r.targeting : null,
  };
}

export function createMetaAdsClient(o: { baseUrl: string; apiVersion: string; adAccountId: string; token: string; fetch?: typeof fetch }): AdsReader & { check(): Promise<{ ok: boolean; message: string }> } {
  const doFetch = o.fetch ?? fetch;
  const account = o.adAccountId.startsWith('act_') ? o.adAccountId : `act_${o.adAccountId}`;
  const root = `${o.baseUrl.replace(/\/+$/, '')}/${o.apiVersion}`;
  const headers = { Authorization: `Bearer ${o.token}` };
  const clean = (v: unknown) => (typeof v === 'string' ? v.replaceAll(o.token, '…').slice(0, 200) : '');

  async function get(url: string): Promise<AdsRead<Record<string, unknown>>> {
    try {
      const res = await doFetch(url, { method: 'GET', headers });
      let b: Record<string, unknown> = {};
      try {
        b = (await res.json()) as Record<string, unknown>;
      } catch {
        // an answer that is not JSON is said in words below
      }
      if (!res.ok) return { ok: false, error: clean((b.error as { message?: unknown } | undefined)?.message) || `Meta answered ${res.status}` };
      return { ok: true, value: b };
    } catch {
      return { ok: false, error: 'Meta did not answer' };
    }
  }

  /** A paged list: follows Meta's `paging.next` (same host only) up to the page guard. */
  async function list<T>(path: string, fields: string, map: (r: Record<string, unknown>) => T): Promise<AdsRead<T[]>> {
    const out: T[] = [];
    let url: string | null = `${root}/${account}/${path}?fields=${encodeURIComponent(fields)}&limit=${PAGE_SIZE}`;
    for (let page = 0; url && page < META_ADS_MAX_PAGES; page += 1) {
      const r = await get(url);
      if (!r.ok) return r;
      const data = Array.isArray(r.value.data) ? (r.value.data as Record<string, unknown>[]) : [];
      out.push(...data.map(map).filter((x) => (x as { externalId: string }).externalId));
      const next = (r.value.paging as { next?: unknown } | undefined)?.next;
      url = typeof next === 'string' && next.startsWith(`${o.baseUrl.replace(/\/+$/, '')}/`) ? next.replace(/([?&])access_token=[^&]*&?/, '$1') : null;
    }
    return { ok: true, value: out };
  }

  const reader = {
    provider: META_ADS_PROVIDER,
    platform: 'meta' as const,
    practice: false,
    async account(): Promise<AdsRead<AdsAccountFacts>> {
      const r = await get(`${root}/${account}?fields=name,currency,account_status`);
      if (!r.ok) return r;
      return { ok: true, value: { externalId: account, name: str(r.value.name) || account, currency: str(r.value.currency, 3).toUpperCase(), status: str(r.value.account_status, 20) } };
    },
    campaigns: () => list('campaigns', 'id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time', metaCampaign),
    adSets: () => list('adsets', 'id,campaign_id,name,status,effective_status,daily_budget,targeting', metaAdSet),
    async check() {
      const r = await reader.account();
      return r.ok ? { ok: true, message: `connected; ad account ${r.value.name} (${r.value.currency})` } : { ok: false, message: r.error };
    },
  };
  return reader;
}

/** The practice copy: an example account and two example campaigns, never saved by the shop. */
export function practiceAdsReader(provider: string, platform: AdsPlatform, currency = 'BDT'): AdsReader {
  const day = 86_400_000;
  const start = new Date(Date.UTC(2026, 0, 1));
  return {
    provider,
    platform,
    practice: true,
    account: async () => ({ ok: true, value: { externalId: 'practice-account', name: 'Practice ad account', currency, status: '1' } }),
    campaigns: async () => ({
      ok: true,
      value: [
        { externalId: 'practice-1', name: 'Practice — sales, delivered purchase', status: 'ACTIVE', objective: 'OUTCOME_SALES', dailyBudgetMinor: 80_000, lifetimeBudgetMinor: null, startAt: start, stopAt: null },
        { externalId: 'practice-2', name: 'Practice — retargeting the bag', status: 'PAUSED', objective: 'OUTCOME_SALES', dailyBudgetMinor: null, lifetimeBudgetMinor: 1_500_000, startAt: start, stopAt: new Date(start.getTime() + 30 * day) },
      ],
    }),
    adSets: async () => ({ ok: true, value: [{ externalId: 'practice-1a', campaignExternalId: 'practice-1', name: 'Practice — Dhaka, 20–40', status: 'ACTIVE', dailyBudgetMinor: null, targeting: { geo_locations: { countries: ['BD'] }, age_min: 20, age_max: 40 } }] }),
  };
}

type CheckedReader = AdsReader & { check?: () => Promise<{ ok: boolean; message: string }> };

export const metaAdsAdapter = defineAdapter<CheckedReader, MetaAdsConfig>({
  kind: 'META',
  provider: META_ADS_PROVIDER,
  modes: ['LIVE'],
  secrets: ['accessToken'],
  configSchema: metaAdsConfig,
  async create(ctx) {
    return createMetaAdsClient({ baseUrl: ctx.config.baseUrl ?? META_DEFAULT_BASE_URL, apiVersion: ctx.config.apiVersion ?? META_DEFAULT_API_VERSION, adAccountId: ctx.config.adAccountId, token: await requireSecret(ctx, 'accessToken') });
  },
  async mock() {
    return practiceAdsReader(META_ADS_PROVIDER, 'meta');
  },
  test: async (api, ctx) => (ctx.mode === 'MOCK' || !api.check ? { ok: true, message: 'mock Meta ads: a practice account, nothing is read from Meta' } : api.check()),
});

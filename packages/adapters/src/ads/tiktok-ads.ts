// S13 · PR 260 — TikTok ads behind the adapter: TikTok's Business API (Marketing API 1.3), read only.
//
// - The same platform-neutral reader as Meta (`AdsReader`, ads/meta-ads.ts): the advertiser account (name, currency,
//   state), its campaigns (status, objective, daily or total budget) and their ad groups (TikTok's ad sets, with their
//   targeting) — so Marketing › Ad platforms shows TikTok beside Meta with no page of its own.
// - TikTok states budgets in the account currency's major unit (500.5 = ৳500.50); the reader turns them into the
//   minor unit the shop keeps, by the currency's own digits. "No limit" (BUDGET_MODE_INFINITE) is no budget.
// - Read only. Nothing here pauses a campaign or changes a budget: that is PR 268, behind a confirm and the owner's
//   approval for any increase (A1 rule 6). The token needs the "Ad Account Management" read scope only.
// - Until the owner types the token into Keys & connections and its test (reading the advertiser) passes, the mock
//   answers with a practice account: the shop shows it as a practice copy and saves nothing (A1.3).
// - No key ever appears in an address or an error: the token travels in TikTok's `Access-Token` header, and TikTok's
//   own words are cleaned. TikTok answers 200 with `code` ≠ 0 for a refusal; that is a refusal here too.
import { z } from 'zod';
import { defineAdapter, requireSecret } from '../define';
import { TIKTOK_DEFAULT_BASE_URL } from './index';
import { practiceAdsReader, type AdsAccountFacts, type AdsCampaignFacts, type AdsRead, type AdsReader, type AdsSetFacts } from './meta-ads';

export const TIKTOK_ADS_PROVIDER = 'tiktokAds';
/** Pages followed per list (TikTok pages its lists); the rest waits for the next read. */
export const TIKTOK_ADS_MAX_PAGES = 20; // hardcode-ok: a paging guard, not a business number
const PAGE_SIZE = 1000; // hardcode-ok: TikTok's largest page size per call, a technical number
const API = '/open_api/v1.3';

export const tiktokAdsConfig = z.object({
  /** The advertiser id from TikTok Ads Manager (the number under the account name). */
  advertiserId: z
    .string()
    .trim()
    .regex(/^\d{5,25}$/, { message: 'the advertiser id is a number, like 7012345678901234567' }),
  baseUrl: z.url({ protocol: /^https$/, message: 'not an https address' }).max(500).optional(),
});
export type TiktokAdsConfig = z.output<typeof tiktokAdsConfig>;

const str = (v: unknown, max = 300): string => (typeof v === 'string' ? v.slice(0, max) : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');

/** The currency's minor digits (BDT 2, JPY 0); an unknown code keeps the common two. */
export function minorDigitsOf(currency: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2; // hardcode-ok: ISO 4217's usual minor digits, only for a code Intl does not know
  }
}

/** A TikTok amount (major unit, a number or a numeric string) in the minor unit; none, zero or nonsense is null. */
export function tiktokMinor(v: unknown, currency: string): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d{1,13}(\.\d{1,6})?$/.test(v.trim()) ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 10 ** minorDigitsOf(currency));
}

/** TikTok's times: "2026-10-01 00:00:00" in UTC, or an ISO time. */
function when(v: unknown): Date | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const s = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v.trim()) ? `${v.trim().replace(' ', 'T')}Z` : v.trim();
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The status shown: TikTok's detailed one (secondary_status), else the switch (ENABLE / DISABLE). */
const statusOf = (r: Record<string, unknown>) => str(r.secondary_status, 60) || str(r.operation_status, 40) || 'UNKNOWN';

/** TikTok's campaign row in our shape (campaigns have no dates on TikTok: their ad groups do). */
export function tiktokCampaign(r: Record<string, unknown>, currency: string): AdsCampaignFacts {
  const mode = str(r.budget_mode, 40);
  const budget = mode === 'BUDGET_MODE_INFINITE' ? null : tiktokMinor(r.budget, currency);
  return {
    externalId: str(r.campaign_id, 40),
    name: str(r.campaign_name) || str(r.campaign_id, 40),
    status: statusOf(r),
    objective: str(r.objective_type, 60) || null,
    dailyBudgetMinor: mode === 'BUDGET_MODE_DAY' || mode === 'BUDGET_MODE_DYNAMIC_DAILY_BUDGET' ? budget : null,
    lifetimeBudgetMinor: mode === 'BUDGET_MODE_TOTAL' ? budget : null,
    startAt: when(r.schedule_start_time),
    stopAt: when(r.schedule_end_time),
  };
}

/** TikTok's ad group row (its ad set) in our shape; targeting keeps TikTok's own fields as given. */
export function tiktokAdGroup(r: Record<string, unknown>, currency: string): AdsSetFacts {
  const keep = ['location_ids', 'age_groups', 'gender', 'languages', 'audience_ids', 'excluded_audience_ids', 'interest_category_ids', 'placements', 'schedule_start_time', 'schedule_end_time'];
  const targeting = Object.fromEntries(keep.filter((k) => r[k] !== undefined && r[k] !== null).map((k) => [k, r[k]]));
  return {
    externalId: str(r.adgroup_id, 40),
    campaignExternalId: str(r.campaign_id, 40),
    name: str(r.adgroup_name) || str(r.adgroup_id, 40),
    status: statusOf(r),
    dailyBudgetMinor: str(r.budget_mode, 40) === 'BUDGET_MODE_DAY' ? tiktokMinor(r.budget, currency) : null,
    targeting: Object.keys(targeting).length ? targeting : null,
  };
}

export function createTiktokAdsClient(o: { baseUrl: string; advertiserId: string; token: string; fetch?: typeof fetch }): AdsReader & { check(): Promise<{ ok: boolean; message: string }> } {
  const doFetch = o.fetch ?? fetch;
  const root = `${o.baseUrl.replace(/\/+$/, '')}${API}`;
  const headers = { 'Access-Token': o.token };
  const clean = (v: unknown) => (typeof v === 'string' ? v.replaceAll(o.token, '…').slice(0, 200) : '');
  let currency: string | null = null;

  async function get(path: string, query: Record<string, string>): Promise<AdsRead<Record<string, unknown>>> {
    const url = `${root}${path}?${new URLSearchParams(query).toString()}`;
    try {
      const res = await doFetch(url, { method: 'GET', headers });
      let b: Record<string, unknown> = {};
      try {
        b = (await res.json()) as Record<string, unknown>;
      } catch {
        // an answer that is not JSON is said in words below
      }
      if (!res.ok || b.code !== 0) return { ok: false, error: clean(b.message) || `TikTok answered ${res.status}` };
      return { ok: true, value: b.data && typeof b.data === 'object' ? (b.data as Record<string, unknown>) : {} };
    } catch {
      return { ok: false, error: 'TikTok did not answer' };
    }
  }

  async function account(): Promise<AdsRead<AdsAccountFacts>> {
    const r = await get('/advertiser/info/', { advertiser_ids: JSON.stringify([o.advertiserId]), fields: JSON.stringify(['advertiser_id', 'name', 'currency', 'status']) });
    if (!r.ok) return r;
    const row = (Array.isArray(r.value.list) ? (r.value.list as Record<string, unknown>[]) : []).find((x) => str(x.advertiser_id, 40) === o.advertiserId);
    if (!row) return { ok: false, error: `TikTok did not list advertiser ${o.advertiserId} for this token` };
    currency = str(row.currency, 3).toUpperCase() || null;
    return { ok: true, value: { externalId: o.advertiserId, name: str(row.name) || o.advertiserId, currency: currency ?? '', status: str(row.status, 60) } };
  }

  /** The currency budgets are stated in: read once from the advertiser. */
  async function currencyOf(): Promise<AdsRead<string>> {
    if (currency) return { ok: true, value: currency };
    const a = await account();
    return a.ok ? { ok: true, value: a.value.currency } : a;
  }

  /** A paged list: TikTok's page_info (page, total_page), up to the page guard. */
  async function list<T>(path: string, map: (r: Record<string, unknown>, currency: string) => T): Promise<AdsRead<T[]>> {
    const c = await currencyOf();
    if (!c.ok) return c;
    const out: T[] = [];
    for (let page = 1; page <= TIKTOK_ADS_MAX_PAGES; page += 1) {
      const r = await get(path, { advertiser_id: o.advertiserId, page: String(page), page_size: String(PAGE_SIZE) });
      if (!r.ok) return r;
      const data = Array.isArray(r.value.list) ? (r.value.list as Record<string, unknown>[]) : [];
      out.push(...data.map((x) => map(x, c.value)).filter((x) => (x as { externalId: string }).externalId));
      const total = Number((r.value.page_info as { total_page?: unknown } | undefined)?.total_page);
      if (!data.length || !Number.isFinite(total) || page >= total) break;
    }
    return { ok: true, value: out };
  }

  const reader = {
    provider: TIKTOK_ADS_PROVIDER,
    platform: 'tiktok' as const,
    practice: false,
    account,
    campaigns: () => list('/campaign/get/', tiktokCampaign),
    adSets: () => list('/adgroup/get/', tiktokAdGroup),
    async check() {
      const r = await account();
      return r.ok ? { ok: true, message: `connected; advertiser ${r.value.name} (${r.value.currency})` } : { ok: false, message: r.error };
    },
  };
  return reader;
}

type CheckedReader = AdsReader & { check?: () => Promise<{ ok: boolean; message: string }> };

export const tiktokAdsAdapter = defineAdapter<CheckedReader, TiktokAdsConfig>({
  kind: 'TIKTOK',
  provider: TIKTOK_ADS_PROVIDER,
  modes: ['LIVE'],
  secrets: ['accessToken'],
  configSchema: tiktokAdsConfig,
  async create(ctx) {
    return createTiktokAdsClient({ baseUrl: ctx.config.baseUrl ?? TIKTOK_DEFAULT_BASE_URL, advertiserId: ctx.config.advertiserId, token: await requireSecret(ctx, 'accessToken') });
  },
  async mock() {
    return practiceAdsReader(TIKTOK_ADS_PROVIDER, 'tiktok');
  },
  test: async (api, ctx) => (ctx.mode === 'MOCK' || !api.check ? { ok: true, message: 'mock TikTok ads: a practice account, nothing is read from TikTok' } : api.check()),
});

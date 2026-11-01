// S13 · PR 261 — Google ads (Search, Shopping, Performance Max and YouTube) behind the adapter: the Google Ads API,
// read only.
//
// - The same platform-neutral reader as Meta and TikTok (`AdsReader`, ads/meta-ads.ts): the customer account (name,
//   currency, state), its campaigns (status, channel, daily or total budget, start and end) and their ad groups
//   (Google's ad sets) — so Marketing › Ad platforms shows Google beside them with no page of its own.
// - Sign-in: the owner's own OAuth client (client id + secret) and a refresh token with the `adwords` scope, plus the
//   developer token from the Google Ads API Center; a manager account (MCC) id goes in "login customer id". Each read
//   asks Google for a short access token from the refresh token; nothing is kept but the vault's keys.
// - Reads use GAQL over `googleAds:search` (paged with nextPageToken). Google states money in micros (1 000 000 = one
//   unit of the account currency); the reader turns them into the currency's minor unit by its own digits.
// - Read only. Nothing here pauses a campaign or changes a budget: that is PR 268, behind a confirm and the owner's
//   approval for any increase (A1 rule 6). Removed campaigns stay listed with Google's REMOVED status.
// - Until the owner types the keys into Keys & connections and its test (reading the account) passes, the mock answers
//   with a practice account: the shop shows it as a practice copy and saves nothing (A1.3).
// - No key ever appears in an address or an error: tokens travel in headers or a form body, and Google's words are
//   cleaned of every key.
import { z } from 'zod';
import { defineAdapter, requireSecret } from '../define';
import { minorDigitsOf } from './tiktok-ads';
import { practiceAdsReader, type AdsAccountFacts, type AdsCampaignFacts, type AdsRead, type AdsReader, type AdsSetFacts } from './meta-ads';

export const GOOGLE_ADS_PROVIDER = 'googleAds';
/** Google Ads API's address and OAuth's; other ones can be set on the connection (a test server). */
export const GOOGLE_ADS_DEFAULT_BASE_URL = 'https://googleads.googleapis.com';
export const GOOGLE_ADS_DEFAULT_OAUTH_URL = 'https://oauth2.googleapis.com/token';
/** The API version the shop was built with; Google retires a version about a year after it ships, so it is a field. */
export const GOOGLE_ADS_DEFAULT_API_VERSION = 'v23';
/** Pages followed per list; the rest waits for the next read. */
export const GOOGLE_ADS_MAX_PAGES = 20; // hardcode-ok: a paging guard, not a business number
const MICROS = 1_000_000; // hardcode-ok: Google's fixed money scale (micros per unit)
/** Google's own "no end date" day: a campaign ending then has no end. */
const GOOGLE_NO_END_DAY = '2037-12-30'; // hardcode-ok: the API's sentinel value, not a business date

const customerIdField = z
  .string()
  .trim()
  .transform((v) => v.replace(/-/g, ''))
  .pipe(z.string().regex(/^\d{10}$/, { message: 'the customer id is ten digits, like 123-456-7890' }));

export const googleAdsConfig = z.object({
  /** The ad account's customer id (Google Ads → top right), with or without dashes. */
  customerId: customerIdField,
  /** A manager account (MCC) id, when the access comes through one. */
  loginCustomerId: customerIdField.optional(),
  /** The OAuth client id of the owner's own Google Cloud project. */
  clientId: z.string().trim().min(10).max(200),
  apiVersion: z.string().trim().regex(/^v\d{1,3}$/, { message: 'like v23' }).optional(),
  baseUrl: z.url({ protocol: /^https$/, message: 'not an https address' }).max(500).optional(),
  oauthUrl: z.url({ protocol: /^https$/, message: 'not an https address' }).max(500).optional(),
});
export type GoogleAdsConfig = z.output<typeof googleAdsConfig>;

const str = (v: unknown, max = 300): string => (typeof v === 'string' ? v.slice(0, max) : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Google micros (an int64 string or a number) in the currency's minor unit; none or zero is null. */
export function googleMinor(micros: unknown, currency: string): number | null {
  const n = typeof micros === 'string' && /^\d{1,18}$/.test(micros) ? Number(micros) : typeof micros === 'number' && Number.isFinite(micros) ? micros : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round((n / MICROS) * 10 ** minorDigitsOf(currency));
}

/** Google's dates: "2026-10-01" (or "2026-10-01 00:00:00"), in the account's own time zone, kept as that day. */
function day(v: unknown): Date | null {
  const m = typeof v === 'string' ? /^(\d{4}-\d{2}-\d{2})/.exec(v) : null;
  if (!m) return null;
  const d = new Date(`${m[1]}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || m[1]! >= GOOGLE_NO_END_DAY ? null : d;
}

/** One `campaign` result row (with its campaign_budget) in our shape. */
export function googleCampaign(row: Record<string, unknown>, currency: string): AdsCampaignFacts {
  const c = obj(row.campaign);
  const b = obj(row.campaignBudget);
  const total = googleMinor(b.totalAmountMicros, currency);
  return {
    externalId: str(c.id, 40),
    name: str(c.name) || str(c.id, 40),
    status: str(c.status, 40) || 'UNKNOWN',
    objective: str(c.advertisingChannelType, 60) || null,
    dailyBudgetMinor: total ? null : googleMinor(b.amountMicros, currency),
    lifetimeBudgetMinor: total,
    startAt: day(c.startDate ?? c.startDateTime),
    stopAt: day(c.endDate ?? c.endDateTime),
  };
}

/** One `ad_group` result row in our shape (budgets live on the campaign in Google, so none here). */
export function googleAdGroup(row: Record<string, unknown>): AdsSetFacts {
  const g = obj(row.adGroup);
  const c = obj(row.campaign);
  const type = str(g.type, 60);
  return {
    externalId: str(g.id, 40),
    campaignExternalId: str(c.id, 40) || (/campaigns\/(\d+)$/.exec(str(g.campaign, 200))?.[1] ?? ''),
    name: str(g.name) || str(g.id, 40),
    status: str(g.status, 40) || 'UNKNOWN',
    dailyBudgetMinor: null,
    targeting: type ? { type } : null,
  };
}

const ACCOUNT_QUERY = 'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.status FROM customer LIMIT 1';
const CAMPAIGN_QUERY =
  'SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.start_date, campaign.end_date, campaign_budget.amount_micros, campaign_budget.total_amount_micros FROM campaign ORDER BY campaign.id';
const AD_GROUP_QUERY = 'SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.type, ad_group.campaign, campaign.id FROM ad_group ORDER BY ad_group.id';

export function createGoogleAdsClient(o: {
  baseUrl: string;
  oauthUrl: string;
  apiVersion: string;
  customerId: string;
  loginCustomerId?: string | null;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  developerToken: string;
  fetch?: typeof fetch;
  now?: () => number;
}): AdsReader & { check(): Promise<{ ok: boolean; message: string }> } {
  const doFetch = o.fetch ?? fetch;
  const now = o.now ?? Date.now;
  const searchUrl = `${o.baseUrl.replace(/\/+$/, '')}/${o.apiVersion}/customers/${o.customerId}/googleAds:search`;
  const keys = [o.clientSecret, o.refreshToken, o.developerToken];
  let access: { token: string; until: number } | null = null;
  let currency: string | null = null;
  const clean = (v: unknown) => {
    let s = typeof v === 'string' ? v : '';
    for (const k of [...keys, access?.token ?? '']) if (k) s = s.replaceAll(k, '…');
    return s.slice(0, 200);
  };

  async function json(res: Response): Promise<Record<string, unknown>> {
    try {
      return obj(await res.json());
    } catch {
      return {};
    }
  }

  /** A short access token from the refresh token, reused until a minute before it ends. */
  async function token(): Promise<AdsRead<string>> {
    if (access && access.until > now()) return { ok: true, value: access.token };
    try {
      const res = await doFetch(o.oauthUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: o.clientId, client_secret: o.clientSecret, refresh_token: o.refreshToken, grant_type: 'refresh_token' }),
      });
      const b = await json(res);
      const t = str(b.access_token, 4000);
      if (!res.ok || !t) return { ok: false, error: `Google sign-in refused: ${clean(b.error_description) || clean(b.error) || res.status}` };
      const seconds = Number(b.expires_in);
      access = { token: t, until: now() + (Number.isFinite(seconds) && seconds > 120 ? (seconds - 60) * 1000 : 0) };
      return { ok: true, value: t };
    } catch {
      return { ok: false, error: 'Google did not answer' };
    }
  }

  /** One GAQL query, every page (up to the page guard). */
  async function search(query: string): Promise<AdsRead<Record<string, unknown>[]>> {
    const t = await token();
    if (!t.ok) return t;
    const headers: Record<string, string> = { Authorization: `Bearer ${t.value}`, 'developer-token': o.developerToken, 'Content-Type': 'application/json' };
    if (o.loginCustomerId) headers['login-customer-id'] = o.loginCustomerId;
    const out: Record<string, unknown>[] = [];
    let pageToken = '';
    for (let page = 0; page < GOOGLE_ADS_MAX_PAGES; page += 1) {
      let res: Response;
      try {
        res = await doFetch(searchUrl, { method: 'POST', headers, body: JSON.stringify(pageToken ? { query, pageToken } : { query }) });
      } catch {
        return { ok: false, error: 'Google did not answer' };
      }
      const b = await json(res);
      if (!res.ok) {
        if (res.status === 401) access = null;
        return { ok: false, error: clean(obj(b.error).message) || `Google answered ${res.status}` };
      }
      out.push(...(Array.isArray(b.results) ? (b.results as unknown[]).map(obj) : []));
      pageToken = str(b.nextPageToken, 2000);
      if (!pageToken) break;
    }
    return { ok: true, value: out };
  }

  async function account(): Promise<AdsRead<AdsAccountFacts>> {
    const r = await search(ACCOUNT_QUERY);
    if (!r.ok) return r;
    const c = obj(r.value[0]?.customer);
    if (!str(c.id, 40)) return { ok: false, error: `Google did not list customer ${o.customerId} for these keys` };
    currency = str(c.currencyCode, 3).toUpperCase() || null;
    return { ok: true, value: { externalId: o.customerId, name: str(c.descriptiveName) || o.customerId, currency: currency ?? '', status: str(c.status, 40) } };
  }

  async function withCurrency<T>(query: string, map: (row: Record<string, unknown>, currency: string) => T): Promise<AdsRead<T[]>> {
    if (!currency) {
      const a = await account();
      if (!a.ok) return a;
    }
    const r = await search(query);
    if (!r.ok) return r;
    return { ok: true, value: r.value.map((x) => map(x, currency ?? '')).filter((x) => (x as { externalId: string }).externalId) };
  }

  const reader = {
    provider: GOOGLE_ADS_PROVIDER,
    platform: 'google' as const,
    practice: false,
    account,
    campaigns: () => withCurrency(CAMPAIGN_QUERY, googleCampaign),
    adSets: () => withCurrency(AD_GROUP_QUERY, (row) => googleAdGroup(row)),
    async check() {
      const r = await account();
      return r.ok ? { ok: true, message: `connected; customer ${r.value.name} (${r.value.currency})` } : { ok: false, message: r.error };
    },
  };
  return reader;
}

type CheckedReader = AdsReader & { check?: () => Promise<{ ok: boolean; message: string }> };

export const googleAdsAdapter = defineAdapter<CheckedReader, GoogleAdsConfig>({
  kind: 'GOOGLE',
  provider: GOOGLE_ADS_PROVIDER,
  modes: ['LIVE'],
  secrets: ['developerToken', 'clientSecret', 'refreshToken'],
  configSchema: googleAdsConfig,
  async create(ctx) {
    const [developerToken, clientSecret, refreshToken] = await Promise.all([requireSecret(ctx, 'developerToken'), requireSecret(ctx, 'clientSecret'), requireSecret(ctx, 'refreshToken')]);
    return createGoogleAdsClient({
      baseUrl: ctx.config.baseUrl ?? GOOGLE_ADS_DEFAULT_BASE_URL,
      oauthUrl: ctx.config.oauthUrl ?? GOOGLE_ADS_DEFAULT_OAUTH_URL,
      apiVersion: ctx.config.apiVersion ?? GOOGLE_ADS_DEFAULT_API_VERSION,
      customerId: ctx.config.customerId,
      loginCustomerId: ctx.config.loginCustomerId ?? null,
      clientId: ctx.config.clientId,
      clientSecret,
      refreshToken,
      developerToken,
    });
  },
  async mock() {
    return practiceAdsReader(GOOGLE_ADS_PROVIDER, 'google');
  },
  test: async (api, ctx) => (ctx.mode === 'MOCK' || !api.check ? { ok: true, message: 'mock Google ads: a practice account, nothing is read from Google' } : api.check()),
});

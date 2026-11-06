// S11 · PR 233 — Google Search Console and Bing Webmaster Tools: which properties (sites) the owner's account may
// manage, and handing them the shop's sitemap address. The owner verifies the shop with each (the verification code is a
// setting the shop's pages carry, `seo.verification`), then types the key into Keys & connections. Until a key is in and
// its Test passes, the mock answers: no property, and a sitemap "sent" is only kept in this process (A1.3).
//
// - Google: a service account's JSON key (Google Cloud → IAM → Service accounts → Keys), with the service account's
//   e-mail added as a user of the Search Console property. The adapter signs its own short-lived token request (RS256,
//   node:crypto) and calls the Search Console API (`webmasters/v3`).
// - PR 238: how the shop does in each engine's results (the organic report, Website › SEO › Organic report): clicks,
//   how often the shop was shown, its average position and the top searches over a span of days. Google answers with
//   the Search Analytics query (`searchAnalytics/query`); Bing with its query stats (`GetQueryStats`, kept per week by
//   Bing, so a span takes the weeks that start in it). The mock has nothing to tell.
// - Bing: the API key from Bing Webmaster Tools → Settings → API access. It is part of the address (`?apikey=`), so no
//   error, message or log line ever carries the address: every failure is said in words.
import { createSign } from 'node:crypto';
import { z } from 'zod';
import { defineAdapter, requireSecret, AdapterError } from '../define';

export const GOOGLE_SEARCH_CONSOLE_PROVIDER = 'googleSearchConsole';
export const BING_WEBMASTER_PROVIDER = 'bingWebmaster';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/webmasters';
const GOOGLE_API = 'https://www.googleapis.com/webmasters/v3';
const BING_API = 'https://ssl.bing.com/webmaster/api.svc/json';
/** How long a signed token request is valid (Google's own maximum, seconds). */
const TOKEN_SECONDS = 3600;

export type SubmitResult = { ok: true } | { ok: false; error: string };

/** One search over the span: clicks, times shown, average position (1 = first). */
export interface SearchQueryRow {
  query: string;
  clicks: number;
  impressions: number;
  position: number | null;
}

/** How the shop did in an engine's results over a span of days. */
export interface SearchPerformance {
  clicks: number;
  impressions: number;
  /** Average position over the times shown (1 = first); null when never shown. */
  position: number | null;
  /** The top searches by clicks (then times shown). */
  queries: SearchQueryRow[];
}

/** A span of days, both included (YYYY-MM-DD). */
export interface SearchSpan {
  start: string;
  end: string;
}

export interface SearchEngineApi {
  provider: string;
  /** The properties the account may manage, as the engine writes them (`https://shop.example/`, `sc-domain:shop.example`). */
  sites(): Promise<string[]>;
  /** Hands the sitemap's address to the engine for one property. */
  submitSitemap(site: string, sitemap: string): Promise<SubmitResult>;
  /** PR 238: how the property did in the results over the span, with at most `top` searches. */
  performance(site: string, span: SearchSpan, top: number): Promise<SearchPerformance>;
}

/** The searches of a span, added up per search and cut to the top ones (clicks, then times shown, then the words). */
export function topQueries(rows: readonly SearchQueryRow[], top: number): SearchPerformance {
  const by = new Map<string, { clicks: number; impressions: number; weighted: number; placed: number }>();
  for (const r of rows) {
    const q = r.query.trim();
    if (!q) continue;
    const x = by.get(q) ?? by.set(q, { clicks: 0, impressions: 0, weighted: 0, placed: 0 }).get(q)!;
    x.clicks += r.clicks;
    x.impressions += r.impressions;
    if (r.position !== null) {
      x.weighted += r.position * r.impressions;
      x.placed += r.impressions;
    }
  }
  const all = [...by].map(([query, x]) => ({ query, clicks: x.clicks, impressions: x.impressions, position: positionOf(x.weighted, x.placed) }));
  const clicks = all.reduce((n, r) => n + r.clicks, 0);
  const impressions = all.reduce((n, r) => n + r.impressions, 0);
  const weighted = [...by.values()].reduce((n, x) => n + x.weighted, 0);
  const placed = [...by.values()].reduce((n, x) => n + x.placed, 0);
  all.sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions || a.query.localeCompare(b.query));
  return { clicks, impressions, position: positionOf(weighted, placed), queries: all.slice(0, Math.max(0, top)) };
}

/** An average position over the times shown with a position, one decimal; null when none. */
const positionOf = (weighted: number, placed: number) => (placed > 0 && weighted > 0 ? Math.round((weighted / placed) * 10) / 10 : null);

const NOTHING: SearchPerformance = { clicks: 0, impressions: 0, position: null, queries: [] };

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

// ---------------------------------------------------------------------------------------------------------- the mock

export interface MockSubmission {
  at: Date;
  provider: string;
  site: string;
  sitemap: string;
}
const G = globalThis as unknown as { __extasMockSitemaps?: MockSubmission[] };
const sent = (): MockSubmission[] => (G.__extasMockSitemaps ??= []);
/** The mock keeps this many submissions (the newest). */
const MOCK_KEEP = 100;

/** What the mock was asked to send in this process (tests, the admin's practice note). */
export const mockSearchEngineLog = {
  all: (): readonly MockSubmission[] => [...sent()],
  clear: (): void => {
    sent().length = 0;
  },
};

export function mockSearchEngine(provider: string): SearchEngineApi {
  return {
    provider,
    async sites() {
      return [];
    },
    async submitSitemap(site, sitemap) {
      const list = sent();
      list.push({ at: new Date(), provider, site, sitemap });
      if (list.length > MOCK_KEEP) list.splice(0, list.length - MOCK_KEEP);
      return { ok: true };
    },
    async performance() {
      return { ...NOTHING, queries: [] };
    },
  };
}

// -------------------------------------------------------------------------------------------------------- Google

/** The two fields of a service account's JSON key the token request needs. */
export const serviceAccountSchema = z.object({ client_email: z.string().email(), private_key: z.string().includes('PRIVATE KEY') }).passthrough();

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url');

/** The signed token request (a JWT, RS256) for the Search Console scope. */
export function googleAssertion(account: { client_email: string; private_key: string }, nowSeconds: number): string {
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: account.client_email, scope: GOOGLE_SCOPE, aud: GOOGLE_TOKEN_URL, iat: nowSeconds, exp: nowSeconds + TOKEN_SECONDS }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${head}.${claims}`);
  return `${head}.${claims}.${b64url(signer.sign(account.private_key))}`;
}

const said = async (res: Response) => {
  try {
    const j = (await res.json()) as { error?: { message?: string } | string; error_description?: string };
    const e = typeof j.error === 'string' ? (j.error_description ?? j.error) : j.error?.message;
    return e ? `${res.status}: ${String(e).slice(0, 200)}` : `${res.status}`;
  } catch {
    return `${res.status}`;
  }
};

export function googleSearchConsole(keyJson: string, fetchImpl: Fetch = fetch, now: () => number = () => Date.now()): SearchEngineApi {
  let parsed: z.infer<typeof serviceAccountSchema>;
  try {
    parsed = serviceAccountSchema.parse(JSON.parse(keyJson));
  } catch {
    throw new AdapterError('the service account key is not a Google JSON key (client_email and private_key are needed)');
  }
  let token: { value: string; until: number } | null = null;
  const bearer = async (): Promise<string> => {
    if (token && token.until > now()) return token.value;
    const assertion = googleAssertion(parsed, Math.floor(now() / 1000));
    const res = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    });
    if (!res.ok) throw new AdapterError(`Google refused the key (${await said(res)})`);
    const j = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!j.access_token) throw new AdapterError('Google gave no access token');
    // a minute early, so a token never runs out mid-call
    token = { value: j.access_token, until: now() + Math.max(0, (j.expires_in ?? TOKEN_SECONDS) - 60) * 1000 };
    return token.value;
  };
  return {
    provider: GOOGLE_SEARCH_CONSOLE_PROVIDER,
    async sites() {
      const res = await fetchImpl(`${GOOGLE_API}/sites`, { headers: { authorization: `Bearer ${await bearer()}` } });
      if (!res.ok) throw new AdapterError(`Search Console did not list the properties (${await said(res)})`);
      const j = (await res.json()) as { siteEntry?: { siteUrl?: string }[] };
      return (j.siteEntry ?? []).flatMap((s) => (s.siteUrl ? [s.siteUrl] : []));
    },
    async submitSitemap(site, sitemap) {
      try {
        const res = await fetchImpl(`${GOOGLE_API}/sites/${encodeURIComponent(site)}/sitemaps/${encodeURIComponent(sitemap)}`, { method: 'PUT', headers: { authorization: `Bearer ${await bearer()}` } });
        return res.ok ? { ok: true } : { ok: false, error: await said(res) };
      } catch (e) {
        return { ok: false, error: e instanceof AdapterError ? e.message : 'Search Console could not be reached' };
      }
    },
    async performance(site, span, top) {
      const query = async (extra: Record<string, unknown>) => {
        const res = await fetchImpl(`${GOOGLE_API}/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
          method: 'POST',
          headers: { authorization: `Bearer ${await bearer()}`, 'content-type': 'application/json' },
          body: JSON.stringify({ startDate: span.start, endDate: span.end, ...extra }),
        });
        if (!res.ok) throw new AdapterError(`Search Console did not give the results (${await said(res)})`);
        return ((await res.json()) as { rows?: { keys?: string[]; clicks?: number; impressions?: number; position?: number }[] }).rows ?? [];
      };
      const [total, byQuery] = await Promise.all([query({}), top > 0 ? query({ dimensions: ['query'], rowLimit: top }) : Promise.resolve([])]);
      const t = total[0];
      const impressions = Number(t?.impressions ?? 0);
      return {
        clicks: Number(t?.clicks ?? 0),
        impressions,
        position: impressions > 0 && t?.position ? Math.round(t.position * 10) / 10 : null,
        queries: byQuery.flatMap((r) => (r.keys?.[0] ? [{ query: r.keys[0], clicks: Number(r.clicks ?? 0), impressions: Number(r.impressions ?? 0), position: r.position ? Math.round(r.position * 10) / 10 : null }] : [])),
      };
    },
  };
}

// ---------------------------------------------------------------------------------------------------------- Bing

/** A Bing Webmaster API key: letters and digits only (it goes into the address). */
export const BING_KEY = /^[A-Za-z0-9]{16,64}$/;

export function bingWebmaster(apiKey: string, fetchImpl: Fetch = fetch): SearchEngineApi {
  if (!BING_KEY.test(apiKey)) throw new AdapterError('the Bing API key is letters and digits only');
  const url = (method: string, q: Record<string, string>) => `${BING_API}/${method}?${new URLSearchParams({ ...q, apikey: apiKey }).toString()}`;
  // never the address in a message: it carries the key
  const call = async (method: string, init?: RequestInit, q: Record<string, string> = {}) => {
    try {
      return await fetchImpl(url(method, q), init);
    } catch {
      throw new AdapterError('Bing Webmaster could not be reached');
    }
  };
  return {
    provider: BING_WEBMASTER_PROVIDER,
    async sites() {
      const res = await call('GetUserSites');
      if (!res.ok) throw new AdapterError(`Bing did not list the sites (${res.status})`);
      const j = (await res.json()) as { d?: { Url?: string; IsVerified?: boolean }[] };
      return (j.d ?? []).flatMap((s) => (s.Url && s.IsVerified !== false ? [s.Url] : []));
    },
    async submitSitemap(site, sitemap) {
      try {
        const res = await call('SubmitFeed', { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ siteUrl: site, feedUrl: sitemap }) });
        return res.ok ? { ok: true } : { ok: false, error: `${res.status}` };
      } catch (e) {
        return { ok: false, error: e instanceof AdapterError ? e.message : 'Bing Webmaster could not be reached' };
      }
    },
    async performance(site, span, top) {
      const res = await call('GetQueryStats', undefined, { siteUrl: site });
      if (!res.ok) throw new AdapterError(`Bing did not give the results (${res.status})`);
      const j = (await res.json()) as { d?: { Query?: string; Clicks?: number; Impressions?: number; AvgImpressionPosition?: number; Date?: string }[] };
      const rows = (j.d ?? []).flatMap((r) => {
        const day = bingDay(r.Date);
        if (!day || day < span.start || day > span.end || !r.Query) return [];
        const position = typeof r.AvgImpressionPosition === 'number' && r.AvgImpressionPosition > 0 ? r.AvgImpressionPosition : null;
        return [{ query: r.Query, clicks: Number(r.Clicks ?? 0), impressions: Number(r.Impressions ?? 0), position }];
      });
      return topQueries(rows, top);
    },
  };
}

/** Bing's date (`/Date(1730419200000)/`, sometimes with a zone) as YYYY-MM-DD, or null. */
export function bingDay(v: string | undefined): string | null {
  const m = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/.exec(v ?? '');
  return m ? new Date(Number(m[1])).toISOString().slice(0, 10) : null;
}

// ------------------------------------------------------------------------------------------------------ adapters

export const searchConsoleConfig = z.object({});
export type SearchConsoleConfig = z.output<typeof searchConsoleConfig>;

const testSites = async (api: SearchEngineApi) => {
  const list = await api.sites();
  return { ok: true, message: `${list.length} propert${list.length === 1 ? 'y' : 'ies'} found` };
};

export const googleSearchConsoleAdapter = defineAdapter<SearchEngineApi, SearchConsoleConfig>({
  kind: 'SEARCH_CONSOLE',
  provider: GOOGLE_SEARCH_CONSOLE_PROVIDER,
  modes: ['LIVE'],
  secrets: ['serviceAccountJson'],
  configSchema: searchConsoleConfig,
  async create(ctx) {
    return googleSearchConsole(await requireSecret(ctx, 'serviceAccountJson'));
  },
  async mock() {
    return mockSearchEngine(GOOGLE_SEARCH_CONSOLE_PROVIDER);
  },
  test: testSites,
});

export const bingWebmasterAdapter = defineAdapter<SearchEngineApi, SearchConsoleConfig>({
  kind: 'SEARCH_CONSOLE',
  provider: BING_WEBMASTER_PROVIDER,
  modes: ['LIVE'],
  secrets: ['apiKey'],
  configSchema: searchConsoleConfig,
  async create(ctx) {
    return bingWebmaster(await requireSecret(ctx, 'apiKey'));
  },
  async mock() {
    return mockSearchEngine(BING_WEBMASTER_PROVIDER);
  },
  test: testSites,
});

/** Both engines (Keys & connections lists them; `use('SEARCH_CONSOLE', { provider })` picks one). */
export const searchConsoleAdapters = [googleSearchConsoleAdapter, bingWebmasterAdapter] as const;

// S11 · PR 233 — Google Search Console and Bing Webmaster Tools: which properties (sites) the owner's account may
// manage, and handing them the shop's sitemap address. The owner verifies the shop with each (the verification code is a
// setting the shop's pages carry, `seo.verification`), then types the key into Keys & connections. Until a key is in and
// its Test passes, the mock answers: no property, and a sitemap "sent" is only kept in this process (A1.3).
//
// - Google: a service account's JSON key (Google Cloud → IAM → Service accounts → Keys), with the service account's
//   e-mail added as a user of the Search Console property. The adapter signs its own short-lived token request (RS256,
//   node:crypto) and calls the Search Console API (`webmasters/v3`).
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

export interface SearchEngineApi {
  provider: string;
  /** The properties the account may manage, as the engine writes them (`https://shop.example/`, `sc-domain:shop.example`). */
  sites(): Promise<string[]>;
  /** Hands the sitemap's address to the engine for one property. */
  submitSitemap(site: string, sitemap: string): Promise<SubmitResult>;
}

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
  };
}

// ---------------------------------------------------------------------------------------------------------- Bing

/** A Bing Webmaster API key: letters and digits only (it goes into the address). */
export const BING_KEY = /^[A-Za-z0-9]{16,64}$/;

export function bingWebmaster(apiKey: string, fetchImpl: Fetch = fetch): SearchEngineApi {
  if (!BING_KEY.test(apiKey)) throw new AdapterError('the Bing API key is letters and digits only');
  const url = (method: string) => `${BING_API}/${method}?apikey=${apiKey}`;
  // never the address in a message: it carries the key
  const call = async (method: string, init?: RequestInit) => {
    try {
      return await fetchImpl(url(method), init);
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
  };
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

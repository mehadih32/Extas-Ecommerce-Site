// S11 · PR 233 — Search Console and Bing Webmaster: the mock until a key is in (no property, a sitemap only kept here);
// Google's signed token request (RS256, checked with the public key) and its calls against a stand-in API; Bing's key
// (part of the address) never in an answer; both listed as connections with exactly the adapters' keys.
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  allAdapters,
  bingDay,
  bingWebmaster,
  bingWebmasterAdapter,
  connectionCatalogue,
  googleAssertion,
  googleSearchConsole,
  googleSearchConsoleAdapter,
  mockSearchEngine,
  mockSearchEngineLog,
  topQueries,
  type Fetch,
} from '../src';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const KEY_JSON = JSON.stringify({ type: 'service_account', client_email: 'shop-seo@sample-project.iam.gserviceaccount.com', private_key: PEM });
const BING_KEY = 'abcdef0123456789abcdef0123456789';

function fakeGoogle(opts: { refuseToken?: boolean } = {}) {
  const calls: { url: string; method: string; auth: string | null; body: string }[] = [];
  const f: Fetch = async (url, init) => {
    calls.push({ url, method: init?.method ?? 'GET', auth: new Headers(init?.headers).get('authorization'), body: String(init?.body ?? '') });
    if (url.endsWith('/token')) {
      if (opts.refuseToken) return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid JWT Signature.' }), { status: 400 });
      return new Response(JSON.stringify({ access_token: 'ya29.sample', expires_in: 3599 }), { status: 200 });
    }
    if (url.endsWith('/sites')) return new Response(JSON.stringify({ siteEntry: [{ siteUrl: 'https://shop.example.test/' }, { siteUrl: 'sc-domain:shop.example.test' }] }), { status: 200 });
    if (url.includes('/sitemaps/')) return new Response(null, { status: 204 });
    if (url.endsWith('/searchAnalytics/query')) {
      const b = JSON.parse(String(init?.body)) as { dimensions?: string[] };
      return new Response(JSON.stringify(b.dimensions ? { rows: [{ keys: ['polo shirt bd'], clicks: 12, impressions: 300, position: 4.26 }] } : { rows: [{ clicks: 40, impressions: 2000, position: 9.04 }] }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };
  return { f, calls };
}

describe('Search Console and Bing (PR 233)', () => {
  it('the mock lists no property and only keeps the sitemap it was handed', async () => {
    mockSearchEngineLog.clear();
    const m = mockSearchEngine('googleSearchConsole');
    expect(await m.sites()).toEqual([]);
    expect(await m.submitSitemap('https://shop.example.test/', 'https://shop.example.test/sitemap.xml')).toEqual({ ok: true });
    expect(mockSearchEngineLog.all().map((x) => [x.provider, x.sitemap])).toEqual([['googleSearchConsole', 'https://shop.example.test/sitemap.xml']]);
  });

  it("Google: the token request is signed with the service account's key, for the Search Console scope only", () => {
    const jwt = googleAssertion({ client_email: 'a@b.iam.gserviceaccount.com', private_key: PEM }, 1_800_000_000);
    const [head, claims, sig] = jwt.split('.');
    const v = createVerify('RSA-SHA256');
    v.update(`${head}.${claims}`);
    expect(v.verify(publicKey, Buffer.from(sig!, 'base64url'))).toBe(true);
    expect(JSON.parse(Buffer.from(claims!, 'base64url').toString())).toEqual({
      iss: 'a@b.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/webmasters',
      aud: 'https://oauth2.googleapis.com/token',
      iat: 1_800_000_000,
      exp: 1_800_003_600,
    });
  });

  it('Google: lists the properties and hands over the sitemap, one token for both calls', async () => {
    const g = fakeGoogle();
    const api = googleSearchConsole(KEY_JSON, g.f, () => 1_800_000_000_000);
    expect(await api.sites()).toEqual(['https://shop.example.test/', 'sc-domain:shop.example.test']);
    expect(await api.submitSitemap('https://shop.example.test/', 'https://shop.example.test/sitemap.xml')).toEqual({ ok: true });
    expect(g.calls.filter((c) => c.url.endsWith('/token'))).toHaveLength(1);
    const put = g.calls.find((c) => c.method === 'PUT')!;
    expect(put.url).toBe('https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fshop.example.test%2F/sitemaps/https%3A%2F%2Fshop.example.test%2Fsitemap.xml');
    expect(put.auth).toBe('Bearer ya29.sample');
  });

  it("Google: a refused key is said in words; a key that is not Google's JSON is refused before any call", async () => {
    const api = googleSearchConsole(KEY_JSON, fakeGoogle({ refuseToken: true }).f);
    await expect(api.sites()).rejects.toThrow('Google refused the key (400: Invalid JWT Signature.)');
    expect(await api.submitSitemap('https://shop.example.test/', 'https://shop.example.test/sitemap.xml')).toEqual({ ok: false, error: 'Google refused the key (400: Invalid JWT Signature.)' });
    expect(() => googleSearchConsole('{"client_email":"x"}')).toThrow(/not a Google JSON key/);
    expect(() => googleSearchConsole('not json')).toThrow(/not a Google JSON key/);
  });

  it("Bing: verified sites only; the sitemap handed over; the key never in an answer", async () => {
    const urls: string[] = [];
    const f: Fetch = async (url, init) => {
      urls.push(url);
      if (url.includes('/GetUserSites')) return new Response(JSON.stringify({ d: [{ Url: 'https://shop.example.test/', IsVerified: true }, { Url: 'https://other.example.test/', IsVerified: false }] }), { status: 200 });
      if (url.includes('/SubmitFeed')) return init?.body && String(init.body).includes('sitemap.xml') ? new Response('{"d":null}', { status: 200 }) : new Response('', { status: 400 });
      return new Response('', { status: 404 });
    };
    const api = bingWebmaster(BING_KEY, f);
    expect(await api.sites()).toEqual(['https://shop.example.test/']);
    expect(await api.submitSitemap('https://shop.example.test/', 'https://shop.example.test/sitemap.xml')).toEqual({ ok: true });
    expect(urls[0]).toBe(`https://ssl.bing.com/webmaster/api.svc/json/GetUserSites?apikey=${BING_KEY}`);
    const down = bingWebmaster(BING_KEY, async () => {
      throw new Error(`connect ECONNREFUSED ${urls[0]}`);
    });
    const r = await down.submitSitemap('https://shop.example.test/', 'https://shop.example.test/sitemap.xml');
    expect(r).toEqual({ ok: false, error: 'Bing Webmaster could not be reached' });
    await expect(down.sites()).rejects.toThrow('Bing Webmaster could not be reached');
    expect(() => bingWebmaster('a key with spaces & symbols')).toThrow(/letters and digits/);
  });

  it('both are Keys & connections rows with exactly their adapters\' keys, the adapters in allAdapters', () => {
    for (const a of [googleSearchConsoleAdapter, bingWebmasterAdapter]) {
      expect(allAdapters).toContain(a);
      const row = connectionCatalogue.find((d) => d.provider === a.provider)!;
      expect(row).toMatchObject({ kind: 'SEARCH_CONSOLE', adapter: true, exclusive: false, targetMode: 'LIVE' });
      expect(row.secrets.map((s) => s.field)).toEqual([...a.secrets]);
    }
  });

  it('PR 238: the mock has no results; Google totals and top searches for the span; Bing adds up its weeks in the span', async () => {
    expect(await mockSearchEngine('googleSearchConsole').performance('https://shop.example.test/', { start: '2026-10-01', end: '2026-10-28' }, 10)).toEqual({ clicks: 0, impressions: 0, position: null, queries: [] });
    const g = fakeGoogle();
    const p = await googleSearchConsole(KEY_JSON, g.f).performance('https://shop.example.test/', { start: '2026-10-01', end: '2026-10-28' }, 5);
    expect(p).toEqual({ clicks: 40, impressions: 2000, position: 9, queries: [{ query: 'polo shirt bd', clicks: 12, impressions: 300, position: 4.3 }] });
    const q = g.calls.filter((c) => c.url.endsWith('/searchAnalytics/query'));
    expect(q.map((c) => JSON.parse(c.body))).toEqual([{ startDate: '2026-10-01', endDate: '2026-10-28' }, { startDate: '2026-10-01', endDate: '2026-10-28', dimensions: ['query'], rowLimit: 5 }]);
    expect(q[0]!.url).toContain(encodeURIComponent('https://shop.example.test/'));

    const urls: string[] = [];
    const week = (ymd: string) => `/Date(${Date.parse(`${ymd}T00:00:00Z`)})/`;
    const f: Fetch = async (url) => {
      urls.push(url);
      return new Response(
        JSON.stringify({
          d: [
            { Query: 'polo', Clicks: 3, Impressions: 100, AvgImpressionPosition: 5, Date: week('2026-10-05') },
            { Query: 'polo', Clicks: 1, Impressions: 100, AvgImpressionPosition: 7, Date: week('2026-10-12') },
            { Query: 'panjabi', Clicks: 0, Impressions: 50, AvgImpressionPosition: -1, Date: week('2026-10-12') },
            { Query: 'old', Clicks: 9, Impressions: 9, AvgImpressionPosition: 1, Date: week('2026-09-01') },
          ],
        }),
        { status: 200 },
      );
    };
    const b = await bingWebmaster(BING_KEY, f).performance('https://shop.example.test/', { start: '2026-10-01', end: '2026-10-28' }, 10);
    expect(b).toEqual({ clicks: 4, impressions: 250, position: 6, queries: [{ query: 'polo', clicks: 4, impressions: 200, position: 6 }, { query: 'panjabi', clicks: 0, impressions: 50, position: null }] });
    expect(urls[0]).toBe(`https://ssl.bing.com/webmaster/api.svc/json/GetQueryStats?siteUrl=${encodeURIComponent('https://shop.example.test/')}&apikey=${BING_KEY}`);
    await expect(bingWebmaster(BING_KEY, async () => new Response('', { status: 401 })).performance('https://shop.example.test/', { start: '2026-10-01', end: '2026-10-28' }, 10)).rejects.toThrow('Bing did not give the results (401)');
    expect(bingDay('/Date(1730419200000-0700)/')).toBe('2024-11-01');
    expect(bingDay('2024-11-01')).toBeNull();
    expect(topQueries([], 3)).toEqual({ clicks: 0, impressions: 0, position: null, queries: [] });
  });
});

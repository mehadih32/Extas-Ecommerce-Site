// S13 · PR 261 — the Google Ads API, read only: the customer, campaigns and ad groups in our shape (micros to the
// currency's minor unit, a shared or total budget, Google's "no end" date as none), the access token asked once from
// the refresh token and reused, every GAQL page followed, the developer token and the manager id in headers, no key in
// an address or an answer, the practice copy before the key, the Keys & connections row and the readers list.
import { describe, expect, it } from 'vitest';
import { ADS_READER_CONNECTION, adsReaderAdapters, allAdapters, createGoogleAdsClient, findConnection, googleAdGroup, googleAdsAdapter, googleAdsConfig, googleCampaign, googleMinor, metaAdsAdapter, practiceAdsReader, tiktokAdsAdapter } from '../src';

const BASE = 'https://ads.example.test';
const OAUTH = 'https://oauth.example.test/token';
const KEYS = { clientId: 'sample-client.apps.example.test', clientSecret: 'sample-secret-0123456789', refreshToken: 'sample-refresh-0123456789', developerToken: 'sample-dev-0123456789' };
const ACCESS = 'sample-access-0123456789';

function stand(answer: (url: string, body: string) => { status?: number; body: unknown }) {
  const calls: { url: string; init: RequestInit; body: string }[] = [];
  const f = (async (url: string | URL, init?: RequestInit) => {
    const body = init?.body instanceof URLSearchParams ? init.body.toString() : String(init?.body ?? '');
    calls.push({ url: String(url), init: init ?? {}, body });
    const a = answer(String(url), body);
    return new Response(JSON.stringify(a.body), { status: a.status ?? 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { f, calls };
}

const client = (f: typeof fetch, o: { loginCustomerId?: string } = {}) => createGoogleAdsClient({ baseUrl: BASE, oauthUrl: OAUTH, apiVersion: 'v23', customerId: '1234567890', ...KEYS, ...o, fetch: f });
const signIn = { body: { access_token: ACCESS, expires_in: 3599, token_type: 'Bearer' } };

describe('Google ads reader (PR 261)', () => {
  it('turns Google rows into ours: micros → minor by the currency, a total budget, the dates, the ad group’s campaign', () => {
    expect(googleMinor('5000000', 'BDT')).toBe(500);
    expect(googleMinor(1_500_000, 'JPY')).toBe(2);
    expect(googleMinor('0', 'BDT')).toBeNull();
    expect(googleCampaign({ campaign: { id: '111', name: 'Eid search', status: 'ENABLED', advertisingChannelType: 'SEARCH', startDate: '2026-10-01', endDate: '2037-12-30' }, campaignBudget: { amountMicros: '800000000' } }, 'BDT')).toEqual({
      externalId: '111',
      name: 'Eid search',
      status: 'ENABLED',
      objective: 'SEARCH',
      dailyBudgetMinor: 80000,
      lifetimeBudgetMinor: null,
      startAt: new Date('2026-10-01T00:00:00Z'),
      stopAt: null,
    });
    expect(googleCampaign({ campaign: { id: '112', status: 'REMOVED' }, campaignBudget: { amountMicros: '1000000', totalAmountMicros: '15000000000' } }, 'BDT')).toMatchObject({ name: '112', status: 'REMOVED', dailyBudgetMinor: null, lifetimeBudgetMinor: 1500000 });
    expect(googleAdGroup({ adGroup: { id: '9', name: 'Polo', status: 'ENABLED', type: 'SEARCH_STANDARD', campaign: 'customers/1234567890/campaigns/111' } })).toEqual({ externalId: '9', campaignExternalId: '111', name: 'Polo', status: 'ENABLED', dailyBudgetMinor: null, targeting: { type: 'SEARCH_STANDARD' } });
  });

  it('signs in once, reads the customer and every page of campaigns, keys only in headers and the form', async () => {
    const { f, calls } = stand((url, body) => {
      if (url === OAUTH) return signIn;
      const q = JSON.parse(body) as { query: string; pageToken?: string };
      if (q.query.includes('FROM customer')) return { body: { results: [{ customer: { id: '1234567890', descriptiveName: 'Sample Google ads', currencyCode: 'BDT', status: 'ENABLED' } }] } };
      if (q.query.includes('FROM campaign') && !q.pageToken) return { body: { results: [{ campaign: { id: '1', name: 'A', status: 'ENABLED' }, campaignBudget: { amountMicros: '1000000' } }], nextPageToken: 'p2' } };
      if (q.query.includes('FROM campaign')) return { body: { results: [{ campaign: { id: '2', name: 'B', status: 'PAUSED' } }] } };
      return { body: { results: [{ adGroup: { id: 'g1', name: 'G', status: 'ENABLED' }, campaign: { id: '1' } }] } };
    });
    const c = client(f, { loginCustomerId: '9876543210' });
    expect(await c.account()).toEqual({ ok: true, value: { externalId: '1234567890', name: 'Sample Google ads', currency: 'BDT', status: 'ENABLED' } });
    const r = await c.campaigns();
    expect(r.ok && r.value.map((x) => [x.externalId, x.dailyBudgetMinor])).toEqual([
      ['1', 100],
      ['2', null],
    ]);
    const s = await c.adSets();
    expect(s.ok && s.value[0]).toMatchObject({ externalId: 'g1', campaignExternalId: '1' });
    expect(calls.filter((x) => x.url === OAUTH)).toHaveLength(1);
    expect(calls[0]!.body).toContain('grant_type=refresh_token');
    const api = calls.filter((x) => x.url !== OAUTH);
    expect(api.every((x) => x.url === `${BASE}/v23/customers/1234567890/googleAds:search`)).toBe(true);
    expect(api.every((x) => {
      const h = x.init.headers as Record<string, string>;
      return h.Authorization === `Bearer ${ACCESS}` && h['developer-token'] === KEYS.developerToken && h['login-customer-id'] === '9876543210';
    })).toBe(true);
    for (const k of [...Object.values(KEYS), ACCESS]) expect(calls.some((x) => x.url.includes(k))).toBe(false);
    expect(await c.check()).toEqual({ ok: true, message: 'connected; customer Sample Google ads (BDT)' });
  });

  it('a refused sign-in or query is said in Google’s words without a key; no answer is said plainly', async () => {
    const badGrant = stand(() => ({ status: 400, body: { error: 'invalid_grant', error_description: `Token has been expired or revoked: ${KEYS.refreshToken}` } }));
    expect(await client(badGrant.f).account()).toEqual({ ok: false, error: 'Google sign-in refused: Token has been expired or revoked: …' });
    const badQuery = stand((url) => (url === OAUTH ? signIn : { status: 403, body: { error: { code: 403, message: `The developer token ${KEYS.developerToken} is not approved.`, status: 'PERMISSION_DENIED' } } }));
    expect(await client(badQuery.f).campaigns()).toEqual({ ok: false, error: 'The developer token … is not approved.' });
    const down = (async () => {
      throw new Error('socket');
    }) as typeof fetch;
    expect(await client(down).account()).toEqual({ ok: false, error: 'Google did not answer' });
  });

  it('the practice copy says it is one; the row is in Keys & connections with its three keys; Meta, TikTok and Google are listed in order', async () => {
    expect(practiceAdsReader('googleAds', 'google').practice).toBe(true);
    expect(allAdapters).toContain(googleAdsAdapter);
    expect(adsReaderAdapters).toEqual([metaAdsAdapter, tiktokAdsAdapter, googleAdsAdapter]);
    expect(Object.keys(ADS_READER_CONNECTION)).toEqual(['meta', 'tiktok', 'google']);
    expect(findConnection('googleAds')).toMatchObject({ kind: 'GOOGLE', secrets: [{ field: 'developerToken' }, { field: 'clientSecret' }, { field: 'refreshToken' }], exclusive: false });
    expect(googleAdsConfig.parse({ customerId: '123-456-7890', clientId: KEYS.clientId })).toMatchObject({ customerId: '1234567890' });
    expect(googleAdsConfig.safeParse({ customerId: '12345', clientId: KEYS.clientId }).success).toBe(false);
  });
});

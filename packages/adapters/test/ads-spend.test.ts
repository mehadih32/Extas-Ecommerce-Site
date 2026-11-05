// S13 · PR 265 — what each ad platform spent per campaign and per day, in one shape: Meta's insights, TikTok's BASIC
// report and Google's GAQL metrics, spend in the account currency's minor unit, the token never in an address, a range
// that is not one refused before anything is asked, and the practice copy's example days. Sample values.
import { describe, expect, it } from 'vitest';
import { countOf, createGoogleAdsClient, createMetaAdsClient, createTiktokAdsClient, daysOf, googleSpendRow, metaSpendRow, practiceAdsReader, spendMinorOf, spendQuery, tiktokSpendRow } from '../src';

const TOKEN = 'sample-token-0123456789abcdef';
const BASE = 'https://ads.example.test';

function stand(answer: (url: string, init: RequestInit) => unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(answer(String(url), init ?? {})), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { f, calls };
}

describe('ad spend in one shape (PR 265)', () => {
  it('turns money and counts into ours, zero kept as 0', () => {
    expect(spendMinorOf('1234.56', 'BDT')).toBe(123456);
    expect(spendMinorOf(0, 'BDT')).toBe(0);
    expect(spendMinorOf('12', 'JPY')).toBe(12);
    expect(spendMinorOf('-1', 'BDT')).toBeNull();
    expect(spendMinorOf('abc', 'BDT')).toBeNull();
    expect(countOf('17')).toBe(17);
    expect(countOf(2.6)).toBe(3);
    expect(countOf(null)).toBe(0);
    expect(daysOf({ from: '2026-10-30', to: '2026-11-02' })).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(daysOf({ from: '2026-11-02', to: '2026-11-01' })).toEqual([]);
    expect(daysOf({ from: 'x', to: '2026-11-01' })).toEqual([]);
  });

  it('maps each platform row; a row without a campaign or a day is dropped', () => {
    expect(metaSpendRow({ campaign_id: '120001', date_start: '2026-11-01', spend: '850.25', impressions: '9000', clicks: '180', actions: [{ action_type: 'link_click', value: '180' }, { action_type: 'offsite_conversion.fb_pixel_purchase', value: '4' }] }, 'BDT')).toEqual({
      campaignExternalId: '120001',
      day: '2026-11-01',
      spendMinor: 85025,
      impressions: 9000,
      clicks: 180,
      purchases: 4,
    });
    expect(metaSpendRow({ campaign_id: '1', date_start: '2026-11-01', spend: '1', actions: [{ action_type: 'offsite_conversion.fb_pixel_purchase', value: '9' }, { action_type: 'purchase', value: '3' }] }, 'BDT')?.purchases).toBe(3);
    expect(metaSpendRow({ date_start: '2026-11-01', spend: '1' }, 'BDT')).toBeNull();
    expect(tiktokSpendRow({ dimensions: { campaign_id: '17001', stat_time_day: '2026-11-01 00:00:00' }, metrics: { spend: '10.50', impressions: '500', clicks: '12', complete_payment: '1' } }, 'USD')).toEqual({ campaignExternalId: '17001', day: '2026-11-01', spendMinor: 1050, impressions: 500, clicks: 12, purchases: 1 });
    expect(tiktokSpendRow({ dimensions: { campaign_id: '17001' }, metrics: {} }, 'USD')).toBeNull();
    expect(googleSpendRow({ campaign: { id: '555' }, segments: { date: '2026-11-01' }, metrics: { costMicros: '12500000', impressions: '700', clicks: '30', conversions: 2.0 } }, 'BDT')).toEqual({ campaignExternalId: '555', day: '2026-11-01', spendMinor: 1250, impressions: 700, clicks: 30, purchases: 2 });
    expect(googleSpendRow({ campaign: { id: '555' }, segments: {}, metrics: {} }, 'BDT')).toBeNull();
    expect(spendQuery({ from: '2026-11-01', to: '2026-11-03' })).toContain("segments.date BETWEEN '2026-11-01' AND '2026-11-03'");
  });

  it('Meta: insights per campaign per day, every page, the token only in a header', async () => {
    const { f, calls } = stand((url) => {
      if (url.includes('/insights') && !url.includes('after=')) return { data: [{ campaign_id: '1', date_start: '2026-11-01', spend: '100' }], paging: { next: `${BASE}/v21.0/act_123456/insights?after=x&access_token=${TOKEN}` } };
      if (url.includes('after=x')) return { data: [{ campaign_id: '1', date_start: '2026-11-02', spend: '0' }] };
      return { name: 'Sample ads', currency: 'BDT', account_status: 1 };
    });
    const c = createMetaAdsClient({ baseUrl: BASE, apiVersion: 'v21.0', adAccountId: '123456', token: TOKEN, fetch: f });
    const r = await c.spend({ from: '2026-11-01', to: '2026-11-02' });
    expect(r).toEqual({ ok: true, value: [expect.objectContaining({ day: '2026-11-01', spendMinor: 10000 }), expect.objectContaining({ day: '2026-11-02', spendMinor: 0 })] });
    const first = calls.find((x) => x.url.includes('/insights'))!.url;
    expect(first).toContain('level=campaign');
    expect(first).toContain('time_increment=1');
    expect(decodeURIComponent(first)).toContain('"since":"2026-11-01","until":"2026-11-02"');
    expect(calls.every((x) => !x.url.includes(TOKEN))).toBe(true);
    expect(await c.spend({ from: '2026-11-02', to: '2026-11-01' })).toEqual({ ok: false, error: 'not a range of days' });
  });

  it('TikTok: the BASIC report per campaign and day, in the advertiser currency', async () => {
    const { f, calls } = stand((url) =>
      url.includes('/advertiser/info/')
        ? { code: 0, data: { list: [{ advertiser_id: '7012345678901234567', name: 'Sample', currency: 'USD' }] } }
        : { code: 0, data: { list: [{ dimensions: { campaign_id: '17001', stat_time_day: '2026-11-01 00:00:00' }, metrics: { spend: '3.25' } }], page_info: { page: 1, total_page: 1 } } },
    );
    const r = await createTiktokAdsClient({ baseUrl: BASE, advertiserId: '7012345678901234567', token: TOKEN, fetch: f }).spend({ from: '2026-11-01', to: '2026-11-01' });
    expect(r).toEqual({ ok: true, value: [{ campaignExternalId: '17001', day: '2026-11-01', spendMinor: 325, impressions: 0, clicks: 0, purchases: 0 }] });
    const rep = new URL(calls.find((x) => x.url.includes('/report/integrated/get/'))!.url);
    expect(rep.searchParams.get('data_level')).toBe('AUCTION_CAMPAIGN');
    expect(JSON.parse(rep.searchParams.get('dimensions')!)).toEqual(['campaign_id', 'stat_time_day']);
    expect(calls.every((x) => !x.url.includes(TOKEN))).toBe(true);
  });

  it('Google: GAQL cost per campaign and day (micros → minor)', async () => {
    const { f, calls } = stand((url, init) => {
      if (url.includes('oauth')) return { access_token: 'short-access', expires_in: 3599 };
      const q = String(JSON.parse(String(init.body)).query);
      if (q.includes('FROM customer')) return { results: [{ customer: { id: '1234567890', descriptiveName: 'Sample', currencyCode: 'BDT' } }] };
      return { results: [{ campaign: { id: '555' }, segments: { date: '2026-11-01' }, metrics: { costMicros: '2000000' } }] };
    });
    const c = createGoogleAdsClient({ baseUrl: BASE, oauthUrl: `${BASE}/oauth`, apiVersion: 'v23', customerId: '1234567890', clientId: 'sample-client-id', clientSecret: 'sample-secret-1', refreshToken: 'sample-refresh-1', developerToken: 'sample-dev-1', fetch: f });
    expect(await c.spend({ from: '2026-11-01', to: '2026-11-01' })).toEqual({ ok: true, value: [{ campaignExternalId: '555', day: '2026-11-01', spendMinor: 200, impressions: 0, clicks: 0, purchases: 0 }] });
    expect(calls.some((x) => String(x.init.body ?? '').includes('segments.date BETWEEN'))).toBe(true);
    expect(await c.spend({ from: "2026-11-01' OR 1=1 --", to: '2026-11-01' })).toEqual({ ok: false, error: 'not a range of days' });
  });

  it('the practice copy: an example day per day of the range', async () => {
    const r = await practiceAdsReader('metaAds', 'meta').spend({ from: '2026-11-01', to: '2026-11-03' });
    expect(r.ok && r.value.map((x) => x.day)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
    expect(r.ok && r.value.every((x) => x.campaignExternalId === 'practice-1' && x.spendMinor > 0)).toBe(true);
  });
});

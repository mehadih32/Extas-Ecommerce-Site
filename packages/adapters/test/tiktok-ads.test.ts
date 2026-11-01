// S13 · PR 260 — TikTok's Business API, read only: the advertiser, campaigns and ad groups in our shape (budgets from
// TikTok's major unit to the minor unit by the currency's digits, "no limit" as no budget), TikTok's page_info paging,
// a refusal inside a 200 (code ≠ 0), the token in its header and never in an address or an answer, the practice copy
// before the key, the Keys & connections row and the readers list.
import { describe, expect, it } from 'vitest';
import { ADS_READER_CONNECTION, adsReaderAdapters, allAdapters, createTiktokAdsClient, findConnection, metaAdsAdapter, practiceAdsReader, tiktokAdGroup, tiktokAdsAdapter, tiktokAdsConfig, tiktokCampaign, tiktokMinor } from '../src';

const TOKEN = 'sample-token-0123456789abcdef';
const BASE = 'https://business.example.test';
const ADV = '7012345678901234567';

function stand(answer: (url: URL) => { status?: number; body: unknown }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const a = answer(new URL(String(url)));
    return new Response(JSON.stringify(a.body), { status: a.status ?? 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { f, calls };
}

const ok = (data: unknown) => ({ body: { code: 0, message: 'OK', request_id: 'r', data } });
const advertiser = ok({ list: [{ advertiser_id: ADV, name: 'Sample TikTok ads', currency: 'bdt', status: 'STATUS_ENABLE' }] });

describe('TikTok ads reader (PR 260)', () => {
  it('turns TikTok rows into ours: major unit → minor by the currency, the budget mode, the detailed status', () => {
    expect(tiktokMinor(500.5, 'BDT')).toBe(50050);
    expect(tiktokMinor('1200', 'JPY')).toBe(1200);
    expect(tiktokMinor(0, 'BDT')).toBeNull();
    expect(tiktokMinor('ten', 'BDT')).toBeNull();
    expect(tiktokCampaign({ campaign_id: 1800001, campaign_name: 'Eid polo', operation_status: 'ENABLE', secondary_status: 'CAMPAIGN_STATUS_ENABLE', objective_type: 'PRODUCT_SALES', budget_mode: 'BUDGET_MODE_DAY', budget: 800 }, 'BDT')).toEqual({
      externalId: '1800001',
      name: 'Eid polo',
      status: 'CAMPAIGN_STATUS_ENABLE',
      objective: 'PRODUCT_SALES',
      dailyBudgetMinor: 80000,
      lifetimeBudgetMinor: null,
      startAt: null,
      stopAt: null,
    });
    expect(tiktokCampaign({ campaign_id: '2', budget_mode: 'BUDGET_MODE_TOTAL', budget: 15000, operation_status: 'DISABLE' }, 'BDT')).toMatchObject({ name: '2', status: 'DISABLE', dailyBudgetMinor: null, lifetimeBudgetMinor: 1500000 });
    expect(tiktokCampaign({ campaign_id: '3', budget_mode: 'BUDGET_MODE_INFINITE', budget: 0 }, 'BDT')).toMatchObject({ status: 'UNKNOWN', dailyBudgetMinor: null, lifetimeBudgetMinor: null });
    expect(tiktokAdGroup({ adgroup_id: '9', campaign_id: '1800001', adgroup_name: 'Dhaka', operation_status: 'ENABLE', budget_mode: 'BUDGET_MODE_DAY', budget: 300, location_ids: ['1210997'], age_groups: ['AGE_25_34'], schedule_start_time: '2026-10-01 00:00:00', unknown: 'x' }, 'BDT')).toEqual({
      externalId: '9',
      campaignExternalId: '1800001',
      name: 'Dhaka',
      status: 'ENABLE',
      dailyBudgetMinor: 30000,
      targeting: { location_ids: ['1210997'], age_groups: ['AGE_25_34'], schedule_start_time: '2026-10-01 00:00:00' },
    });
    expect(tiktokAdGroup({ adgroup_id: '10', campaign_id: '1' }, 'BDT').targeting).toBeNull();
  });

  it('reads the advertiser and every page of campaigns, the token only in its header', async () => {
    const { f, calls } = stand((u) => {
      if (u.pathname.endsWith('/advertiser/info/')) return advertiser;
      if (u.pathname.endsWith('/campaign/get/')) {
        const page = Number(u.searchParams.get('page'));
        return ok({ list: [{ campaign_id: `c${page}`, campaign_name: `C${page}`, operation_status: 'ENABLE' }], page_info: { page, page_size: 1000, total_page: 2, total_number: 2 } });
      }
      return ok({ list: [{ adgroup_id: 'g1', campaign_id: 'c1', adgroup_name: 'G1', budget_mode: 'BUDGET_MODE_DAY', budget: 1.25 }], page_info: { page: 1, total_page: 1 } });
    });
    const c = createTiktokAdsClient({ baseUrl: `${BASE}/`, advertiserId: ADV, token: TOKEN, fetch: f });
    expect(await c.account()).toEqual({ ok: true, value: { externalId: ADV, name: 'Sample TikTok ads', currency: 'BDT', status: 'STATUS_ENABLE' } });
    const r = await c.campaigns();
    expect(r.ok && r.value.map((x) => x.externalId)).toEqual(['c1', 'c2']);
    const s = await c.adSets();
    expect(s.ok && s.value[0]).toMatchObject({ campaignExternalId: 'c1', dailyBudgetMinor: 125 });
    expect(calls.map((x) => x.url).filter((u) => u.includes(TOKEN))).toEqual([]);
    expect(calls.every((x) => (x.init.headers as Record<string, string>)['Access-Token'] === TOKEN && x.url.startsWith(`${BASE}/open_api/v1.3/`))).toBe(true);
    // the currency is read once, then reused for every list
    expect(calls.filter((x) => x.url.includes('/advertiser/info/'))).toHaveLength(1);
    expect(await c.check()).toEqual({ ok: true, message: 'connected; advertiser Sample TikTok ads (BDT)' });
  });

  it('a refusal (even inside a 200) is said in TikTok’s words without the token; no answer is said plainly', async () => {
    const bad = stand(() => ({ body: { code: 40105, message: `Access token is incorrect or has been revoked: ${TOKEN}`, data: {} } }));
    const r = await createTiktokAdsClient({ baseUrl: BASE, advertiserId: ADV, token: TOKEN, fetch: bad.f }).campaigns();
    expect(r).toEqual({ ok: false, error: 'Access token is incorrect or has been revoked: …' });
    const other = stand(() => ok({ list: [{ advertiser_id: '1111111', name: 'Not ours', currency: 'USD' }] }));
    expect((await createTiktokAdsClient({ baseUrl: BASE, advertiserId: ADV, token: TOKEN, fetch: other.f }).check()).ok).toBe(false);
    const down = (async () => {
      throw new Error(`socket ${TOKEN}`);
    }) as typeof fetch;
    expect(await createTiktokAdsClient({ baseUrl: BASE, advertiserId: ADV, token: TOKEN, fetch: down }).account()).toEqual({ ok: false, error: 'TikTok did not answer' });
  });

  it('the practice copy says it is one; the row is in Keys & connections with its one key; Meta and TikTok are listed in order', async () => {
    const p = practiceAdsReader('tiktokAds', 'tiktok');
    expect(p.practice).toBe(true);
    expect(allAdapters).toContain(tiktokAdsAdapter);
    expect(adsReaderAdapters).toEqual([metaAdsAdapter, tiktokAdsAdapter]);
    expect(Object.keys(ADS_READER_CONNECTION)).toEqual(['meta', 'tiktok']);
    expect(ADS_READER_CONNECTION.tiktok).toEqual({ kind: 'TIKTOK', provider: 'tiktokAds' });
    expect(findConnection('tiktokAds')).toMatchObject({ kind: 'TIKTOK', secrets: [{ field: 'accessToken' }], exclusive: false });
    expect(tiktokAdsConfig.safeParse({ advertiserId: ADV }).success).toBe(true);
    expect(tiktokAdsConfig.safeParse({ advertiserId: 'act_123' }).success).toBe(false);
  });
});

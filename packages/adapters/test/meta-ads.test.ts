// S13 · PR 259 — Meta's Marketing API, read only: the account, campaigns and ad sets in our shape (budgets in the
// account currency's minor unit), Meta's paging followed on its own host only, the token in a header and never in an
// answer, the practice copy before the key, and the Keys & connections row.
import { describe, expect, it } from 'vitest';
import { allAdapters, createMetaAdsClient, findConnection, metaAdsAdapter, metaAdsConfig, metaAdSet, metaCampaign, practiceAdsReader } from '../src';

const TOKEN = 'sample-token-0123456789abcdef';
const BASE = 'https://graph.example.test';

function stand(answer: (url: string) => { status?: number; body: unknown }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const a = answer(String(url));
    return new Response(JSON.stringify(a.body), { status: a.status ?? 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { f, calls };
}

describe('Meta ads reader (PR 259)', () => {
  it('turns Meta rows into ours: budgets in minor units, the effective status, dates', () => {
    expect(metaCampaign({ id: '120001', name: 'Eid polo', status: 'ACTIVE', effective_status: 'CAMPAIGN_PAUSED', objective: 'OUTCOME_SALES', daily_budget: '80000', start_time: '2026-10-01T00:00:00+0600' })).toEqual({
      externalId: '120001',
      name: 'Eid polo',
      status: 'CAMPAIGN_PAUSED',
      objective: 'OUTCOME_SALES',
      dailyBudgetMinor: 80000,
      lifetimeBudgetMinor: null,
      startAt: new Date('2026-09-30T18:00:00Z'),
      stopAt: null,
    });
    expect(metaCampaign({ id: '120002', lifetime_budget: '0', daily_budget: 'x' })).toMatchObject({ name: '120002', status: 'UNKNOWN', dailyBudgetMinor: null, lifetimeBudgetMinor: null });
    expect(metaAdSet({ id: '9', campaign_id: '120001', name: 'Dhaka', status: 'ACTIVE', targeting: { age_min: 20 } })).toMatchObject({ campaignExternalId: '120001', targeting: { age_min: 20 } });
  });

  it('reads the account and every page of campaigns, the token only in a header', async () => {
    const { f, calls } = stand((url) => {
      if (url.includes('/campaigns') && !url.includes('after=')) return { body: { data: [{ id: '1', name: 'A', status: 'ACTIVE' }], paging: { next: `${BASE}/v21.0/act_123456/campaigns?after=abc&access_token=${TOKEN}` } } };
      if (url.includes('after=abc')) return { body: { data: [{ id: '2', name: 'B', status: 'PAUSED' }], paging: { next: 'https://elsewhere.example.test/next' } } };
      return { body: { name: 'Sample ads', currency: 'bdt', account_status: 1 } };
    });
    const c = createMetaAdsClient({ baseUrl: BASE, apiVersion: 'v21.0', adAccountId: '123456', token: TOKEN, fetch: f });
    expect(await c.account()).toEqual({ ok: true, value: { externalId: 'act_123456', name: 'Sample ads', currency: 'BDT', status: '1' } });
    const r = await c.campaigns();
    expect(r.ok && r.value.map((x) => x.externalId)).toEqual(['1', '2']);
    expect(calls.map((x) => x.url).filter((u) => u.includes(TOKEN))).toEqual([]);
    expect(calls.every((x) => (x.init.headers as Record<string, string>).Authorization === `Bearer ${TOKEN}`)).toBe(true);
    expect(calls.some((x) => x.url.includes('elsewhere'))).toBe(false);
    expect(await c.check()).toEqual({ ok: true, message: 'connected; ad account Sample ads (BDT)' });
  });

  it('a refusal is said in Meta’s words without the token; no answer is said plainly', async () => {
    const bad = stand(() => ({ status: 400, body: { error: { message: `Invalid OAuth access token ${TOKEN}` } } }));
    const r = await createMetaAdsClient({ baseUrl: BASE, apiVersion: 'v21.0', adAccountId: 'act_123456', token: TOKEN, fetch: bad.f }).adSets();
    expect(r).toEqual({ ok: false, error: 'Invalid OAuth access token …' });
    const down = (async () => {
      throw new Error(`socket ${TOKEN}`);
    }) as typeof fetch;
    expect(await createMetaAdsClient({ baseUrl: BASE, apiVersion: 'v21.0', adAccountId: '123456', token: TOKEN, fetch: down }).account()).toEqual({ ok: false, error: 'Meta did not answer' });
  });

  it('the practice copy says it is one; the row is in Keys & connections with its one key', async () => {
    const p = practiceAdsReader('metaAds', 'meta');
    expect(p.practice).toBe(true);
    expect((await p.campaigns()).ok).toBe(true);
    expect(allAdapters).toContain(metaAdsAdapter);
    expect(findConnection('metaAds')).toMatchObject({ kind: 'META', secrets: [{ field: 'accessToken' }], exclusive: false });
    expect(metaAdsConfig.safeParse({ adAccountId: 'act_1234567890' }).success).toBe(true);
    expect(metaAdsConfig.safeParse({ adAccountId: 'my account' }).success).toBe(false);
  });
});

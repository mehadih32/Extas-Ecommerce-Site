// S13 · PR 268 — what each platform would be sent for a pause, a start again and a new daily budget, and the practice
// writer that keeps it in this process and sends nothing. Values made up.
import { describe, expect, it } from 'vitest';
import { googleCampaignPayload, metaCampaignPayload, mockCampaignOutbox, practiceCampaignWriter, tiktokCampaignPayload, type CampaignChangeInput } from '../src';

const o = (change: CampaignChangeInput['change'], currency = 'BDT'): CampaignChangeInput => ({ campaignExternalId: '120201', accountExternalId: '123-456-7890', currency, change });

describe('PR 268 · campaign changes per platform', () => {
  it('Meta: status, or the daily budget in the minor unit', () => {
    expect(metaCampaignPayload(o({ kind: 'pause' }))).toEqual({ path: '/120201', body: { status: 'PAUSED' } });
    expect(metaCampaignPayload(o({ kind: 'resume' })).body).toEqual({ status: 'ACTIVE' });
    expect(metaCampaignPayload(o({ kind: 'budget', dailyBudgetMinor: 150_000 })).body).toEqual({ daily_budget: 150_000 });
  });
  it('TikTok: operation status, or the day budget in the major unit', () => {
    expect(tiktokCampaignPayload(o({ kind: 'pause' })).body).toEqual({ advertiser_id: '123-456-7890', campaign_ids: ['120201'], operation_status: 'DISABLE' });
    expect(tiktokCampaignPayload(o({ kind: 'budget', dailyBudgetMinor: 150_050 })).body).toMatchObject({ budget_mode: 'BUDGET_MODE_DAY', budget: 1500.5 });
  });
  it('Google: the campaign status, or the budget in micros', () => {
    expect(googleCampaignPayload(o({ kind: 'resume' }))).toEqual({ path: '/customers/1234567890/campaigns:mutate', body: { operations: [{ update: { resourceName: 'customers/1234567890/campaigns/120201', status: 'ENABLED' }, updateMask: 'status' }] } });
    expect(googleCampaignPayload(o({ kind: 'budget', dailyBudgetMinor: 2_500 }, 'USD')).body).toMatchObject({ amountMicros: '25000000' });
  });
  it('the practice writer keeps what it would send, and sends nothing', async () => {
    mockCampaignOutbox.clear();
    const w = practiceCampaignWriter('tiktok');
    expect(w.practice).toBe(true);
    expect(await w.change(o({ kind: 'pause' }))).toEqual({ ok: true, value: { done: true } });
    expect(mockCampaignOutbox.all()).toEqual([expect.objectContaining({ platform: 'tiktok', campaignExternalId: '120201', change: { kind: 'pause' }, payload: expect.objectContaining({ path: '/campaign/status/update/' }) })]);
  });
});

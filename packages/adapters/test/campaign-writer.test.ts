// S13 · PR 268 — what each platform would be sent for a pause, a start again and a new daily budget, and the practice
// writer that keeps it in this process and sends nothing. Values made up.
import { describe, expect, it } from 'vitest';
import { googleCampaignPayload, googleCreatePayload, metaCampaignPayload, metaCreatePayload, mockCampaignOutbox, objectiveOf, practiceCampaignWriter, tiktokCampaignPayload, tiktokCreatePayload, type CampaignChangeInput, type CampaignCreateInput } from '../src';

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

const S0 = '2026-12-01T04:00:00.000Z';
const E0 = '2026-12-20T18:00:00.000Z';
const n = (o: Partial<CampaignCreateInput> = {}): CampaignCreateInput => ({ accountExternalId: '123-456-7890', currency: 'BDT', name: 'Eid polo 2', objective: 'sales', dailyBudgetMinor: 150_050, startAt: S0, endAt: E0, copyOfExternalId: null, ...o });

describe('PR 531 · a schedule and a new campaign per platform', () => {
  it('a schedule: Meta start/stop time, TikTok on the ad groups, Google start/end dates', () => {
    const s = o({ kind: 'schedule', startAt: S0, endAt: null });
    expect(metaCampaignPayload(s).body).toEqual({ start_time: S0, stop_time: null });
    expect(tiktokCampaignPayload(s)).toMatchObject({ path: '/adgroup/update/', body: { schedule_type: 'SCHEDULE_FROM_NOW', schedule_start_time: S0, schedule_end_time: null } });
    expect(tiktokCampaignPayload(o({ kind: 'schedule', startAt: S0, endAt: E0 })).body).toMatchObject({ schedule_type: 'SCHEDULE_START_END' });
    expect(googleCampaignPayload(s).body.operations?.[0]).toMatchObject({ update: { startDate: '2026-12-01', endDate: null }, updateMask: 'start_date,end_date' });
  });
  it('a new campaign: each platform its own objective word, the budget in its own unit', () => {
    expect(metaCreatePayload(n())).toEqual({ path: '/act_123-456-7890/campaigns', body: { name: 'Eid polo 2', objective: 'OUTCOME_SALES', status: 'ACTIVE', daily_budget: 150_050, start_time: S0, stop_time: E0, special_ad_categories: [] } });
    expect(metaCreatePayload(n({ accountExternalId: 'act_9' })).path).toBe('/act_9/campaigns');
    expect(tiktokCreatePayload(n({ objective: 'traffic' })).body).toMatchObject({ campaign_name: 'Eid polo 2', objective_type: 'TRAFFIC', budget_mode: 'BUDGET_MODE_DAY', budget: 1500.5 });
    expect(googleCreatePayload(n({ currency: 'USD', dailyBudgetMinor: 2_500, objective: 'awareness' }))).toMatchObject({ budget: { amountMicros: '25000000' }, body: { operations: [{ create: { advertisingChannelType: 'DISPLAY', startDate: '2026-12-01', endDate: '2026-12-20' } }] } });
  });
  it('a copy: Meta copies the campaign with its ad sets, then names and budgets it', () => {
    expect(metaCreatePayload(n({ copyOfExternalId: '120201' }))).toEqual({ path: '/120201/copies', body: { deep_copy: true, status_option: 'ACTIVE', start_time: S0, end_time: E0 }, then: { name: 'Eid polo 2', daily_budget: 150_050 } });
  });
  it('a duplicate keeps the objective; an unknown word reads as sales', () => {
    expect(objectiveOf('meta', 'OUTCOME_TRAFFIC')).toBe('traffic');
    expect(objectiveOf('tiktok', 'REACH')).toBe('awareness');
    expect(objectiveOf('google', null)).toBe('sales');
  });
  it('the practice writer "creates" nothing: it keeps what it would send', async () => {
    mockCampaignOutbox.clear();
    const r = await practiceCampaignWriter('meta').create!(n());
    expect(r.ok && r.value.externalId.startsWith('practice-')).toBe(true);
    expect(mockCampaignOutbox.all()).toEqual([expect.objectContaining({ platform: 'meta', change: { kind: 'create', name: 'Eid polo 2' }, payload: expect.objectContaining({ path: '/act_123-456-7890/campaigns' }) })]);
  });
});

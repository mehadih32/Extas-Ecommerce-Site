// S13 · PR 259 — Marketing › Ad platforms on a real PostgreSQL: before the key a practice copy that is shown and never
// saved; with a (stand-in) Meta account the account, campaigns and ad sets are kept, changed ones updated, ones Meta
// no longer lists marked gone (never deleted); a platform refusal is said; tying to our own campaign needs the write
// permission and is audited. PR 260: TikTok is listed beside Meta, and its account is kept as its own (platform TIKTOK).
// A throwaway database (skipped without TEST_DATABASE_ADMIN_URL). Sample values.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createConnections, defineAdapter, metaAdsAdapter, tiktokAdsAdapter, type AdsCampaignFacts, type AdsReader } from '@extas/adapters';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { adPlatformsHandler, type AdPlatformsOverview } from './ad-platforms';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const S = MOTHER_STORE_ID;

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

function req(method: string, o: { body?: unknown; cookie?: string; path?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.41', 'x-forwarded-proto': 'https' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (o.cookie) headers.cookie = o.cookie;
  if (o.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${o.path ?? '/api/admin/marketing/ad-platforms'}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
}

const camp = (externalId: string, name: string, o: Partial<AdsCampaignFacts> = {}): AdsCampaignFacts => ({ externalId, name, status: 'ACTIVE', objective: 'OUTCOME_SALES', dailyBudgetMinor: 80_000, lifetimeBudgetMinor: null, startAt: null, stopAt: null, ...o });

describe.skipIf(!HAS_TEST_DB)('Marketing › Ad platforms on PostgreSQL (PR 259)', () => {
  let t: TestDatabase;
  let admin: AdminDeps;
  let owner = '';
  let reader = '';
  // what the stand-in Meta account lists now
  let live: { campaigns: AdsCampaignFacts[]; refuse?: string } = { campaigns: [] };
  const standIn: AdsReader = {
    provider: 'metaAds',
    platform: 'meta',
    practice: false,
    account: async () => (live.refuse ? { ok: false, error: live.refuse } : { ok: true, value: { externalId: 'act_1234567', name: 'Sample ads', currency: 'BDT', status: '1' } }),
    campaigns: async () => ({ ok: true, value: live.campaigns }),
    adSets: async () => ({ ok: true, value: live.campaigns.map((c) => ({ externalId: `${c.externalId}-a`, campaignExternalId: c.externalId, name: `${c.name} set`, status: 'ACTIVE', dailyBudgetMinor: null, targeting: { age_min: 20 } })) }),
  };
  // PR 260: a stand-in TikTok advertiser (its budgets already in minor units, as the reader gives them)
  const tiktokStandIn: AdsReader = {
    provider: 'tiktokAds',
    platform: 'tiktok',
    practice: false,
    account: async () => ({ ok: true, value: { externalId: '7012345678901234567', name: 'Sample TikTok ads', currency: 'BDT', status: 'STATUS_ENABLE' } }),
    campaigns: async () => ({ ok: true, value: [camp('t1', 'Eid polo on TikTok', { status: 'CAMPAIGN_STATUS_ENABLE', objective: 'PRODUCT_SALES', dailyBudgetMinor: 50_000 })] }),
    adSets: async () => ({ ok: true, value: [{ externalId: 't1-g', campaignExternalId: 't1', name: 'Dhaka 25–34', status: 'ENABLE', dailyBudgetMinor: null, targeting: { age_groups: ['AGE_25_34'] } }] }),
  };
  const liveConnections = () =>
    createConnections({ db: t.prisma, vault: { get: async () => null }, adapters: [defineAdapter({ ...metaAdsAdapter, mock: async () => standIn }), defineAdapter({ ...tiktokAdsAdapter, mock: async () => tiktokStandIn })], secretCacheMs: 0, testTimeoutMs: 1000 });

  const api = async (method: string, b?: unknown, cookie = owner, extra = {}) => {
    const res = await adPlatformsHandler(req(method, { body: b, cookie }), admin, extra);
    return { status: res.status, a: (await res.json()) as { ok: boolean; error?: string; details?: string[]; overview: AdPlatformsOverview; outcome?: { practice: boolean; campaigns: number; adSets: number; gone: number } } };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    const resolver = new SettingsResolver(prismaBackend(t.prisma), registry);
    admin = { db: t.prisma, resolver, vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'owner@example.com', password: OWNER_PW } }), admin));
    const role = await rolesHandler(req('POST', { path: '/api/admin/roles', cookie: owner, body: { nameEn: 'Campaign watch', nameBn: 'ক্যাম্পেইন দেখা', permissions: ['marketing.campaigns.read'] } }), admin);
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(req('POST', { path: '/api/admin/staff', cookie: owner, body: { email: 'ads@example.com', displayName: 'Sample reader', password: 'first password from the owner' } }), admin);
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(req('POST', { path: `/api/admin/staff/${staffId}/roles`, cookie: owner, body: { action: 'assign', roleId, storeId: S } }), admin, staffId);
    const first = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'ads@example.com', password: 'first password from the owner' } }), admin));
    reader = cookiesOf(await passwordHandler(req('POST', { path: '/api/admin/auth/password', cookie: first, body: { current: 'first password from the owner', next: 'my own words for this job' } }), admin));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('before the key: a practice copy, shown and never saved', async () => {
    expect((await api('GET', undefined, '')).status).toBe(401);
    const { status, a } = await api('GET', undefined, reader);
    expect(status).toBe(200);
    const practice = expect.objectContaining({ campaigns: expect.arrayContaining([expect.objectContaining({ externalId: 'practice-1' })]) });
    expect(a.overview.platforms).toEqual([expect.objectContaining({ platform: 'meta', mode: 'MOCK', accounts: [], practice }), expect.objectContaining({ platform: 'tiktok', mode: 'MOCK', accounts: [], practice })]);
    expect((await api('POST', { action: 'sync', platform: 'tiktok' })).a.outcome).toMatchObject({ platform: 'tiktok', practice: true });
    expect((await api('POST', { action: 'sync', platform: 'meta' }, reader)).status).toBe(403);
    const r = await api('POST', { action: 'sync', platform: 'meta' });
    expect(r.a.outcome).toMatchObject({ practice: true, campaigns: 2 });
    expect(await t.prisma.adAccount.count()).toBe(0);
    expect(await t.prisma.adCampaign.count()).toBe(0);
    expect((await api('POST', { action: 'sync', platform: 'myspace' })).a.error).toBe('INVALID_INPUT');
  });

  it('with the account: kept, updated, and what Meta no longer lists marked gone (never deleted)', async () => {
    live = { campaigns: [camp('c1', 'Eid polo'), camp('c2', 'Bag retargeting', { status: 'PAUSED', dailyBudgetMinor: null, lifetimeBudgetMinor: 1_500_000 })] };
    const first = await api('POST', { action: 'sync', platform: 'meta' }, owner, { connections: liveConnections() });
    expect(first.status).toBe(200);
    expect(first.a.outcome).toEqual({ platform: 'meta', practice: false, campaigns: 2, adSets: 2, gone: 0 });
    expect(await t.prisma.adAccount.findFirst()).toMatchObject({ storeId: S, platform: 'META', externalId: 'act_1234567', name: 'Sample ads', currency: 'BDT' });
    live = { campaigns: [camp('c1', 'Eid polo — two colours', { dailyBudgetMinor: 60_000 })] };
    const second = await api('POST', { action: 'sync', platform: 'meta' }, owner, { connections: liveConnections() });
    expect(second.a.outcome).toMatchObject({ campaigns: 1, gone: 2 }); // c2 and its ad set
    const rows = await t.prisma.adCampaign.findMany({ orderBy: { externalId: 'asc' } });
    expect(rows.map((r) => [r.externalId, r.name, r.dailyBudgetMinor, !!r.archivedAt])).toEqual([
      ['c1', 'Eid polo — two colours', 60_000, false],
      ['c2', 'Bag retargeting', null, true],
    ]);
    expect(await t.prisma.adSet.count({ where: { archivedAt: null } })).toBe(1);
    expect(await t.prisma.auditLog.count({ where: { action: 'marketing.adPlatforms.sync' } })).toBe(2);
    const meta = second.a.overview.platforms[0]!;
    expect(meta.accounts[0]!.campaigns.map((c) => [c.externalId, c.gone, c.adSets])).toEqual([
      ['c1', false, 1],
      ['c2', true, 0],
    ]);
  });

  it('a platform refusal is said, and nothing changes', async () => {
    live = { campaigns: [], refuse: 'Invalid OAuth access token' };
    const r = await api('POST', { action: 'sync', platform: 'meta' }, owner, { connections: liveConnections() });
    expect(r.status).toBe(502);
    expect(r.a).toMatchObject({ error: 'PLATFORM', details: ['Invalid OAuth access token'] });
    expect(await t.prisma.adCampaign.count({ where: { archivedAt: null } })).toBe(1);
  });

  it('a platform campaign is tied to one of ours (write permission, audited) and untied', async () => {
    const ours = await t.prisma.campaign.create({ data: { storeId: S, name: 'Eid push' } });
    const c1 = await t.prisma.adCampaign.findFirstOrThrow({ where: { externalId: 'c1' } });
    expect((await api('POST', { action: 'link', adCampaignId: c1.id, campaignId: ours.id }, reader)).status).toBe(403);
    expect((await api('POST', { action: 'link', adCampaignId: c1.id, campaignId: '00000000-0000-7000-8000-000000000000' })).a.error).toBe('INVALID_INPUT');
    expect((await api('POST', { action: 'link', adCampaignId: '00000000-0000-7000-8000-000000000000', campaignId: ours.id })).a.error).toBe('NOT_FOUND');
    const tied = await api('POST', { action: 'link', adCampaignId: c1.id, campaignId: ours.id });
    expect(tied.status).toBe(200);
    expect(tied.a.overview.platforms[0]!.accounts[0]!.campaigns[0]!.campaign).toEqual({ id: ours.id, name: 'Eid push' });
    expect(tied.a.overview.ours).toEqual([{ id: ours.id, name: 'Eid push' }]);
    await api('POST', { action: 'link', adCampaignId: c1.id, campaignId: null });
    expect((await t.prisma.adCampaign.findUniqueOrThrow({ where: { id: c1.id } })).campaignId).toBeNull();
    expect(await t.prisma.auditLog.count({ where: { action: 'marketing.adPlatforms.link' } })).toBe(2);
    expect((await api('POST', { action: 'nope' })).a.error).toBe('INVALID_INPUT');
  });

  it('TikTok (PR 260): its advertiser, campaigns and ad groups kept as its own account, beside Meta', async () => {
    const r = await api('POST', { action: 'sync', platform: 'tiktok' }, owner, { connections: liveConnections() });
    expect(r.status).toBe(200);
    expect(r.a.outcome).toEqual({ platform: 'tiktok', practice: false, campaigns: 1, adSets: 1, gone: 0 });
    expect(await t.prisma.adAccount.findFirst({ where: { platform: 'TIKTOK' } })).toMatchObject({ storeId: S, externalId: '7012345678901234567', name: 'Sample TikTok ads', currency: 'BDT' });
    // Meta's account is untouched by a TikTok read
    expect(await t.prisma.adCampaign.count({ where: { externalId: 'c1', archivedAt: null } })).toBe(1);
    const [meta, tiktok] = r.a.overview.platforms;
    expect(meta!.accounts.map((x) => x.externalId)).toEqual(['act_1234567']);
    expect(tiktok!.accounts[0]!.campaigns.map((c) => [c.externalId, c.status, c.dailyBudgetMinor, c.adSets])).toEqual([['t1', 'CAMPAIGN_STATUS_ENABLE', 50_000, 1]]);
  });
});

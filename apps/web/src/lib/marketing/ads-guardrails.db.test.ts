// S15 · PR 581 — Tirondaj's own guardrails on a real PostgreSQL: off as shipped (every ceiling and the cap at 0,
// nothing blocked); the daily budget ceiling and the kill switch refuse a budget increase even through the plain
// campaign controls (the one choke point every increase passes); turning the kill switch on pauses every active
// campaign in the same save; "Decrease now" refuses while auto-decrease is off. A throwaway database (skipped
// without TEST_DATABASE_ADMIN_URL). Sample values; no real platform is called.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { moneyOf } from '@/components/admin/products/model';
import { campaignControlHandler, type ControlDeps, type ControlOverview } from './campaign-control';
import { guardrailsHandler, type GuardrailOverview } from './ads-guardrails';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const S = MOTHER_STORE_ID;
const T0 = new Date('2026-11-13T08:00:00Z');

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

function req(method: string, o: { body?: unknown; cookie?: string; path?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.44', 'x-forwarded-proto': 'https' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (o.cookie) headers.cookie = o.cookie;
  if (o.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${o.path ?? '/api/admin/marketing/ad-platforms/guardrails'}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
}

describe.skipIf(!HAS_TEST_DB)('Marketing › Ad platforms · ads guardrails on PostgreSQL (PR 581)', () => {
  let t: TestDatabase;
  let admin: AdminDeps;
  let owner = '';
  let approver = ''; // marketing.campaigns.read + marketing.ads.control + marketing.ads.approve
  let camp1 = '';
  let camp2 = '';
  const now = T0;

  const gr = async (method: string, body?: unknown, cookie = approver) => {
    const res = await guardrailsHandler(req(method, { body, cookie }), admin, { now: () => now });
    return { status: res.status, a: (await res.json()) as GuardrailOverview & { ok: boolean; error?: string; cards?: { guardrails: GuardrailOverview['card'] }; lowered?: number; skipped?: number } };
  };
  const ctl = async (method: string, body?: unknown, cookie = approver) => {
    const res = await campaignControlHandler(req(method, { path: '/api/admin/marketing/ad-platforms/control', body, cookie }), admin, { now: () => now });
    return { status: res.status, a: (await res.json()) as ControlOverview & { ok: boolean; error?: string; id?: string; status?: string; cards?: { control: ControlOverview['card'] } } };
  };
  const campaign = (id: string) => t.prisma.adCampaign.findUniqueOrThrow({ where: { id }, select: { status: true, dailyBudgetMinor: true } });

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    admin = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: null } as unknown as AdminDeps;
    owner = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'owner@example.com', password: OWNER_PW } }), admin));
    const role = await rolesHandler(req('POST', { path: '/api/admin/roles', cookie: owner, body: { nameEn: 'Ads owner desk', nameBn: 'বিজ্ঞাপন মালিক ডেস্ক', permissions: ['marketing.campaigns.read', 'marketing.ads.control', 'marketing.ads.approve'] } }), admin);
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(req('POST', { path: '/api/admin/staff', cookie: owner, body: { email: 'adsowner@example.com', displayName: 'Sample ads owner desk', password: 'first password from the owner' } }), admin);
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(req('POST', { path: `/api/admin/staff/${staffId}/roles`, cookie: owner, body: { action: 'assign', roleId, storeId: S } }), admin, staffId);
    const first = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'adsowner@example.com', password: 'first password from the owner' } }), admin));
    approver = cookiesOf(await passwordHandler(req('POST', { path: '/api/admin/auth/password', cookie: first, body: { current: 'first password from the owner', next: 'my own words for this job' } }), admin));
    // campaign controls must be on for any change (pause/budget/kill-switch pause) to go through at all
    await admin.resolver.set('ads.campaignControl', { on: true, approvalHours: 48 }, storeTarget(S), { actorId: null, reason: 'test' });
    const acc = await t.prisma.adAccount.create({ data: { storeId: S, platform: 'META', externalId: 'act_581', name: 'Sample Meta', currency: 'BDT' } });
    camp1 = (await t.prisma.adCampaign.create({ data: { storeId: S, adAccountId: acc.id, externalId: '120581a', name: 'Eid polo', status: 'ACTIVE', dailyBudgetMinor: 80_000, currency: 'BDT' } })).id;
    camp2 = (await t.prisma.adCampaign.create({ data: { storeId: S, adAccountId: acc.id, externalId: '120581b', name: 'Winter jacket', status: 'ACTIVE', dailyBudgetMinor: 60_000, currency: 'BDT' } })).id;
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('off as shipped: every ceiling and the cap at 0, nothing blocks a budget increase', async () => {
    const g = await gr('GET');
    expect(g.a.card.value).toMatchObject({ on: false, killSwitch: false, dailyBudgetCeiling: 0 });
    const r = await ctl('POST', { action: 'change', adCampaignId: camp1, change: 'budget', dailyBudgetMinor: 90_000, confirm: true });
    expect(r.a.status).toBe('WAITING'); // an increase always waits for the owner's approval first; the guardrail runs when it is sent
    const d = await ctl('POST', { action: 'decide', id: r.a.id, decision: 'approve', confirm: true });
    expect(d.a.status).toBe('PRACTICE');
    expect((await campaign(camp1)).dailyBudgetMinor).toBe(90_000);
  });

  it('a daily budget ceiling blocks an increase even after the owner approves it', async () => {
    const before = await gr('GET');
    const scale = 10 ** moneyOf('BDT', 'en-GB').digits;
    // camp1=90,000 minor + camp2=60,000 minor = 150,000 minor already active; a ceiling of 140,000/scale whole units
    // leaves no room for any further increase
    const put = await gr('PUT', { key: 'guardrails', value: { ...before.a.card.value, on: true, dailyBudgetCeiling: Math.floor(150_000 / scale) - 1 }, version: before.a.card.version });
    expect(put.status).toBe(200);
    const r = await ctl('POST', { action: 'change', adCampaignId: camp2, change: 'budget', dailyBudgetMinor: 61_000, confirm: true });
    const d = await ctl('POST', { action: 'decide', id: r.a.id, decision: 'approve', confirm: true });
    expect(d.a.status).toBe('FAILED');
    expect((await campaign(camp2)).dailyBudgetMinor).toBe(60_000); // unchanged
  });

  it('the kill switch refuses an increase, and turning it on pauses every active campaign at once', async () => {
    const before = await gr('GET');
    const put = await gr('PUT', { key: 'guardrails', value: { ...before.a.card.value, killSwitch: true }, version: before.a.card.version });
    expect(put.status).toBe(200);
    expect((await campaign(camp1)).status).toBe('PAUSED');
    expect((await campaign(camp2)).status).toBe('PAUSED');
    // starting one back up is an increase too: refused while the kill switch is on
    const r = await ctl('POST', { action: 'change', adCampaignId: camp1, change: 'resume', confirm: true });
    const d = await ctl('POST', { action: 'decide', id: r.a.id, decision: 'approve', confirm: true });
    expect(d.a.status).toBe('FAILED');
    expect((await campaign(camp1)).status).toBe('PAUSED');
    // turn it back off for the next test, without touching the active status it left behind
    const after = await gr('GET');
    await gr('PUT', { key: 'guardrails', value: { ...after.a.card.value, killSwitch: false, on: false, dailyBudgetCeiling: 0 }, version: after.a.card.version });
  });

  it('"Decrease now" refuses while auto-decrease is off', async () => {
    const r = await gr('POST', { action: 'decreaseNow' });
    expect(r.a).toMatchObject({ ok: false, error: 'OFF' });
  });

  it('seeing the card needs `marketing.campaigns.read`; changing it needs `marketing.ads.approve`', async () => {
    const made = await staffHandler(req('POST', { path: '/api/admin/staff', cookie: owner, body: { email: 'noads@example.com', displayName: 'No ads permission', password: 'first password from the owner' } }), admin);
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    const first = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'noads@example.com', password: 'first password from the owner' } }), admin));
    const bare = cookiesOf(await passwordHandler(req('POST', { path: '/api/admin/auth/password', cookie: first, body: { current: 'first password from the owner', next: 'my own words for this one too' } }), admin));
    const g = await gr('GET', undefined, bare);
    expect(g.status).toBe(403);
  });
});

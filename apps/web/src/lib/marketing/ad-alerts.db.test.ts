// S13 · PR 267 — Marketing › Ad platforms' cost per order and alert rules on a real PostgreSQL: the figures over the
// owner's last days (a campaign's spend ÷ its orders and ÷ its delivered orders); a rule added off, needing the write
// permission, switched on, its limit changed, put away (never deleted), each audited; the card's switch; and the
// Telegram words of the crossed rules, sent only with the switch on. A throwaway database (skipped without
// TEST_DATABASE_ADMIN_URL). Sample values.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { adAlertsHandler, sendCostAlerts, type AlertsOverview } from './ad-alerts';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const S = MOTHER_STORE_ID;
const NOW = new Date('2026-10-20T08:00:00Z');
const at = (d: number) => new Date(Date.UTC(2026, 9, d, 6));

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

function req(method: string, o: { body?: unknown; cookie?: string; path?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.42', 'x-forwarded-proto': 'https' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (o.cookie) headers.cookie = o.cookie;
  if (o.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${o.path ?? '/api/admin/marketing/ad-platforms/alerts'}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
}

describe.skipIf(!HAS_TEST_DB)('Marketing › Ad platforms · cost per order and alerts on PostgreSQL (PR 267)', () => {
  let t: TestDatabase;
  let admin: AdminDeps;
  let owner = '';
  let reader = '';
  let camp = '';
  const api = async (method: string, body?: unknown, cookie = owner) => {
    const res = await adAlertsHandler(req(method, { body, cookie }), admin, { now: () => NOW });
    return { status: res.status, a: (await res.json()) as AlertsOverview & { ok: boolean; error?: string; details?: string[]; id?: string; cards?: { alerts: AlertsOverview['card'] } } };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    admin = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: null } as unknown as AdminDeps;
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

  it('nothing yet: empty figures, no rule, the card off', async () => {
    expect((await api('GET', undefined, '')).status).toBe(401);
    const { status, a } = await api('GET', undefined, reader);
    expect(status).toBe(200);
    expect(a.rules).toEqual([]);
    expect(a.card.value).toEqual({ on: false, days: 7, lang: 'bn' });
    expect(a.cost).toMatchObject({ from: '2026-10-14', to: '2026-10-20', campaigns: [], platforms: [], total: { spendMinor: 0, orders: 0 } });
  });

  it('a rule: added off, switched on, its limit changed, put away — each audited, never deleted', async () => {
    const acc = await t.prisma.adAccount.create({ data: { storeId: S, platform: 'META', externalId: 'act-267', name: 'Sample Meta', currency: 'BDT' } });
    camp = (await t.prisma.adCampaign.create({ data: { storeId: S, adAccountId: acc.id, externalId: 'c-267', name: 'Eid polo', status: 'ACTIVE', currency: 'BDT' } })).id;
    for (const [i, status] of (['DELIVERED', 'DELIVERED', 'IN_TRANSIT', 'RETURNED'] as const).entries())
      await t.prisma.order.create({ data: { storeId: S, number: `W267-${i}`, source: 'WEBSITE', currency: 'BDT', status, placedAt: at(15), deliveredAt: status === 'DELIVERED' ? at(18) : null, returnedAt: status === 'RETURNED' ? at(19) : null, subtotalMinor: 150_000, deliveryChargeMinor: 0, totalMinor: 150_000, paymentMethod: 'COD', adCampaignId: camp, idempotencyKey: `w267-${i}` } });
    await t.prisma.adSpendDaily.create({ data: { storeId: S, adAccountId: acc.id, adCampaignId: camp, date: new Date('2026-10-16T00:00:00Z'), platform: 'META', spendMinor: 100_000, currency: 'BDT', purchases: 5 } });
    await t.prisma.adSpendDaily.create({ data: { storeId: S, adAccountId: acc.id, adCampaignId: camp, date: new Date('2026-10-01T00:00:00Z'), platform: 'META', spendMinor: 900_000, currency: 'BDT' } }); // before the window

    const add = { action: 'add', metric: 'costPerDelivered', scope: { adCampaignId: camp }, thresholdMinor: 40_000 };
    expect((await api('POST', add, reader)).status).toBe(403);
    expect((await api('POST', { ...add, scope: { adCampaignId: '0190a000-0000-7000-8000-000000000000' } })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['scope'] });
    expect((await api('POST', { ...add, thresholdMinor: 0 })).a.details).toEqual(['thresholdMinor']);
    expect((await api('POST', { ...add, scope: { platform: 'MYSPACE' } })).a.error).toBe('INVALID_INPUT');
    const made = await api('POST', add);
    expect(made.status).toBe(200);
    const id = made.a.id!;
    await api('POST', { action: 'add', metric: 'costPerOrder', scope: null, thresholdMinor: 30_000 });

    let g = (await api('GET', undefined, reader)).a;
    expect(g.cost.campaigns[0]).toMatchObject({ key: camp, spendMinor: 100_000, platformPurchases: 5, orders: 4, delivered: 2, returned: 1, perOrderMinor: 25_000, perDeliveredMinor: 50_000 });
    expect(g.rules.map((r) => [r.metric, r.enabled, r.hit.state, r.campaignName])).toEqual([
      ['costPerDelivered', false, 'over', 'Eid polo'],
      ['costPerOrder', false, 'ok', null],
    ]);

    await api('POST', { action: 'set', id, enabled: true });
    await api('POST', { action: 'set', id, thresholdMinor: 60_000 });
    g = (await api('GET')).a;
    expect(g.rules[0]).toMatchObject({ enabled: true, thresholdMinor: 60_000, hit: { state: 'ok', valueMinor: 50_000 } });
    await api('POST', { action: 'set', id, thresholdMinor: 45_000 });

    const other = g.rules[1]!.id;
    expect((await api('POST', { action: 'archive', id: other })).status).toBe(200);
    expect((await api('POST', { action: 'set', id: other, enabled: true })).a.error).toBe('NOT_FOUND');
    expect((await api('GET')).a.rules.map((r) => r.id)).toEqual([id]);
    expect(await t.prisma.adAlertRule.count()).toBe(2); // put away, still there
    expect(await t.prisma.auditLog.count({ where: { action: { startsWith: 'marketing.adAlert.' } } })).toBe(6);
  });

  it('the card, and the Telegram words of the crossed rules only with it on', async () => {
    const sent: string[] = [];
    const send = async (x: string) => void sent.push(x);
    const deps = { db: t.prisma, resolver: admin.resolver, vault: null, now: () => NOW, send };
    expect(await sendCostAlerts(deps)).toEqual({ crossed: 0, sent: false });
    const v0 = (await api('GET')).a.card.version;
    expect((await api('PUT', { key: 'alerts', value: { on: true, days: 7, lang: 'en' }, version: v0 }, reader)).status).toBe(403);
    expect((await api('PUT', { key: 'alerts', value: { on: true, days: 0, lang: 'en' }, version: v0 })).a.details).toEqual(['days']);
    const saved = await api('PUT', { key: 'alerts', value: { on: true, days: 7, lang: 'en' }, version: v0 });
    expect(saved.a.cards!.alerts.value).toEqual({ on: true, days: 7, lang: 'en' });
    expect((await api('PUT', { key: 'alerts', value: { on: false, days: 7, lang: 'en' }, version: v0 })).status).toBe(409);
    expect(await sendCostAlerts(deps)).toEqual({ crossed: 1, sent: true });
    expect(sent[0]).toContain('Ad cost alert (2026-10-14 to 2026-10-20):');
    expect(sent[0]).toContain('Eid polo: Cost per delivered order');
    expect(sent[0]).toContain('Nothing was paused or changed.');
    // the same campaign's spend and orders: no budget or campaign touched
    expect(await t.prisma.adCampaign.findUnique({ where: { id: camp }, select: { status: true, dailyBudgetMinor: true } })).toEqual({ status: 'ACTIVE', dailyBudgetMinor: null });
  });
});

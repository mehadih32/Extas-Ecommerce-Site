// S13 · PR 256 — Marketing › Campaigns on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): a campaign made
// with its parts and the shop's currency, saved at its version (stale refused, another store's audience refused), the
// steps (schedule needs a future start, start locks the budget, pause / resume / end, archive / restore never delete),
// the orders its landing pages brought and the delivered ones; audited; signed out 401. Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from '../admin-auth';
import { loginHandler } from '../admin-api';
import { campaignsHandler } from './campaigns';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.54' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

describe.skipIf(!HAS_TEST_DB)('Marketing › Campaigns on PostgreSQL (PR 256)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let otherStore = 0;
  let couponId = '';
  const api = async (method: string, id: string | null, body?: unknown, cookie = owner) => {
    const r = await campaignsHandler(call(method, `/api/admin/marketing/campaigns${id ? `/${id}` : ''}`, cookie, body), deps, id);
    return { status: r.status, j: (await r.json()) as Record<string, any> };
  };
  const input = { name: 'Eid polo push', objective: 'delivered', channels: ['meta', 'tiktok'], audienceId: null, offer: { kind: 'words', words: { en: 'Any 2, cash on delivery', bn: null } }, couponId: null, creative: { headline: { en: 'Two polos, one price', bn: null } }, startsAt: null, endsAt: null, budgetMinor: 80_000, budgetKind: 'DAILY', version: null };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('campaigns');
    const [A, B] = await seedSampleStores(t.prisma);
    expect(A).toBe(MOTHER_STORE_ID);
    otherStore = B;
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', undefined, { email: 'owner@example.com', password: OWNER_PW }), deps));
    couponId = (await t.prisma.coupon.create({ data: { storeId: MOTHER_STORE_ID, code: 'EIDSAMPLE', kind: 'percent', value: { percent: 10 } } })).id;
  });
  afterAll(async () => t?.drop());

  it('makes a campaign with its parts in the shop currency, saves it at its version, refuses stale saves and strangers\' rows', async () => {
    const made = await api('POST', null, input);
    expect(made.status).toBe(201);
    const c = made.j.campaign;
    expect(c).toMatchObject({ name: 'Eid polo push', state: 'DRAFT', channels: ['meta', 'tiktok'], budgetMinor: 80_000, budgetKind: 'DAILY', pages: 0, orders: 0 });
    expect(c.budgetCurrency).toBe(await deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID }));
    const saved = await api('PUT', c.id, { ...input, offer: { kind: 'coupon' }, couponId, budgetMinor: null, version: c.version });
    expect(saved.status).toBe(200);
    expect(saved.j.campaign).toMatchObject({ couponId, offer: { kind: 'coupon' }, budgetMinor: null, budgetKind: null, budgetCurrency: null });
    expect((await api('PUT', c.id, { ...input, version: c.version })).j.error).toBe('STALE');
    const theirs = await t.prisma.audience.create({ data: { storeId: otherStore, name: 'Theirs', kind: 'segment', definition: {} } });
    expect((await api('POST', null, { ...input, audienceId: theirs.id })).j).toMatchObject({ error: 'INVALID_INPUT', details: ['audienceId'] });
    expect((await api('GET', 'not-a-campaign')).status).toBe(404);
    expect(await t.prisma.auditLog.count({ where: { action: { in: ['marketing.campaign.create', 'marketing.campaign.save'] } } })).toBe(2);
  });

  it('steps: schedule needs a future start; start locks the budget; pause, resume, end; archive and restore keep the row', async () => {
    const now = Date.now();
    let c = (await api('GET', null)).j.list.rows[0];
    let v = (await api('GET', c.id)).j.campaign;
    expect((await api('POST', c.id, { action: 'schedule', version: v.version })).j.error).toBe('NEEDS_START');
    v = (await api('PUT', c.id, { ...input, startsAt: new Date(now + 86_400_000).toISOString(), version: v.version })).j.campaign;
    v = (await api('POST', c.id, { action: 'schedule', version: v.version })).j.campaign;
    expect(v.state).toBe('SCHEDULED');
    v = (await api('POST', c.id, { action: 'start', version: v.version })).j.campaign;
    expect(v.state).toBe('RUNNING');
    expect((await api('PUT', c.id, { ...input, startsAt: v.startsAt, budgetMinor: 160_000, version: v.version })).j.error).toBe('BUDGET_LOCKED');
    const same = await api('PUT', c.id, { ...input, name: 'Eid polo push · week 2', startsAt: v.startsAt, version: v.version });
    expect(same.j.campaign).toMatchObject({ name: 'Eid polo push · week 2', budgetMinor: 80_000 });
    v = same.j.campaign;
    expect((await api('POST', c.id, { action: 'resume', version: v.version })).j.error).toBe('WRONG_STATE');
    v = (await api('POST', c.id, { action: 'pause', version: v.version })).j.campaign;
    v = (await api('POST', c.id, { action: 'resume', version: v.version })).j.campaign;
    v = (await api('POST', c.id, { action: 'end', version: v.version })).j.campaign;
    expect(v.state).toBe('ENDED');
    v = (await api('POST', c.id, { action: 'archive', version: v.version })).j.campaign;
    expect(v.state).toBe('ARCHIVED');
    expect((await api('PUT', c.id, { ...input, version: v.version })).j.error).toBe('ARCHIVED');
    v = (await api('POST', c.id, { action: 'restore', version: v.version })).j.campaign;
    expect(v.state).toBe('ENDED');
    expect(await t.prisma.campaign.count({ where: { id: c.id } })).toBe(1);
    c = (await api('GET', null)).j.list.rows[0];
    expect(c.state).toBe('ENDED');
  });

  it('counts the orders its landing pages brought and the delivered ones', async () => {
    const id = (await api('GET', null)).j.list.rows[0].id;
    const page = await t.prisma.page.create({ data: { storeId: MOTHER_STORE_ID, kind: 'LANDING', slug: 'cp-page', titleEn: 'Polo Duo', campaignId: id } });
    const order = (n: number, delivered: boolean) =>
      t.prisma.order.create({
        data: { storeId: MOTHER_STORE_ID, number: `W256-${n}`, source: 'LANDING_PAGE', landingPageId: page.id, currency: 'BDT', status: delivered ? 'DELIVERED' : 'PLACED', deliveredAt: delivered ? new Date() : null, subtotalMinor: 150_000, deliveryChargeMinor: 0, totalMinor: 150_000, paymentMethod: 'COD', idempotencyKey: `w256-${n}` },
      });
    await order(1, true);
    await order(2, false);
    const l = (await api('GET', null)).j.list;
    expect(l.rows[0]).toMatchObject({ pages: 1, orders: 2, delivered: 1 });
    expect(l.kpis).toMatchObject({ orders: 2, delivered: 1, running: 0 });
    expect((await api('GET', id)).j.campaign.landingPages).toEqual([{ id: page.id, title: 'Polo Duo', slug: 'cp-page', status: 'DRAFT' }]);
  });

  it('signed out is 401; PUT on the list is 405', async () => {
    expect((await api('GET', null, undefined, '')).status).toBe(401);
    expect((await api('PUT', null, input)).status).toBe(405);
  });
});

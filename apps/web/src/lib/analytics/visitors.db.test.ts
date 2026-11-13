// S28 · PR 700 — the visitors view on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the page view carries only
// its page type until the owner turns the visitors view on (then the shaped source, device, path, session and the CDN's region,
// never what else the browser sends); the Overview rolls the days up (today every time, a past day once), counts visitors,
// sessions, live now and visit-to-order, removes roll-ups past the keep days, and the settings need the owner's PIN. Made-up data.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, setOwnerPin, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { ymdIn } from '@extas/metrics';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from '../admin-auth';
import { loginHandler } from '../admin-api';
import { BAG_COOKIE } from '../shop/bag-model';
import { analyticsIngestHandler, type AnalyticsApiDeps } from './ingest';
import { ensureRollups, visitorsRoute, visitorsView } from './visitors';

const ORIGIN = 'https://shop.example.test';
const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const PIN = '4821';

function adminCall(method: string, path: string, opts: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.79' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

describe.skipIf(!HAS_TEST_DB)('the visitors view on PostgreSQL (PR 700)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let A = 0;
  let owner = '';
  let tz = '';
  const ingestDeps = (): AnalyticsApiDeps => ({ analytics: { db: t.prisma }, accounts: null, resolver: deps.resolver, storeId: A });
  const V = (n: string) => n.replace(/[^a-z0-9]/g, '').padEnd(32, 'x');
  const view = (body: unknown, visitor: string, extra: Record<string, string> = {}) =>
    analyticsIngestHandler(new Request(`${ORIGIN}/api/shop/analytics`, { method: 'POST', headers: { host: 'shop.example.test', 'sec-fetch-site': 'same-origin', cookie: `${BAG_COOKIE}=${visitor}`, 'content-type': 'application/json', ...extra }, body: JSON.stringify(body) }), ingestDeps());

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('visitors700');
    [A] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    await deps.resolver.set('store.timeZone', 'Asia/Dhaka', storeTarget(A), { actorId: null, reason: 'test' });
    tz = 'Asia/Dhaka';
    owner = cookiesOf(await loginHandler(adminCall('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    const ownerRow = await t.prisma.staffUser.findUniqueOrThrow({ where: { email: 'owner@example.com' } });
    await setOwnerPin(t.prisma, { staffUserId: ownerRow.id }, { password: OWNER_PW, pin: PIN }, { minLength: 4, maxLength: 12, maxAttempts: 9, lockMinutes: 15 }, new Date());
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('with collect off a page view keeps only its page type', async () => {
    await view({ name: 'page_view', pageType: 'home', props: { ref: 'https://google.com', device: 'mobile', path: '/' } }, V('visitor-off-1'), { 'cf-region': 'Dhaka' });
    const row = await t.prisma.analyticsEvent.findFirstOrThrow({ where: { storeId: A, visitorId: V('visitor-off-1') } });
    expect(row.pageType).toBe('home');
    expect(row.props).toBeNull();
  });

  it('with collect on it keeps the shaped fields and the CDN region, and drops what is not on the list', async () => {
    await deps.resolver.set('analytics.visitors', { collect: true, keepDays: 90, liveWindowMinutes: 5, topCount: 10 }, storeTarget(A), { actorId: null, reason: 'test' });
    await view({ name: 'page_view', pageType: 'product', props: { ref: 'https://www.google.com/search?q=x', utm_source: 'Facebook', device: 'mobile', path: '/p/polo?token=1', sid: 'sess-aaaa1', ip: '203.0.113.9', phone: '01711223344' } }, V('visitor-on-1'), { 'cf-region': 'Dhaka' });
    await view({ name: 'page_view', pageType: 'home', props: { ref: 'https://shop.example.test/', device: 'desktop', path: '/', sid: 'sess-bbbb2' } }, V('visitor-on-2'));
    await view({ name: 'page_view', pageType: 'home', props: { device: 'mobile', path: '/', sid: 'sess-aaaa1' } }, V('visitor-on-1'));
    const row = await t.prisma.analyticsEvent.findFirstOrThrow({ where: { storeId: A, visitorId: V('visitor-on-1'), pageType: 'product' } });
    expect(row.props).toEqual({ ref: 'google.com', utm_source: 'facebook', device: 'mobile', path: '/p/polo', sid: 'sess-aaaa1', region: 'Dhaka' });
    expect(JSON.stringify(row.props)).not.toContain('203.0.113.9');
    expect(JSON.stringify(row.props)).not.toContain('0171');
  });

  it('the Overview counts visitors, sessions, live now, sources, pages, devices, regions and visit-to-order', async () => {
    const o = await t.prisma.order.count({ where: { storeId: A } });
    expect(o).toBe(0);
    const v = await visitorsView(deps, A, 30);
    expect(v.totals).toMatchObject({ views: 4, visitors: 3, orders: 0, conversionPct: 0 });
    expect(v.totals.sessions).toBe(3); // visitor-off-1 (no sid) + sess-aaaa1 + sess-bbbb2
    expect(v.live.now).toBe(3);
    expect(v.sources.map((s) => s.key).sort()).toEqual(['direct', 'facebook']);
    expect(v.pages.find((p) => p.key === 'home')).toMatchObject({ views: 3 });
    expect(v.devices.find((p) => p.key === 'mobile')).toMatchObject({ views: 2 });
    expect(v.regions).toEqual([{ key: 'Dhaka', views: 1, visitors: 1 }]);
    expect(v.paths.find((p) => p.key === '/p/polo')).toBeTruthy();
    expect(v.days.at(-1)!.views).toBe(4);
    expect(v.days).toHaveLength(30);
  });

  it('a past day is rolled up once; today is rebuilt every time; roll-ups past the keep days are removed', async () => {
    const today = ymdIn(new Date(), tz);
    await view({ name: 'page_view', pageType: 'bag' }, V('visitor-on-3'));
    const again = await visitorsView(deps, A, 30);
    expect(again.totals.views).toBe(5);
    const old = new Date(Date.now() - 200 * 86_400_000).toISOString().slice(0, 10);
    await t.prisma.pageViewDay.create({ data: { storeId: A, day: new Date(`${old}T00:00:00.000Z`), dim: 'all', key: '', views: 9, visitors: 9, sessions: 9 } });
    const yest = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    await t.prisma.pageViewDay.updateMany({ where: { storeId: A, day: new Date(`${yest}T00:00:00.000Z`), dim: 'all' }, data: { views: 77, visitors: 7, sessions: 7 } });
    await ensureRollups(t.prisma, A, yest, today, tz, today, 90);
    expect(await t.prisma.pageViewDay.count({ where: { storeId: A, day: new Date(`${old}T00:00:00.000Z`) } })).toBe(0);
    expect((await t.prisma.pageViewDay.findFirstOrThrow({ where: { storeId: A, day: new Date(`${yest}T00:00:00.000Z`), dim: 'all' } })).views).toBe(77); // a past day already rolled up is left alone
  });

  it('the settings need the PIN and the numbers must fit', async () => {
    const post = async (body: unknown) => {
      const res = await visitorsRoute(adminCall('POST', `/api/admin/analytics-visitors/settings?storeId=${A}`, { body, cookie: owner }), deps, ['settings']);
      return { status: res.status, body: (await res.json()) as Record<string, any> };
    };
    const good = { collect: false, keepDays: 60, liveWindowMinutes: 10, topCount: 5 };
    expect((await post({ ...good, pin: '0000' })).body.error).toBe('WRONG_PIN');
    expect((await post({ ...good, keepDays: 1, pin: PIN })).body.error).toBe('INVALID_INPUT');
    expect((await post({ ...good, pin: PIN })).status).toBe(200);
    const res = await visitorsRoute(adminCall('GET', `/api/admin/analytics-visitors?storeId=${A}&days=7`, { cookie: owner }), deps, []);
    const body = (await res.json()) as Record<string, any>;
    expect(body.cfg).toMatchObject({ collect: false, keepDays: 60 });
    expect(body.days).toHaveLength(7);
    expect(await t.prisma.auditLog.count({ where: { action: 'analytics.visitors.settings' } })).toBe(1);
  });
});

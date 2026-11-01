// S13 · PR 257 — server-side event tracking on a real PostgreSQL: off as it ships (nothing recorded); switched on by
// someone with `ads.tracking.manage` (audited); a product page, an add to the bag and the checkout are recorded with
// the server's own prices, colour and size, once per event id, and sent to each ticked platform's practice copy; a
// customer's contact only as hashes and only while matching is allowed; a failing platform is tried again up to the
// owner's number; the admin's test event goes to every platform and is never counted. A throwaway database (skipped
// without TEST_DATABASE_ADMIN_URL). Sample values.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { adEventAdapters, createConnections, defineAdapter, metaConversionsAdapter, mockAdOutbox } from '@extas/adapters';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { BAG_COOKIE } from '../shop/bag-model';
import { trackingHandler, type TrackingOverview } from './admin';
import { recordEvent, sendEvents, type TrackingDeps } from './service';
import { trackAddToBag, trackHandler, trackPurchase } from './shop';
import { ATTRIBUTION_COOKIE, encodeTouch, touchOf } from './attribution';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const S = MOTHER_STORE_ID;
const VISITOR = 'c2FtcGxlLXZpc2l0b3ItaWQtZm9yLXRlc3Rz';

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

function req(path: string, method: string, o: { body?: unknown; cookie?: string; referer?: string; ua?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': o.ua ?? 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.41', 'x-forwarded-proto': 'https' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (o.cookie) headers.cookie = o.cookie;
  if (o.referer) headers.referer = o.referer;
  if (o.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
}

describe.skipIf(!HAS_TEST_DB)('server-side event tracking on PostgreSQL (PR 257)', () => {
  let t: TestDatabase;
  let admin: AdminDeps;
  let deps: TrackingDeps;
  let owner = '';
  let reader = '';
  let lineId = '';

  const beacon = (path: string, id: string, cookie = '') => trackHandler(req('/api/shop/track', 'POST', { body: { path, id }, cookie }), S, deps);
  const api = async (method: string, b?: unknown, cookie = owner, query = '') => {
    const res = await trackingHandler(req(`/api/admin/marketing/tracking${query}`, method, { body: b, cookie }), admin, `https://${HOST}`, { defer: undefined });
    return { status: res.status, a: (await res.json()) as { ok: boolean; error?: string; overview: TrackingOverview; outcome?: { platforms: Record<string, { sent: number; mock: number; failed: number }> } } };
  };
  const rows = () => t.prisma.trackedEvent.findMany({ orderBy: { createdAt: 'asc' } });

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    const resolver = new SettingsResolver(prismaBackend(t.prisma), registry);
    admin = { db: t.prisma, resolver, vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    deps = { db: t.prisma, resolver, vault: null };
    owner = cookiesOf(await loginHandler(req('/api/admin/auth/login', 'POST', { body: { email: 'owner@example.com', password: OWNER_PW } }), admin));
    const role = await rolesHandler(req('/api/admin/roles', 'POST', { cookie: owner, body: { nameEn: 'Ads watch', nameBn: 'বিজ্ঞাপন দেখা', permissions: ['ads.tracking.read'] } }), admin);
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(req('/api/admin/staff', 'POST', { cookie: owner, body: { email: 'ads@example.com', displayName: 'Sample reader', password: 'first password from the owner' } }), admin);
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(req(`/api/admin/staff/${staffId}/roles`, 'POST', { cookie: owner, body: { action: 'assign', roleId, storeId: S } }), admin, staffId);
    const first = cookiesOf(await loginHandler(req('/api/admin/auth/login', 'POST', { body: { email: 'ads@example.com', password: 'first password from the owner' } }), admin));
    reader = cookiesOf(await passwordHandler(req('/api/admin/auth/password', 'POST', { cookie: first, body: { current: 'first password from the owner', next: 'my own words for this job' } }), admin));

    const db = t.prisma;
    const g = await db.garmentType.create({ data: { storeId: S, key: 'trk-polo', nameEn: 'Polo', nameBn: 'পোলো', measurementFields: [] } });
    const cat = await db.category.create({ data: { storeId: S, slug: 'trk-polos', nameEn: 'Polos', isVisible: true, garmentTypeId: g.id } });
    const p = await db.product.create({ data: { storeId: S, slug: 'trk-polo', nameEn: 'Sample polo', status: 'PUBLISHED', publishedAt: new Date(), categoryId: cat.id } });
    const colour = await db.colour.create({ data: { storeId: S, key: 'trk-navy', nameEn: 'Navy', hex: '#1f2a44' } });
    const size = await db.size.create({ data: { storeId: S, key: 'trk-m', label: 'M' } });
    const v = await db.productVariant.create({ data: { storeId: S, productId: p.id, sku: 'TRK-NVY-M', colourId: colour.id, sizeId: size.id, priceMinor: 120000, active: true } });
    const cart = await db.cart.create({ data: { storeId: S, visitorId: VISITOR } });
    lineId = (await db.cartItem.create({ data: { storeId: S, cartId: cart.id, variantId: v.id, quantity: 2, unitPriceMinor: 120000 } })).id;
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('is off as it ships: nothing is recorded', async () => {
    expect((await beacon('/p/trk-polo', 'pv-00000000-0001')).status).toBe(204);
    await trackAddToBag(req('/api/bag/lines', 'POST'), { storeId: S, lineId, quantity: 1 }, deps);
    expect(await rows()).toEqual([]);
    expect((await api('GET', undefined, '')).status).toBe(401);
    const { status, a } = await api('GET', undefined, reader);
    expect(status).toBe(200);
    expect(a.overview.card.value).toMatchObject({ on: false, platforms: { meta: false, google: false, tiktok: false }, matchCustomers: false });
    expect(a.overview.platforms.map((p) => [p.platform, p.mode])).toEqual([
      ['meta', 'MOCK'],
      ['google', 'MOCK'],
      ['tiktok', 'MOCK'],
    ]);
  });

  it('switching on needs ads.tracking.manage, is version-checked and audited', async () => {
    const card = (await api('GET')).a.overview.card;
    const on = { ...card.value, on: true, platforms: { meta: true, google: true, tiktok: false } };
    expect((await api('PUT', { key: 'tracking', value: on, version: card.version }, reader)).status).toBe(403);
    expect((await api('PUT', { key: 'tracking', value: on, version: 'old' })).a.error).toBe('STALE');
    expect((await api('PUT', { key: 'tracking', value: { ...on, platforms: { ...on.platforms, myspace: true } }, version: card.version })).a.error).toBe('INVALID_INPUT');
    const saved = await api('PUT', { key: 'tracking', value: on, version: card.version });
    expect(saved.status).toBe(200);
    expect(saved.a.overview.card.value).toMatchObject({ on: true, platforms: { meta: true, google: true, tiktok: false } });
    expect(await t.prisma.auditLog.count({ where: { action: 'ads.tracking.settings' } })).toBe(1);
  });

  it('a product page: the server’s own price, once per event id, sent to each ticked platform’s practice copy', async () => {
    mockAdOutbox.clear();
    await beacon('/bn/p/trk-polo', 'pv-00000000-0002');
    await beacon('/p/trk-polo', 'pv-00000000-0002'); // the same event again
    await beacon('/p/no-such-polo', 'pv-00000000-0003');
    await beacon('/bag', 'pv-00000000-0004');
    // the shop's own test browsers (smoke test, journeys, the lab run) are not shoppers
    expect((await trackHandler(req('/api/shop/track', 'POST', { body: { path: '/p/trk-polo', id: 'pv-00000000-0009' }, ua: 'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/140.0 Safari/537.36' }), S, deps)).status).toBe(204);
    const [r, ...more] = await rows();
    expect(more).toEqual([]);
    expect(r).toMatchObject({ name: 'view', eventId: 'pv-00000000-0002', valueMinor: 120000, currency: 'BDT', url: `https://${HOST}/bn/p/trk-polo`, pending: false, test: false });
    expect(r!.items).toEqual([expect.objectContaining({ name: 'Sample polo', category: 'Polos', quantity: 1, priceMinor: 120000 })]);
    expect(r!.deliveries).toMatchObject({ meta: { state: 'mock', attempts: 1 }, google: { state: 'mock', attempts: 1 } });
    expect(r!.deliveries).not.toHaveProperty('tiktok');
    expect(mockAdOutbox.all().map((m) => [m.platform, m.eventIds])).toEqual([
      ['meta', ['pv-00000000-0002']],
      ['google', ['pv-00000000-0002']],
    ]);
  });

  it('put in the bag and the checkout: the line’s colour, size and quantity; the bag read on the server', async () => {
    await trackAddToBag(req('/api/bag/lines', 'POST', { cookie: `${BAG_COOKIE}=${VISITOR}`, referer: `https://${HOST}/p/trk-polo` }), { storeId: S, lineId, quantity: 2 }, deps);
    await beacon('/checkout', 'pv-00000000-0005', `${BAG_COOKIE}=${VISITOR}`);
    await beacon('/checkout', 'pv-00000000-0006'); // no bag: nothing to tell
    const all = await rows();
    const add = all.find((r) => r.name === 'addToBag')!;
    expect(add).toMatchObject({ valueMinor: 240000, url: `https://${HOST}/p/trk-polo` });
    expect(add.items).toEqual([{ id: expect.any(String), sku: 'TRK-NVY-M', name: 'Sample polo', category: 'Polos', colour: 'Navy', size: 'M', quantity: 2, priceMinor: 120000 }]);
    expect((add.userData as Record<string, string>).ext).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(add.userData)).not.toContain(VISITOR);
    expect(all.filter((r) => r.name === 'checkout')).toHaveLength(1);
    expect(all.find((r) => r.name === 'checkout')).toMatchObject({ valueMinor: 240000 });
    // a page can never take an order's event id (it would hide the real order from the platforms)
    await beacon('/p/trk-polo', 'purchase-EX1001');
    expect(await t.prisma.trackedEvent.count({ where: { eventId: 'purchase-EX1001' } })).toBe(0);
    expect(await t.prisma.trackedEvent.count({ where: { name: 'view' } })).toBe(2);
    // an order that is not there is passed over quietly
    await trackPurchase(req('/api/checkout/orders', 'POST'), { storeId: S, orderId: '00000000-0000-7000-8000-000000000000' }, deps);
    expect(await t.prisma.trackedEvent.count({ where: { name: 'purchase' } })).toBe(0);
  });

  it('PR 257 follow-up: "Where an order came from" ships on, is version-checked and audited; its Facebook click is the fbc', async () => {
    const card = (await api('GET', undefined, reader)).a.overview.attribution;
    expect(card.value).toEqual({ on: true, keepDays: 30, touch: 'last' });
    expect((await api('PUT', { key: 'attribution', value: { ...card.value, keepDays: 7 }, version: card.version }, reader)).status).toBe(403);
    expect((await api('PUT', { key: 'attribution', value: { ...card.value, keepDays: 0 }, version: card.version })).a.error).toBe('INVALID_INPUT');
    expect((await api('PUT', { key: 'attribution', value: card.value, version: 'old' })).a.error).toBe('STALE');
    const saved = await api('PUT', { key: 'attribution', value: { ...card.value, keepDays: 7 }, version: card.version });
    expect(saved.a.overview.attribution.value).toEqual({ on: true, keepDays: 7, touch: 'last' });
    expect(await t.prisma.auditLog.count({ where: { action: 'ads.tracking.attribution' } })).toBe(1);
    // a visit from a Facebook ad with no pixel cookie: the click goes with the event as fbc
    const visit = touchOf(new URLSearchParams('utm_source=facebook&fbclid=IwAR3sampleClickId_01'), null, HOST, Date.now())!;
    const before = await t.prisma.trackedEvent.count({ where: { name: 'addToBag' } });
    await trackAddToBag(req('/api/bag/lines', 'POST', { cookie: `${BAG_COOKIE}=${VISITOR}; ${ATTRIBUTION_COOKIE}=${encodeTouch(visit)}` }), { storeId: S, lineId, quantity: 1 }, deps);
    const add = (await rows()).filter((r) => r.name === 'addToBag');
    expect(add).toHaveLength(before + 1);
    expect((add.at(-1)!.userData as Record<string, string>).fbc).toBe(visit.fbc);
  });

  it('a customer’s phone and e-mail only as hashes, and only while matching is allowed', async () => {
    const shopper = { visitorId: VISITOR, phone: '+8801711000000', email: 'Sample@Example.com' };
    await recordEvent(deps, { storeId: S, name: 'view', eventId: 'match-off-0001', url: null, items: [], shopper });
    const off = await t.prisma.trackedEvent.findFirstOrThrow({ where: { eventId: 'match-off-0001' } });
    expect(off.userData).not.toHaveProperty('em');
    const v = await deps.resolver.value('ads.tracking', { storeId: S });
    await deps.resolver.set('ads.tracking', { ...v, matchCustomers: true }, storeTarget(S), { actorId: null, reason: 'test' });
    await recordEvent(deps, { storeId: S, name: 'view', eventId: 'match-on-0001', url: null, items: [], shopper });
    const on = await t.prisma.trackedEvent.findFirstOrThrow({ where: { eventId: 'match-on-0001' } });
    expect(on.userData).toMatchObject({ em: expect.stringMatching(/^[0-9a-f]{64}$/), ph: expect.stringMatching(/^[0-9a-f]{64}$/), phPlus: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(JSON.stringify(on.userData)).not.toMatch(/8801711000000|sample@example/i);
  });

  it('a failing platform is tried again up to the owner’s number of attempts, the others are not held up', async () => {
    const v = await deps.resolver.value('ads.tracking', { storeId: S });
    await deps.resolver.set('ads.tracking', { ...v, maxAttempts: 2 }, storeTarget(S), { actorId: null, reason: 'test' });
    const down = defineAdapter({ ...metaConversionsAdapter, mock: async () => ({ provider: 'metaConversions', platform: 'meta' as const, send: async () => ({ ok: false as const, error: 'Meta did not answer' }) }) });
    const connections = createConnections({ db: t.prisma, vault: { get: async () => null }, adapters: [down, ...adEventAdapters.slice(1)], secretCacheMs: 0, testTimeoutMs: 1000 });
    const d = { ...deps, connections };
    const r = await recordEvent(d, { storeId: S, name: 'view', eventId: 'retry-0001', url: null, items: [], shopper: {} });
    let row = await t.prisma.trackedEvent.findUniqueOrThrow({ where: { id: r.id! } });
    expect(row.deliveries).toMatchObject({ meta: { state: 'failed', attempts: 1, error: 'Meta did not answer' }, google: { state: 'mock' } });
    expect(row.pending).toBe(true);
    await sendEvents(d, { ids: [r.id!] });
    row = await t.prisma.trackedEvent.findUniqueOrThrow({ where: { id: r.id! } });
    expect(row.deliveries).toMatchObject({ meta: { state: 'failed', attempts: 2 }, google: { state: 'mock', attempts: 1 } });
    expect(row.pending).toBe(false);
  });

  it('the admin’s test event goes to every platform in its test mode and is never counted', async () => {
    const before = (await api('GET')).a.overview;
    expect((await api('POST', { action: 'test' }, reader)).status).toBe(403);
    expect((await api('POST', { action: 'nope' })).a.error).toBe('INVALID_INPUT');
    mockAdOutbox.clear();
    const { status, a } = await api('POST', { action: 'test', event: 'purchase' });
    expect(status).toBe(200);
    expect(a.outcome!.platforms).toEqual({ meta: expect.objectContaining({ mock: 1 }), google: expect.objectContaining({ mock: 1 }), tiktok: expect.objectContaining({ mock: 1 }) });
    expect(mockAdOutbox.all().every((m) => m.test)).toBe(true);
    expect(a.overview.recorded).toEqual(before.recorded);
    expect(a.overview.recent[0]).toMatchObject({ name: 'purchase', test: true });
    expect(a.overview.table.view!.meta).toMatchObject({ mock: 4, failed: 1 });
    expect(await t.prisma.auditLog.count({ where: { action: 'ads.tracking.test' } })).toBe(1);
    const sent = await api('POST', { action: 'send' });
    expect(sent.a.outcome).toMatchObject({ events: 0 });
    expect(sent.a.overview.waiting).toBe(0);
  });
});

// S29 · PR 752 — Reports › Geography map's routes on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): every
// permission edge, the off state, the audited and validated card, Sales only with `books.read`, another store's id
// dropped, the CSV, the one-area panel. Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, createRole, defaultSecurityPolicy, hashPassword, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from '../admin-auth';
import { loginHandler } from '../admin-api';
import { geoMapShapesHandler } from './shapes';
import { clearGeoMapCache, geoMapAreaHandler, geoMapCsvHandler, geoMapHandler, geoMapSettingHandler } from './api';

const HOST = 'admin.example.test';
const PW = 'a long sentence for the tests';

function call(method: string, path: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.75' };
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

describe.skipIf(!HAS_TEST_DB)('Reports › Geography map routes on PostgreSQL (PR 752)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let reader = '';
  let nobody = '';
  const S = MOTHER_STORE_ID;
  const now = new Date('2026-11-16T06:00:00Z');
  const ids: Record<string, string> = {};
  const BASE = '/api/admin/reports/geo-map';

  const get = async (path: string, cookie = owner, handler = geoMapHandler) => {
    const r = await handler(call('GET', path, cookie), deps);
    return { status: r.status, res: r, text: await r.clone().text() };
  };
  const json = async (path: string, cookie = owner, handler = geoMapHandler) => {
    const g = await get(path, cookie, handler);
    return { status: g.status, j: JSON.parse(g.text) as Record<string, any> };
  };
  const card = async (method: string, body?: unknown, cookie = owner) => {
    const r = await geoMapSettingHandler(call(method, `${BASE}/setting`, cookie, body), deps);
    return { status: r.status, j: (await r.json()) as Record<string, any> };
  };

  async function user(email: string, key: string, permissions: string[]) {
    const role = await createRole(t.prisma, SYSTEM, { key, nameEn: key, nameBn: key, permissions: permissions as never });
    const u = await t.prisma.staffUser.create({ data: { email, displayName: key, passwordHash: await hashPassword(PW), passwordSetAt: new Date() } });
    await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
    return cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', undefined, { email, password: PW }), deps));
  }

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('geo-map-api');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')), now: () => now };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', undefined, { email: 'owner@example.com', password: PW }), deps));
    reader = await user('reader@example.com', 'geo-map-reader', ['reports.read']);
    nobody = await user('nobody@example.com', 'geo-map-nobody', ['orders.read']);

    const div = await t.prisma.geoArea.create({ data: { level: 'DIVISION', nameEn: 'Sample division', code: 'test.gm.div', ancestorIds: [], aliases: [], postcodes: [] } });
    ids.dhaka = (await t.prisma.geoArea.create({ data: { level: 'DISTRICT', nameEn: 'Sample Dhaka', code: 'test.gm.dhaka', parentId: div.id, ancestorIds: [div.id], aliases: [], postcodes: [] } })).id;
    const cat = await t.prisma.category.create({ data: { storeId: S, slug: 'sample-gm', nameEn: 'Sample polos' } });
    ids.cat = cat.id;
    const polo = await t.prisma.product.create({ data: { storeId: S, slug: 'sample-gm-polo', nameEn: 'Sample polo', categoryId: cat.id } });
    const at = new Date('2026-11-10T06:00:00Z');
    for (let i = 0; i < 3; i += 1) {
      const o = await t.prisma.order.create({
        data: { storeId: S, number: `GM752-${i}`, source: 'WEBSITE', currency: 'BDT', status: 'DELIVERED', placedAt: at, deliveredAt: at, areaId: ids.dhaka, subtotalMinor: 100_000, discountMinor: 0, deliveryChargeMinor: 0, totalMinor: 100_000, paymentMethod: 'COD', idempotencyKey: `gm752-${i}` },
      });
      await t.prisma.orderItem.create({ data: { storeId: S, orderId: o.id, productId: polo.id, sku: `SKU-GM-${i}`, productName: 'Sample', quantity: 2, unitPriceMinor: 50_000, lineTotalMinor: 100_000, status: 'ACTIVE' } });
    }
  });
  afterAll(async () => t?.drop());

  it('signed out is 401 on every route; a person without reports.read is 403', async () => {
    for (const [p, h] of [[BASE, geoMapHandler], [`${BASE}/csv`, geoMapCsvHandler], [`${BASE}/area?area=${ids.dhaka}`, geoMapAreaHandler]] as const) {
      expect((await get(p, '', h)).status, p).toBe(401);
      expect((await get(p, nobody, h)).status, p).toBe(403);
    }
    expect((await card('GET', undefined, '')).status).toBe(401);
    expect((await card('GET', undefined, nobody)).status).toBe(403);
  });

  it('is off as shipped: the figure routes answer "not on" and read nothing; the card shows it off', async () => {
    for (const [p, h] of [[BASE, geoMapHandler], [`${BASE}/csv`, geoMapCsvHandler], [`${BASE}/area?area=${ids.dhaka}`, geoMapAreaHandler]] as const) {
      const r = await json(p, owner, h).catch(() => null);
      const g = await get(p, owner, h);
      expect(g.status, p).toBe(404);
      expect(JSON.parse(g.text), p).toMatchObject({ ok: false, error: 'not_on' });
      expect(r).not.toBeNull();
    }
    const c = await card('GET');
    expect(c.status).toBe(200);
    expect(c.j.card.value.on).toBe(false);
    expect(c.j.card.key).toBe('reports.geoMap');
  });

  it('only settings.write changes the card; it is audited, validated, stale-safe and refuses unknown fields', async () => {
    expect((await card('PUT', { on: true }, reader)).status).toBe(403);
    expect((await card('PUT', { values: { minOrders: -1 } })).status).toBe(400);
    const bad = await card('PUT', { on: true, values: { budgetShift: 5 } });
    expect(bad.status).toBe(400);
    const stale = await card('PUT', { on: true, version: 'old' });
    expect(stale.status).toBe(409);
    const ok = await card('PUT', { on: true, values: { minOrders: 2, cacheSeconds: 0 } });
    expect(ok.status).toBe(200);
    expect(ok.j.card.value).toMatchObject({ on: true, minOrders: 2, cacheSeconds: 0 });
    expect(await t.prisma.auditLog.count({ where: { action: 'reports.geoMap.settings' } })).toBe(1);
    // the same save again changes nothing and writes no second audit row
    expect((await card('PUT', { on: true, values: { minOrders: 2, cacheSeconds: 0 } })).status).toBe(200);
    expect(await t.prisma.auditLog.count({ where: { action: 'reports.geoMap.settings' } })).toBe(1);
    clearGeoMapCache();
  });

  it('on: the figures by district for the month; Sales only with books.read; the counts stay for a reader', async () => {
    const q = '?period=month&level=district';
    const o = await json(`${BASE}${q}`);
    expect(o.status).toBe(200);
    expect(o.j).toMatchObject({ ok: true, moneyHidden: false });
    expect(o.j.data.rows[0]).toMatchObject({ nameEn: 'Sample Dhaka', code: 'test.gm.dhaka' });
    expect(o.j.data.rows[0].current).toMatchObject({ orders: 3, delivered: 3, salesMinor: 300_000, pieces: 6 });
    expect(o.j.data.query.days).toEqual({ from: '2026-11-01', to: '2026-11-16' });
    const r = await json(`${BASE}${q}`, reader);
    expect(r.j).toMatchObject({ ok: true, moneyHidden: true });
    expect(r.j.data.rows[0].current).toMatchObject({ orders: 3, delivered: 3, salesMinor: null });
    expect(JSON.stringify(r.j)).not.toMatch(/"salesMinor":\d/);
  });

  it('compare, another store’s category and a made-up level are all kept safe', async () => {
    const c = await json(`${BASE}?period=month&compare=previous`);
    expect(c.j.data.query.compareDays).toEqual({ from: '2026-10-16', to: '2026-10-31' });
    expect(c.j.data.rows[0].previous).toMatchObject({ orders: 0 });
    const own = await json(`${BASE}?category=${ids.cat}`);
    expect(own.j.data.total.delivered).toBe(3);
    const other = await json(`${BASE}?category=00000000-0000-4000-8000-000000000001`);
    expect(other.j.data.total.delivered).toBe(3); // an id that is not this store's category is dropped, not an empty map
    expect((await json(`${BASE}?level=planet`)).j.data.query.level).toBe('district');
    expect((await get(`${BASE}?storeId=0`)).status).toBe(400);
  });

  it('the CSV has no Sales column for a reader and carries the same rows', async () => {
    const o = await get(`${BASE}/csv?period=month`, owner, geoMapCsvHandler);
    expect(o.status).toBe(200);
    expect(o.res.headers.get('content-type')).toMatch(/text\/csv/);
    expect(o.res.headers.get('content-disposition')).toMatch(/geography-district-2026-11-01-2026-11-16\.csv/);
    expect(o.text.split('\r\n')[0]).toContain('salesMinor');
    expect(o.text).toContain('test.gm.dhaka');
    const r = await get(`${BASE}/csv?period=month`, reader, geoMapCsvHandler);
    expect(r.text.split('\r\n')[0]).not.toContain('salesMinor');
    expect(r.text).not.toContain('300000');
  });

  it('one area’s panel: its figures and best sellers; a bad id is 400, a made-up area 404; Sales hidden for a reader', async () => {
    const o = await json(`${BASE}/area?area=${ids.dhaka}&period=month`, owner, geoMapAreaHandler);
    expect(o.status).toBe(200);
    expect(o.j.detail).toMatchObject({ areaId: ids.dhaka, level: 'district' });
    expect(o.j.detail.current).toMatchObject({ delivered: 3, salesMinor: 300_000 });
    expect(o.j.detail.topProducts[0]).toMatchObject({ nameEn: 'Sample polo', pieces: 6, salesMinor: 300_000 });
    const r = await json(`${BASE}/area?area=${ids.dhaka}&period=month`, reader, geoMapAreaHandler);
    expect(r.j.detail.topProducts[0].salesMinor).toBeNull();
    expect((await json(`${BASE}/area?area=nope`, owner, geoMapAreaHandler)).status).toBe(400);
    expect((await json(`${BASE}/area?area=00000000-0000-4000-8000-000000000002`, owner, geoMapAreaHandler)).status).toBe(404);
  });

  it('the shapes route (PR 753): reports.read only, one level at a time, kept a day by the browser, "not on" when off', async () => {
    const S1 = `${BASE}/shapes?level=district`;
    expect((await get(S1, '', geoMapShapesHandler)).status).toBe(401);
    expect((await get(S1, nobody, geoMapShapesHandler)).status).toBe(403);
    const ok = await get(S1, reader, geoMapShapesHandler);
    expect(ok.status).toBe(200);
    expect(ok.res.headers.get('cache-control')).toMatch(/max-age=\d+/);
    const pack = JSON.parse(ok.text).pack;
    expect(pack.level).toBe('district');
    expect(pack.shapes.length).toBeGreaterThan(60);
    expect(pack.attribution).toMatch(/geoBoundaries/);
    expect((await get(`${BASE}/shapes?level=planet`, owner, geoMapShapesHandler)).status).toBe(400);
    expect((await get(`${BASE}/shapes?level=area`, owner, geoMapShapesHandler)).status).toBe(200);
    await card('PUT', { on: false });
    expect((await get(S1, owner, geoMapShapesHandler)).status).toBe(404);
    await card('PUT', { on: true });
  });

  it('switching it off again makes every figure route answer "not on"', async () => {
    expect((await card('PUT', { on: false })).status).toBe(200);
    expect((await get(BASE)).status).toBe(404);
  });
});

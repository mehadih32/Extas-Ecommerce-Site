// S12 · PR 592 — the journal's house ads on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): off as shipped
// (no ad on any page, a click only sends the reader to the journal, no order credited); a new ad and place start off;
// on: the most relevant running ad per place, a product ad only while its product is live, a banner only with its
// picture, dates as whole shop days; a click counted once a place per day row with the cookie, then the order credited
// once to the last click in the window; the page's report (clicks, orders) and the card saved as the switch card sends
// it; switch / set aside / bring back, audited, never deleted; another site 403, signed out 401. Made-up values.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from '../admin-auth';
import { loginHandler } from '../admin-api';
import { AD_CLICK_COOKIE } from './house-ads-model';
import { adsHandler, adsScreen, clickHandler, creditAdOrder, pageAds, viewsHandler } from './house-ads';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, opts: { cookie?: string; body?: unknown; site?: 'cross-site' } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.71' };
  if (method !== 'GET') headers.origin = opts.site ? 'https://elsewhere.example' : `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

describe.skipIf(!HAS_TEST_DB)('Website › Blog & journal › House ads on PostgreSQL (PR 592)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  const S = MOTHER_STORE_ID;
  const clock = { now: new Date('2026-11-10T06:00:00Z') };
  const ids: Record<string, string> = {};
  let orderN = 0;
  const api = async (method: 'GET' | 'POST' | 'PUT', body?: unknown, path = '/api/admin/blog/ads') => {
    const r = await adsHandler(call(method, path, { cookie: owner, body }), deps);
    return { status: r.status, body: (await r.json()) as Record<string, unknown> & { id?: string; details?: string[]; screen?: Awaited<ReturnType<typeof adsScreen>> } };
  };
  const set = async (patch: Record<string, unknown>) => {
    const v = await deps.resolver.value('blog.houseAds', { storeId: S });
    await deps.resolver.set('blog.houseAds', { ...v, ...patch } as never, storeTarget(S), { actorId: null, reason: 'test' });
  };
  // the shop's live cards: only a product a customer may see now (as the catalogue's liveCardsByIds)
  const cards = async (wanted: string[]) => (await t.prisma.product.findMany({ where: { id: { in: wanted }, status: 'PUBLISHED' }, select: { id: true, nameEn: true, nameBn: true } })).map((p) => ({ ...p, photos: {} }));
  const page = (facts: { postId?: string | null; categoryIds?: string[]; productIds?: string[] }, slots: Parameters<typeof pageAds>[2]['slots']) =>
    pageAds(t.prisma, deps.resolver, { storeId: S, lang: 'en', page: { postId: facts.postId ?? null, categoryIds: facts.categoryIds ?? [], productIds: facts.productIds ?? [] }, slots, now: clock.now }, { cards, rnd: () => 0 });
  const click = (placeId: string) => clickHandler(new Request(`https://${HOST}/api/shop/house-ad?p=${placeId}`), { db: t.prisma, settings: deps.resolver, storeId: S, now: () => clock.now });
  const order = async (placedAt: Date) => {
    orderN += 1;
    return (
      await t.prisma.order.create({
        data: { storeId: S, number: `T592-${orderN}`, source: 'WEBSITE', currency: 'BDT', status: 'PLACED', placedAt, subtotalMinor: 100_000, discountMinor: 0, deliveryChargeMinor: 0, totalMinor: 100_000, paymentMethod: 'COD', idempotencyKey: `t592-${orderN}` },
      })
    ).id;
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('house-ads');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')), now: () => clock.now };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    ids.polo = (await t.prisma.product.create({ data: { storeId: S, slug: 'sample-polo', nameEn: 'Sample polo', status: 'PUBLISHED' } })).id;
    ids.combo = (await t.prisma.combo.create({ data: { storeId: S, slug: 'sample-set', nameEn: 'Sample set', status: 'RUNNING', type: 'FIXED_SET', pieceCount: 2 } })).id;
    ids.care = (await t.prisma.blogCategory.create({ data: { storeId: S, slug: 'care', nameEn: 'Care' } })).id;
    ids.post = (await t.prisma.blogPost.create({ data: { storeId: S, locale: 'en', slug: 'how-to-wash', title: 'How to wash', body: 'Words.', status: 'PUBLISHED', categoryId: ids.care } })).id;
  });
  afterAll(async () => t?.drop());

  it('as shipped nothing shows and a click only sends the reader to the journal', async () => {
    expect((await deps.resolver.value('blog.houseAds', { storeId: S })).on).toBe(false);
    expect((await page({}, ['listTop'])).ads).toEqual([]);
    const r = await click('00000000-0000-4000-8000-000000000001');
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('/journal');
    expect(r.headers.get('set-cookie')).toBeNull();
  });

  it('a new ad and its new place start switched off; a wrong field is named', async () => {
    const bad = await api('POST', { op: 'ad', ad: { name: 'X', kind: 'banner', target: 'https://elsewhere.example', weight: 1, headlineEn: 'X' } });
    expect(bad.status).toBe(400);
    expect(bad.body.details).toEqual(expect.arrayContaining(['target']));
    const a = await api('POST', { op: 'ad', ad: { name: 'Polo week', kind: 'product', target: ids.polo, weight: 2, headlineEn: 'Polos for the heat', startsOn: '2026-11-10', endsOn: '2026-11-12' } });
    expect(a.status).toBe(200);
    ids.ad = a.body.id!;
    const p = await api('POST', { op: 'place', adId: ids.ad, place: { slot: 'end', scope: 'all' } });
    ids.end = p.body.id!;
    const row = await t.prisma.houseAd.findUniqueOrThrow({ where: { id: ids.ad }, include: { placements: true } });
    expect(row.enabled).toBe(false);
    expect(row.placements.map((x) => x.enabled)).toEqual([false]);
    expect(row.startsAt!.toISOString()).toBe('2026-11-09T18:00:00.000Z');
    expect(row.endsAt!.toISOString()).toBe('2026-11-12T18:00:00.000Z');
    expect(await t.prisma.auditLog.count({ where: { action: { startsWith: 'blog.houseAd' } } })).toBe(2);
  });

  it('on: a running ad in a switched-on place shows; the most relevant wins; a product ad only while its product is live', async () => {
    await set({ on: true });
    expect((await page({}, ['end'])).ads).toEqual([]);
    await api('POST', { op: 'switch', what: 'ad', ids: [ids.ad], on: true });
    await api('POST', { op: 'switch', what: 'place', ids: [ids.end], on: true });
    const one = await page({ postId: ids.post, categoryIds: [ids.care!] }, ['end']);
    expect(one.ads.map((a) => [a.slot, a.headline, a.href])).toEqual([['end', 'Polos for the heat', `/api/shop/house-ad?p=${ids.end}`]]);
    // a combo ad only for the Care topic beats an ad for all pages
    const c = await api('POST', { op: 'ad', ad: { name: 'Care set', kind: 'combo', target: ids.combo, weight: 1, headlineEn: 'The care set' } });
    ids.comboAd = c.body.id!;
    const cp = await api('POST', { op: 'place', adId: ids.comboAd, place: { slot: 'end', scope: 'category', blogCategoryId: ids.care } });
    await api('POST', { op: 'switch', what: 'ad', ids: [ids.comboAd], on: true });
    await api('POST', { op: 'switch', what: 'place', ids: [cp.body.id], on: true });
    expect((await page({ postId: ids.post, categoryIds: [ids.care!] }, ['end'])).ads.map((a) => a.headline)).toEqual(['The care set']);
    expect((await page({ postId: null, categoryIds: [] }, ['end'])).ads.map((a) => a.headline)).toEqual(['Polos for the heat']);
    // outside its days the product ad rests
    clock.now = new Date('2026-11-12T18:00:00Z');
    expect((await page({}, ['end'])).ads).toEqual([]);
    clock.now = new Date('2026-11-10T06:00:00Z');
    // its product taken off the shop: the ad does not show
    await t.prisma.product.update({ where: { id: ids.polo }, data: { status: 'UNPUBLISHED' } });
    expect((await page({}, ['end'])).ads).toEqual([]);
    await t.prisma.product.update({ where: { id: ids.polo }, data: { status: 'PUBLISHED' } });
  });

  it('a banner shows only with a rendered picture of its own', async () => {
    const asset = await t.prisma.mediaAsset.create({ data: { storeId: S, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: 'sample/banner.jpg', mimeType: 'image/jpeg', bytes: 10, checksumSha256: 'a'.repeat(64) } });
    const b = await api('POST', { op: 'ad', ad: { name: 'Banner', kind: 'banner', target: '/collections/polo', creativeAssetId: asset.id, weight: 1, headlineEn: 'Banner' } });
    const bp = await api('POST', { op: 'place', adId: b.body.id, place: { slot: 'listTop', scope: 'all' } });
    await api('POST', { op: 'switch', what: 'ad', ids: [b.body.id], on: true });
    await api('POST', { op: 'switch', what: 'place', ids: [bp.body.id], on: true });
    expect((await page({}, ['listTop'])).ads).toEqual([]);
  });

  it('a click is counted once a place per day row, keeps the cookie, sends the reader on; the order credits it once', async () => {
    const r = await click(ids.end!);
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('/p/sample-polo');
    const cookie = r.headers.get('set-cookie')!;
    expect(cookie).toContain(`${AD_CLICK_COOKIE}=`);
    expect(cookie).toContain('Max-Age=604800');
    await click(ids.end!);
    const stat = await t.prisma.houseAdDailyStat.findFirstOrThrow({ where: { placementId: ids.end } });
    expect(stat.clicks).toBe(2);
    const raw = decodeURIComponent(cookie.split(';')[0]!.split('=')[1]!);
    const o = await order(new Date('2026-11-10T07:00:00Z'));
    expect(await creditAdOrder(t.prisma, deps.resolver, { storeId: S, orderId: o, cookie: raw })).toBe(1);
    expect(await creditAdOrder(t.prisma, deps.resolver, { storeId: S, orderId: o, cookie: raw })).toBe(0);
    const late = await order(new Date('2026-11-20T06:00:00Z'));
    expect(await creditAdOrder(t.prisma, deps.resolver, { storeId: S, orderId: late, cookie: raw })).toBe(0);
    const screen = (await api('GET', undefined, '/api/admin/blog/ads?days=7')).body.screen!;
    const ad = screen.ads.find((a) => a.id === ids.ad)!;
    expect(ad.clicks).toBe(2);
    expect(ad.ordered.orders).toBe(1);
    expect(screen.totals).toMatchObject({ clicks: 2, orders: 1 });
  });

  it('follow-up: views are counted only while "count views" is on, once per place a report, only from the shop\'s own pages', async () => {
    const seen = (p: unknown, origin = `https://${HOST}`) =>
      viewsHandler(new Request(`https://${HOST}/api/shop/house-ad/seen`, { method: 'POST', headers: { host: HOST, origin, 'content-type': 'text/plain' }, body: JSON.stringify({ p }) }), { db: t.prisma, settings: deps.resolver, storeId: S, now: () => clock.now });
    const views = async () => (await t.prisma.houseAdDailyStat.findFirstOrThrow({ where: { placementId: ids.end } })).views;
    expect((await seen([ids.end])).status).toBe(204);
    expect(await views()).toBe(0); // off as shipped
    await set({ countViews: true });
    await seen([ids.end, ids.end, 'not-an-id', '00000000-0000-7000-8000-00000000abcd']);
    await seen([ids.end]);
    expect(await views()).toBe(2);
    await seen([ids.end], 'https://elsewhere.example');
    expect(await views()).toBe(2);
    expect((await viewsHandler(new Request(`https://${HOST}/api/shop/house-ad/seen`, { method: 'POST', headers: { host: HOST }, body: '{broken' }), { db: t.prisma, settings: deps.resolver, storeId: S })).status).toBe(204);
    const screen = (await api('GET', undefined, '/api/admin/blog/ads?days=7')).body.screen!;
    const ad = screen.ads.find((a) => a.id === ids.ad)!;
    expect(ad.views).toBe(2);
    expect(ad.places.find((x) => x.id === ids.end)).toMatchObject({ views: 2, clicks: 2 });
    expect(screen.totals.views).toBe(2);
    await set({ countViews: false });
  });

  it('set aside switches off and keeps the ad (never deleted); bring back leaves it off', async () => {
    const r = await api('POST', { op: 'switch', what: 'ad', ids: [ids.comboAd], aside: true });
    expect(r.body.changed).toBe(1);
    let row = await t.prisma.houseAd.findUniqueOrThrow({ where: { id: ids.comboAd } });
    expect(row.archivedAt).not.toBeNull();
    expect(row.enabled).toBe(false);
    expect((await api('POST', { op: 'switch', what: 'ad', ids: [ids.comboAd], on: true })).body.changed).toBe(0);
    await api('POST', { op: 'switch', what: 'ad', ids: [ids.comboAd], aside: false });
    row = await t.prisma.houseAd.findUniqueOrThrow({ where: { id: ids.comboAd } });
    expect(row).toMatchObject({ archivedAt: null, enabled: false });
  });

  it('the card as the switch card sends it (the search guard as its choice), audited; a wrong number refused', async () => {
    const ok = await api('PUT', { key: 'blog.houseAds', on: true, values: { maxPerPage: 2, searchGuard: 'off' } });
    expect(ok.status).toBe(200);
    expect(await deps.resolver.value('blog.houseAds', { storeId: S })).toMatchObject({ on: true, maxPerPage: 2, searchGuard: false });
    expect((await api('PUT', { key: 'blog.houseAds', on: true, values: { maxPerPage: 9 } })).status).toBe(400);
    expect(await t.prisma.auditLog.count({ where: { action: 'blog.houseAds.settings' } })).toBe(1);
  });

  it('another site is refused, a signed-out caller too', async () => {
    expect((await adsHandler(call('POST', '/api/admin/blog/ads', { cookie: owner, body: { op: 'switch' }, site: 'cross-site' }), deps)).status).toBe(403);
    expect((await adsHandler(call('GET', '/api/admin/blog/ads'), deps)).status).toBe(401);
  });
});

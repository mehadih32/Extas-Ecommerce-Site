// S13 · PR 254 — Marketing › Landing pages on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): a page made
// with its parts, saved again with its version (a stale one refused), the link taken twice refused, publish refused
// while the product is not on sale and allowed once it is, the shop's read of it, take down / archive / restore (never
// deleted), the orders each page brought and how many were delivered, the master switch saved and audited; signed out
// 401. Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from '../admin-auth';
import { loginHandler } from '../admin-api';
import { landingHandler, publishedLanding } from './landing';

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

describe.skipIf(!HAS_TEST_DB)('Marketing › Landing pages on PostgreSQL (PR 254)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let productId = '';
  const api = async (method: string, id: string | null, body?: unknown, cookie = owner) => {
    const r = await landingHandler(call(method, `/api/admin/marketing/landing-pages${id ? `/${id}` : ''}`, cookie, body), deps, id);
    return { status: r.status, j: (await r.json()) as Record<string, any> };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('landing');
    const [A] = await seedSampleStores(t.prisma);
    expect(A).toBe(MOTHER_STORE_ID);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', undefined, { email: 'owner@example.com', password: OWNER_PW }), deps));
    const S = MOTHER_STORE_ID;
    const g = await t.prisma.garmentType.create({ data: { storeId: S, key: 'lp-polo', nameEn: 'Polo', nameBn: 'পোলো', measurementFields: [] } });
    const cat = await t.prisma.category.create({ data: { storeId: S, slug: 'lp-polos', nameEn: 'Polos', isVisible: true, garmentTypeId: g.id } });
    productId = (await t.prisma.product.create({ data: { storeId: S, slug: 'lp-polo', nameEn: 'Sample polo', status: 'DRAFT', categoryId: cat.id } })).id;
  });
  afterAll(async () => t?.drop());

  it('makes a page with its parts, saves it again at its version, refuses a stale save and a link taken twice', async () => {
    const input = { titleEn: 'Polo Duo', titleBn: null, slug: 'polo-duo', productId, campaignId: null, sections: { timer: { on: true, config: { endsAt: '2026-12-01T00:00:00+06:00' } }, benefits: { on: true, config: { lines: [{ en: 'Breathes in the heat', bn: null }] } }, reviews: { on: false } }, version: null };
    const made = await api('POST', null, input);
    expect(made.status).toBe(201);
    const p = made.j.page;
    expect(p).toMatchObject({ slug: 'polo-duo', state: 'draft', orders: 0 });
    expect(p.sections.map((s: { key: string; on: boolean }) => `${s.key}:${s.on}`)).toEqual(['hero:true', 'gallery:true', 'benefits:true', 'size:true', 'reviews:false', 'form:true', 'faq:true', 'timer:true']);
    expect(p.sections.find((s: { key: string }) => s.key === 'benefits').config.lines[0].en).toBe('Breathes in the heat');
    expect(await t.prisma.pageSection.count({ where: { pageId: p.id } })).toBe(3);

    const saved = await api('PUT', p.id, { ...input, titleEn: 'Polo Duo · any 2', sections: { reviews: { on: true } }, version: p.version });
    expect(saved.status).toBe(200);
    expect(saved.j.page.titleEn).toBe('Polo Duo · any 2');
    expect(saved.j.page.sections.find((s: { key: string }) => s.key === 'reviews').on).toBe(true);
    expect((await api('PUT', p.id, { ...input, version: p.version })).j.error).toBe('STALE');
    expect((await api('POST', null, { ...input, titleEn: 'Another' })).j).toMatchObject({ error: 'SLUG_TAKEN', details: ['slug'] });
    expect((await api('POST', null, { ...input, slug: 'x2', productId: '0190a0a0-0000-7000-8000-000000000001' })).j).toMatchObject({ error: 'INVALID_INPUT', details: ['productId'] });
    expect((await api('GET', 'not-a-page')).status).toBe(404);
    expect(await t.prisma.auditLog.count({ where: { action: { in: ['marketing.landing.create', 'marketing.landing.save'] } } })).toBe(2);
  });

  it('publish waits for the product to be on sale; the shop reads it; take down, archive and restore keep the row', async () => {
    const list = await api('GET', null);
    const id = list.j.list.rows[0].id;
    let v = (await api('GET', id)).j.page.version;
    expect((await api('POST', id, { action: 'publish', version: v })).j.error).toBe('PRODUCT_OFF');
    expect(await publishedLanding(t.prisma, MOTHER_STORE_ID, 'polo-duo')).toBeNull();
    await t.prisma.product.update({ where: { id: productId }, data: { status: 'PUBLISHED', publishedAt: new Date() } });
    const pub = await api('POST', id, { action: 'publish', version: v });
    expect(pub.j.page.state).toBe('live');
    const shop = await publishedLanding(t.prisma, MOTHER_STORE_ID, 'polo-duo');
    expect(shop).toMatchObject({ id, productId, titleEn: 'Polo Duo · any 2' });
    expect(shop!.sections.find((s) => s.key === 'timer')?.on).toBe(true);
    v = pub.j.page.version;
    expect((await api('POST', id, { action: 'restore', version: v })).j.error).toBe('WRONG_STATE');
    v = (await api('POST', id, { action: 'unpublish', version: v })).j.page.version;
    expect(await publishedLanding(t.prisma, MOTHER_STORE_ID, 'polo-duo')).toBeNull();
    const arch = await api('POST', id, { action: 'archive', version: v });
    expect(arch.j.page.state).toBe('archived');
    expect((await api('PUT', id, { titleEn: 'x', slug: 'polo-duo', productId, sections: {}, version: arch.j.page.version })).j.error).toBe('ARCHIVED');
    const back = await api('POST', id, { action: 'restore', version: arch.j.page.version });
    expect(back.j.page.state).toBe('draft');
    expect(await t.prisma.page.count({ where: { id } })).toBe(1);
  });

  it('counts the orders each page brought and the delivered ones; the switch is saved with its version and audited', async () => {
    const id = (await api('GET', null)).j.list.rows[0].id;
    const order = (n: number, delivered: boolean) =>
      t.prisma.order.create({
        data: { storeId: MOTHER_STORE_ID, number: `W254-${n}`, source: 'LANDING_PAGE', landingPageId: id, currency: 'BDT', status: delivered ? 'DELIVERED' : 'PLACED', deliveredAt: delivered ? new Date() : null, subtotalMinor: 150_000, deliveryChargeMinor: 0, totalMinor: 150_000, paymentMethod: 'COD', idempotencyKey: `w254-${n}` },
      });
    await order(1, true);
    await order(2, false);
    const l = (await api('GET', null)).j.list;
    expect(l.rows[0]).toMatchObject({ orders: 2, delivered: 1 });
    expect(l.kpis).toMatchObject({ orders: 2, delivered: 1, live: 0 });
    expect(l.card.value).toEqual({ on: false });
    expect((await api('PUT', null, { key: 'landing', value: { on: true }, version: 'old' })).j.error).toBe('STALE');
    const on = await api('PUT', null, { key: 'landing', value: { on: true }, version: l.card.version });
    expect(on.j.cards.landing.value).toEqual({ on: true });
    expect(await deps.resolver.value('marketing.landing', { storeId: MOTHER_STORE_ID })).toEqual({ on: true });
    expect(await t.prisma.auditLog.count({ where: { action: 'marketing.landing.settings' } })).toBe(1);
  });

  it('signed out is 401', async () => {
    expect((await api('GET', null, undefined, '')).status).toBe(401);
  });
});

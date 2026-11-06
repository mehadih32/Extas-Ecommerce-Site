// S12 · PR 246 — Marketing › Landing pages › Seasonal pages on a real PostgreSQL (skipped without
// TEST_DATABASE_ADMIN_URL): a page made for an occasion with its parts, saved again at its version (a stale one refused),
// a link a category or "New in" answers at refused, an occasion not on the owner's list refused, going live refused
// until its collection and journal category are set, the shop's read (live; its resting page once taken down or put
// away; nothing for a draft or while the switch is off), restore never makes it live, the card saved and audited;
// signed out 401. Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from '../admin-auth';
import { loginHandler } from '../admin-api';
import { seasonalHandler, servedSeasonal } from './seasonal';

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

describe.skipIf(!HAS_TEST_DB)('Marketing › Landing pages › Seasonal pages on PostgreSQL (PR 246)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let colId = '';
  let catId = '';
  const api = async (method: string, id: string | null, body?: unknown, cookie = owner) => {
    const r = await seasonalHandler(call(method, `/api/admin/marketing/seasonal-pages${id ? `/${id}` : ''}`, cookie, body), deps, id);
    return { status: r.status, j: (await r.json()) as Record<string, any> };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('seasonal');
    const [A] = await seedSampleStores(t.prisma);
    expect(A).toBe(MOTHER_STORE_ID);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', undefined, { email: 'owner@example.com', password: OWNER_PW }), deps));
    const S = MOTHER_STORE_ID;
    const g = await t.prisma.garmentType.create({ data: { storeId: S, key: 'sp-panjabi', nameEn: 'Panjabi', nameBn: 'পাঞ্জাবি', measurementFields: [] } });
    await t.prisma.category.create({ data: { storeId: S, slug: 'sp-panjabi', nameEn: 'Panjabi', isVisible: true, garmentTypeId: g.id } });
    colId = (await t.prisma.collection.create({ data: { storeId: S, slug: 'eid-picks', nameEn: 'Eid picks', kind: 'SEASONAL' } })).id;
    catId = (await t.prisma.blogCategory.create({ data: { storeId: S, slug: 'sp-season', nameEn: 'Occasions' } })).id;
  });
  afterAll(async () => t?.drop());

  const input = () => ({ titleEn: 'Eid collection', titleBn: 'ঈদের কালেকশন', slug: 'eid', occasion: 'eid', introEn: 'Panjabi and polos for the whole Eid weekend.', introBn: null, sections: { timer: { on: false }, reasons: { on: true, config: { lines: [{ en: 'Fine cotton voile', bn: null }] } } }, version: null as string | null });

  it('makes a page for its occasion, saves it again at its version, refuses a stale save, a taken link and an unknown occasion', async () => {
    const made = await api('POST', null, input());
    expect(made.status).toBe(201);
    const p = made.j.page;
    expect(p).toMatchObject({ slug: 'eid', occasion: 'eid', state: 'draft', lastLive: null, introEn: 'Panjabi and polos for the whole Eid weekend.' });
    expect(p.sections.map((s: { key: string; on: boolean }) => `${s.key}:${s.on}`)).toEqual(['hero:true', 'cutoff:true', 'timer:false', 'products:true', 'reasons:true', 'articles:true']);
    expect(await t.prisma.page.findFirst({ where: { id: p.id }, select: { kind: true, recurrence: true } })).toEqual({ kind: 'SEASONAL', recurrence: { occasion: 'eid' } });

    const saved = await api('PUT', p.id, { ...input(), sections: { products: { on: true, config: { collectionId: colId } }, articles: { on: true, config: { categoryId: catId } } }, version: p.version });
    expect(saved.status).toBe(200);
    expect(saved.j.page.sections.find((s: { key: string }) => s.key === 'products').config.collectionId).toBe(colId);
    expect((await api('PUT', p.id, { ...input(), version: p.version })).j.error).toBe('STALE');
    expect((await api('POST', null, { ...input(), titleEn: 'Another' })).j).toMatchObject({ error: 'SLUG_TAKEN', details: ['slug'] });
    expect((await api('POST', null, { ...input(), slug: 'sp-panjabi' })).j).toMatchObject({ error: 'SLUG_TAKEN' });
    expect((await api('POST', null, { ...input(), slug: 'new-in' })).j).toMatchObject({ error: 'SLUG_TAKEN' });
    expect((await api('POST', null, { ...input(), slug: 'boishakh', occasion: 'boishakh' })).j).toMatchObject({ error: 'INVALID_INPUT', details: ['occasion'] });
    expect((await api('POST', null, { ...input(), slug: 'x2', sections: { products: { on: true, config: { collectionId: '0190a0a0-0000-7000-8000-000000000001' } } } })).j).toMatchObject({ error: 'INVALID_INPUT', details: ['collectionId'] });
    expect((await api('GET', 'not-a-page')).status).toBe(404);
    expect(await t.prisma.auditLog.count({ where: { action: { in: ['marketing.seasonal.create', 'marketing.seasonal.save'] } } })).toBe(2);
  });

  it('goes live only when ready, keeps its link once live, never comes back live by itself, and the shop reads it', async () => {
    const S = MOTHER_STORE_ID;
    const on = { enabled: true, offSeason: true };
    const winter = (await api('POST', null, { ...input(), titleEn: 'Winter', slug: 'winter', occasion: 'winter' })).j.page;
    expect((await api('POST', winter.id, { action: 'publish', version: winter.version })).j).toMatchObject({ error: 'NOT_READY', details: ['collectionId', 'categoryId'] });
    expect(await servedSeasonal(t.prisma, S, 'winter', on)).toBeNull();

    let p = (await api('GET', null)).j.list.rows.find((r: { slug: string }) => r.slug === 'eid');
    let v = (await api('GET', p.id)).j.page;
    const live = await api('POST', p.id, { action: 'publish', version: v.version });
    expect(live.j.page).toMatchObject({ state: 'live' });
    expect(live.j.page.lastLive).toBeTruthy();
    expect(await servedSeasonal(t.prisma, S, 'eid', { ...on, enabled: false })).toBeNull();
    expect(await servedSeasonal(t.prisma, S, 'eid', on)).toMatchObject({ serve: 'live', page: { titleBn: 'ঈদের কালেকশন' } });

    v = (await api('POST', p.id, { action: 'unpublish', version: live.j.page.version })).j.page;
    expect(v.state).toBe('off');
    expect((await servedSeasonal(t.prisma, S, 'eid', on))?.serve).toBe('resting');
    expect(await servedSeasonal(t.prisma, S, 'eid', { ...on, offSeason: false })).toBeNull();
    v = (await api('POST', p.id, { action: 'archive', version: v.version })).j.page;
    expect(v.state).toBe('archived');
    expect((await servedSeasonal(t.prisma, S, 'eid', on))?.serve).toBe('resting');
    expect((await api('PUT', p.id, { ...input(), version: v.version })).j.error).toBe('ARCHIVED');
    v = (await api('POST', p.id, { action: 'restore', version: v.version })).j.page;
    expect(v.state).toBe('off');
    expect(await t.prisma.page.count({ where: { storeId: S, kind: 'SEASONAL' } })).toBe(2);
    p = (await api('GET', null)).j.list;
    expect(p.kpis).toEqual({ live: 0, resting: 1, pages: 2 });
    expect(await t.prisma.auditLog.count({ where: { action: { startsWith: 'marketing.seasonal.' }, entityId: v.id } })).toBe(6);
  });

  it('saves the card at its version (audited) and refuses a stale one or a bad value', async () => {
    const l = (await api('GET', null)).j.list;
    expect(l.card.value.enabled).toBe(false);
    expect((await api('PUT', null, { key: 'seasonal', value: { ...l.card.value, enabled: true }, version: 'old' })).j.error).toBe('STALE');
    expect((await api('PUT', null, { key: 'seasonal', value: { ...l.card.value, productsMax: 0 }, version: l.card.version })).j).toMatchObject({ error: 'INVALID_INPUT', details: ['productsMax'] });
    const on = await api('PUT', null, { key: 'seasonal', value: { ...l.card.value, enabled: true }, version: l.card.version });
    expect(on.j.cards.seasonal.value.enabled).toBe(true);
    expect((await deps.resolver.value('marketing.seasonal', { storeId: MOTHER_STORE_ID })).enabled).toBe(true);
    expect(await t.prisma.auditLog.count({ where: { action: 'marketing.seasonal.settings' } })).toBe(1);
  });

  it('signed out is 401', async () => {
    expect((await api('GET', null, undefined, '')).status).toBe(401);
  });
});

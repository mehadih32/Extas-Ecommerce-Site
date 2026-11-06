// S12 · PR 530 — Marketing › Landing pages › Seasonal pages › Each year on a real PostgreSQL (skipped without
// TEST_DATABASE_ADMIN_URL): a page live once and taken down, ticked "comes back each year" (audited; kept when the page
// is saved again), the occasions' dates saved at their version (a stale save, a bad row and an unknown occasion
// refused), the switch card; the shop shows the page live only inside its window with the switch on, rests it after
// (with the day it comes back), never brings back a page put away or a draft never live, and the page's own state is
// never written; signed out 401. Every date and value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from '../admin-auth';
import { loginHandler } from '../admin-api';
import { seasonalHandler, servedSeasonal } from './seasonal';
import { returnScreen, seasonalReturnHandler } from './seasonal-return';

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

describe.skipIf(!HAS_TEST_DB)('Seasonal pages › Each year on PostgreSQL (PR 530)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let colId = '';
  let catId = '';
  const pages = async (method: string, id: string | null, body?: unknown) => {
    const r = await seasonalHandler(call(method, `/api/admin/marketing/seasonal-pages${id ? `/${id}` : ''}`, owner, body), deps, id);
    return (await r.json()) as Record<string, any>;
  };
  const api = async (method: string, body?: unknown, cookie = owner) => {
    const r = await seasonalReturnHandler(call(method, '/api/admin/marketing/seasonal-return', cookie, body), deps);
    return { status: r.status, j: (await r.json()) as Record<string, any> };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('seasonal_return');
    const [A] = await seedSampleStores(t.prisma);
    expect(A).toBe(MOTHER_STORE_ID);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', undefined, { email: 'owner@example.com', password: OWNER_PW }), deps));
    const S = MOTHER_STORE_ID;
    const g = await t.prisma.garmentType.create({ data: { storeId: S, key: 'sy-panjabi', nameEn: 'Panjabi', nameBn: 'পাঞ্জাবি', measurementFields: [] } });
    await t.prisma.category.create({ data: { storeId: S, slug: 'sy-panjabi', nameEn: 'Panjabi', isVisible: true, garmentTypeId: g.id } });
    colId = (await t.prisma.collection.create({ data: { storeId: S, slug: 'eid-picks', nameEn: 'Eid picks', kind: 'SEASONAL' } })).id;
    catId = (await t.prisma.blogCategory.create({ data: { storeId: S, slug: 'sy-season', nameEn: 'Occasions' } })).id;
  });
  afterAll(async () => t?.drop());

  const S = MOTHER_STORE_ID;
  const on = { enabled: true, offSeason: true };
  const at = (day: string) => new Date(`${day}T06:00:00Z`);
  const input = (slug: string, occasion: string) => ({ titleEn: `${occasion} page`, titleBn: null, slug, occasion, introEn: null, introBn: null, sections: { products: { on: true, config: { collectionId: colId } }, articles: { on: true, config: { categoryId: catId } } }, version: null as string | null });

  it('ticks a page, keeps the tick when the page is saved, and saves the dates and the card (audited)', async () => {
    let p = (await pages('POST', null, input('eid', 'eid'))).page;
    p = (await pages('POST', p.id, { action: 'publish', version: p.version })).page;
    p = (await pages('POST', p.id, { action: 'unpublish', version: p.version })).page;
    expect(p.state).toBe('off');
    const draft = (await pages('POST', null, input('puja', 'puja'))).page;

    let s = (await api('GET')).j.screen;
    expect(s.card.value).toEqual({ on: false, leadDays: 14, afterDays: 2, dates: [] });
    expect(s.rows.map((r: any) => `${r.slug}:${r.status}:${r.ticked.status}`).sort()).toEqual(['eid:notTicked:noDates', 'puja:neverLive:neverLive']);

    expect((await api('PUT', { key: `page:${p.id}`, on: true })).status).toBe(200);
    expect((await api('PUT', { key: `page:${p.id}`, on: 'yes' })).j.error).toBe('INVALID_INPUT');
    expect((await api('PUT', { key: 'page:0190a0a0-0000-7000-8000-000000000009', on: true })).j.error).toBe('NOT_FOUND');
    expect((await pages('PUT', p.id, { ...input('eid', 'eid'), version: p.version })).error).toBe('STALE');
    const cur = (await pages('GET', p.id)).page;
    const saved = (await pages('PUT', p.id, { ...input('eid', 'eid'), titleEn: 'Eid edit', version: cur.version })).page;
    expect(saved.returns).toBe(true);
    expect((await t.prisma.page.findUnique({ where: { id: p.id }, select: { recurrence: true } }))?.recurrence).toEqual({ occasion: 'eid', returns: true });

    s = (await api('GET')).j.screen;
    const dates = [
      { occasion: 'eid', from: '2027-03-09', to: '2027-03-11', yearly: false },
      { occasion: 'winter', from: '2026-12-01', to: '2027-02-15', yearly: true },
    ];
    expect((await api('PUT', { key: 'marketing.seasonalReturn', dates, version: 'old' })).j.error).toBe('STALE');
    expect((await api('PUT', { key: 'marketing.seasonalReturn', dates: [{ ...dates[0], to: '2027-03-01' }], version: s.card.version })).j.error).toBe('INVALID_INPUT');
    expect((await api('PUT', { key: 'marketing.seasonalReturn', dates: [{ ...dates[0], occasion: 'boishakh' }], version: s.card.version })).j).toMatchObject({ error: 'INVALID_INPUT', details: ['occasion'] });
    s = (await api('PUT', { key: 'marketing.seasonalReturn', dates, version: s.card.version })).j.screen;
    expect(s.card.value.dates).toEqual(dates);
    s = (await api('PUT', { key: 'marketing.seasonalReturn', on: true, values: { leadDays: 10, afterDays: 2 } })).j.screen;
    expect(s.card.value).toMatchObject({ on: true, leadDays: 10, afterDays: 2 });
    expect((await api('PUT', { key: 'marketing.seasonalReturn', on: true, values: { leadDays: 91 } })).j).toMatchObject({ error: 'INVALID_INPUT', details: ['leadDays'] });
    expect(await t.prisma.auditLog.count({ where: { action: 'marketing.seasonal.returns', entityId: p.id } })).toBe(1);
    expect(await t.prisma.auditLog.count({ where: { action: 'marketing.seasonal.returnSettings' } })).toBe(2);
    expect(draft.state).toBe('draft');
  });

  it('the shop shows a ticked page live inside its window only, rests it after with its next day, and writes nothing on the page', async () => {
    const set = await deps.resolver.value('marketing.seasonalReturn', { storeId: S });
    const ret = (day: string, patch: object = {}) => ({ set: { ...set, ...patch }, timeZone: 'Asia/Dhaka', now: at(day) });
    expect(await servedSeasonal(t.prisma, S, 'eid', on, ret('2027-01-10'))).toMatchObject({ serve: 'resting', returnsOn: '2027-02-27' });
    expect((await servedSeasonal(t.prisma, S, 'eid', on, ret('2027-02-27')))?.serve).toBe('live');
    expect((await servedSeasonal(t.prisma, S, 'eid', on, ret('2027-03-13')))?.serve).toBe('live');
    expect(await servedSeasonal(t.prisma, S, 'eid', on, ret('2027-03-14'))).toMatchObject({ serve: 'resting', returnsOn: null });
    expect(await servedSeasonal(t.prisma, S, 'eid', on, ret('2027-03-01', { on: false }))).toMatchObject({ serve: 'resting', returnsOn: null });
    expect(await servedSeasonal(t.prisma, S, 'eid', { ...on, enabled: false }, ret('2027-03-01'))).toBeNull();
    expect(await servedSeasonal(t.prisma, S, 'puja', on, ret('2027-03-01'))).toBeNull();
    const eid = await t.prisma.page.findFirst({ where: { storeId: S, slug: 'eid' }, select: { id: true, status: true } });
    expect(eid?.status).toBe('UNPUBLISHED');

    const back = await returnScreen(t.prisma, deps.resolver, at('2027-03-01'));
    expect(back.counts).toEqual({ back: 1, waiting: 0, noDates: 0 });
    expect(back.rows.find((r) => r.slug === 'eid')).toMatchObject({ status: 'back', span: { from: '2027-02-27', to: '2027-03-13' } });
    expect((await returnScreen(t.prisma, deps.resolver, at('2027-01-10'))).counts).toEqual({ back: 0, waiting: 1, noDates: 0 });

    // put away: never comes back by itself; the tick cannot change while it is away
    let v = (await pages('GET', eid!.id)).page;
    v = (await pages('POST', eid!.id, { action: 'archive', version: v.version })).page;
    expect((await servedSeasonal(t.prisma, S, 'eid', on, ret('2027-03-01')))?.serve).toBe('resting');
    expect((await api('PUT', { key: `page:${eid!.id}`, on: false })).j.error).toBe('ARCHIVED');
    expect((await returnScreen(t.prisma, deps.resolver, at('2027-03-01'))).rows.map((r) => r.slug)).toEqual(['puja']);
    expect(await t.prisma.page.count({ where: { storeId: S, kind: 'SEASONAL' } })).toBe(2);
  });

  it('signed out is 401; a wrong method 405', async () => {
    expect((await api('GET', undefined, '')).status).toBe(401);
    expect((await api('POST', {})).status).toBe(405);
  });
});

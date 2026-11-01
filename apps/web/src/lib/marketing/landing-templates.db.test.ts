// S13 · PR 255 — landing page templates on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the four
// ready-made ones listed, an own one saved from the builder's parts (never the countdown's end; a name used twice
// refused), a new page started from a ready-made or own template keeping its key (an unknown or archived one refused,
// a later save keeping it), the uses counted, archive / restore at the version read (never deleted, another store's
// unknown), audited; signed out 401. Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from '../admin-auth';
import { loginHandler } from '../admin-api';
import { landingHandler } from './landing';
import { landingTemplatesHandler, templateChoices } from './landing-templates';

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

describe.skipIf(!HAS_TEST_DB)('Marketing › Landing page templates on PostgreSQL (PR 255)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let productId = '';
  let otherStore = 0;
  const pages = async (method: string, id: string | null, body?: unknown, cookie = owner) => {
    const r = await landingHandler(call(method, `/api/admin/marketing/landing-pages${id ? `/${id}` : ''}`, cookie, body), deps, id);
    return { status: r.status, j: (await r.json()) as Record<string, any> };
  };
  const tpls = async (method: string, id: string | null, body?: unknown, cookie = owner) => {
    const r = await landingTemplatesHandler(call(method, `/api/admin/marketing/landing-templates${id ? `/${id}` : ''}`, cookie, body), deps, id);
    return { status: r.status, j: (await r.json()) as Record<string, any> };
  };
  const on = (secs: { key: string; on: boolean }[]) => secs.filter((s) => s.on).map((s) => s.key);

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('landing_tpl');
    const [A, B] = await seedSampleStores(t.prisma);
    expect(A).toBe(MOTHER_STORE_ID);
    otherStore = B;
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', undefined, { email: 'owner@example.com', password: OWNER_PW }), deps));
    const S = MOTHER_STORE_ID;
    const g = await t.prisma.garmentType.create({ data: { storeId: S, key: 'lpt-polo', nameEn: 'Polo', nameBn: 'পোলো', measurementFields: [] } });
    const cat = await t.prisma.category.create({ data: { storeId: S, slug: 'lpt-polos', nameEn: 'Polos', isVisible: true, garmentTypeId: g.id } });
    productId = (await t.prisma.product.create({ data: { storeId: S, slug: 'lpt-polo', nameEn: 'Sample polo', status: 'DRAFT', categoryId: cat.id } })).id;
  });
  afterAll(async () => t?.drop());

  it('lists the four ready-made templates and none of the owner\'s yet; saves one from the builder\'s parts', async () => {
    const l = await tpls('GET', null);
    expect(l.status).toBe(200);
    expect(l.j.list.builtIn.map((x: { key: string }) => x.key)).toEqual(['offer-first', 'fit-first', 'story', 'combo-push']);
    expect(l.j.list.own).toEqual([]);
    const made = await tpls('POST', null, { name: 'Eid polo', sections: { hero: { on: true, config: { offer: { en: 'Any 2, cash on delivery', bn: null } } }, reviews: { on: false }, timer: { on: true, config: { endsAt: '2026-12-01T00:00:00+06:00' } } } });
    expect(made.status).toBe(201);
    expect(made.j.template).toMatchObject({ key: 'own-eid-polo', name: 'Eid polo', archived: false, uses: 0 });
    expect(on(made.j.template.sections)).toEqual(['hero', 'gallery', 'benefits', 'size', 'form', 'faq', 'timer']);
    const row = await t.prisma.landingTemplate.findFirstOrThrow({ where: { key: 'own-eid-polo' } });
    expect((row.sections as any).parts.timer.config).toEqual({});
    expect((await tpls('POST', null, { name: ' eid POLO ', sections: {} })).j).toMatchObject({ error: 'NAME_TAKEN', details: ['name'] });
    expect((await tpls('POST', null, { name: '', sections: {} })).j).toMatchObject({ error: 'INVALID_INPUT', details: ['name'] });
    expect(await t.prisma.auditLog.count({ where: { action: 'marketing.landing.template.create' } })).toBe(1);
  });

  it('a new page starts from a template and keeps its key; an unknown or archived template is refused; saving later keeps the key', async () => {
    const base = { titleEn: 'Polo Duo', titleBn: null, productId, campaignId: null, version: null };
    const fit = await pages('POST', null, { ...base, slug: 'from-fit', templateKey: 'fit-first', sections: {} });
    expect(fit.status).toBe(201);
    expect(fit.j.page.templateKey).toBe('fit-first');
    const own = await pages('POST', null, { ...base, slug: 'from-own', templateKey: 'own-eid-polo', sections: { reviews: { on: false } } });
    expect(own.j.page.templateKey).toBe('own-eid-polo');
    expect((await pages('POST', null, { ...base, slug: 'from-none', templateKey: 'own-nothing', sections: {} })).j).toMatchObject({ error: 'INVALID_INPUT', details: ['templateKey'] });
    const saved = await pages('PUT', fit.j.page.id, { ...base, slug: 'from-fit', templateKey: 'story', sections: {}, version: fit.j.page.version });
    expect(saved.j.page.templateKey).toBe('fit-first');
    const l = (await tpls('GET', null)).j.list;
    expect(l.builtIn.find((x: { key: string }) => x.key === 'fit-first').uses).toBe(1);
    expect(l.own[0].uses).toBe(1);
    expect((await templateChoices(t.prisma)).map((x) => x.key)).toEqual(['offer-first', 'fit-first', 'story', 'combo-push', 'own-eid-polo']);
  });

  it('archive and restore at the version read, never deleted; an archived template is not offered; another store\'s is unknown', async () => {
    const tp = (await tpls('GET', null)).j.list.own[0];
    expect((await tpls('POST', tp.id, { action: 'archive', version: 'old' })).j.error).toBe('STALE');
    const arch = await tpls('POST', tp.id, { action: 'archive', version: tp.version });
    expect(arch.j.template.archived).toBe(true);
    expect((await tpls('POST', tp.id, { action: 'archive', version: arch.j.template.version })).j.error).toBe('WRONG_STATE');
    expect((await templateChoices(t.prisma)).map((x) => x.key)).not.toContain('own-eid-polo');
    expect((await pages('POST', null, { titleEn: 'X', titleBn: null, slug: 'from-arch', productId, campaignId: null, templateKey: 'own-eid-polo', sections: {}, version: null })).j.details).toEqual(['templateKey']);
    const again = await tpls('POST', null, { name: 'Eid polo', sections: {} });
    expect(again.j.template.key).toBe('own-eid-polo-2');
    expect((await tpls('POST', tp.id, { action: 'restore', version: arch.j.template.version })).j.error).toBe('NAME_TAKEN');
    const other = await t.prisma.landingTemplate.create({ data: { storeId: otherStore, key: 'own-theirs', name: 'Theirs', sections: {} } });
    expect((await tpls('POST', other.id, { action: 'archive', version: other.updatedAt.toISOString() })).status).toBe(404);
    expect(await t.prisma.landingTemplate.count({ where: { storeId: MOTHER_STORE_ID } })).toBe(2);
    expect(await t.prisma.auditLog.count({ where: { action: 'marketing.landing.template.archive' } })).toBe(1);
  });

  it('signed out is 401; a GET on one template is 405', async () => {
    expect((await tpls('GET', null, undefined, '')).status).toBe(401);
    expect((await tpls('POST', null, { name: 'x', sections: {} }, '')).status).toBe(401);
    expect((await tpls('GET', '0190a0a0-0000-7000-8000-000000000001')).status).toBe(405);
  });
});

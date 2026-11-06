// S02 · PR 598 — Settings › Shimmer and Products › Combos › Bag tier box on a real PostgreSQL: as designed at first; a
// save keeps every value, is audited and writes nothing when unchanged; a stale version, a value out of range (stronger
// than designed, more than 4 tiers, days backwards, a price slipped into the words) and a staff member who may only
// look are refused. A throwaway database (skipped without TEST_DATABASE_ADMIN_URL). Sample values only.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { disconnectPrisma, MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { bagBoxHandler, type BagBoxView } from './bag-box-admin';
import { shimmerHandler, type ShimmerView } from './shimmer-admin';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const S = MOTHER_STORE_ID;

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

function req(method: string, o: { body?: unknown; cookie?: string; path?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.77', 'x-forwarded-proto': 'https' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (o.cookie) headers.cookie = o.cookie;
  if (o.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${o.path ?? '/api/admin/settings/shimmer'}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
}

describe.skipIf(!HAS_TEST_DB)('Settings › Shimmer and Combos › Bag tier box on PostgreSQL (PR 598)', () => {
  let t: TestDatabase;
  let admin: AdminDeps;
  let resolver: SettingsResolver<typeof registry>;
  let owner = '';
  let desk = '';
  const saved = process.env.DATABASE_URL;
  type Err = { ok: boolean; error?: string; details?: string[] };
  const shim = async (method: string, o: { body?: unknown; cookie?: string } = {}) => {
    const res = await shimmerHandler(req(method, { body: o.body, cookie: o.cookie ?? owner }), admin);
    return { status: res.status, a: (await res.json()) as ShimmerView & Err };
  };
  const box = async (method: string, o: { body?: unknown; cookie?: string } = {}) => {
    const res = await bagBoxHandler(req(method, { body: o.body, cookie: o.cookie ?? owner, path: '/api/admin/combos/bag-box' }), admin);
    return { status: res.status, a: (await res.json()) as BagBoxView & Err };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web_shimmer_box');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await disconnectPrisma();
    process.env.DATABASE_URL = t.url;
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    resolver = new SettingsResolver(prismaBackend(t.prisma), registry);
    admin = { db: t.prisma, resolver, vault: null } as unknown as AdminDeps;
    owner = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'owner@example.com', password: OWNER_PW } }), admin));
    const role = await rolesHandler(req('POST', { path: '/api/admin/roles', cookie: owner, body: { nameEn: 'Look desk', nameBn: 'দেখার ডেস্ক', permissions: ['settings.read', 'combos.read'] } }), admin);
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(req('POST', { path: '/api/admin/staff', cookie: owner, body: { email: 'desk@example.com', displayName: 'Sample desk', password: 'first password from the owner' } }), admin);
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(req('POST', { path: `/api/admin/staff/${staffId}/roles`, cookie: owner, body: { action: 'assign', roleId, storeId: S } }), admin, staffId);
    const once = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'desk@example.com', password: 'first password from the owner' } }), admin));
    desk = cookiesOf(await passwordHandler(req('POST', { path: '/api/admin/auth/password', cookie: once, body: { current: 'first password from the owner', next: 'my own words for this job' } }), admin));
  });
  afterAll(async () => {
    await disconnectPrisma();
    process.env.DATABASE_URL = saved;
    await t?.drop();
  });

  it('Shimmer: as designed at first; a save keeps switches, speed and strength, is audited; stale, bad and lookers refused', async () => {
    const h = (await shim('GET')).a;
    expect(h).toMatchObject({ ok: true, sweep: { on: true, items: { addToBag: false } }, tune: { items: {} } });
    const tune = { ...h.tune, items: { logo: { speed: 'slow', strength: 'soft' } } };
    const put = await shim('PUT', { body: { sweep: { ...h.sweep, items: { ...h.sweep.items, addToBag: true } }, pdp: { ...h.pdp, sizePills: false }, tune, version: h.version } });
    expect(put.a).toMatchObject({ ok: true, sweep: { items: { addToBag: true } }, pdp: { sizePills: false }, tune: { items: { logo: { speed: 'slow' } } } });
    expect(await resolver.value('shop.shimmer', { storeId: S })).toMatchObject({ items: { logo: { strength: 'soft' } } });
    expect(await t.prisma.auditLog.count({ where: { action: 'settings.shimmer.save' } })).toBe(1);
    await shim('PUT', { body: { sweep: put.a.sweep, pdp: put.a.pdp, tune: put.a.tune, version: put.a.version } });
    expect(await t.prisma.auditLog.count({ where: { action: 'settings.shimmer.save' } })).toBe(1);
    expect((await shim('PUT', { body: { sweep: put.a.sweep, pdp: put.a.pdp, tune: put.a.tune, version: 'old' } })).a).toMatchObject({ ok: false, error: 'STALE' });
    expect((await shim('PUT', { body: { sweep: put.a.sweep, pdp: put.a.pdp, tune: { ...put.a.tune, medium: 1.4 }, version: put.a.version } })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['tune'] });
    expect((await shim('GET', { cookie: desk })).status).toBe(200);
    expect((await shim('PUT', { cookie: desk, body: { sweep: put.a.sweep, pdp: put.a.pdp, tune: put.a.tune, version: put.a.version } })).status).toBe(403);
  });

  it('Bag tier box: a save keeps the switch, days, rules shown and words (no price), is audited; bad days and lookers refused', async () => {
    const h = (await box('GET')).a;
    expect(h.box).toMatchObject({ startsOn: null, endsOn: null, rules: { hidden: [], labels: {} } });
    const next = { ...h.box, startsOn: '2026-11-10', endsOn: '2026-11-30', max: 4, rules: { hidden: ['any-polos'], labels: { 'any-polos:2': { en: 'Pair up', bn: 'জোড়া নিন' } } } };
    const put = await box('PUT', { body: { box: next, version: h.version } });
    expect(put.a).toMatchObject({ ok: true, box: { max: 4, rules: { hidden: ['any-polos'] } } });
    expect(await resolver.value('bag.tiers.rules', { storeId: S })).toEqual(next.rules);
    expect(await t.prisma.auditLog.count({ where: { action: 'combos.bagbox.save' } })).toBe(1);
    expect((await box('PUT', { body: { box: { ...put.a.box, startsOn: '2026-12-01' }, version: put.a.version } })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['endsOn'] });
    expect((await box('PUT', { body: { box: { ...put.a.box, max: 5 }, version: put.a.version } })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['max'] });
    expect((await box('PUT', { body: { box: { ...put.a.box, rules: { ...put.a.box.rules, priceMinor: 100 } }, version: put.a.version } })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['rules'] });
    expect((await box('PUT', { body: { box: put.a.box, version: 'old' } })).a).toMatchObject({ ok: false, error: 'STALE' });
    expect((await box('GET', { cookie: desk })).status).toBe(200);
    expect((await box('PUT', { cookie: desk, body: { box: put.a.box, version: put.a.version } })).status).toBe(403);
  });
});

// S02 · PR 597 — Website › Launch default on a real PostgreSQL: save the launch default and named looks; "Back to launch
// default" saves the look first, brings the saved settings back, keeps newer sections as hidden copies, switches house ads
// to the saved set and pauses the running A/B tests; undo brings everything back and can itself be undone; stale steps,
// junk and a looker are refused; home looks of Seasonal home are never listed. A throwaway database (skipped without
// TEST_DATABASE_ADMIN_URL). Sample values only.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { disconnectPrisma, MOTHER_STORE_ID } from '@extas/db/client';
import { blockDefaults, messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { launchDefaultHandler, type LookView, type RestoreDone } from './launch-default-admin';

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
  return new Request(`https://${HOST}${o.path ?? '/api/admin/website/launch-default'}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
}

const block = (id: string, on: boolean) => ({ id, page: 'home', cat: null, name: id, on, dev: 'both', from: null, to: null, before: null, type: 'spacer', data: blockDefaults('spacer') });

describe.skipIf(!HAS_TEST_DB)('Website › Launch default on PostgreSQL (PR 597)', () => {
  let t: TestDatabase;
  let admin: AdminDeps;
  let resolver: SettingsResolver<typeof registry>;
  let owner = '';
  let desk = '';
  const saved = process.env.DATABASE_URL;
  type Answer = LookView & { ok: boolean; error?: string; details?: string[]; done?: RestoreDone; id?: string };
  const api = async (method: string, o: { body?: unknown; cookie?: string } = {}) => {
    const res = await launchDefaultHandler(req(method, { body: o.body, cookie: o.cookie ?? owner }), admin);
    return { status: res.status, a: (await res.json()) as Answer };
  };
  const step = async (b: Record<string, unknown>) => {
    const v = (await api('GET')).a.version;
    return api('POST', { body: { version: v, ...b } });
  };
  const set = (k: Parameters<typeof resolver.set>[0], v: unknown) => resolver.set(k, v as never, storeTarget(S), { actorId: null, reason: 'test' });
  const blocks = async () => ((await resolver.value('layout.blocks', { storeId: S })) as { id: string; on: boolean }[]).map((b) => [b.id, b.on]);

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web_launch_default');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await disconnectPrisma();
    process.env.DATABASE_URL = t.url;
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    resolver = new SettingsResolver(prismaBackend(t.prisma), registry);
    admin = { db: t.prisma, resolver, vault: null } as unknown as AdminDeps;
    owner = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'owner@example.com', password: OWNER_PW } }), admin));
    const role = await rolesHandler(req('POST', { path: '/api/admin/roles', cookie: owner, body: { nameEn: 'Site desk', nameBn: 'সাইট ডেস্ক', permissions: ['website.read'] } }), admin);
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

  it('saves the launch default; back to it restores the look, keeps newer sections hidden, switches ads and pauses tests; undo brings it all back', async () => {
    const h = (await api('GET')).a;
    expect(h).toMatchObject({ ok: true, launch: null, looks: [], log: [], seasonLive: false, testsRunning: 0 });
    await set('experiments.module', { ...(registry['experiments.module'].default as object), enabled: true });
    await set('layout.blocks', [block('launch01', true)]);
    await set('layout.sideCanvas', { ...(registry['layout.sideCanvas'].default as object), enabled: true });
    const ad1 = await t.prisma.houseAd.create({ data: { storeId: S, name: 'Sample ad one', kind: 'banner', enabled: true } });
    const ad2 = await t.prisma.houseAd.create({ data: { storeId: S, name: 'Sample ad two', kind: 'banner', enabled: false } });
    const ab = await t.prisma.abTest.create({ data: { storeId: S, key: 'sample-test', name: 'Sample test', status: 'RUNNING', variants: {}, split: {}, goalEvent: 'bag' } });

    const saveLd = await step({ action: 'save', name: 'Launch default', launch: true });
    expect(saveLd.a).toMatchObject({ ok: true, launch: { name: 'Launch default', launch: true, by: 'Sample owner', sum: { sections: 1, sectionsOn: 1, canvasOn: true, ads: 1 } } });
    expect(await t.prisma.auditLog.count({ where: { action: 'website.look.launchDefault' } })).toBe(1);

    // the festival look
    await set('layout.blocks', [block('launch01', false), block('eidweek1', true)]);
    await set('layout.sideCanvas', { ...(registry['layout.sideCanvas'].default as object), enabled: false });
    await t.prisma.houseAd.update({ where: { id: ad1.id }, data: { enabled: false } });
    await t.prisma.houseAd.update({ where: { id: ad2.id }, data: { enabled: true } });
    const looks = await t.prisma.layoutSnapshot.count();

    // stale: nothing written
    expect((await api('POST', { body: { action: 'restore', id: 'launch', version: h.version } })).a).toMatchObject({ ok: false, error: 'STALE' });
    expect(await t.prisma.layoutSnapshot.count()).toBe(looks);

    const back = await step({ action: 'restore', id: 'launch', reason: 'Eid is over' });
    expect(back.a.ok).toBe(true);
    expect(back.a.done).toMatchObject({ hidden: 1, paused: 1, adsOn: 1, adsOff: 1 });
    expect(back.a.done!.written).toEqual(expect.arrayContaining(['layout.blocks', 'layout.sideCanvas']));
    expect(await blocks()).toEqual([
      ['launch01', true],
      ['eidweek1', false],
    ]);
    expect(await resolver.value('layout.sideCanvas', { storeId: S })).toMatchObject({ enabled: true });
    expect((await t.prisma.houseAd.findUniqueOrThrow({ where: { id: ad1.id } })).enabled).toBe(true);
    expect((await t.prisma.houseAd.findUniqueOrThrow({ where: { id: ad2.id } })).enabled).toBe(false);
    expect((await t.prisma.abTest.findUniqueOrThrow({ where: { id: ab.id } })).status).toBe('PAUSED');
    // the look before the restore was saved first, and the log can undo it
    expect(back.a.looks.find((l) => l.id === back.a.done!.beforeId)).toMatchObject({ auto: { kind: 'restore', of: 'Launch default' }, sum: { sections: 2, sectionsOn: 1 } });
    expect(back.a.log).toMatchObject([{ kind: 'restore', look: 'Launch default', launch: true, reason: 'Eid is over', undone: false, canUndo: true, paused: 1 }]);
    expect(await t.prisma.auditLog.count({ where: { action: 'website.look.restore' } })).toBe(1);

    const undo = await step({ action: 'undo', restoreId: back.a.log[0]!.id });
    expect(undo.a.ok).toBe(true);
    expect(undo.a.done).toMatchObject({ resumed: 1, adsOn: 1, adsOff: 1 });
    expect(await blocks()).toEqual([
      ['launch01', false],
      ['eidweek1', true],
    ]);
    expect(await resolver.value('layout.sideCanvas', { storeId: S })).toMatchObject({ enabled: false });
    expect((await t.prisma.houseAd.findUniqueOrThrow({ where: { id: ad2.id } })).enabled).toBe(true);
    expect((await t.prisma.abTest.findUniqueOrThrow({ where: { id: ab.id } })).status).toBe('RUNNING');
    expect(undo.a.log.map((r) => [r.kind, r.undone, r.canUndo])).toEqual([
      ['undo', false, true],
      ['restore', true, false],
    ]);
    // the old restore cannot be undone twice; the undo itself can
    expect((await step({ action: 'undo', restoreId: back.a.log[0]!.id })).a).toMatchObject({ ok: false, error: 'NOT_ALLOWED' });
    const again = await step({ action: 'undo', restoreId: undo.a.log[0]!.id });
    expect(again.a.ok).toBe(true);
    expect(await blocks()).toEqual([
      ['launch01', true],
      ['eidweek1', false],
    ]);
  });

  it('names, renames and sets looks aside (never deleted); a newer launch default keeps the older one as a named look', async () => {
    const named = await step({ action: 'save', name: 'Eid 2027' });
    expect(named.a.looks[0]).toMatchObject({ name: 'Eid 2027', launch: false, auto: null });
    const id = named.a.id!;
    expect((await step({ action: 'rename', id, name: 'Eid 2027 look' })).a.looks[0]).toMatchObject({ name: 'Eid 2027 look' });
    const aside = await step({ action: 'archive', id });
    expect(aside.a.looks.find((l) => l.id === id)).toMatchObject({ archived: true });
    expect((await step({ action: 'restore', id })).a).toMatchObject({ ok: false, error: 'NOT_ALLOWED' });
    expect((await step({ action: 'unarchive', id })).a.looks.find((l) => l.id === id)).toMatchObject({ archived: false });
    const oldLaunch = named.a.launch!.id;
    expect((await step({ action: 'archive', id: oldLaunch })).a).toMatchObject({ ok: false, error: 'NOT_ALLOWED' });
    const second = await step({ action: 'save', name: 'Launch default 2', launch: true });
    expect(second.a.launch).toMatchObject({ name: 'Launch default 2' });
    expect(second.a.looks.find((l) => l.id === oldLaunch)).toMatchObject({ launch: false, name: 'Launch default' });
    expect(await t.prisma.layoutSnapshot.count({ where: { isLaunchDefault: true } })).toBe(1);
  });

  it('leaves values that no longer fit as they are, never lists home looks, refuses junk and a looker', async () => {
    const bad = await t.prisma.layoutSnapshot.create({ data: { storeId: S, name: 'Old look', payload: { scope: 'shop', settings: { 'home.rowFade': 'yes', 'layout.blocks': 'junk' }, rows: {} } } });
    await t.prisma.layoutSnapshot.create({ data: { storeId: S, name: 'Seasonal home look', payload: { scope: 'home', settings: {} } } });
    const before = await blocks();
    const r = await step({ action: 'restore', id: bad.id });
    expect(r.a.ok).toBe(true);
    expect(r.a.done!.kept).toEqual(expect.arrayContaining(['home.rowFade', 'layout.blocks', 'home.hero']));
    expect(await blocks()).toEqual(before);
    expect(r.a.looks.some((l) => l.name === 'Seasonal home look')).toBe(false);
    expect((await step({ action: 'restore', id: 'not-an-id' })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    expect((await step({ action: 'save', name: '   ' })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    expect((await step({ action: 'drop' })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    expect((await api('GET', { cookie: desk })).status).toBe(200);
    expect((await api('POST', { cookie: desk, body: { action: 'save', name: 'x', version: r.a.version } })).status).toBe(403);
  });
});

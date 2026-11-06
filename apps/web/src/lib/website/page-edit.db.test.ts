// S02 · PR 600 — the on-page edit mode on a real PostgreSQL: refused while the switch is off and for anyone but the owner;
// a section's own settings; a draft that changes nothing live; "Apply to phone too?" (asked; Yes needs the checks and
// the owner's OK; No keeps a hidden section on phones and leaves a text in the draft); Publish through the saved-looks
// path (Website › Launch default lists it and its log can undo it); undo from the bar; STALE when someone changed the
// setting since; discard sets the draft aside. A throwaway database (skipped without TEST_DATABASE_ADMIN_URL).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { disconnectPrisma, MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { launchDefaultHandler, type LookView } from './launch-default-admin';
import { pageEditHandler, type EditView, type PublishDone, type SectionView } from './page-edit-admin';
import { pageEditSettingsHandler, type PageEditSettingsView } from './page-edit-settings';

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
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.78', 'x-forwarded-proto': 'https' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (o.cookie) headers.cookie = o.cookie;
  if (o.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${o.path ?? '/api/admin/website/page-edit'}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
}

describe.skipIf(!HAS_TEST_DB)('On-page edit mode on PostgreSQL (PR 600)', () => {
  let t: TestDatabase;
  let admin: AdminDeps;
  let resolver: SettingsResolver<typeof registry>;
  let owner = '';
  let desk = '';
  const saved = process.env.DATABASE_URL;
  type Answer = { ok: boolean; error?: string; details?: string[]; view: EditView; section?: SectionView; done?: PublishDone };
  const api = async (method: string, b?: unknown, cookie = owner) => {
    const res = await pageEditHandler(req(method, { body: b, cookie }), admin);
    return { status: res.status, a: (await res.json()) as Answer };
  };
  const value = (k: Parameters<typeof resolver.value>[0]) => resolver.value(k, { storeId: S });
  const settingsApi = async (method: string, b?: unknown) => {
    const res = await pageEditSettingsHandler(req(method, { body: b, cookie: owner, path: '/api/admin/website/page-edit-settings' }), admin);
    return { status: res.status, a: (await res.json()) as PageEditSettingsView & { ok: boolean; error?: string } };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web_page_edit');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await disconnectPrisma();
    process.env.DATABASE_URL = t.url;
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    resolver = new SettingsResolver(prismaBackend(t.prisma), registry);
    admin = { db: t.prisma, resolver, vault: null } as unknown as AdminDeps;
    owner = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'owner@example.com', password: OWNER_PW } }), admin));
    const role = await rolesHandler(req('POST', { path: '/api/admin/roles', cookie: owner, body: { nameEn: 'Site desk', nameBn: 'সাইট ডেস্ক', permissions: ['website.read', 'website.layout.write'] } }), admin);
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

  it('is off as shipped; then only the owner may use it; a draft changes nothing live; phone answers; publish and undo', async () => {
    expect((await api('GET')).a.error).toBe('PAGE_EDIT_OFF');
    const s0 = await settingsApi('GET');
    expect(s0.a.cfg.enabled).toBe(false);
    expect(s0.a.cfg.phones).toHaveLength(10);
    expect((await settingsApi('PUT', { cfg: { ...s0.a.cfg, enabled: true, tapMinPx: 5 }, version: s0.a.version })).status).toBe(400);
    const s1 = await settingsApi('PUT', { cfg: { ...s0.a.cfg, enabled: true }, version: s0.a.version });
    expect(s1.a.cfg.enabled).toBe(true);
    expect((await settingsApi('PUT', { cfg: s0.a.cfg, version: s0.a.version })).a.error).toBe('STALE');

    // Not the owner: refused even with the layout permission.
    expect((await api('GET', undefined, desk)).a.error).toBe('OWNER_ONLY');
    expect((await api('GET', undefined, '')).status).toBe(401);

    // A section's own settings; money only as links; the bag locked.
    const hero = (await api('POST', { action: 'section', page: 'home', id: 'hero' })).a.section!;
    const title = hero.fields.find((f) => f.name === 'title')!;
    expect(title.shown?.en.length).toBeGreaterThan(0);
    const flash = (await api('POST', { action: 'section', page: 'home', id: 'flash-sale' })).a.section!;
    expect(flash.money.map((m) => m.href)).toContain('/admin/rules');
    const bag = await api('POST', { action: 'set', page: 'bag', id: 'offer', field: 'x', value: 1 });
    expect(bag.a.error).toBe('LOCKED');
    expect((await api('POST', { action: 'set', page: 'home', id: 'hero', field: 'home.hero:nope', value: 1 })).a.error).toBe('INVALID_INPUT');

    // Draft: the title and the reviews hidden. Nothing live changes.
    const before = await value('home.hero');
    const t1 = await api('POST', { action: 'set', page: 'home', id: 'hero', field: title.id, value: { en: 'Sample new drop', bn: 'নমুনা নতুন' } });
    expect(t1.a.section!.fields.find((f) => f.id === title.id)!.changed).toBe(true);
    const reviews = (await api('POST', { action: 'section', page: 'home', id: 'reviews' })).a.section!;
    const show = reviews.fields.find((f) => f.kind === 'show')!;
    const r1 = await api('POST', { action: 'set', page: 'home', id: 'reviews', field: show.id, value: false });
    expect(r1.a.view.draft.sort()).toEqual(['home.hero', 'home.sections']);
    expect(await value('home.hero')).toEqual(before);

    // Publish needs the phone answer; Yes needs the checks passed and the owner's OK.
    expect((await api('POST', { action: 'publish' })).a.error).toBe('ASK_PHONE');
    expect((await api('POST', { action: 'publish', phone: 'yes', checks: { pass: false, sizes: 10, failed: 1 }, ok: true })).a.error).toBe('PHONE_CHECKS_NEEDED');
    expect((await api('POST', { action: 'publish', phone: 'yes', checks: { pass: true, sizes: 10, failed: 0 } })).a.error).toBe('PHONE_CHECKS_NEEDED');

    // No: the reviews hide on computers only; the title (it shows on phones too) stays in the draft.
    const no = await api('POST', { action: 'publish', phone: 'no', path: '/' });
    expect(no.a.done!.held).toEqual(['home.hero']);
    expect(no.a.done!.written).toEqual(['home.sections']);
    const rows = (await value('home.sections')) as { id: string; on: boolean; dev?: string }[];
    expect(rows.find((r) => r.id === 'reviews')).toEqual({ id: 'reviews', on: true, dev: 'phone' });
    expect(no.a.view.draft).toEqual(['home.hero']);
    expect(no.a.view.last?.canUndo).toBe(true);

    // Launch default lists the publish as a look saved by itself and its log row can be undone there too.
    const ld = (await (await launchDefaultHandler(req('GET', { cookie: owner, path: '/api/admin/website/launch-default' }), admin)).json()) as LookView;
    expect(ld.looks.some((l) => l.auto?.kind === 'edit')).toBe(true);
    expect(ld.log[0]?.canUndo).toBe(true);

    // Yes with the checks passed and the owner's OK: the title goes live; the draft is set aside.
    const yes = await api('POST', { action: 'publish', phone: 'yes', checks: { pass: true, sizes: 10, failed: 0 }, ok: true, path: '/' });
    expect(yes.a.done!.written).toEqual(['home.hero']);
    expect(((await value('home.hero')) as { title: unknown }).title).toEqual({ en: 'Sample new drop', bn: 'নমুনা নতুন' });
    expect(yes.a.view.draft).toEqual([]);

    // Undo from the bar: the title is back, and the undo is itself in the log.
    const u = await api('POST', { action: 'undo', restoreId: yes.a.view.last!.restoreId });
    expect(u.status).toBe(200);
    expect(await value('home.hero')).toEqual(before);
    expect(u.a.view.last?.canUndo).toBe(false);
    const logs = await t.prisma.auditLog.findMany({ where: { action: { in: ['website.pageEdit.publish', 'website.look.undo', 'website.pageEdit.settings'] } }, select: { action: true } });
    expect(logs.map((l) => l.action).sort()).toEqual(['website.look.undo', 'website.pageEdit.publish', 'website.pageEdit.publish', 'website.pageEdit.settings']);

    // STALE: someone changes the setting after the draft did.
    const nf = (await api('POST', { action: 'section', page: 'home', id: 'new-in' })).a.section!.fields.find((f) => f.kind === 'number')!;
    await api('POST', { action: 'set', page: 'home', id: 'new-in', field: nf.id, value: 6 });
    await resolver.set('home.newIn', { ...((await value('home.newIn')) as object), count: 4 } as never, storeTarget(S), { actorId: null, reason: 'test' });
    const stale = await api('POST', { action: 'publish', phone: 'yes', checks: { pass: true, sizes: 10, failed: 0 }, ok: true });
    expect(stale.a.error).toBe('STALE');
    expect(stale.a.details).toEqual(['home.newIn']);

    // Discard: the draft is set aside, never deleted.
    const d = await api('POST', { action: 'discard' });
    expect(d.a.view.draft).toEqual([]);
    expect(await t.prisma.layoutSnapshot.count({ where: { payload: { path: ['scope'], equals: 'edit-draft' } } })).toBeGreaterThanOrEqual(2);
    expect((await settingsApi('GET')).a.log.length).toBe(2);
  });
});

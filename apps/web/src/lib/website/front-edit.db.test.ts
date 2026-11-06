// S02 · PR 79 — editing the shop's words on the shop page, on a real PostgreSQL: the switch is off as shipped and the
// page's words are refused then; switched on (website.words.write, audited, STALE), a page's texts give back its words
// (the owner's word when he has one) with the saved words' version, which publishes through the dictionary's own save
// and goes STALE after another save; seeing needs website.read.
// A throwaway database (skipped without TEST_DATABASE_ADMIN_URL). Sample values only.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { disconnectPrisma, MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { frontEditHandler } from './front-edit';
import { dictionaryHandler } from './words-admin';

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
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.79', 'x-forwarded-proto': 'https' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (o.cookie) headers.cookie = o.cookie;
  if (o.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${o.path ?? '/api/admin/website/dictionary'}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
}

describe.skipIf(!HAS_TEST_DB)('Website › Words & language › Edit on the shop page on PostgreSQL (PR 79)', () => {
  let t: TestDatabase;
  let admin: AdminDeps;
  let resolver: SettingsResolver<typeof registry>;
  let owner = '';
  let desk = '';
  const saved = process.env.DATABASE_URL;
  type Answer = Record<string, unknown> & { ok: boolean; error?: string };
  const api = async (method: string, o: { body?: unknown; cookie?: string; path?: string } = {}) => {
    const path = o.path ?? '/api/admin/website/front-edit';
    const handler = path.includes('dictionary') ? dictionaryHandler : frontEditHandler;
    const res = await handler(req(method, { body: o.body, cookie: o.cookie ?? owner, path }), admin);
    return { status: res.status, a: (await res.json()) as Answer };
  };
  const labels = async () => (await resolver.value('language.labels', { storeId: S })) as Record<string, { en?: string; bn?: string }> | null;
  const KEY = 'nav.newIn';
  type Card = { key: string; value: { enabled: boolean }; version: string };
  const card = async (cookie?: string) => ((await api('GET', { cookie })).a.cards as Record<string, Card>).frontEdit!;

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web_front_edit');
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

  it('is off as shipped; the page words are refused then; the switch needs website.words.write and is audited', async () => {
    const c = await card(desk);
    expect(c.value).toEqual({ enabled: false });
    expect((await api('POST', { cookie: desk, body: { lang: 'en', texts: ['New in'] } })).a).toMatchObject({ ok: false, error: 'FRONT_EDIT_OFF' });
    expect((await api('PUT', { cookie: desk, body: { key: 'frontEdit', value: { enabled: true }, version: c.version } })).status).toBe(403);
    expect((await api('PUT', { body: { key: 'frontEdit', value: { enabled: 'yes' }, version: c.version } })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    expect((await api('PUT', { body: { key: 'frontEdit', value: { enabled: true }, version: 'old' } })).a).toMatchObject({ ok: false, error: 'STALE' });
    const on = await api('PUT', { body: { key: 'frontEdit', value: { enabled: true }, version: c.version } });
    expect((on.a.cards as Record<string, Card>).frontEdit!.value).toEqual({ enabled: true });
    expect(await t.prisma.auditLog.count({ where: { action: 'website.frontEdit.save' } })).toBe(1);
    expect((await frontEditHandler(req('DELETE', { path: '/api/admin/website/front-edit' }), admin)).status).toBe(405);
  });

  it("finds a page's words and publishes a change through the dictionary save; a later publish with the old version is STALE", async () => {
    const page = await api('POST', { cookie: desk, body: { lang: 'en', texts: ['  New in ', 'not a shop word at all'] } });
    expect(page.a).toMatchObject({ ok: true, canEdit: false });
    const words = page.a.words as { key: string; seen: string[] }[];
    expect(words.map((x) => x.key)).toContain(KEY);
    expect(words.find((x) => x.key === KEY)?.seen).toEqual(['New in']);
    expect((await api('POST', { body: { lang: 'fr', texts: [] } })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['lang'] });
    expect((await api('POST', { body: { lang: 'en', texts: [1] } })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['texts'] });
    const mine = await api('POST', { body: { lang: 'en', texts: ['New in'] } });
    expect(mine.a.canEdit).toBe(true);
    const put = await api('PUT', { path: '/api/admin/website/dictionary', body: { version: mine.a.version, words: { [KEY]: { en: 'Sample arrivals', bn: '' } } } });
    expect(put.a).toMatchObject({ ok: true, changed: [KEY] });
    expect(await labels()).toEqual({ [KEY]: { en: 'Sample arrivals' } });
    const after = await api('POST', { body: { lang: 'en', texts: ['Sample arrivals'] } });
    expect((after.a.words as { key: string; changed: boolean }[]).find((x) => x.key === KEY)).toMatchObject({ changed: true });
    expect(after.a.version).toBe(put.a.version);
    expect((await api('PUT', { path: '/api/admin/website/dictionary', body: { version: mine.a.version, words: { [KEY]: { en: '' } } } })).a).toMatchObject({ ok: false, error: 'STALE' });
  });
});

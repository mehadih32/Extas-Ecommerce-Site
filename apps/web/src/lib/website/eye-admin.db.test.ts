// S02 · PR 81 — Website › Eye-toggles on a real PostgreSQL: the list reads every eye-toggle with its shipped value; a save
// hides and shows parts by writing only that one yes/no value of each setting (every other value kept) and the shop
// reads it; back to as shipped; refused: an unknown switch, a value that is not yes/no, a save after another change of
// the same settings (also from the section's own card); seeing needs `website.read`, saving `website.eye.write`;
// audited once per save that changes something.
// A throwaway database (skipped without TEST_DATABASE_ADMIN_URL). Sample values only.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { disconnectPrisma, MOTHER_STORE_ID } from '@extas/db/client';
import { EYE_TOGGLES, messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { doorNoteHandler, eyeTogglesHandler, type EyeView } from './eye-admin';

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
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.81', 'x-forwarded-proto': 'https' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (o.cookie) headers.cookie = o.cookie;
  if (o.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${o.path ?? '/api/admin/website/eye-toggles'}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
}

describe.skipIf(!HAS_TEST_DB)('Website › Eye-toggles on PostgreSQL (PR 81)', () => {
  let t: TestDatabase;
  let admin: AdminDeps;
  let resolver: SettingsResolver<typeof registry>;
  let owner = '';
  let desk = '';
  const saved = process.env.DATABASE_URL;
  type Answer = EyeView & { ok: boolean; error?: string; details?: string[]; changed?: string[] };
  const api = async (method: string, o: { body?: unknown; cookie?: string } = {}) => {
    const res = await eyeTogglesHandler(req(method, { body: o.body, cookie: o.cookie ?? owner }), admin);
    return { status: res.status, a: (await res.json()) as Answer };
  };
  const value = async (k: string) => (await resolver.value(k as never, { storeId: S })) as Record<string, unknown>;
  const NOTE = 'pdp.colour:note';
  const WA = 'shell.header:icons.#whatsapp.on';
  const HELP = 'bag.whatsappHelp:';

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web_eye_toggles');
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

  it('lists every eye-toggle as shipped; seeing needs website.read, saving website.eye.write', async () => {
    const all = await api('GET', { cookie: desk });
    expect(all.status).toBe(200);
    expect(all.a.rows).toHaveLength(EYE_TOGGLES.length);
    expect(all.a.rows.every((r) => r.shown === r.def)).toBe(true);
    expect(all.a.rows.find((r) => r.id === NOTE)).toMatchObject({ area: 'product', shown: false, def: false });
    expect((await api('PUT', { cookie: desk, body: { version: all.a.version, shown: { [NOTE]: true } } })).status).toBe(403);
    expect((await eyeTogglesHandler(req('DELETE'), admin)).status).toBe(405);
  });

  it('shows and hides parts by one value each, keeps the rest of the setting, back to as shipped; audited once per change', async () => {
    const colourBefore = await value('pdp.colour');
    const v = (await api('GET')).a.version;
    const put = await api('PUT', { body: { version: v, shown: { [NOTE]: true, [WA]: false, [HELP]: true } } });
    expect(put.a).toMatchObject({ ok: true, changed: [NOTE, WA, HELP] });
    expect(await value('pdp.colour')).toEqual({ ...colourBefore, note: true });
    const header = await value('shell.header');
    expect((header.icons as { id: string; on: boolean }[]).map((i) => [i.id, i.on])).toEqual([['whatsapp', false], ['search', true], ['wish', true], ['account', true], ['bag', true]]);
    expect(await resolver.value('bag.whatsappHelp', { storeId: S })).toBe(true);
    expect(put.a.rows.find((r) => r.id === WA)).toMatchObject({ shown: false, def: true });
    const again = await api('PUT', { body: { version: put.a.version, shown: { [NOTE]: true } } });
    expect(again.a).toMatchObject({ ok: true, changed: [] });
    const log = await t.prisma.auditLog.findMany({ where: { action: 'website.eye.save' } });
    expect(log).toHaveLength(1);
    expect(log[0]!.before).toEqual({ [NOTE]: false, [WA]: true, [HELP]: false });
    expect(log[0]!.after).toEqual({ [NOTE]: true, [WA]: false, [HELP]: true });
    const back = await api('PUT', { body: { version: again.a.version, shown: { [NOTE]: false, [WA]: true, [HELP]: false } } });
    expect(back.a.ok).toBe(true);
    expect(back.a.rows.every((r) => r.shown === r.def)).toBe(true);
    expect(await value('pdp.colour')).toEqual(colourBefore);
  });

  it('refuses an unknown switch, a value that is not yes/no, a stale version (also a change from the section card) and a bad body', async () => {
    const v = (await api('GET')).a.version;
    expect((await api('PUT', { body: { version: v, shown: { 'pdp.colour:nowhere': true, [NOTE]: true } } })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['pdp.colour:nowhere'] });
    expect((await api('PUT', { body: { version: v, shown: { [NOTE]: 'yes' } } })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: [NOTE] });
    expect((await api('PUT', { body: { shown: {} } })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['version'] });
    expect((await api('PUT', { body: { version: v } })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['shown'] });
    await resolver.set('pdp.colour', { ...(await value('pdp.colour')), trueColourLink: true } as never, storeTarget(S), { actorId: null, reason: 'test' });
    expect((await api('PUT', { body: { version: v, shown: { [NOTE]: true } } })).a).toMatchObject({ ok: false, error: 'STALE' });
    expect((await value('pdp.colour')).note).toBe(false);
    expect((await api('GET')).a.rows.find((r) => r.id === 'pdp.colour:trueColourLink')).toMatchObject({ shown: true, def: false });
  });

  it('follow-up 679: the door note words ship empty, are only the owner\'s, saved trimmed and audited; the list keeps its version', async () => {
    const door = async (method: string, o: { body?: unknown; cookie?: string } = {}) => {
      const res = await doorNoteHandler(req(method, { path: '/api/admin/website/eye-toggles/door-note', body: o.body, cookie: o.cookie ?? owner }), admin);
      return { status: res.status, a: (await res.json()) as { ok: boolean; error?: string; details?: string[]; text?: { en: string; bn: string }; changed?: boolean } };
    };
    expect((await door('GET', { cookie: desk })).a).toMatchObject({ ok: true, text: { en: '', bn: '' } });
    expect((await door('PUT', { cookie: desk, body: { en: 'x', bn: '' } })).status).toBe(403);
    const v = (await api('GET')).a.version;
    const put = await door('PUT', { body: { en: '  Sample owner words  ', bn: '' } });
    expect(put.a).toMatchObject({ ok: true, changed: true, text: { en: 'Sample owner words', bn: '' } });
    expect(await resolver.value('checkout.doorNote.text', { storeId: S })).toEqual({ en: 'Sample owner words', bn: '' });
    expect((await door('PUT', { body: { en: 'Sample owner words', bn: '' } })).a).toMatchObject({ ok: true, changed: false });
    expect((await door('PUT', { body: { en: 'x'.repeat(161), bn: '' } })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['en'] });
    expect((await door('PUT', { body: { en: 'x' } })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    const log = await t.prisma.auditLog.findMany({ where: { action: 'website.doorNote.save' } });
    expect(log).toHaveLength(1);
    expect(log[0]!.before).toEqual({ en: '', bn: '' });
    // the words are not an eye-toggle: the list's version is unchanged, the switch is still off as shipped
    expect((await api('GET')).a.version).toBe(v);
    expect((await api('GET')).a.rows.find((r) => r.id === 'checkout.doorNote:')).toMatchObject({ shown: false, def: false });
  });
});

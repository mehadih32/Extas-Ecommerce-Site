// S02 · PR 599 — Help & Build › Feature requests on a real PostgreSQL: asking numbers the requests per store and audits
// them; a staff member who may only look sees the list but cannot ask; the build team's status needs a PR number (in the
// register, built) or a note (already possible, not built); nothing is deleted; the open list comes as Markdown for the
// register flow. A throwaway database (skipped without TEST_DATABASE_ADMIN_URL). Sample values only.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { disconnectPrisma, MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from './admin-api';
import type { AdminDeps } from './admin-auth';
import { buildRequestsHandler } from './build-api';
import { requestsMarkdown, type RequestRow } from './feature-requests';

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
  return new Request(`https://${HOST}${o.path ?? '/api/admin/build/requests'}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
}

describe.skipIf(!HAS_TEST_DB)('Help & Build › Feature requests on PostgreSQL (PR 599)', () => {
  let t: TestDatabase;
  let admin: AdminDeps;
  let resolver: SettingsResolver<typeof registry>;
  let owner = '';
  let desk = '';
  const saved = process.env.DATABASE_URL;
  type Answer = { ok: boolean; error?: string; details?: string[]; request?: RequestRow; rows?: RequestRow[]; counts?: Record<string, number> };
  const api = async (method: string, o: { body?: unknown; cookie?: string; q?: string } = {}) => {
    const res = await buildRequestsHandler(req(method, { body: o.body, cookie: o.cookie ?? owner, path: `/api/admin/build/requests${o.q ?? ''}` }), admin);
    return { status: res.status, res, a: method === 'GET' && o.q?.includes('format=md') ? ({} as Answer) : ((await res.json()) as Answer) };
  };
  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web_feature_requests');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await disconnectPrisma();
    process.env.DATABASE_URL = t.url;
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    resolver = new SettingsResolver(prismaBackend(t.prisma), registry);
    admin = { db: t.prisma, resolver, vault: null } as unknown as AdminDeps;
    owner = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'owner@example.com', password: OWNER_PW } }), admin));
    const role = await rolesHandler(req('POST', { path: '/api/admin/roles', cookie: owner, body: { nameEn: 'Build looker', nameBn: 'দেখার ডেস্ক', permissions: ['build.read'] } }), admin);
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

  it('asks for a feature (F-1, F-2 …), lists it as open, audits it; a looker sees but cannot ask; bad input refused', async () => {
    const one = await api('POST', { body: { action: 'ask', title: 'Gift note', need: 'Let a customer write a gift note on the order.', section: 'orders', page: '/admin/orders', when: 'SOON' } });
    expect(one.status).toBe(201);
    expect(one.a.request).toMatchObject({ number: 1, status: 'NEW', when: 'SOON', section: 'orders', prNumber: null });
    const two = await api('POST', { body: { action: 'ask', title: 'Second idea', need: 'Something else the shop should do later.' } });
    expect(two.a.request).toMatchObject({ number: 2, when: 'LATER', section: null });
    expect((await api('POST', { body: { action: 'ask', title: 'x', need: 'short' } })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    expect((await api('POST', { body: { action: 'ask', title: 'Bad page', need: 'A page that is not an admin page.', page: 'https://example.com' } })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['page'] });
    const list = await api('GET', { cookie: desk });
    expect(list.status).toBe(200);
    expect(list.a.rows?.map((r) => r.number)).toEqual([2, 1]);
    expect(list.a.counts).toMatchObject({ open: 2, done: 0, all: 2 });
    expect((await api('POST', { cookie: desk, body: { action: 'ask', title: 'Not mine', need: 'A looker may not ask for a feature.' } })).status).toBe(403);
    expect(await t.prisma.auditLog.count({ where: { action: 'build.request.ask' } })).toBe(2);
  });

  it('the build team sets a status: PR number for register/built, a note for possible/not built; never deleted; Markdown list', async () => {
    const rows = (await api('GET')).a.rows!;
    const gift = rows.find((r) => r.number === 1)!;
    expect((await api('POST', { body: { action: 'status', id: gift.id, status: 'REGISTERED' } })).a).toMatchObject({ ok: false, error: 'PR_NEEDED' });
    expect((await api('POST', { body: { action: 'status', id: gift.id, status: 'REGISTERED', pr: 640 } })).a.request).toMatchObject({ status: 'REGISTERED', prNumber: 640 });
    expect((await api('POST', { body: { action: 'status', id: gift.id, status: 'REGISTERED', pr: 640 } })).a).toMatchObject({ ok: false, error: 'SAME_STATUS' });
    const other = rows.find((r) => r.number === 2)!;
    expect((await api('POST', { body: { action: 'status', id: other.id, status: 'POSSIBLE' } })).a).toMatchObject({ ok: false, error: 'NOTE_NEEDED' });
    expect((await api('POST', { body: { action: 'status', id: other.id, status: 'POSSIBLE', note: 'Settings › Shimmer already does it.' } })).a.request).toMatchObject({ status: 'POSSIBLE' });
    expect((await api('GET', { q: '?view=done' })).a.rows?.map((r) => r.number)).toEqual([2]);
    expect(await t.prisma.featureRequest.count()).toBe(2);
    expect(await t.prisma.auditLog.count({ where: { action: 'build.request.status' } })).toBe(2);
    const md = await api('GET', { q: '?view=all&format=md' });
    const text = await md.res.text();
    expect(md.res.headers.get('content-type')).toContain('text/markdown');
    expect(text).toContain('| F-1 |');
    expect(text).toContain('| 640 | Gift note |');
    expect(requestsMarkdown([{ ...gift, title: 'a | b', need: 'x\ny' }], 'H')).toContain('a \\| b | x y |');
  });
});

// S18 · PR 382 — Settings › Privacy & data on a real PostgreSQL: the page's data needs security.read (the requests only
// with customers.privacy); the card saves the keeping period and the erasure switch (security.write); a request is filed
// by the customer's number and carried out by the owner with the word of either admin language. A throwaway database
// (skipped without TEST_DATABASE_ADMIN_URL). Made-up test values.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { CONFIRM_WORDS, privacyHandler } from './api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const PHONE = '+8801700003829'; // hardcode-ok: made-up test number

function call(method: string, opts: { body?: unknown; cookie?: string; path?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.21' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${opts.path ?? '/api/admin/privacy'}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

interface Answer {
  ok: boolean;
  error?: string;
  cards: { keep: { value: Record<string, unknown>; version: string } };
  view: { purge: { lastRun: unknown; holding: number; overdue: number }; requests: { id: string; status: string; name: string | null; phoneEnd: string | null }[] | null; canErase: boolean };
}

describe.skipIf(!HAS_TEST_DB)('Settings › Privacy & data on PostgreSQL (PR 382)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let watcher = '';

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', { path: '/api/admin/auth/login', body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    const role = await rolesHandler(call('POST', { path: '/api/admin/roles', cookie: owner, body: { nameEn: 'Watch', nameBn: 'নজর', permissions: ['security.read'] } }), deps);
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(call('POST', { path: '/api/admin/staff', cookie: owner, body: { email: 'watch@example.com', displayName: 'Sample watcher', password: 'first password from the owner' } }), deps);
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(call('POST', { path: `/api/admin/staff/${staffId}/roles`, cookie: owner, body: { action: 'assign', roleId, storeId: MOTHER_STORE_ID } }), deps, staffId);
    const first = cookiesOf(await loginHandler(call('POST', { path: '/api/admin/auth/login', body: { email: 'watch@example.com', password: 'first password from the owner' } }), deps));
    watcher = cookiesOf(await passwordHandler(call('POST', { path: '/api/admin/auth/password', cookie: first, body: { current: 'first password from the owner', next: 'my own words for this job' } }), deps));
    await t.prisma.customer.create({ data: { storeId: MOTHER_STORE_ID, phone: PHONE, name: 'Sample buyer' } });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  const send = async (method: string, cookie: string, b?: unknown) => {
    const res = await privacyHandler(call(method, { cookie, body: b }), deps);
    return { status: res.status, a: (await res.json()) as Answer };
  };

  it('reads with security.read: the keeping period, the clean-up; no requests without customers.privacy', async () => {
    const w = await send('GET', watcher);
    expect(w.status).toBe(200);
    expect(w.a.cards.keep.value).toEqual({ retentionDays: 180, purgeEveryMinutes: 60, erasureRequests: false });
    expect(w.a.view.purge).toEqual({ lastRun: null, holding: 0, overdue: 0 });
    expect(w.a.view.requests).toBeNull();
    expect((await send('PUT', watcher, { key: 'keep', value: { retentionDays: 90 } })).status).toBe(403);
  });

  it('the owner saves the card, files a request by number, and erases with the word', async () => {
    const g = await send('GET', owner);
    expect(g.a.view.requests).toEqual([]);
    expect((await send('POST', owner, { action: 'request', phone: PHONE, reason: 'asked by phone' })).a.error).toBe('SWITCHED_OFF');
    const saved = await send('PUT', owner, { key: 'keep', value: { retentionDays: 90, erasureRequests: true }, version: g.a.cards.keep.version });
    expect(saved.status).toBe(200);
    expect(saved.a.cards.keep.value).toEqual({ retentionDays: 90, purgeEveryMinutes: 60, erasureRequests: true });
    expect((await deps.resolver.value('risk.capture', { storeId: MOTHER_STORE_ID })).retentionDays).toBe(90);
    expect((await send('PUT', owner, { key: 'keep', value: { retentionDays: 0 } })).status).toBe(400);

    expect((await send('POST', owner, { action: 'request', phone: '01700000000', reason: 'x' })).status).toBe(404);
    const filed = await send('POST', owner, { action: 'request', phone: '01700-003829', reason: 'asked by phone' });
    expect(filed.status).toBe(200);
    const req = filed.a.view.requests![0]!;
    expect(req).toMatchObject({ status: 'REQUESTED', name: 'Sample buyer', phoneEnd: '829' });
    expect(filed.a.view.canErase).toBe(true);

    const wrong = await send('POST', owner, { action: 'erase', requestId: req.id, confirm: 'please' });
    expect(wrong).toMatchObject({ status: 422, a: { error: 'CONFIRM_MISMATCH' } });
    const done = await send('POST', owner, { action: 'erase', requestId: req.id, confirm: CONFIRM_WORDS[1] });
    expect(done.status).toBe(200);
    expect(done.a.view.requests![0]).toMatchObject({ status: 'DONE', name: null, phoneEnd: null });
    expect(await t.prisma.customer.count({ where: { phone: PHONE } })).toBe(0);
    expect((await send('POST', owner, { action: 'nope' })).status).toBe(400);
  });
});

// S18 · PR 386 — Settings › Cloudflare protection on a real PostgreSQL, with the mock Cloudflare (no token in tests):
// without a host name no rule can be made or sent; with the staging host the plan's rules are listed and differ from
// the empty mock zone until sent; sending writes only the shop's rules and is audited; the sign-in limit is the owner's
// alone; a bad address is refused. A throwaway database (skipped without TEST_DATABASE_ADMIN_URL). Sample host names.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mockShieldLog } from '@extas/adapters';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { INSTALLATION, messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import { loginHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { edgeHandler } from './api';
import type { EdgeView } from './service';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, opts: { body?: unknown; cookie?: string; path?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.23' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${opts.path ?? '/api/admin/edge'}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
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
  details?: string[];
  view: EdgeView;
}

describe.skipIf(!HAS_TEST_DB)('Settings › Cloudflare protection on PostgreSQL (PR 386)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockShieldLog.clear();
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', { path: '/api/admin/auth/login', body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  const send = async (method: string, b?: unknown, cookie = owner) => {
    const res = await edgeHandler(call(method, { cookie, body: b }), deps);
    return { status: res.status, a: (await res.json()) as Answer };
  };

  it('makes no rule and sends nothing without a host name; a sign-in is needed', async () => {
    expect((await edgeHandler(call('GET'), deps)).status).toBe(401);
    const g = await send('GET');
    expect(g.a.view).toMatchObject({ link: { provider: 'cloudflare', mode: 'MOCK' }, hosts: [], hostsFrom: 'none', rules: [], canSend: true, owner: true, lastSent: null });
    expect((await send('POST', { action: 'send' })).a.error).toBe('NO_HOST');
    expect(mockShieldLog.rules()).toEqual({ config: [], custom: [], rate: [] });
  });

  it('lists the plan for the staging host, sends only the shop`s rules and audits it', async () => {
    await deps.resolver.set('system.stagingHost', 'new.example.com', INSTALLATION, { actorId: null, reason: 'test' });
    const g = await send('GET');
    expect(g.a.view.hosts).toEqual(['new.example.com']);
    expect(g.a.view.hostsFrom).toBe('staging');
    expect(g.a.view.rules).toEqual([
      { ref: 'extas-shield', phase: 'config', action: 'set_config' },
      { ref: 'extas-probes', phase: 'custom', action: 'block' },
    ]);
    expect(g.a.view.state.differences.map((d) => d.kind)).toEqual(['missing', 'missing']);
    const sent = await send('POST', { action: 'send' });
    expect(sent.status).toBe(200);
    expect(sent.a.view.state.differences).toEqual([]);
    expect(sent.a.view.lastSent).toMatchObject({ changed: ['config', 'custom'], mode: 'MOCK' });
    expect(mockShieldLog.rules().custom[0]!.expression).toContain('(http.host in {"new.example.com"})');
    expect(await t.prisma.auditLog.count({ where: { action: 'edge.shield.apply' } })).toBe(1);
    expect((await send('POST', { action: 'nope' })).status).toBe(400);
  });

  it('saves the plan, refuses a bad address, and keeps the sign-in limit for the owner', async () => {
    const g = await send('GET');
    const card = g.a.view.cards.shield;
    const saved = await send('PUT', { key: 'shield', value: { ...card.value, probePaths: '/wp-login.php, /.env /phpmyadmin', adminChallenge: true }, version: card.version });
    expect(saved.status).toBe(200);
    expect(await deps.resolver.value('edge.shield')).toMatchObject({ probePaths: ['/wp-login.php', '/.env', '/phpmyadmin'], adminChallenge: true });
    expect(saved.a.view.rules.map((r) => r.ref)).toEqual(['extas-shield', 'extas-probes', 'extas-admin']);
    expect(saved.a.view.state.differences).toEqual([
      { ref: 'extas-probes', kind: 'changed' },
      { ref: 'extas-admin', kind: 'missing' },
    ]);
    const next = saved.a.view.cards.shield;
    expect((await send('PUT', { key: 'shield', value: { ...next.value, probePaths: '/x" or true' }, version: next.version })).a).toMatchObject({ error: 'INVALID_INPUT', details: ['probePaths'] });
    expect((await send('PUT', { key: 'shield', value: { ...next.value, securityLevel: 'under_attack' }, version: next.version })).a.error).toBe('INVALID_INPUT');
    expect((await send('PUT', { key: 'shield', value: next.value, version: card.version })).status).toBe(409);
    // the owner may set the sign-in limit (another person is refused: OWNER_ONLY, checked in the service by isOwner)
    const limit = await send('PUT', { key: 'shield', value: { ...next.value, adminLoginPer10s: 5 }, version: next.version });
    expect(limit.status).toBe(200);
    expect(limit.a.view.rules.map((r) => r.ref)).toContain('extas-admin-login');
    expect(await t.prisma.auditLog.count({ where: { action: 'edge.shield.save' } })).toBe(2);
  });
});

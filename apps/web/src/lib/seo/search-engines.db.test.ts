// S11 · PR 233 — Search Console and Bing on a real PostgreSQL: nothing is sent before the shop has its own domain or
// while sitemaps are off; an engine with no key stays on its mock and sends nothing ("practice"); an engine is shown
// connected only once its connection is LIVE and on; "Send the sitemap" needs seo.manage and leaves an audit row.
// A throwaway database (skipped without TEST_DATABASE_ADMIN_URL).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { disconnectPrisma, MOTHER_STORE_ID } from '@extas/db/client';
import { messages, registry, storeTarget, syncSettings } from '@extas/settings';
import { mockSearchEngineLog } from '@extas/adapters';
import { createVault } from '@extas/vault';
import { loginHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { settingsResolver } from '../settings';
import { searchEngineState, seoSearchEnginesRoute } from './search-engines';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const BASE = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.43', origin: `https://${HOST}`, 'content-type': 'application/json' };
const call = (cookie?: string, method = 'POST') => new Request(`https://${HOST}/api/admin/seo/search-engines`, { method, headers: { ...BASE, ...(cookie ? { cookie } : {}) }, ...(method === 'POST' ? { body: '{}' } : {}) });
const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');
const forgetDomain = () => (globalThis as unknown as { __seoPrimary?: Map<number, unknown> }).__seoPrimary?.clear();

describe.skipIf(!HAS_TEST_DB)('Search Console and Bing on PostgreSQL (PR 233)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  const savedUrl = process.env.DATABASE_URL;
  const S = MOTHER_STORE_ID;
  const send = async () => {
    const res = await seoSearchEnginesRoute(call(owner), deps, []);
    expect(res.status).toBe(200);
    return (await res.json()) as Record<string, unknown>;
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    await disconnectPrisma();
    process.env.DATABASE_URL = t.url;
    forgetDomain();
    deps = { db: t.prisma, resolver: settingsResolver()!, vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
  }, 300_000);

  afterAll(async () => {
    vi.restoreAllMocks();
    forgetDomain();
    await disconnectPrisma();
    if (savedUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedUrl;
    await t?.drop();
  });

  it('"Send the sitemap" needs a session with seo.manage', async () => {
    expect((await seoSearchEnginesRoute(call(), deps, [])).status).toBe(401);
    const login = await loginHandler(new Request(`https://${HOST}/api/admin/auth/login`, { method: 'POST', headers: BASE, body: JSON.stringify({ email: 'owner@example.com', password: OWNER_PW }) }), deps);
    owner = cookiesOf(login);
    expect((await seoSearchEnginesRoute(call(owner, 'GET'), deps, [])).status).toBe(405);
    expect((await seoSearchEnginesRoute(call(owner), deps, ['x'])).status).toBe(404);
  });

  it('sends nothing before the shop has its own domain', async () => {
    expect(await send()).toEqual({ ok: true, blocked: 'noDomain' });
  });

  it('with a domain: an engine with no key sends nothing; sitemaps off sends nothing at all; each try is audited', async () => {
    await t.prisma.storeDomain.create({ data: { storeId: S, hostname: 'shop.example.test', isPrimaryHost: true, status: 'ACTIVE' } });
    forgetDomain();
    mockSearchEngineLog.clear();
    expect(await send()).toEqual({
      ok: true,
      sitemap: 'https://shop.example.test/sitemap.xml',
      results: [
        { engine: 'google', status: 'practice' },
        { engine: 'bing', status: 'practice' },
      ],
    });
    expect(mockSearchEngineLog.all()).toEqual([]);
    await settingsResolver()!.set('seo.sitemaps', { ...registry['seo.sitemaps'].default, enabled: false }, storeTarget(S), { actorId: null, reason: 'test' });
    expect(await send()).toEqual({ ok: true, blocked: 'sitemapsOff' });
    expect(await t.prisma.auditLog.count({ where: { action: 'seo.searchEngines.send' } })).toBe(3);
  });

  it('an engine shows connected only once its connection is LIVE and on', async () => {
    expect(await searchEngineState(t.prisma)).toEqual([
      { engine: 'google', connected: false },
      { engine: 'bing', connected: false },
    ]);
    await t.prisma.integration.create({ data: { kind: 'SEARCH_CONSOLE', provider: 'bingWebmaster', name: 'bingWebmaster', mode: 'LIVE', enabled: true, secretNames: [] } });
    await t.prisma.integration.create({ data: { kind: 'SEARCH_CONSOLE', provider: 'googleSearchConsole', name: 'googleSearchConsole', mode: 'MOCK', enabled: false, secretNames: [] } });
    expect(await searchEngineState(t.prisma)).toEqual([
      { engine: 'google', connected: false },
      { engine: 'bing', connected: true },
    ]);
  });
});

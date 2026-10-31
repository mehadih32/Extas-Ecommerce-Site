// S21 · PR 413 — Reports › Site health on a real PostgreSQL: a sign-in and `health.read` are needed; with no state folder
// every server line is grey; the server's files (a temporary folder standing in for EXTAS_STATE_DIR) turn the lines
// green or red; the limits are saved with `settings.write`, refused when stale or out of range, and audited. A
// throwaway database (skipped without TEST_DATABASE_ADMIN_URL). Sample values.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import { loginHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { healthHandler } from './api';
import type { HubView } from './service';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, opts: { body?: unknown; cookie?: string; path?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.24' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${opts.path ?? '/api/admin/health'}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
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
  view: HubView;
}

describe.skipIf(!HAS_TEST_DB)('Reports › Site health on PostgreSQL (PR 413)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  const dir = mkdtempSync(join(tmpdir(), 'extas-state-'));

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
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
    rmSync(dir, { recursive: true, force: true });
    await t?.drop();
  });

  const send = async (method: string, b?: unknown, stateDir: string | null = dir) => {
    const res = await healthHandler(call(method, { cookie: owner, body: b }), deps, { stateDir });
    return { status: res.status, a: (await res.json()) as Answer };
  };

  it('needs a sign-in; with no server reports every line is grey and says so', async () => {
    expect((await healthHandler(call('GET'), deps, { stateDir: null })).status).toBe(401);
    const g = await send('GET', undefined, null);
    expect(g.status).toBe(200);
    expect(g.a.view.serverConnected).toBe(false);
    // no worker has ever beaten in a fresh database: the server line still has nothing to judge without a report
    expect(g.a.view.lines.map((l) => [l.id, l.state])).toEqual([
      ['problems', 'off'],
      ['server', 'off'],
      ['speed', 'off'],
      ['audit', 'off'],
      ['smoke', 'off'],
    ]);
    expect(g.a.view.overall).toBe('off');
  });

  it("reads the server's files: a failed smoke test is red, a slow home page yellow", async () => {
    writeFileSync(join(dir, 'health.json'), JSON.stringify({ at: 'sample', problems: [], site_ms: 2500 }));
    writeFileSync(join(dir, 'smoke.json'), JSON.stringify({ at: 'sample', ok: false, pages: 30, failed: 1, problems: ['/checkout: console error'] }));
    writeFileSync(join(dir, 'k6-baseline.json'), 'not json');
    const g = await send('GET');
    const by = Object.fromEntries(g.a.view.lines.map((l) => [l.id, l]));
    expect(g.a.view.serverConnected).toBe(true);
    expect(by.server).toMatchObject({ state: 'warn', reason: 'workerNever' });
    expect(by.speed).toMatchObject({ state: 'warn', reason: 'slow', vars: { ms: 2500, limit: 2000 } });
    expect(by.speed!.note).toBeUndefined();
    expect(by.smoke).toMatchObject({ state: 'bad', reason: 'failed', vars: { failed: 1, pages: 30 } });
    expect(g.a.view.overall).toBe('bad');
  });

  it('saves the limits (audited), refuses a stale or out-of-range value, and judges with the new limit at once', async () => {
    const card = (await send('GET')).a.view.cards.hub;
    const saved = await send('PUT', { key: 'hub', value: { ...card.value, siteSlowMs: 3000 }, version: card.version });
    expect(saved.status).toBe(200);
    expect(saved.a.view.lines.find((l) => l.id === 'speed')).toMatchObject({ state: 'ok', vars: { ms: 2500 } });
    expect(await t.prisma.auditLog.count({ where: { action: 'health.hub.save' } })).toBe(1);
    expect((await send('PUT', { key: 'hub', value: card.value, version: card.version })).status).toBe(409);
    const next = saved.a.view.cards.hub;
    expect((await send('PUT', { key: 'hub', value: { ...next.value, smokeStaleHours: 0 }, version: next.version })).a).toMatchObject({ error: 'INVALID_INPUT', details: ['smokeStaleHours'] });
    expect((await send('DELETE')).status).toBe(405);
  });
});

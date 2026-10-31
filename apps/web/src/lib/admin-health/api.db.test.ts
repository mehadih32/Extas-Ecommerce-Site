// S21 · PR 413 — Reports › Site health on a real PostgreSQL: a sign-in and `health.read` are needed; with no state folder
// every server line is grey; the server's files (a temporary folder standing in for EXTAS_STATE_DIR) turn the lines
// green or red; the limits are saved with `settings.write`, refused when stale or out of range, and audited. A
// throwaway database (skipped without TEST_DATABASE_ADMIN_URL). Sample values. PR 414: the saved journeys' line, their
// kept runs, their schedule card and "Run now" (`settings.write`, audited); a read-only role is refused with 403.
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
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
  let watcher = '';
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
    // PR 414: a read-only role (what the check account's journeys stand for: it may look, never change)
    const role = await rolesHandler(call('POST', { path: '/api/admin/roles', cookie: owner, body: { nameEn: 'Watch', nameBn: 'নজর', permissions: ['health.read'] } }), deps);
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(call('POST', { path: '/api/admin/staff', cookie: owner, body: { email: 'watch@example.com', displayName: 'Sample watcher', password: 'first password from the owner' } }), deps);
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(call('POST', { path: `/api/admin/staff/${staffId}/roles`, cookie: owner, body: { action: 'assign', roleId, storeId: MOTHER_STORE_ID } }), deps, staffId);
    const first = cookiesOf(await loginHandler(call('POST', { path: '/api/admin/auth/login', body: { email: 'watch@example.com', password: 'first password from the owner' } }), deps));
    watcher = cookiesOf(await passwordHandler(call('POST', { path: '/api/admin/auth/password', cookie: first, body: { current: 'first password from the owner', next: 'my own words for this job' } }), deps));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
    await t?.drop();
  });

  const send = async (method: string, b?: unknown, stateDir: string | null = dir, cookie = owner) => {
    const res = await healthHandler(call(method, { cookie, body: b }), deps, { stateDir });
    return { status: res.status, a: (await res.json()) as Answer };
  };

  it('needs a sign-in; with no server reports every server line is grey and says so', async () => {
    expect((await healthHandler(call('GET'), deps, { stateDir: null })).status).toBe(401);
    const g = await send('GET', undefined, null);
    expect(g.status).toBe(200);
    expect(g.a.view.serverConnected).toBe(false);
    // no worker has ever beaten in a fresh database: the server line still has nothing to judge without a report
    expect(g.a.view.lines.map((l) => [l.id, l.state])).toEqual([
      ['problems', 'ok'],
      ['server', 'off'],
      ['speed', 'off'],
      ['audit', 'off'],
      ['smoke', 'off'],
      ['journeys', 'off'],
    ]);
    expect(g.a.view.lines.at(-1)?.reason).toBe('scheduleOff');
    expect(g.a.view.runs).toEqual([]);
    expect(g.a.view.cards.journeys.value).toEqual({ enabled: false, every: 'daily', hour: 6, weekday: 5, keepRuns: 30 });
    // PR 423: the recorder is on as it ships and nothing is open, so the problems line is green
    expect(g.a.view.overall).toBe('ok');
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

  it('PR 414: the last journeys run and the kept runs, newest first; a broken file is left out', async () => {
    writeFileSync(join(dir, 'journeys.json'), JSON.stringify({ at: 'sample', kind: 'scheduled', ok: false, journeys: 8, failed: 1, steps: 52, skipped: 0, problems: ['admin (phone) step 2 open /admin/products: request 500: /admin/products'] }));
    mkdirSync(join(dir, 'journeys'), { recursive: true });
    const run = (name: string, body: string, minutesAgo: number) => {
      writeFileSync(join(dir, 'journeys', name), body);
      const t0 = new Date(Date.now() - minutesAgo * 60_000);
      utimesSync(join(dir, 'journeys', name), t0, t0);
    };
    run('20261030-0400.json', JSON.stringify({ ok: true, kind: 'scheduled', journeys: 8, failed: 0, steps: 52, skipped: 4, problems: [] }), 24 * 60);
    run('20261031-0400.json', JSON.stringify({ ok: false, kind: 'scheduled', journeys: 8, failed: 1, steps: 52, skipped: 0, problems: ['admin (phone) step 2 open /admin/products: request 500: /admin/products'] }), 5);
    run('broken.json', '{', 1);
    run('notes.txt', 'not a run', 1);
    const g = await send('GET');
    expect(g.a.view.lines.find((l) => l.id === 'journeys')).toMatchObject({ state: 'bad', reason: 'failed', vars: { failed: 1, journeys: 8 } });
    expect(g.a.view.runs.map((r) => [r.ok, r.skipped])).toEqual([
      [false, 0],
      [true, 4],
    ]);
    expect(g.a.view.runs[0]!.first).toContain('/admin/products');
  });

  it('PR 414: the schedule is saved (audited) without touching "Run now"; Run now is recorded once until a newer run', async () => {
    const card = (await send('GET')).a.view.cards.journeys;
    expect((await send('PUT', { key: 'journeys', value: { ...card.value, runRequestedAt: new Date().toISOString() }, version: card.version })).a).toMatchObject({ error: 'INVALID_INPUT', details: ['runRequestedAt'] });
    expect((await send('PUT', { key: 'journeys', value: { ...card.value, every: 'monthly' }, version: card.version })).a).toMatchObject({ error: 'INVALID_INPUT', details: ['every'] });
    const saved = await send('PUT', { key: 'journeys', value: { ...card.value, enabled: true, every: 'weekly', weekday: 1, hour: 22 }, version: card.version });
    expect(saved.status).toBe(200);
    expect(saved.a.view.cards.journeys.value).toMatchObject({ enabled: true, every: 'weekly', weekday: 1, hour: 22 });
    expect(await t.prisma.auditLog.count({ where: { action: 'health.journeys.save' } })).toBe(1);
    expect((await send('PUT', { key: 'journeys', value: card.value, version: card.version })).status).toBe(409);

    expect((await send('POST', { action: 'nope' })).status).toBe(400);
    const asked = await send('POST', { action: 'run' });
    expect(asked.status).toBe(200);
    expect(asked.a.view.runAsked).toBe(true);
    expect(asked.a.view.lines.find((l) => l.id === 'journeys')?.note).toEqual({ key: 'asked', vars: {} });
    expect((await send('POST', { action: 'run' })).a.view.runAsked).toBe(true);
    expect(await t.prisma.auditLog.count({ where: { action: 'health.journeys.run' } })).toBe(1);
    const pressed = (await deps.resolver.value('health.journeys')).runRequestedAt;
    expect(pressed).toEqual(expect.any(String));
    // the schedule card's version ignores the press, and saving it keeps the press
    const next = asked.a.view.cards.journeys;
    expect(next.version).toBe(saved.a.view.cards.journeys.version);
    await send('PUT', { key: 'journeys', value: { ...next.value, keepRuns: 10 }, version: next.version });
    expect(await deps.resolver.value('health.journeys')).toMatchObject({ keepRuns: 10, runRequestedAt: pressed });
    // a run written after the press answers it
    const later = new Date(Date.parse(pressed!) + 60_000);
    utimesSync(join(dir, 'journeys.json'), later, later);
    expect((await send('GET')).a.view.runAsked).toBe(false);
  });

  it('PR 414: a read-only role sees the hub and is refused every change with 403 (what the accountant journey checks)', async () => {
    expect((await send('GET', undefined, dir, watcher)).status).toBe(200);
    expect((await send('PUT', { key: 'nope' }, dir, watcher)).status).toBe(403);
    expect((await send('POST', { action: 'nope' }, dir, watcher)).status).toBe(403);
    expect((await send('POST', { action: 'run' }, dir, watcher)).status).toBe(403);
  });
});

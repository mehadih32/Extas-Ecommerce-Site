// S21 · PR 419 — /api/admin/health/history on PostgreSQL: runs kept once (the server's import and the page's catch-up
// from state/smoke-runs and state/journeys), newest first, by tool and result, a page at a time; one run's findings
// compared with the run of the same tool before it; nothing without a sign-in; a read-only role sees everything.
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { journeysRunInput, keepRun, smokeRunInput } from '@extas/jobs';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { HISTORY_PAGE_SIZE, type HistoryRunView, type HistoryView } from './history';
import { historyHandler } from './history-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, opts: { cookie?: string; path?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.24' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  return new Request(`https://${HOST}${opts.path ?? '/api/admin/health/history'}`, { method, headers });
}

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);
const smokeRows = (failing: string[]) => ({ rows: ['/', '/checkout', '/about'].map((path) => ({ path, screen: 'phone', status: failing.includes(path) ? 500 : 200, ok: !failing.includes(path), problems: failing.includes(path) ? [`${path}: answered 500`] : [] })) });
const smokeResult = (at: string, failing: string[]) => ({ at, kind: 'nightly', sha: 'abc123', ok: !failing.length, pages: 3, failed: failing.length, problems: failing.map((p) => `${p}: answered 500 (phone)`) });

describe.skipIf(!HAS_TEST_DB)('Reports › Site health › Run history on PostgreSQL (PR 419)', () => {
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
    owner = cookiesOf(await loginHandler(new Request(`https://${HOST}/api/admin/auth/login`, { method: 'POST', headers: { host: HOST, origin: `https://${HOST}`, 'content-type': 'application/json', 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.24' }, body: JSON.stringify({ email: 'owner@example.com', password: OWNER_PW }) }), deps));
    const post = (path: string, body: unknown, cookie: string) => new Request(`https://${HOST}${path}`, { method: 'POST', headers: { host: HOST, origin: `https://${HOST}`, 'content-type': 'application/json', 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.24', cookie }, body: JSON.stringify(body) });
    const role = await rolesHandler(post('/api/admin/roles', { nameEn: 'Watch', nameBn: 'নজর', permissions: ['health.read'] }, owner), deps);
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(post('/api/admin/staff', { email: 'watch@example.com', displayName: 'Sample watcher', password: 'first password from the owner' }, owner), deps);
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(post(`/api/admin/staff/${staffId}/roles`, { action: 'assign', roleId, storeId: MOTHER_STORE_ID }, owner), deps, staffId);
    const first = cookiesOf(await loginHandler(post('/api/admin/auth/login', { email: 'watch@example.com', password: 'first password from the owner' }, ''), deps));
    watcher = cookiesOf(await passwordHandler(post('/api/admin/auth/password', { current: 'first password from the owner', next: 'my own words for this job' }, first), deps));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
    await t?.drop();
  });

  const list = async (query = '', cookie = owner, stateDir: string | null = dir) => {
    const res = await historyHandler(call('GET', { cookie, path: `/api/admin/health/history${query}` }), deps, { stateDir });
    return { status: res.status, v: ((await res.json()) as { view: HistoryView }).view };
  };
  const one = async (id: string, cookie = owner) => {
    const res = await historyHandler(call('GET', { cookie, path: `/api/admin/health/history?run=${id}` }), deps, { stateDir: dir });
    return { status: res.status, r: ((await res.json()) as { run: HistoryRunView }).run };
  };

  it('needs a sign-in; with nothing kept the history is empty', async () => {
    expect((await historyHandler(call('GET'), deps, { stateDir: dir })).status).toBe(401);
    const { status, v } = await list('', owner, null);
    expect(status).toBe(200);
    expect(v).toMatchObject({ kept: 0, total: 0, rows: [], latest: { smoke: null, journeys: null }, caughtUp: 0 });
  });

  it('keeps a run once, whether the server or the page keeps it first', async () => {
    const input = smokeRunInput(smokeResult('2026-10-29 03:30', ['/checkout']), smokeRows(['/checkout']), minutesAgo(3 * 1440))!;
    expect(await keepRun(t.prisma, input)).toBe('kept');
    expect(await keepRun(t.prisma, input)).toBe('known');
    // the same run in the server's files: the page does not keep it again
    const slot = join(dir, 'smoke-runs', 'scheduled');
    mkdirSync(slot, { recursive: true });
    writeFileSync(join(slot, 'result.json'), JSON.stringify(smokeResult('2026-10-29 03:30', ['/checkout'])));
    writeFileSync(join(slot, 'rows.json'), JSON.stringify(smokeRows(['/checkout'])));
    expect((await list()).v).toMatchObject({ kept: 1, caughtUp: 0 });
    expect(await t.prisma.siteAuditFinding.count()).toBe(1);
  });

  it('catches up from the server files: the newest smoke runs and the kept journeys summaries', async () => {
    const slot = join(dir, 'smoke-runs', 'scheduled');
    writeFileSync(join(slot, 'result.json'), JSON.stringify(smokeResult('2026-10-30 03:30', ['/checkout', '/about'])));
    writeFileSync(join(slot, 'rows.json'), JSON.stringify(smokeRows(['/checkout', '/about'])));
    utimesSync(join(slot, 'result.json'), minutesAgo(2 * 1440), minutesAgo(2 * 1440));
    const deploy = join(dir, 'smoke-runs', 'deploy');
    mkdirSync(deploy, { recursive: true });
    writeFileSync(join(deploy, 'result.json'), JSON.stringify({ ...smokeResult('2026-10-31 19:10', ['/about']), kind: 'after deploy' }));
    writeFileSync(join(deploy, 'rows.json'), JSON.stringify(smokeRows(['/about'])));
    utimesSync(join(deploy, 'result.json'), minutesAgo(60), minutesAgo(60));
    const jdir = join(dir, 'journeys');
    mkdirSync(jdir, { recursive: true });
    writeFileSync(join(jdir, '20261031-080001.json'), JSON.stringify({ at: '2026-10-31 08:00', kind: 'scheduled', sha: 'abc123', ok: true, journeys: 4, failed: 0, steps: 30, skipped: 0, problems: [] }));
    utimesSync(join(jdir, '20261031-080001.json'), minutesAgo(600), minutesAgo(600));
    writeFileSync(join(jdir, 'notes.txt'), 'not a run');
    const { v } = await list();
    expect(v.caughtUp).toBe(3);
    expect(v.kept).toBe(4);
    expect(v.rows.map((r) => [r.tool, r.at, r.ok, r.findings])).toEqual([
      ['smoke', '2026-10-31 19:10', false, 1],
      ['journeys', '2026-10-31 08:00', true, 0],
      ['smoke', '2026-10-30 03:30', false, 2],
      ['smoke', '2026-10-29 03:30', false, 1],
    ]);
    expect(v.failedWeek).toBe(3);
    expect(v.latest.smoke).toMatchObject({ at: '2026-10-31 19:10', kind: 'after deploy' });
    expect(v.latest.journeys).toMatchObject({ ok: true, passed: 4 });
    expect((await list()).v.caughtUp).toBe(0);
    // a journeys run the server kept in full later has the same key: still one run
    expect(await keepRun(t.prisma, journeysRunInput({ at: '2026-10-31 08:00', kind: 'scheduled', sha: 'abc123', ok: true, journeys: 4, failed: 0, rows: [] }, new Date())!)).toBe('known');
  });

  it('filters by tool and result, and pages', async () => {
    expect((await list('?tool=journeys')).v.rows.map((r) => r.tool)).toEqual(['journeys']);
    expect((await list('?tool=smoke&result=failed')).v).toMatchObject({ total: 3, tool: 'smoke', result: 'failed' });
    expect((await list('?tool=nope&result=nope')).v).toMatchObject({ tool: 'all', result: 'all', total: 4 });
    for (let i = 0; i < HISTORY_PAGE_SIZE; i += 1) await keepRun(t.prisma, smokeRunInput({ ...smokeResult(`2026-09-${String(i + 1).padStart(2, '0')} 03:30`, []) }, smokeRows([]), minutesAgo(40 * 1440 - i))!);
    const p1 = (await list()).v;
    expect(p1).toMatchObject({ page: 1, pages: 2, total: HISTORY_PAGE_SIZE + 4 });
    expect(p1.rows).toHaveLength(HISTORY_PAGE_SIZE);
    const p2 = (await list('?page=2')).v;
    expect(p2.rows).toHaveLength(4);
    expect(p2.rows.at(-1)!.at).toBe('2026-09-01 03:30');
    expect((await list('?page=99')).v.page).toBe(2);
  });

  it('opens one run: findings by severity, compared with the run of the same tool before it', async () => {
    const rows = (await list('?tool=smoke&result=failed')).v.rows;
    const newest = rows[0]!;
    const { status, r } = await one(newest.id);
    expect(status).toBe(200);
    expect(r.run).toMatchObject({ at: '2026-10-31 19:10', ok: false });
    expect(r.previous).toMatchObject({ at: '2026-10-30 03:30' });
    expect(r.findings.map((f) => [f.page, f.severity, f.isNew, f.fixStatus])).toEqual([['/about', 'URGENT', false, 'none']]);
    expect(r.fixedSince.map((f) => f.page)).toEqual(['/checkout']);
    const middle = (await one(rows[1]!.id)).r;
    expect(middle.findings.map((f) => [f.page, f.isNew])).toEqual([
      ['/about', true],
      ['/checkout', false],
    ]);
    // the oldest failed run follows a passing September run (no findings): everything in it is new
    const oldest = (await one(rows[2]!.id)).r;
    expect(oldest.previous).toMatchObject({ ok: true });
    expect(oldest.findings.every((f) => f.isNew)).toBe(true);
    expect((await one('00000000-0000-7000-8000-000000000000')).status).toBe(404);
    expect((await one('nope')).status).toBe(404);
  });

  it('a read-only role sees the history and every run; nothing but GET', async () => {
    const { status, v } = await list('', watcher);
    expect(status).toBe(200);
    expect(v.kept).toBe(HISTORY_PAGE_SIZE + 4);
    expect((await one(v.rows[0]!.id, watcher)).status).toBe(200);
    expect((await historyHandler(call('POST', { cookie: owner }), deps, { stateDir: dir })).status).toBe(405);
  });
});

// S21 · PR 424 — "Telegram when a test fails" on PostgreSQL (/api/admin/health/run-alerts): off as it ships; anyone with
// `health.read` sees the switches and what the server last said, only `settings.write` saves them (audited once per
// real change, a stale version refused, bad values named); the saved switches are what the server's file gets.
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { runAlertsPart, type PartContext } from '@extas/jobs';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { readAlertState, type RunAlertsView } from './run-alerts';
import { runAlertsHandler } from './run-alerts-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, opts: { body?: unknown; cookie?: string; path?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.25' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${opts.path ?? '/api/admin/health/run-alerts'}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
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
  view: RunAlertsView;
  cards: RunAlertsView['cards'];
}

describe.skipIf(!HAS_TEST_DB)('"Telegram when a test fails" on PostgreSQL (PR 424)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let watcher = '';
  let dir = '';
  const now = new Date('2026-10-31T10:00:00Z');

  const staff = async (email: string, perms: string[]) => {
    const role = await rolesHandler(call('POST', { path: '/api/admin/roles', cookie: owner, body: { nameEn: email, nameBn: email, permissions: perms } }), deps);
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(call('POST', { path: '/api/admin/staff', cookie: owner, body: { email, displayName: email, password: 'first password from the owner' } }), deps);
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(call('POST', { path: `/api/admin/staff/${staffId}/roles`, cookie: owner, body: { action: 'assign', roleId, storeId: MOTHER_STORE_ID } }), deps, staffId);
    const first = cookiesOf(await loginHandler(call('POST', { path: '/api/admin/auth/login', body: { email, password: 'first password from the owner' } }), deps));
    return cookiesOf(await passwordHandler(call('POST', { path: '/api/admin/auth/password', cookie: first, body: { current: 'first password from the owner', next: 'my own words for this job' } }), deps));
  };
  const ask = async (method: string, cookie: string, body?: unknown) => {
    const res = await runAlertsHandler(call(method, { cookie, body }), deps, { stateDir: dir });
    return { status: res.status, a: (await res.json()) as Answer };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')), now: () => now };
    owner = cookiesOf(await loginHandler(call('POST', { path: '/api/admin/auth/login', body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    watcher = await staff('watch@example.com', ['health.read']);
    dir = await mkdtemp(join(tmpdir(), 'run-alerts-'));
    await mkdir(join(dir, 'run-alerts'));
    await writeFile(join(dir, 'run-alerts', 'smoke.json'), JSON.stringify({ failing: true, since: 1793433600, told: 1793437200 }));
    await writeFile(join(dir, 'run-alerts', 'journeys.json'), 'not json');
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    if (dir) await rm(dir, { recursive: true, force: true });
    await t?.drop();
  });

  it('off as it ships; the server\'s last word for each test, a broken file is "nothing yet"', async () => {
    const { status, a } = await ask('GET', watcher);
    expect(status).toBe(200);
    expect(a.view.settings).toEqual({ enabled: false, smoke: true, journeys: true, repeatHours: 24, recovered: true });
    expect(a.view.canEdit).toBe(false);
    expect(a.view.told).toEqual({ smoke: { failing: true, since: '2026-10-31T08:00:00.000Z', told: '2026-10-31T09:00:00.000Z' }, journeys: null });
    expect(await readAlertState(null, 'smoke')).toBeNull();
  });

  it('only settings.write saves; a stale version and bad values are refused', async () => {
    const { a } = await ask('GET', owner);
    expect(a.view.canEdit).toBe(true);
    const card = a.cards.runAlerts;
    const on = { ...card.value, enabled: true, repeatHours: 6 };
    expect((await ask('PUT', watcher, { key: 'runAlerts', value: on, version: card.version })).status).toBe(403);
    expect((await ask('PUT', owner, { key: 'runAlerts', value: on, version: 'old' })).a.error).toBe('STALE');
    const bad = await ask('PUT', owner, { key: 'runAlerts', value: { ...on, repeatHours: 0, extra: 1 }, version: card.version });
    expect([bad.status, bad.a.error]).toEqual([400, 'INVALID_INPUT']);
    expect(bad.a.details).toContain('repeatHours');
    expect((await ask('PUT', owner, { key: 'other', value: on, version: card.version })).a.details).toEqual(['key']);
    expect(await t.prisma.auditLog.count({ where: { action: 'health.runAlerts.save' } })).toBe(0);
  });

  it('a real change is saved and audited once, and is what the server gets', async () => {
    const { a } = await ask('GET', owner);
    const on = { ...a.cards.runAlerts.value, enabled: true, journeys: false, repeatHours: 6 };
    const saved = await ask('PUT', owner, { key: 'runAlerts', value: on, version: a.cards.runAlerts.version });
    expect(saved.status).toBe(200);
    expect(saved.a.view.settings).toEqual(on);
    expect(saved.a.cards.runAlerts.version).not.toBe(a.cards.runAlerts.version);
    // the same values again change nothing
    await ask('PUT', owner, { key: 'runAlerts', value: on, version: saved.a.cards.runAlerts.version });
    expect(await t.prisma.auditLog.count({ where: { action: 'health.runAlerts.save' } })).toBe(1);
    const file = await runAlertsPart.build({ db: t.prisma, vault: null, connections: [], secret: async () => null, settings: deps.resolver } as unknown as PartContext);
    expect(file).toBe("RUN_ALERTS_ON='yes'\nRUN_ALERTS_SMOKE='yes'\nRUN_ALERTS_JOURNEYS='no'\nRUN_ALERTS_REPEAT_H='6'\nRUN_ALERTS_RECOVERED='yes'\n");
  });
});

// S21 · PR 570 — AI › Checklist audit on PostgreSQL (/api/admin/ai/audit): the checklist's groups and points; off as it
// ships; the last audit and the kept ones from the server's files (a broken file is skipped); the switches and "Run
// now" only with `settings.write` (audited; a stale version, an unknown or empty group choice refused); all ticked is
// saved as "all"; what the server's file gets.
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { auditSettingsPart, type PartContext } from '@extas/jobs';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import type { AuditView } from './audit';
import { auditHandler } from './audit-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, opts: { body?: unknown; cookie?: string; path?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.26' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${opts.path ?? '/api/admin/ai/audit'}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
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
  view: AuditView;
  cards: AuditView['cards'];
}

describe.skipIf(!HAS_TEST_DB)('AI › Checklist audit on PostgreSQL (PR 570)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let watcher = '';
  let dir = '';
  const now = new Date('2026-11-02T10:00:00Z');

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
    const res = await auditHandler(call(method, { cookie, body }), deps, { stateDir: dir });
    return { status: res.status, a: (await res.json()) as Answer };
  };
  const summary = { at: '2026-11-02 03:40 (Asia/Dhaka)', kind: 'scheduled', sha: 'abc', ok: false, chosen: 3, points: 60, passedGroups: 1, failedGroups: 1, agentGroups: 1, agents: { asked: 2 }, groups: [{ id: '8', status: 'fail', pages: 2, failedPages: 1, failedSteps: 0, problems: ['/bag (phone): console error'] }, { id: '6', status: 'pass', pages: 4 }, { id: '14', status: 'agents' }], problems: ['8. Bag: /bag (phone): console error'] };

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
    dir = await mkdtemp(join(tmpdir(), 'audit-'));
    await mkdir(join(dir, 'audit'));
    await writeFile(join(dir, 'audit.json'), JSON.stringify(summary));
    await writeFile(join(dir, 'audit', '20261102-034000.json'), JSON.stringify(summary));
    await writeFile(join(dir, 'audit', '20261026-034000.json'), JSON.stringify({ ...summary, ok: true, failedGroups: 0, passedGroups: 2, at: '2026-10-26 03:40 (Asia/Dhaka)' }));
    await writeFile(join(dir, 'audit', '20261019-034000.json'), 'not json');
    await writeFile(join(dir, 'audit', 'notes.txt'), 'x');
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    if (dir) await rm(dir, { recursive: true, force: true });
    await t?.drop();
  });

  it('the checklist, off as it ships, the last audit and the kept ones (a broken file skipped)', async () => {
    const { status, a } = await ask('GET', watcher);
    expect(status).toBe(200);
    const v = a.view;
    expect(v.points).toBeGreaterThan(400);
    expect(v.groups.map((g) => g.id)).toContain('timing');
    expect(v.groups.find((g) => g.id === '8')?.title).toBe('Bag');
    expect(v.settings).toMatchObject({ enabled: false, groups: [], agents: 2, telegram: true, runRequestedAt: null });
    expect(v.canEdit).toBe(false);
    expect(v.last).toMatchObject({ ok: false, failedGroups: 1, agentsAsked: 2, problems: ['8. Bag: /bag (phone): console error'] });
    expect(v.last?.groups.map((g) => [g.id, g.status])).toEqual([['8', 'fail'], ['6', 'pass'], ['14', 'agents']]);
    expect(v.runs.map((r) => r.ok)).toEqual([false, true]);
    expect(Object.values(a.cards.audit.value.groups).every(Boolean)).toBe(true);
  });

  it('only settings.write saves or runs; stale, unknown and empty group choices are refused', async () => {
    const { a } = await ask('GET', owner);
    const card = a.cards.audit;
    const some = { ...card.value, enabled: true, groups: Object.fromEntries(Object.keys(card.value.groups).map((id) => [id, id === '8' || id === '9'])) };
    expect((await ask('PUT', watcher, { key: 'audit', value: some, version: card.version })).status).toBe(403);
    expect((await ask('POST', watcher, { action: 'run' })).status).toBe(403);
    expect((await ask('PUT', owner, { key: 'audit', value: some, version: 'old' })).a.error).toBe('STALE');
    expect((await ask('PUT', owner, { key: 'audit', value: { ...some, groups: { ...some.groups, 99: true } }, version: card.version })).a.details).toEqual(['groups']);
    const none = Object.fromEntries(Object.keys(card.value.groups).map((id) => [id, false]));
    expect((await ask('PUT', owner, { key: 'audit', value: { ...some, groups: none }, version: card.version })).a.details).toEqual(['groups']);
    expect((await ask('PUT', owner, { key: 'audit', value: { ...some, agents: 4 }, version: card.version })).a.details).toEqual(['agents']);
    expect(await t.prisma.auditLog.count({ where: { action: { in: ['health.audit.save', 'health.audit.run'] } } })).toBe(0);
  });

  it('saves the chosen groups in order, all ticked = all; Run now is recorded and kept by a save; the server file', async () => {
    const { a } = await ask('GET', owner);
    const card = a.cards.audit;
    const some = { ...card.value, enabled: true, every: 'daily', groups: Object.fromEntries(Object.keys(card.value.groups).map((id) => [id, id === '9' || id === '8'])) };
    const saved = await ask('PUT', owner, { key: 'audit', value: some, version: card.version });
    expect(saved.status).toBe(200);
    expect(saved.a.view.settings).toMatchObject({ enabled: true, every: 'daily', groups: ['8', '9'] });
    const run = await ask('POST', owner, { action: 'run' });
    expect([run.a.view.settings.runRequestedAt, run.a.view.asked]).toEqual([now.toISOString(), true]);
    const all = { ...saved.a.cards.audit.value, groups: Object.fromEntries(Object.keys(card.value.groups).map((id) => [id, true])) };
    const back = await ask('PUT', owner, { key: 'audit', value: all, version: run.a.cards.audit.version });
    expect(back.a.view.settings).toMatchObject({ groups: [], runRequestedAt: now.toISOString() });
    expect(await t.prisma.auditLog.count({ where: { action: 'health.audit.save' } })).toBe(2);
    expect(await t.prisma.auditLog.count({ where: { action: 'health.audit.run' } })).toBe(1);
    const file = await auditSettingsPart.build({ db: t.prisma, vault: null, connections: [], secret: async () => null, settings: deps.resolver } as unknown as PartContext);
    expect(file).toContain("AUDIT_ON='yes'\nAUDIT_EVERY='daily'");
    expect(file).toContain("AUDIT_GROUPS=''");
    expect(file).toContain(`AUDIT_REQUESTED='${Math.floor(now.getTime() / 1000)}'`);
  });
});

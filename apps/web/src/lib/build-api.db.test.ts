// S21 · PR 594 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): "Report a problem on this PR" and the
// Blueprint & files download, through the API. The owner reports on PRs the register has (numbered R-1, R-2 …), a PR
// it does not have is refused, a status is set (fixed and closed say how or why), the lists count them, every step is
// audited; a person who may only read sees the list but cannot report; a file outside the docs listing is never sent.
// Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, createRole, defaultSecurityPolicy, hashPassword, SYSTEM, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { prismaBackend, registry, SettingsResolver } from '@extas/settings';
import type { AdminDeps } from './admin-auth';
import { loginHandler } from './admin-api';
import { buildFilesHandler, buildProblemsHandler } from './build-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const READER_PW = 'another long sentence for the tests';

function call(method: string, path: string, opts: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.44' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');

describe.skipIf(!HAS_TEST_DB)('Build progress: reported problems and files on PostgreSQL (PR 594)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let reader = '';
  const problems = async (method: 'GET' | 'POST', cookie: string, opts: { query?: string; body?: unknown } = {}) => {
    const res = await buildProblemsHandler(call(method, `/api/admin/build/problems${opts.query ?? ''}`, { cookie, body: opts.body }), deps);
    return { status: res.status, body: (await res.json()) as Record<string, any> };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web_build');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: null };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    const role = await createRole(t.prisma, SYSTEM, { key: 'test-build-read', nameEn: 'build reader', nameBn: 'build reader', permissions: ['build.read'] });
    const r = await t.prisma.staffUser.create({ data: { email: 'reader@example.com', displayName: 'Sample reader', passwordHash: await hashPassword(READER_PW), passwordSetAt: new Date() } });
    await t.prisma.staffRoleAssignment.create({ data: { staffUserId: r.id, roleId: role.id, storeId: null } });
    reader = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'reader@example.com', password: READER_PW } }), deps));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('reports on a PR the register has, numbers them, sets a status with its note, and audits each step', async () => {
    const first = await problems('POST', owner, { body: { action: 'report', pr: 594, note: 'the stage page should show who owns each PR', page: '/admin/build?stage=S21' } });
    expect(first.status).toBe(201);
    expect(first.body.problem).toMatchObject({ number: 1, prNumber: 594, status: 'OPEN', page: '/admin/build?stage=S21' });
    expect((await problems('POST', owner, { body: { action: 'report', pr: 155, note: 'dashboard sales differ from the money page' } })).body.problem).toMatchObject({ number: 2, prNumber: 155 });

    expect((await problems('POST', owner, { body: { action: 'report', pr: 99_999, note: 'no such PR here' } })).body).toMatchObject({ ok: false, error: 'UNKNOWN_PR' });
    expect((await problems('POST', owner, { body: { action: 'report', pr: 594, note: 'x' } })).body).toMatchObject({ error: 'INVALID_INPUT', details: ['note'] });
    expect((await problems('POST', owner, { body: { action: 'report', pr: 594, note: 'a real note', page: 'https://elsewhere.example/' } })).body).toMatchObject({ error: 'INVALID_INPUT', details: ['page'] });
    expect((await problems('POST', owner, { body: { action: 'delete', id: first.body.problem.id } })).status).toBe(422);

    let list = await problems('GET', owner);
    expect(list.body).toMatchObject({ view: 'open', counts: { open: 2, done: 0, all: 2 } });
    expect(list.body.rows.map((r: { number: number }) => r.number)).toEqual([2, 1]);
    expect(list.body.rows[0].reportedBy).toBe('Sample owner');

    const id = first.body.problem.id as string;
    expect((await problems('POST', owner, { body: { action: 'status', id, status: 'FIXED' } })).body).toMatchObject({ error: 'NOTE_NEEDED' });
    expect((await problems('POST', owner, { body: { action: 'status', id, status: 'FIXING' } })).body.problem).toMatchObject({ status: 'FIXING' });
    expect((await problems('POST', owner, { body: { action: 'status', id, status: 'FIXING' } })).body).toMatchObject({ error: 'SAME_STATUS' });
    expect((await problems('POST', owner, { body: { action: 'status', id, status: 'FIXED', note: 'the owner column is on the stage page' } })).body.problem).toMatchObject({ status: 'FIXED', statusNote: 'the owner column is on the stage page' });
    expect((await problems('POST', owner, { body: { action: 'status', id: '0196f000-0000-7000-8000-000000000000', status: 'OPEN' } })).status).toBe(404);

    list = await problems('GET', owner, { query: '?view=done' });
    expect(list.body).toMatchObject({ view: 'done', counts: { open: 1, done: 1, all: 2 } });
    expect(list.body.rows[0]).toMatchObject({ number: 1, status: 'FIXED', statusBy: 'Sample owner' });
    expect((await problems('GET', owner, { query: '?view=all&pr=155' })).body.rows).toHaveLength(1);

    // nothing is deleted; every report and status change is in the audit log
    expect(await t.prisma.buildProblem.count()).toBe(2);
    expect(await t.prisma.auditLog.count({ where: { action: 'build.problem.report' } })).toBe(2);
    expect(await t.prisma.auditLog.count({ where: { action: 'build.problem.status' } })).toBe(2);
  });

  it('a person who may only read sees the list but cannot report or change one', async () => {
    expect((await problems('GET', reader)).status).toBe(200);
    expect((await problems('POST', reader, { body: { action: 'report', pr: 594, note: 'a note from a reader' } })).status).toBe(403);
    expect((await problems('GET', '')).status).toBe(401);
  });

  it('sends a docs file from the listing as a download, and nothing else', async () => {
    const res = await buildFilesHandler(call('GET', '/api/admin/build/files?path=MASTER-REGISTER.md', { cookie: reader }), deps);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="MASTER-REGISTER.md"');
    expect(await res.text()).toMatch(/^# EXTAS — Master Register/);
    for (const bad of ['../README.md', 'agents/skills/INDEX.md', 'demo/EXTAS-demo-V12.4.html', '']) {
      expect((await buildFilesHandler(call('GET', `/api/admin/build/files?path=${encodeURIComponent(bad)}`, { cookie: reader }), deps)).status).toBe(404);
    }
    // a kept version exists only on the server's copies
    expect((await buildFilesHandler(call('GET', '/api/admin/build/files?path=MASTER-REGISTER.md&v=aaaaaaaaaaaa', { cookie: reader }), deps)).status).toBe(404);
  });
});

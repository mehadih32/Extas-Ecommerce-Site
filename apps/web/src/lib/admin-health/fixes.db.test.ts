// S21 · PR 420 — the approval gate on PostgreSQL (/api/admin/health/fixes): proposals are refused while the gate is off;
// an agent account proposes a fix for a run-history finding and a new skill; nothing is applied until the owner
// approves (requireApprovedFix); a decision is made once, never on one's own proposal, with the right permission; the
// re-test outcome is recorded only after an approval; an approved new skill stays switched off; undecided proposals
// expire; the "Needs you now" row counts what waits; every step is audited and nothing is deleted.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { keepRun, smokeRunInput } from '@extas/jobs';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { countQueues } from '../admin-shell/queues';
import { expireProposals, FixGateError, requireApprovedFix, type FixesView } from './fixes';
import { fixesHandler } from './fixes-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, opts: { body?: unknown; cookie?: string; path?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.24' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${opts.path ?? '/api/admin/health/fixes'}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
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
  id?: string;
  version?: number;
  status?: string;
  fixStatus?: string;
  view: FixesView;
  cards: FixesView['cards'];
}

describe.skipIf(!HAS_TEST_DB)('the approval gate for agent fixes and new skills on PostgreSQL (PR 420)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let agent = '';
  let watcher = '';
  let findings: { id: string; title: string }[] = [];
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

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')), now: () => now };
    owner = cookiesOf(await loginHandler(call('POST', { path: '/api/admin/auth/login', body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    agent = await staff('agent@example.com', ['health.read', 'health.fixes.propose']);
    watcher = await staff('watch@example.com', ['health.read']);
    const run = smokeRunInput(
      { at: '2026-10-31 02:00 (Asia/Dhaka)', kind: 'nightly', sha: 'abc123', ok: false, pages: 4, failed: 2, problems: [] },
      {
        rows: [
          { path: '/checkout', screen: 'phone', status: 200, ok: false, problems: ['/checkout: UI TAP-TOO-SMALL: button.pay (30px)'] },
          { path: '/about', screen: 'desktop', status: 200, ok: false, problems: ['/about: console error: boom'] },
        ],
      },
      now,
    )!;
    await keepRun(t.prisma, run);
    findings = await t.prisma.siteAuditFinding.findMany({ orderBy: { page: 'asc' }, select: { id: true, title: true } });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  const send = async (method: string, b?: unknown, cookie = owner, path?: string) => {
    const res = await fixesHandler(call(method, { cookie, body: b, path }), deps);
    return { status: res.status, a: (await res.json()) as Answer };
  };
  const checkout = () => findings.find((f) => f.title.includes('TAP-TOO-SMALL'))!.id;
  const about = () => findings.find((f) => f.title.includes('console'))!.id;

  it('ships off: proposals are refused, nothing waits, and the gate card says so', async () => {
    expect((await fixesHandler(call('GET'), deps)).status).toBe(401);
    const { status, a } = await send('GET', undefined, watcher);
    expect(status).toBe(200);
    expect(a.view).toMatchObject({ show: 'waiting', rows: [], waitingFixes: 0, waitingSkills: 0, canApprove: false, canEdit: false, gate: { proposals: false, expireDays: 0 } });
    const off = await send('POST', { action: 'propose-fix', findingId: checkout(), fix: 'make the pay button 44px tall' }, agent);
    expect(off).toMatchObject({ status: 409, a: { error: 'PROPOSALS_OFF' } });
    expect(await t.prisma.aiApprovalRequest.count()).toBe(0);
  });

  it('only settings.write turns the gate on (audited, stale versions refused)', async () => {
    const card = (await send('GET')).a.cards.fixGate;
    expect((await send('PUT', { key: 'fixGate', value: { proposals: true, expireDays: 0 }, version: card.version }, watcher)).status).toBe(403);
    expect((await send('PUT', { key: 'fixGate', value: { proposals: true, expireDays: 0 }, version: 'old' })).a.error).toBe('STALE');
    expect((await send('PUT', { key: 'fixGate', value: { proposals: true, expireDays: 91 }, version: card.version })).a).toMatchObject({ error: 'INVALID_INPUT', details: ['expireDays'] });
    const on = await send('PUT', { key: 'fixGate', value: { proposals: true, expireDays: 0 }, version: card.version });
    expect(on.status).toBe(200);
    expect(on.a.view.gate.proposals).toBe(true);
    expect(await t.prisma.auditLog.count({ where: { action: 'health.fixGate.save' } })).toBe(1);
  });

  it('an agent proposes a fix: it waits, the finding shows it, and nothing may apply it yet', async () => {
    expect((await send('POST', { action: 'propose-fix', findingId: checkout(), fix: 'x' }, watcher)).status).toBe(403);
    expect((await send('POST', { action: 'propose-fix', findingId: checkout(), fix: '  ' }, agent)).a).toMatchObject({ error: 'INVALID_INPUT', details: ['fix'] });
    expect((await send('POST', { action: 'propose-fix', findingId: checkout(), fix: 'ok', agentKey: 'bad key!' }, agent)).a.details).toEqual(['agentKey']);
    const p = await send('POST', { action: 'propose-fix', findingId: checkout(), fix: 'make the pay button 44px tall', agentKey: 'prohori' }, agent);
    expect(p.status).toBe(200);
    // one proposal at a time per finding
    expect((await send('POST', { action: 'propose-fix', findingId: checkout(), fix: 'again' }, agent)).a.error).toBe('BUSY');
    const f = await t.prisma.siteAuditFinding.findUniqueOrThrow({ where: { id: checkout() } });
    expect(f).toMatchObject({ fixStatus: 'proposed', suggestedFix: 'make the pay button 44px tall', approvalRequestId: p.a.id });
    await expect(requireApprovedFix(t.prisma, checkout())).rejects.toBeInstanceOf(FixGateError);
    expect((await send('POST', { action: 'outcome', findingId: checkout(), outcome: 'fixed' }, agent)).a.error).toBe('NOT_APPROVED');
    const { a } = await send('GET');
    expect(a.view.waitingFixes).toBe(1);
    expect(a.view.rows).toEqual([
      expect.objectContaining({ id: p.a.id, kind: 'health.fix', status: 'PENDING', agentKey: 'prohori', own: false, summary: 'make the pay button 44px tall', fix: expect.objectContaining({ findingId: checkout(), page: '/checkout', device: 'phone', severity: 'URGENT', fixStatus: 'proposed' }) }),
    ]);
    // "Needs you now" counts it
    const q = await countQueues({ db: t.prisma, settings: deps.resolver, now: () => now }, MOTHER_STORE_ID);
    expect(q.find((r) => r.id === 'agentFixes')).toMatchObject({ n: 1 });
  });

  it('nobody decides their own proposal; only health.fixes.approve decides', async () => {
    const own = await send('POST', { action: 'propose-fix', findingId: about(), fix: 'catch the error' });
    expect(own.status).toBe(200);
    expect((await send('GET')).a.view.rows.find((r) => r.id === own.a.id)!.own).toBe(true);
    expect((await send('POST', { action: 'approve', id: own.a.id })).a.error).toBe('OWN_PROPOSAL');
    const pending = (await send('GET')).a.view.rows.find((r) => !r.own)!;
    expect((await send('POST', { action: 'approve', id: pending.id }, agent)).status).toBe(403);
    expect((await send('POST', { action: 'approve', id: pending.id }, watcher)).status).toBe(403);
    expect((await send('POST', { action: 'approve', id: '00000000-0000-0000-0000-000000000000' })).status).toBe(404);
    expect((await send('POST', { action: 'nope', id: pending.id })).status).toBe(400);
  });

  it('the owner approves once: the fix may run, then its re-test is recorded', async () => {
    const pending = (await send('GET')).a.view.rows.find((r) => !r.own)!;
    const ok = await send('POST', { action: 'approve', id: pending.id, reason: 'go ahead' });
    expect(ok).toMatchObject({ status: 200, a: { status: 'APPROVED' } });
    expect((await send('POST', { action: 'reject', id: pending.id })).a.error).toBe('DECIDED');
    expect(await requireApprovedFix(t.prisma, checkout())).toMatchObject({ findingId: checkout(), fix: 'make the pay button 44px tall', approvalRequestId: pending.id });
    expect(await t.prisma.aiApprovalRequest.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({ status: 'APPROVED', decisionNote: 'go ahead' });
    expect((await send('POST', { action: 'outcome', findingId: checkout(), outcome: 'maybe' }, agent)).a.details).toEqual(['outcome']);
    const done = await send('POST', { action: 'outcome', findingId: checkout(), outcome: 'rolled-back', note: 'the layout broke on 320px' }, agent);
    expect(done).toMatchObject({ status: 200, a: { fixStatus: 'rolled-back' } });
    // a rolled-back fix is not approved any more: nothing may apply it again, but a new proposal may come
    await expect(requireApprovedFix(t.prisma, checkout())).rejects.toBeInstanceOf(FixGateError);
    expect((await send('POST', { action: 'propose-fix', findingId: checkout(), fix: 'only the pay button, not the row' }, agent)).status).toBe(200);
    const decided = await send('GET', undefined, owner, '/api/admin/health/fixes?show=decided');
    expect(decided.a.view.rows).toEqual([expect.objectContaining({ id: pending.id, status: 'APPROVED', fix: expect.objectContaining({ fixStatus: 'proposed' }) })]);
    expect(await t.prisma.auditLog.count({ where: { action: { in: ['health.fix.propose', 'health.fix.approve', 'health.fix.outcome'] } } })).toBe(5);
  });

  it('a rejected fix changes nothing and the finding is open for another proposal', async () => {
    const rows = (await send('GET')).a.view.rows;
    const next = rows.find((r) => r.fix?.findingId === checkout())!;
    expect((await send('POST', { action: 'reject', id: next.id, reason: 'x'.repeat(501) })).a.details).toEqual(['reason']);
    expect((await send('POST', { action: 'reject', id: next.id, reason: 'too wide' })).a.status).toBe('REJECTED');
    expect(await t.prisma.siteAuditFinding.findUniqueOrThrow({ where: { id: checkout() } })).toMatchObject({ fixStatus: 'rejected' });
    await expect(requireApprovedFix(t.prisma, checkout())).rejects.toBeInstanceOf(FixGateError);
  });

  it('a new skill waits, and once approved it is current but stays switched off', async () => {
    const bad = await send('POST', { action: 'propose-skill', key: 'Bad Key', name: 'x', content: 'y' }, agent);
    expect(bad.a.details).toEqual(['key']);
    const p = await send('POST', { action: 'propose-skill', key: 'tap-size-check', name: 'Tap size check', purpose: 'Find small buttons on phones', content: 'Measure every button; flag under 44px.', agentKey: 'prohori' }, agent);
    expect(p.a).toMatchObject({ ok: true, version: 1 });
    expect((await send('POST', { action: 'propose-skill', key: 'tap-size-check', name: 'Tap size check', content: 'v2' }, agent)).a.error).toBe('BUSY');
    expect(await t.prisma.aiSkill.findUniqueOrThrow({ where: { key: 'tap-size-check' } })).toMatchObject({ status: 'proposed', enabled: false, currentVersion: 0 });
    const row = (await send('GET')).a.view.rows.find((r) => r.id === p.a.id)!;
    expect(row).toMatchObject({ kind: 'ai.skill', skill: { key: 'tap-size-check', version: 1, isNew: true, preview: 'Measure every button; flag under 44px.' } });
    expect((await send('GET')).a.view.waitingSkills).toBe(1);
    expect((await send('POST', { action: 'approve', id: p.a.id })).a.status).toBe('APPROVED');
    const skill = await t.prisma.aiSkill.findUniqueOrThrow({ where: { key: 'tap-size-check' }, include: { versions: true } });
    expect(skill).toMatchObject({ status: 'approved', enabled: false, currentVersion: 1 });
    expect(skill.versions[0]!.approvedById).not.toBeNull();
    // a second version is an update; rejecting it keeps the approved version current
    const v2 = await send('POST', { action: 'propose-skill', key: 'tap-size-check', name: 'Tap size check', content: 'Measure links too.', changeNote: 'links' }, agent);
    expect(v2.a.version).toBe(2);
    expect((await send('GET')).a.view.rows.find((r) => r.id === v2.a.id)!.skill).toMatchObject({ isNew: false, changeNote: 'links' });
    expect((await send('POST', { action: 'reject', id: v2.a.id })).a.status).toBe('REJECTED');
    expect(await t.prisma.aiSkill.findUniqueOrThrow({ where: { key: 'tap-size-check' } })).toMatchObject({ status: 'approved', currentVersion: 1, enabled: false });
    expect(await t.prisma.aiSkillVersion.count()).toBe(2);
  });

  it('undecided proposals expire after the set days and can be proposed again', async () => {
    const card = (await send('GET')).a.cards.fixGate;
    expect((await send('PUT', { key: 'fixGate', value: { proposals: true, expireDays: 3 }, version: card.version })).status).toBe(200);
    const p = await send('POST', { action: 'propose-fix', findingId: checkout(), fix: 'third try' }, agent);
    expect((await t.prisma.aiApprovalRequest.findUniqueOrThrow({ where: { id: p.a.id } })).expiresAt!.toISOString()).toBe(new Date(now.getTime() + 3 * 86_400_000).toISOString());
    // four days on (moved on the proposal, not the clock, so the sign-in stays fresh)
    await t.prisma.aiApprovalRequest.update({ where: { id: p.a.id }, data: { expiresAt: new Date(now.getTime() - 86_400_000) } });
    const { a } = await send('GET');
    expect(a.view.rows.some((r) => r.id === p.a.id)).toBe(false);
    expect(await t.prisma.aiApprovalRequest.findUniqueOrThrow({ where: { id: p.a.id } })).toMatchObject({ status: 'EXPIRED' });
    expect(await t.prisma.siteAuditFinding.findUniqueOrThrow({ where: { id: checkout() } })).toMatchObject({ fixStatus: 'expired' });
    expect((await send('POST', { action: 'approve', id: p.a.id })).a.error).toBe('DECIDED');
    expect(await expireProposals(t.prisma, now)).toBe(0);
    expect((await send('POST', { action: 'propose-fix', findingId: checkout(), fix: 'fourth try' }, agent)).status).toBe(200);
  });

  it('keeps every proposal and decision (nothing deleted)', async () => {
    expect(await t.prisma.aiApprovalRequest.count()).toBe(7);
    expect(await t.prisma.siteAuditFinding.count()).toBe(2);
  });
});

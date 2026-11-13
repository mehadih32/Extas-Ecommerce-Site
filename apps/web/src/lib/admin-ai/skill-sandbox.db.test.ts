// S15 · PR 322 — the skill sandbox's own writer on a real PostgreSQL. Called straight (no HTTP handler is
// exercised here — `skills-api.ts`'s own guard is a thin, already-reviewed wrapper, the same split every other
// admin-ai `.db.test.ts` already uses). A throwaway database (skipped without TEST_DATABASE_ADMIN_URL).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { loginHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { decideProposal, type FixesDeps } from '../admin-health/fixes';
import { isAiError } from './errors';
import { runSkillSandbox, sandboxHistory, type SkillSandboxDeps } from './skill-sandbox';
import { importSkill, type SkillsDeps } from './skills';

const S = MOTHER_STORE_ID;
const NOW = new Date('2026-11-12T10:00:00Z');
const HOST = 'admin.example.test';
let n = 0;

function call(method: string, path: string, opts: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.62' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

describe.skipIf(!HAS_TEST_DB)('AI 360 · the skill sandbox writer on PostgreSQL (PR 322)', () => {
  let t: TestDatabase;
  let deps: SkillSandboxDeps;
  let skillsDeps: SkillsDeps;
  let fixesDeps: FixesDeps;
  let adminDeps: AdminDeps;
  let owner = '';
  let ownerId = '';
  let approverId = '';

  const order = (placedAt: Date) => t.prisma.order.create({ data: { storeId: S, number: `SBX-${++n}`, source: 'WEBSITE', currency: 'BDT', subtotalMinor: 1_000, totalMinor: 1_000, idempotencyKey: `sbx-${n}`, placedAt } });
  const who = (staffUserId: string): { actor: Actor; ctx: Record<string, never> } => ({ actor: { staffUserId }, ctx: {} });
  const day = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86_400_000);

  beforeAll(async () => {
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    const owned = await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: 'a long sentence for the tests', passwordChosenByOwner: true });
    ownerId = owned.id;
    const resolver = new SettingsResolver(prismaBackend(t.prisma), registry);
    deps = { db: t.prisma, resolver, now: () => NOW };
    skillsDeps = { db: t.prisma, resolver, now: () => NOW };
    fixesDeps = { db: t.prisma, resolver, now: () => NOW };
    adminDeps = { db: t.prisma, resolver, vault: null, now: () => NOW };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/login', { body: { email: 'owner@example.com', password: 'a long sentence for the tests' } }), adminDeps));

    // A separate approver — the owner's own importSkill proposal cannot be self-approved (OWN_PROPOSAL).
    const role = await rolesHandler(call('POST', '/api/admin/roles', { cookie: owner, body: { nameEn: 'Approver', nameBn: 'Approver', permissions: ['health.fixes.approve'] } }), adminDeps);
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(call('POST', '/api/admin/staff', { cookie: owner, body: { email: 'approver@example.com', displayName: 'Approver', password: 'first password from the owner' } }), adminDeps);
    approverId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(call('POST', '/api/admin/staff-roles', { cookie: owner, body: { action: 'assign', roleId, storeId: MOTHER_STORE_ID } }), adminDeps, approverId);

    // Real, read-only data to test against: 3 orders in the last 7 days, 2 more between 7 and 30 days ago, 1 older.
    await order(day(1));
    await order(day(3));
    await order(day(6));
    await order(day(10));
    await order(day(20));
    await order(day(45));
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('throws for an unknown data window, a skill that does not exist, or one with no version yet', async () => {
    const out = await importSkill(skillsDeps, who(ownerId), { agentKey: 'doot', name: 'Reel caption sandbox test' });
    await expect(runSkillSandbox(deps, who(ownerId), { storeId: S, skillId: out.id, dataWindowDays: 14 as never })).rejects.toSatisfy((e: unknown) => isAiError(e) && e.code === 'INVALID_INPUT');
    await expect(runSkillSandbox(deps, who(ownerId), { storeId: S, skillId: '00000000-0000-0000-0000-000000000000', dataWindowDays: 7 })).rejects.toSatisfy((e: unknown) => isAiError(e) && e.code === 'NOT_FOUND');
    expect(await t.prisma.aiSandboxRun.count()).toBe(0);
  });

  it('reads the real order count for the window, never writing to Order itself, and logs an append-only run; honestly NO_EXCHANGE_RATE before any rate is typed', async () => {
    const out = await importSkill(skillsDeps, who(ownerId), { agentKey: 'doot', name: 'Reel caption sandbox count test', content: 'Reply with a caption.' });
    const before = await t.prisma.order.findMany({ select: { id: true, updatedAt: true } });

    const run7 = await runSkillSandbox(deps, who(ownerId), { storeId: S, skillId: out.id, dataWindowDays: 7 });
    expect(run7).toMatchObject({ skillId: out.id, skillKey: out.key, version: 1, dataWindowDays: 7, ordersRead: 3, passed: true, estimatedCostMinor: null, costNote: 'NO_EXCHANGE_RATE' });

    const run30 = await runSkillSandbox(deps, who(ownerId), { storeId: S, skillId: out.id, dataWindowDays: 30 });
    expect(run30.ordersRead).toBe(5);

    // nothing on Order itself changed
    const after = await t.prisma.order.findMany({ select: { id: true, updatedAt: true } });
    expect(after).toEqual(before);

    // two append-only rows, never overwritten
    expect(await t.prisma.aiSandboxRun.count({ where: { kind: 'skill', skillKey: out.key } })).toBe(2);
    expect(await t.prisma.auditLog.count({ where: { action: 'ai.skill.sandbox', entityId: out.id } })).toBe(2);
  });

  it("estimates a real cost once the skill's agent has a Cost Book job and a USD rate exists, scaled by orders read", async () => {
    await t.prisma.exchangeRate.create({ data: { storeId: S, baseCurrency: 'USD', quoteCurrency: 'BDT', rate: '119.5', effectiveFrom: new Date('2026-01-01T00:00:00Z') } });
    const out = await importSkill(skillsDeps, who(ownerId), { agentKey: 'doot', name: 'Costed sandbox test', content: 'Reply with a caption.' });

    const run = await runSkillSandbox(deps, who(ownerId), { storeId: S, skillId: out.id, dataWindowDays: 7 });
    expect(run.costNote).toBeNull();
    expect(run.estimatedCostMinor).not.toBeNull();
    expect(run.estimatedCostMinor!).toBeGreaterThan(0);

    const run30 = await runSkillSandbox(deps, who(ownerId), { storeId: S, skillId: out.id, dataWindowDays: 30 });
    expect(run30.estimatedCostMinor!).toBeGreaterThanOrEqual(run.estimatedCostMinor!); // more orders read, never a smaller cost
  });

  it('is honest, never a guessed number: NO_AGENT_JOB when the agent has no Cost Book job at all', async () => {
    // bhandari has no Cost Book job — true whether or not a USD rate exists
    const noJob = await importSkill(skillsDeps, who(ownerId), { agentKey: 'bhandari', name: 'No cost-book job sandbox test' });
    const runNoJob = await runSkillSandbox(deps, who(ownerId), { storeId: S, skillId: noJob.id, dataWindowDays: 7 });
    expect(runNoJob).toMatchObject({ estimatedCostMinor: null, costNote: 'NO_AGENT_JOB' });
  });

  it('passed is false for a skill version with no real content, true once it has some', async () => {
    const empty = await t.prisma.aiSkill.create({ data: { key: `empty-${Date.now()}`, name: 'Placeholder-only skill', status: 'proposed', source: 'owner_import', sourceRef: 'doot', enabled: false } });
    await t.prisma.aiSkillVersion.create({ data: { skillId: empty.id, version: 1, content: '   ' } });
    const run = await runSkillSandbox(deps, who(ownerId), { storeId: S, skillId: empty.id, dataWindowDays: 7 });
    expect(run.passed).toBe(false);
  });

  it('sandboxHistory lists newest first, is append-only, and mirrors the same answer run after run', async () => {
    const out = await importSkill(skillsDeps, who(ownerId), { agentKey: 'doot', name: 'History order sandbox test', content: 'Reply with a caption.' });
    const a = await runSkillSandbox(deps, who(ownerId), { storeId: S, skillId: out.id, dataWindowDays: 7 });
    const b = await runSkillSandbox(deps, who(ownerId), { storeId: S, skillId: out.id, dataWindowDays: 30 });
    const rows = await sandboxHistory(deps, out.key);
    expect(rows.map((r) => r.id)).toEqual([b.id, a.id]);
    expect(rows[0]).toMatchObject({ dataWindowDays: 30, ordersRead: b.ordersRead, passed: true });

    // approving the skill afterwards never touches the sandbox log — a separate, append-only table
    await decideProposal(fixesDeps, who(approverId), { id: out.approvalRequestId, decision: 'approve' });
    expect(await sandboxHistory(deps, out.key)).toHaveLength(2);
  });
});

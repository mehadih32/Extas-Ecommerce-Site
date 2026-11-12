// S15 · PR 323 — the real "correction becomes a training example" loop on PostgreSQL: `recordSkillCorrection`
// (called straight for its own honest-gap branches) and the full real loop — `importSkill` (PR 321) raising an
// `ai.skill` approval request, `approvalsHandler` (PR 317) rejecting it with a reason through `fixes.decideProposal`
// (S21 · PR 420, already shipped), which now also writes the agent's own training example — plus the small
// `GET /api/admin/ai/training` read side. A throwaway database (skipped without TEST_DATABASE_ADMIN_URL, like every
// other `.db.test.ts`).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { FIX_KIND } from '../admin-health/fixes';
import { approvalsHandler } from './approvals-api';
import { importSkill, type SkillsDeps } from './skills';
import { recordSkillCorrection, trainingExamplesView, type TrainingDeps } from './training';
import { trainingHandler } from './training-api';

const S = MOTHER_STORE_ID;
const NOW = new Date('2026-11-12T12:00:00Z');
const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, opts: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.70' };
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

describe.skipIf(!HAS_TEST_DB)('AI 360 · corrections become training examples on PostgreSQL (PR 323)', () => {
  let t: TestDatabase;
  let deps: TrainingDeps;
  let skillsDeps: SkillsDeps;
  let adminDeps: AdminDeps;
  let owner = '';
  let ownerId = '';
  // Imports in this file are always made by the owner; decisions are always made by a *separate* approver account
  // (health.fixes.approve), since `fixes.decideProposal`'s own `OWN_PROPOSAL` rule refuses the importer deciding
  // their own import — the same split `skills.db.test.ts` already uses.
  let approverCookie = '';
  let readerCookie = '';

  const staff = async (email: string, perms: string[]) => {
    const role = await rolesHandler(call('POST', '/api/admin/roles', { cookie: owner, body: { nameEn: email, nameBn: email, permissions: perms } }), adminDeps);
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(call('POST', '/api/admin/staff', { cookie: owner, body: { email, displayName: email, password: 'first password from the owner' } }), adminDeps);
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(call('POST', '/api/admin/staff-roles', { cookie: owner, body: { action: 'assign', roleId, storeId: S } }), adminDeps, staffId);
    const first = cookiesOf(await loginHandler(call('POST', '/api/admin/login', { body: { email, password: 'first password from the owner' } }), adminDeps));
    return cookiesOf(await passwordHandler(call('POST', '/api/admin/password', { cookie: first, body: { current: 'first password from the owner', next: 'my own words for this job' } }), adminDeps));
  };

  beforeAll(async () => {
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    const owned = await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    ownerId = owned.id;
    const resolver = new SettingsResolver(prismaBackend(t.prisma), registry);
    deps = { db: t.prisma };
    skillsDeps = { db: t.prisma, resolver, now: () => NOW };
    adminDeps = { db: t.prisma, resolver, vault: null, now: () => NOW };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), adminDeps));
    approverCookie = await staff('approver@example.com', ['ai.read', 'health.fixes.approve']);
    readerCookie = await staff('reader@example.com', ['ai.read']);
  });
  afterAll(async () => {
    await t?.drop();
  });

  const who = (staffUserId: string): { actor: Actor; ctx: Record<string, never> } => ({ actor: { staffUserId }, ctx: {} });

  const decide = (id: string, decision: 'approve' | 'reject', note?: string) => approvalsHandler(call('POST', '/api/admin/ai/approvals', { cookie: approverCookie, body: { id, decision, note } }), adminDeps);

  it('recordSkillCorrection honestly writes nothing for a skill, a version or a reason it cannot find', async () => {
    await expect(recordSkillCorrection(deps, who(ownerId), { skillId: '00000000-0000-0000-0000-000000000000', agentKey: 'doot', payload: { version: 1 }, reason: 'Wrong tone' })).resolves.toBeNull();

    const out = await importSkill(skillsDeps, who(ownerId), { agentKey: 'doot', name: 'No-version correction probe' });
    // payload names a version that was never written for this skill
    await expect(recordSkillCorrection(deps, who(ownerId), { skillId: out.id, agentKey: 'doot', payload: { version: 99 }, reason: 'Wrong tone' })).resolves.toBeNull();
    // an empty reason is nothing to record either
    await expect(recordSkillCorrection(deps, who(ownerId), { skillId: out.id, agentKey: 'doot', payload: { version: out.version }, reason: '   ' })).resolves.toBeNull();
    expect(await t.prisma.aiTrainingExample.count()).toBe(0);
  });

  it("rejecting a skill proposal with a reason writes one training example, tagged with the skill's own agent", async () => {
    const out = await importSkill(skillsDeps, who(ownerId), { agentKey: 'doot', name: 'Eid size reminder draft', content: 'Dear customer, your size may be out of stock soon.' });
    const auditBefore = await t.prisma.auditLog.count({ where: { action: 'ai.training.correction' } });

    const res = await decide(out.approvalRequestId, 'reject', 'Too pushy — never imply urgency without a real stock number');
    expect(res.status).toBe(200);

    const rows = await t.prisma.aiTrainingExample.findMany({ where: { sourceRef: out.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      agentKey: 'doot',
      skillKey: out.key,
      kind: 'correction',
      input: 'Dear customer, your size may be out of stock soon.',
      expected: 'Too pushy — never imply urgency without a real stock number',
      sourceRef: out.id,
    });
    expect(await t.prisma.auditLog.count({ where: { action: 'ai.training.correction', entityId: rows[0]!.id } })).toBe(1);
    expect(await t.prisma.auditLog.count({ where: { action: 'ai.training.correction' } })).toBe(auditBefore + 1);

    const view = await trainingExamplesView(deps, { agentKey: 'doot' });
    expect(view.find((r) => r.sourceRef === out.id)).toMatchObject({ skillKey: out.key, expected: 'Too pushy — never imply urgency without a real stock number' });
  });

  it('rejecting with no reason writes no training example — an honest gap, never a guessed lesson', async () => {
    const out = await importSkill(skillsDeps, who(ownerId), { agentKey: 'bhandari', name: 'Courier note draft', content: 'Pack is slightly late, nothing to worry about.' });
    const res = await decide(out.approvalRequestId, 'reject');
    expect(res.status).toBe(200);
    expect(await t.prisma.aiTrainingExample.count({ where: { sourceRef: out.id } })).toBe(0);
  });

  it('approving (never rejecting) writes no training example', async () => {
    const out = await importSkill(skillsDeps, who(ownerId), { agentKey: 'prohori', name: 'Backup check reminder', content: 'Check the backup log every morning.' });
    const res = await decide(out.approvalRequestId, 'approve', 'Looks right');
    expect(res.status).toBe(200);
    expect(await t.prisma.aiTrainingExample.count({ where: { sourceRef: out.id } })).toBe(0);
  });

  it('rejecting a health.fix row (not a skill) writes no training example — this is a skill-only mechanic', async () => {
    const fix = await t.prisma.aiApprovalRequest.create({ data: { storeId: S, kind: FIX_KIND, title: 'A checklist fix', payload: {}, refType: 'SiteAuditFinding', refId: '00000000-0000-7000-8000-000000000009' } });
    const before = await t.prisma.aiTrainingExample.count();
    const res = await decide(fix.id, 'reject', 'Not safe to apply yet');
    expect(res.status).toBe(200);
    expect(await t.prisma.aiTrainingExample.count()).toBe(before);
  });

  it('trainingExamplesView narrows by agent, and an unrecognised agent is an honest empty list', async () => {
    const all = await trainingExamplesView(deps);
    expect(all.length).toBeGreaterThanOrEqual(1);
    expect(await trainingExamplesView(deps, { agentKey: 'nobody' })).toEqual([]);
    const doot = await trainingExamplesView(deps, { agentKey: 'doot' });
    expect(doot.every((r) => r.agentKey === 'doot')).toBe(true);
    expect(doot.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/admin/ai/training needs ai.read, and answers the same rows the view gives, newest first', async () => {
    const denied = await trainingHandler(call('GET', '/api/admin/ai/training'), adminDeps);
    expect(denied.status).toBe(401);

    const res = await trainingHandler(call('GET', '/api/admin/ai/training?agent=doot', { cookie: readerCookie }), adminDeps);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; examples: { agentKey: string; createdAt: string }[] };
    expect(body.ok).toBe(true);
    expect(body.examples.length).toBeGreaterThanOrEqual(1);
    expect(body.examples.every((e) => e.agentKey === 'doot')).toBe(true);
    for (let i = 1; i < body.examples.length; i++) expect(new Date(body.examples[i - 1]!.createdAt).getTime()).toBeGreaterThanOrEqual(new Date(body.examples[i]!.createdAt).getTime());
  });
});

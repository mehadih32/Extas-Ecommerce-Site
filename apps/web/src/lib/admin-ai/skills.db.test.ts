// S15 · PR 321 — the owner's own skill-library writer and its read screen, on a real PostgreSQL. `importSkill` is
// called straight (no HTTP handler is exercised here — `skills-api.ts`'s own guard is a thin, already-reviewed
// wrapper, the same split `diary.db.test.ts`/`bugbox.db.test.ts` already use). One test exercises the full real
// loop — `importSkill` (this file) raising the same `ai.skill` approval request `fixes.proposeSkill` raises, and
// `fixes.decideProposal` (S21 · PR 420, already shipped) deciding it — to prove the two producers genuinely share
// one decision path, never two. A throwaway database (skipped without TEST_DATABASE_ADMIN_URL, like every other
// `.db.test.ts`).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { decideProposal, type FixesDeps } from '../admin-health/fixes';
import { isAiError } from './errors';
import { importSkill, rollbackSkill, setSkillEnabled, skillLibraryView, type SkillsDeps } from './skills';

const S = MOTHER_STORE_ID;
const NOW = new Date('2026-11-12T10:00:00Z');
const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, opts: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.61' };
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

describe.skipIf(!HAS_TEST_DB)('AI 360 · the skill library writer and its read screen on PostgreSQL (PR 321)', () => {
  let t: TestDatabase;
  let deps: SkillsDeps;
  let fixesDeps: FixesDeps;
  let adminDeps: AdminDeps;
  let owner = '';
  let ownerId = '';
  let approverId = '';

  const staff = async (email: string, perms: string[]) => {
    const role = await rolesHandler(call('POST', '/api/admin/roles', { cookie: owner, body: { nameEn: email, nameBn: email, permissions: perms } }), adminDeps);
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(call('POST', '/api/admin/staff', { cookie: owner, body: { email, displayName: email, password: 'first password from the owner' } }), adminDeps);
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(call('POST', '/api/admin/staff-roles', { cookie: owner, body: { action: 'assign', roleId, storeId: MOTHER_STORE_ID } }), adminDeps, staffId);
    return staffId;
  };

  beforeAll(async () => {
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    const owned = await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    ownerId = owned.id;
    const resolver = new SettingsResolver(prismaBackend(t.prisma), registry);
    deps = { db: t.prisma, resolver, now: () => NOW };
    fixesDeps = { db: t.prisma, resolver, now: () => NOW };
    adminDeps = { db: t.prisma, resolver, vault: null, now: () => NOW };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), adminDeps));
    approverId = await staff('approver@example.com', ['health.fixes.approve']);
  });
  afterAll(async () => {
    await t?.drop();
  });

  const who = (staffUserId: string): { actor: Actor; ctx: Record<string, never> } => ({ actor: { staffUserId }, ctx: {} });

  it('throws for an unknown agent, an empty or too-long name — never inventing one, and writes nothing', async () => {
    await expect(importSkill(deps, who(ownerId), { agentKey: 'nobody', name: 'x' })).rejects.toSatisfy((e: unknown) => isAiError(e) && e.code === 'UNKNOWN_AGENT');
    await expect(importSkill(deps, who(ownerId), { agentKey: 'doot', name: '   ' })).rejects.toSatisfy((e: unknown) => isAiError(e) && e.code === 'INVALID_INPUT');
    await expect(importSkill(deps, who(ownerId), { agentKey: 'doot', name: 'x'.repeat(121) })).rejects.toSatisfy((e: unknown) => isAiError(e) && e.code === 'INVALID_INPUT');
    expect(await t.prisma.aiSkill.count()).toBe(0);
  });

  it('writes a new skill waiting for approval, at version 1 with no current version yet', async () => {
    const out = await importSkill(deps, who(ownerId), { agentKey: 'doot', name: 'Eid size reminder draft', purpose: 'Draft a size-reminder message near Eid' });
    expect(out.version).toBe(1);
    const skill = await t.prisma.aiSkill.findUniqueOrThrow({ where: { id: out.id }, include: { versions: true } });
    expect(skill).toMatchObject({ key: out.key, status: 'proposed', enabled: false, currentVersion: 0, source: 'owner_import', sourceRef: 'doot' });
    expect(skill.versions).toHaveLength(1);
    expect(skill.versions[0]).toMatchObject({ version: 1 });
    const req = await t.prisma.aiApprovalRequest.findUniqueOrThrow({ where: { id: out.approvalRequestId } });
    expect(req).toMatchObject({ kind: 'ai.skill', status: 'PENDING', refType: 'AiSkill', refId: out.id, storeId: null });
    expect(await t.prisma.auditLog.count({ where: { action: 'ai.skill.import', entityId: out.id } })).toBe(1);

    const rows = await skillLibraryView(deps);
    const row = rows.find((r) => r.id === out.id)!;
    expect(row).toMatchObject({ status: 'proposed', currentVersion: 0, currentContent: null, olderApprovedVersions: 0, rollbackTo: null, agentKey: 'doot' });
  });

  it('two imports with the same name get different keys (the collision retry), never two skills sharing one key', async () => {
    const a = await importSkill(deps, who(ownerId), { agentKey: 'bhandari', name: 'Tap size check' });
    const b = await importSkill(deps, who(ownerId), { agentKey: 'bhandari', name: 'Tap size check' });
    expect(a.key).not.toBe(b.key);
    expect(a.key).toBe('tap-size-check');
    expect(b.key).toBe('tap-size-check-2');
  });

  it('approving the request (fixes.decideProposal, the single decision path) makes v1 current but leaves it switched off', async () => {
    const out = await importSkill(deps, who(ownerId), { agentKey: 'shilpi', name: 'Phone-first banner check', content: 'Check every new banner at 360-430px before it ships.' });
    const decided = await decideProposal(fixesDeps, who(approverId), { id: out.approvalRequestId, decision: 'approve' });
    expect(decided.status).toBe('APPROVED');
    const skill = await t.prisma.aiSkill.findUniqueOrThrow({ where: { id: out.id } });
    expect(skill).toMatchObject({ status: 'approved', currentVersion: 1, enabled: false });

    const row = (await skillLibraryView(deps)).find((r) => r.id === out.id)!;
    expect(row).toMatchObject({ status: 'approved', enabled: false, currentVersion: 1, currentContent: 'Check every new banner at 360-430px before it ships.', olderApprovedVersions: 0, rollbackTo: null });
  });

  it('setSkillEnabled only switches an approved skill, is idempotent, and is audited', async () => {
    const out = await importSkill(deps, who(ownerId), { agentKey: 'prohori', name: 'Backup check reminder' });
    await expect(setSkillEnabled(deps, who(ownerId), out.id, true)).rejects.toSatisfy((e: unknown) => isAiError(e) && e.code === 'NOT_APPROVED');
    await decideProposal(fixesDeps, who(approverId), { id: out.approvalRequestId, decision: 'approve' });

    const on = await setSkillEnabled(deps, who(ownerId), out.id, true);
    expect(on.enabled).toBe(true);
    expect((await t.prisma.aiSkill.findUniqueOrThrow({ where: { id: out.id } })).enabled).toBe(true);
    // a second tap with the same value is a no-op, never a second audit row
    await setSkillEnabled(deps, who(ownerId), out.id, true);
    expect(await t.prisma.auditLog.count({ where: { action: 'ai.skill.enable', entityId: out.id } })).toBe(1);

    const off = await setSkillEnabled(deps, who(ownerId), out.id, false);
    expect(off.enabled).toBe(false);
    expect(await t.prisma.auditLog.count({ where: { action: 'ai.skill.disable', entityId: out.id } })).toBe(1);

    await expect(setSkillEnabled(deps, who(ownerId), '00000000-0000-0000-0000-000000000000', true)).rejects.toSatisfy((e: unknown) => isAiError(e) && e.code === 'NOT_FOUND');
  });

  it('rollbackSkill moves the current-version pointer back to the most recent approved version, deleting nothing', async () => {
    const out = await importSkill(deps, who(ownerId), { agentKey: 'doot', name: 'Reel caption helper v1', content: 'v1 of the caption helper.' });
    await expect(rollbackSkill(deps, who(ownerId), out.id)).rejects.toSatisfy((e: unknown) => isAiError(e) && e.code === 'NOT_APPROVED');
    await decideProposal(fixesDeps, who(approverId), { id: out.approvalRequestId, decision: 'approve' });
    // nothing to roll back to yet: only one approved version exists
    await expect(rollbackSkill(deps, who(ownerId), out.id)).rejects.toSatisfy((e: unknown) => isAiError(e) && e.code === 'NO_HISTORY');

    // a second version, proposed the same way `fixes.ts`'s own `proposeSkill` would for an existing key, approved too
    const v2 = await t.prisma.aiSkillVersion.create({ data: { skillId: out.id, version: 2, content: 'v2 with a fixed typo.' } });
    const req2 = await t.prisma.aiApprovalRequest.create({
      data: { storeId: null, agentKey: 'doot', kind: 'ai.skill', title: 'Reel caption helper v1', payload: { skillId: out.id, key: out.key, version: 2 }, refType: 'AiSkill', refId: out.id },
    });
    await decideProposal(fixesDeps, who(approverId), { id: req2.id, decision: 'approve' });
    expect((await t.prisma.aiSkill.findUniqueOrThrow({ where: { id: out.id } })).currentVersion).toBe(2);
    expect(v2.version).toBe(2);

    const rows = await skillLibraryView(deps);
    const before = rows.find((r) => r.id === out.id)!;
    expect(before).toMatchObject({ currentVersion: 2, currentContent: 'v2 with a fixed typo.', olderApprovedVersions: 1, rollbackTo: 1 });

    const back = await rollbackSkill(deps, who(ownerId), out.id);
    expect(back).toMatchObject({ fromVersion: 2, toVersion: 1 });
    expect((await t.prisma.aiSkill.findUniqueOrThrow({ where: { id: out.id } })).currentVersion).toBe(1);
    // nothing deleted: both versions are still in the database
    expect(await t.prisma.aiSkillVersion.count({ where: { skillId: out.id } })).toBe(2);
    expect(await t.prisma.auditLog.count({ where: { action: 'ai.skill.rollback', entityId: out.id } })).toBe(1);

    const afterRow = (await skillLibraryView(deps)).find((r) => r.id === out.id)!;
    expect(afterRow).toMatchObject({ currentVersion: 1, currentContent: 'v1 of the caption helper.', olderApprovedVersions: 0, rollbackTo: null });
  });

  it('rejecting a request leaves the skill rejected and writes no version as current', async () => {
    const out = await importSkill(deps, who(ownerId), { agentKey: 'tirondaj', name: 'Budget raise reminder draft' });
    const decided = await decideProposal(fixesDeps, who(approverId), { id: out.approvalRequestId, decision: 'reject' });
    expect(decided.status).toBe('REJECTED');
    const skill = await t.prisma.aiSkill.findUniqueOrThrow({ where: { id: out.id } });
    expect(skill).toMatchObject({ status: 'rejected', currentVersion: 0, enabled: false });
    await expect(setSkillEnabled(deps, who(ownerId), out.id, true)).rejects.toSatisfy((e: unknown) => isAiError(e) && e.code === 'NOT_APPROVED');
    await expect(rollbackSkill(deps, who(ownerId), out.id)).rejects.toSatisfy((e: unknown) => isAiError(e) && e.code === 'NOT_APPROVED');
  });
});

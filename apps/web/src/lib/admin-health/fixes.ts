// S21 · PR 420 (B7.3) — the approval gate for agent auto-fixes and new skills (Reports › Site health › Fixes to
// approve). "A fix needs the owner's approval, runs on staging first, re-tests, and rolls back automatically if anything
// gets worse"; a new skill is "approval-gated" (PR 577). Both wait in the single approval table (AiApprovalRequest,
// kinds `health.fix` and `ai.skill`) until a person decides:
// - an agent (or the audit runner, PR 570) proposes a fix for one run-history finding (PR 419) or a new skill / a new
//   version of one (`health.fixes.propose`, and only while `health.fixGate.proposals` is on — off as it ships);
// - the owner approves or rejects it (`health.fixes.approve`, a confirm step on the page); nobody decides their own
//   proposal, and the claim is atomic, so a request is decided once;
// - whatever applies a fix calls `requireApprovedFix` first and reports the re-test with `recordFixOutcome` (fixed, or
//   rolled back); an approved skill version becomes the skill's current one, but a new skill stays switched off
//   (switching skills on is the skill library's, PR 321–323).
// Undecided proposals expire after `health.fixGate.expireDays` (0 = never). Nothing here deletes a row, moves money or
// blocks anyone; every step is audited.
import { createHash } from 'node:crypto';
import { audit, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, type Prisma, type PrismaClient } from '@extas/db/client';
import { healthFixGateSchema, INSTALLATION, type HealthFixGateSettings } from '@extas/settings';
import type { AppResolver } from '../settings';

export const FIX_KIND = 'health.fix';
export const SKILL_KIND = 'ai.skill';
export const GATE_KINDS = [FIX_KIND, SKILL_KIND] as const;
export type GateKind = (typeof GATE_KINDS)[number];
/** A finding's fix, as SiteAuditFinding.fixStatus keeps it. */
export const FIX_STATUSES = ['none', 'proposed', 'approved', 'rejected', 'expired', 'fixed', 'rolled-back'] as const;
export type FixStatus = (typeof FIX_STATUSES)[number];
/** A finding takes a (new) proposal only from these: nothing proposed yet, or the last one did not go through. */
const OPEN_FOR_PROPOSAL: readonly string[] = ['none', 'rejected', 'expired', 'rolled-back'];
export const FIX_OUTCOMES = ['fixed', 'rolled-back'] as const;
export type FixOutcome = (typeof FIX_OUTCOMES)[number];
export const FIX_SHOWS = ['waiting', 'decided'] as const;
export type FixShow = (typeof FIX_SHOWS)[number];

/** Text-length guards (not business numbers). */
export const FIX_MAX = 2_000; // hardcode-ok: a text-length guard
export const SKILL_CONTENT_MAX = 20_000; // hardcode-ok: a text-length guard
export const REASON_MAX = 500; // hardcode-ok: a text-length guard
const PREVIEW_MAX = 600; // hardcode-ok: how much of a skill the list shows
const SHOWN = 50; // hardcode-ok: the size of one list
const RECENT_DAYS = 30; // hardcode-ok: the "approved in the last 30 days" tile
const DAY = 86_400_000;
const S = MOTHER_STORE_ID;

export interface FixesDeps {
  db: PrismaClient;
  resolver: AppResolver;
  now?: () => Date;
}
export interface FixesWho {
  actor: Actor;
  ctx: RequestContext;
}

export class FixGateError extends Error {
  constructor(
    readonly code: 'INVALID_INPUT' | 'PROPOSALS_OFF' | 'BUSY' | 'NOT_FOUND' | 'DECIDED' | 'OWN_PROPOSAL' | 'NOT_APPROVED' | 'STALE',
    readonly status: number,
    readonly details: string[] = [],
  ) {
    super(code);
  }
}
export const isFixGateError = (e: unknown): e is FixGateError => e instanceof FixGateError;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
const text = (v: unknown, field: string, max: number, required: boolean): string | null => {
  if (v === undefined || v === null || v === '') {
    if (required) throw new FixGateError('INVALID_INPUT', 400, [field]);
    return null;
  }
  if (typeof v !== 'string') throw new FixGateError('INVALID_INPUT', 400, [field]);
  const t = v.trim();
  if ((required && !t) || t.length > max) throw new FixGateError('INVALID_INPUT', 400, [field]);
  return t || null;
};
const agentOf = (v: unknown): string | null => {
  const a = text(v, 'agentKey', 40, false);
  if (a && !/^[a-z0-9][a-z0-9-]*$/i.test(a)) throw new FixGateError('INVALID_INPUT', 400, ['agentKey']);
  return a;
};
const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const payloadOf = (v: unknown): Record<string, unknown> => (isObj(v) ? v : {});
const str = (v: unknown) => (typeof v === 'string' ? v : null);
const pending = (now: Date): Prisma.AiApprovalRequestWhereInput => ({ kind: { in: [...GATE_KINDS] }, status: 'PENDING', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] });

async function gate(deps: FixesDeps): Promise<HealthFixGateSettings> {
  return (await deps.resolver.value('health.fixGate')) as HealthFixGateSettings;
}

/** Undecided proposals past their day: EXPIRED, their finding or new skill marked so (it can be proposed again). */
export async function expireProposals(db: PrismaClient, now: Date): Promise<number> {
  const old = await db.aiApprovalRequest.findMany({ where: { kind: { in: [...GATE_KINDS] }, status: 'PENDING', expiresAt: { lte: now } }, select: { id: true, kind: true, refId: true } });
  if (!old.length) return 0;
  const ids = old.map((r) => r.id);
  await db.$transaction([
    db.aiApprovalRequest.updateMany({ where: { id: { in: ids }, status: 'PENDING' }, data: { status: 'EXPIRED' } }),
    db.siteAuditFinding.updateMany({ where: { approvalRequestId: { in: ids }, fixStatus: 'proposed' }, data: { fixStatus: 'expired' } }),
    db.aiSkill.updateMany({ where: { id: { in: old.filter((r) => r.kind === SKILL_KIND && r.refId).map((r) => r.refId!) }, status: 'proposed' }, data: { status: 'expired' } }),
  ]);
  return ids.length;
}

const expiresAt = (g: HealthFixGateSettings, now: Date) => (g.expireDays > 0 ? new Date(now.getTime() + g.expireDays * DAY) : null);
const isUnique = (e: unknown) => isObj(e) && e.code === 'P2002';

/** An agent proposes a fix for one finding (`health.fixes.propose`, proposals on). It waits for the owner. */
export async function proposeFix(deps: FixesDeps, who: FixesWho, input: unknown): Promise<{ id: string }> {
  await requirePermission(deps.db, who.actor, 'health.fixes.propose', { storeId: S });
  const g = await gate(deps);
  if (!g.proposals) throw new FixGateError('PROPOSALS_OFF', 409);
  if (!isObj(input) || !isId(input.findingId)) throw new FixGateError('INVALID_INPUT', 400, ['findingId']);
  const fix = text(input.fix, 'fix', FIX_MAX, true)!;
  const agentKey = agentOf(input.agentKey);
  const now = deps.now?.() ?? new Date();
  await expireProposals(deps.db, now);
  const f = await deps.db.siteAuditFinding.findFirst({
    where: { id: input.findingId, storeId: S },
    select: { id: true, runId: true, title: true, page: true, device: true, severity: true, reproduce: true, fixStatus: true },
  });
  if (!f) throw new FixGateError('NOT_FOUND', 404);
  if (!OPEN_FOR_PROPOSAL.includes(f.fixStatus)) throw new FixGateError('BUSY', 409);
  const payload = { findingId: f.id, runId: f.runId, severity: f.severity, page: f.page, device: f.device, reproduce: f.reproduce, fix, proposedById: who.actor.staffUserId ?? null };
  const id = await deps.db.$transaction(async (tx) => {
    const req = await tx.aiApprovalRequest.create({
      data: { storeId: S, agentKey, kind: FIX_KIND, title: f.title.slice(0, 300), summary: fix, payload, refType: 'SiteAuditFinding', refId: f.id, channel: 'admin', expiresAt: expiresAt(g, now) },
      select: { id: true },
    });
    // the finding moves only from the state it was read in: a second proposal at the same time finds it busy
    const moved = await tx.siteAuditFinding.updateMany({ where: { id: f.id, fixStatus: f.fixStatus }, data: { suggestedFix: fix, fixStatus: 'proposed', approvalRequestId: req.id } });
    if (moved.count !== 1) throw new FixGateError('BUSY', 409);
    return req.id;
  });
  await audit(deps.db, who.actor, { storeId: S, action: 'health.fix.propose', entityType: 'SiteAuditFinding', entityId: f.id, before: { fixStatus: f.fixStatus }, after: { fixStatus: 'proposed', approvalRequestId: id, agentKey } }, who.ctx);
  return { id };
}

/** An agent proposes a new skill, or a new version of one (`health.fixes.propose`, proposals on). Switched off. */
export async function proposeSkill(deps: FixesDeps, who: FixesWho, input: unknown): Promise<{ id: string; version: number }> {
  await requirePermission(deps.db, who.actor, 'health.fixes.propose', { storeId: S });
  const g = await gate(deps);
  if (!g.proposals) throw new FixGateError('PROPOSALS_OFF', 409);
  if (!isObj(input)) throw new FixGateError('INVALID_INPUT', 400, ['key']);
  const key = text(input.key, 'key', 80, true)!;
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(key)) throw new FixGateError('INVALID_INPUT', 400, ['key']);
  const name = text(input.name, 'name', 120, true)!;
  const purpose = text(input.purpose, 'purpose', REASON_MAX, false);
  const content = text(input.content, 'content', SKILL_CONTENT_MAX, true)!;
  const changeNote = text(input.changeNote, 'changeNote', REASON_MAX, false);
  const agentKey = agentOf(input.agentKey);
  const now = deps.now?.() ?? new Date();
  await expireProposals(deps.db, now);
  try {
    const out = await deps.db.$transaction(async (tx) => {
      const had = await tx.aiSkill.findUnique({ where: { key }, select: { id: true } });
      if (had && (await tx.aiApprovalRequest.findFirst({ where: { kind: SKILL_KIND, status: 'PENDING', refId: had.id }, select: { id: true } }))) throw new FixGateError('BUSY', 409);
      const skill = had ?? (await tx.aiSkill.create({ data: { key, name, purpose, status: 'proposed', source: 'agent', sourceRef: agentKey, enabled: false }, select: { id: true } }));
      const last = await tx.aiSkillVersion.aggregate({ where: { skillId: skill.id }, _max: { version: true } });
      const version = (last._max.version ?? 0) + 1;
      await tx.aiSkillVersion.create({ data: { skillId: skill.id, version, content, changeNote } });
      const req = await tx.aiApprovalRequest.create({
        data: {
          storeId: null,
          agentKey,
          kind: SKILL_KIND,
          title: name,
          summary: purpose,
          payload: { skillId: skill.id, key, version, name, purpose, changeNote, isNew: !had, proposedById: who.actor.staffUserId ?? null },
          refType: 'AiSkill',
          refId: skill.id,
          channel: 'admin',
          expiresAt: expiresAt(g, now),
        },
        select: { id: true },
      });
      return { id: req.id, version, skillId: skill.id, isNew: !had };
    });
    await audit(deps.db, who.actor, { storeId: S, action: 'ai.skill.propose', entityType: 'AiSkill', entityId: out.skillId, after: { key, version: out.version, isNew: out.isNew, approvalRequestId: out.id, agentKey } }, who.ctx);
    return { id: out.id, version: out.version };
  } catch (e) {
    // the same new skill proposed twice at once: the other one is waiting
    if (isUnique(e)) throw new FixGateError('BUSY', 409);
    throw e;
  }
}

/**
 * The owner approves or rejects one waiting proposal (`health.fixes.approve`). Claimed atomically (decided once); never
 * the person's own proposal. Approving a fix lets whatever applies it go ahead (`requireApprovedFix`); approving a skill
 * makes that version current, and a new skill stays off.
 */
export async function decideProposal(deps: FixesDeps, who: FixesWho, input: unknown): Promise<{ id: string; status: 'APPROVED' | 'REJECTED' }> {
  await requirePermission(deps.db, who.actor, 'health.fixes.approve', { storeId: S });
  if (!isObj(input) || !isId(input.id)) throw new FixGateError('INVALID_INPUT', 400, ['id']);
  if (input.decision !== 'approve' && input.decision !== 'reject') throw new FixGateError('INVALID_INPUT', 400, ['decision']);
  const reason = text(input.reason, 'reason', REASON_MAX, false);
  const now = deps.now?.() ?? new Date();
  await expireProposals(deps.db, now);
  const req = await deps.db.aiApprovalRequest.findFirst({ where: { id: input.id, kind: { in: [...GATE_KINDS] } } });
  if (!req) throw new FixGateError('NOT_FOUND', 404);
  if (req.status !== 'PENDING') throw new FixGateError('DECIDED', 409);
  const p = payloadOf(req.payload);
  if (p.proposedById && p.proposedById === who.actor.staffUserId) throw new FixGateError('OWN_PROPOSAL', 403);
  const status = input.decision === 'approve' ? ('APPROVED' as const) : ('REJECTED' as const);
  const approve = status === 'APPROVED';
  await deps.db.$transaction(async (tx) => {
    const claimed = await tx.aiApprovalRequest.updateMany({ where: { id: req.id, status: 'PENDING' }, data: { status, decidedById: who.actor.staffUserId ?? null, decisionNote: reason, decidedAt: now } });
    if (claimed.count !== 1) throw new FixGateError('DECIDED', 409);
    if (req.kind === FIX_KIND) {
      await tx.siteAuditFinding.updateMany({ where: { id: req.refId ?? '', approvalRequestId: req.id, fixStatus: 'proposed' }, data: { fixStatus: approve ? 'approved' : 'rejected' } });
      return;
    }
    const skillId = str(p.skillId);
    const version = typeof p.version === 'number' ? p.version : null;
    if (!skillId || version === null) return;
    if (approve) {
      await tx.aiSkillVersion.updateMany({ where: { skillId, version }, data: { approvedById: who.actor.staffUserId ?? null } });
      // the approved version is the skill's current one; `enabled` is left as it was (a new skill stays off)
      await tx.aiSkill.update({ where: { id: skillId }, data: { currentVersion: version, status: 'approved' } });
    } else await tx.aiSkill.updateMany({ where: { id: skillId, status: 'proposed' }, data: { status: 'rejected' } });
  });
  const kind = req.kind === FIX_KIND ? 'health.fix' : 'ai.skill';
  await audit(
    deps.db,
    who.actor,
    { storeId: S, action: `${kind}.${approve ? 'approve' : 'reject'}`, entityType: req.kind === FIX_KIND ? 'SiteAuditFinding' : 'AiSkill', entityId: req.refId ?? req.id, before: { status: 'PENDING' }, after: { status, reason, approvalRequestId: req.id } },
    who.ctx,
  );
  return { id: req.id, status };
}

/** The gate itself: whatever applies a fix asks first. Throws NOT_APPROVED unless the owner approved this one. */
export async function requireApprovedFix(db: PrismaClient, findingId: string): Promise<{ findingId: string; fix: string; approvalRequestId: string }> {
  if (!isId(findingId)) throw new FixGateError('NOT_APPROVED', 409);
  const f = await db.siteAuditFinding.findFirst({ where: { id: findingId, storeId: S }, select: { id: true, fixStatus: true, suggestedFix: true, approvalRequestId: true } });
  if (!f || f.fixStatus !== 'approved' || !f.approvalRequestId || !f.suggestedFix) throw new FixGateError('NOT_APPROVED', 409);
  const req = await db.aiApprovalRequest.findFirst({ where: { id: f.approvalRequestId, kind: FIX_KIND, status: 'APPROVED', refId: f.id }, select: { id: true } });
  if (!req) throw new FixGateError('NOT_APPROVED', 409);
  return { findingId: f.id, fix: f.suggestedFix, approvalRequestId: req.id };
}

/** After an approved fix ran on staging and the same check ran again: fixed, or rolled back (`health.fixes.propose`). */
export async function recordFixOutcome(deps: FixesDeps, who: FixesWho, input: unknown): Promise<{ findingId: string; fixStatus: FixOutcome }> {
  await requirePermission(deps.db, who.actor, 'health.fixes.propose', { storeId: S });
  if (!isObj(input) || !isId(input.findingId)) throw new FixGateError('INVALID_INPUT', 400, ['findingId']);
  if (!(FIX_OUTCOMES as readonly unknown[]).includes(input.outcome)) throw new FixGateError('INVALID_INPUT', 400, ['outcome']);
  const outcome = input.outcome as FixOutcome;
  const note = text(input.note, 'note', REASON_MAX, false);
  const ok = await requireApprovedFix(deps.db, input.findingId);
  const moved = await deps.db.siteAuditFinding.updateMany({ where: { id: ok.findingId, fixStatus: 'approved' }, data: { fixStatus: outcome } });
  if (moved.count !== 1) throw new FixGateError('NOT_APPROVED', 409);
  await audit(deps.db, who.actor, { storeId: S, action: 'health.fix.outcome', entityType: 'SiteAuditFinding', entityId: ok.findingId, before: { fixStatus: 'approved' }, after: { fixStatus: outcome, note, approvalRequestId: ok.approvalRequestId } }, who.ctx);
  return { findingId: ok.findingId, fixStatus: outcome };
}

export interface FixesCard {
  key: 'fixGate';
  value: HealthFixGateSettings;
  version: string;
}
const cardOf = (s: HealthFixGateSettings): FixesCard => {
  const value = { proposals: s.proposals, expireDays: s.expireDays };
  return { key: 'fixGate', value, version: versionOf(value) };
};

export interface ProposalRow {
  id: string;
  kind: GateKind;
  status: string;
  title: string;
  summary: string | null;
  agentKey: string | null;
  createdAt: string;
  expiresAt: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  /** The person looking proposed it (they cannot decide it). */
  own: boolean;
  fix: { findingId: string; runId: string | null; severity: string | null; page: string | null; device: string | null; reproduce: string | null; fixStatus: string | null } | null;
  skill: { key: string; version: number | null; isNew: boolean; changeNote: string | null; preview: string | null } | null;
}
export interface FixesView {
  show: FixShow;
  rows: ProposalRow[];
  waitingFixes: number;
  waitingSkills: number;
  approvedRecent: number;
  recentDays: number;
  gate: HealthFixGateSettings;
  canApprove: boolean;
  canEdit: boolean;
  cards: { fixGate: FixesCard };
}

/** The page (`health.read`): what waits for a decision, or the last decisions; the gate's own switches. */
export async function fixesView(deps: FixesDeps, who: FixesWho, opts: { show?: string | null } = {}): Promise<FixesView> {
  const held = await requirePermission(deps.db, who.actor, 'health.read', { storeId: S });
  const now = deps.now?.() ?? new Date();
  await expireProposals(deps.db, now);
  const show: FixShow = opts.show === 'decided' ? 'decided' : 'waiting';
  const kinds = { in: [...GATE_KINDS] };
  const [g, reqs, waitingFixes, waitingSkills, approvedRecent] = await Promise.all([
    gate(deps),
    show === 'waiting'
      ? deps.db.aiApprovalRequest.findMany({ where: pending(now), orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: SHOWN })
      : deps.db.aiApprovalRequest.findMany({ where: { kind: kinds, status: { not: 'PENDING' } }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: SHOWN }),
    deps.db.aiApprovalRequest.count({ where: { ...pending(now), kind: FIX_KIND } }),
    deps.db.aiApprovalRequest.count({ where: { ...pending(now), kind: SKILL_KIND } }),
    deps.db.aiApprovalRequest.count({ where: { kind: kinds, status: 'APPROVED', decidedAt: { gte: new Date(now.getTime() - RECENT_DAYS * DAY) } } }),
  ]);
  const findingIds = reqs.filter((r) => r.kind === FIX_KIND && r.refId).map((r) => r.refId!);
  const skillVersions = reqs.filter((r) => r.kind === SKILL_KIND).map((r) => payloadOf(r.payload)).filter((p) => str(p.skillId) && typeof p.version === 'number');
  const [findings, versions] = await Promise.all([
    findingIds.length ? deps.db.siteAuditFinding.findMany({ where: { id: { in: findingIds }, storeId: S }, select: { id: true, runId: true, severity: true, page: true, device: true, reproduce: true, fixStatus: true } }) : Promise.resolve([]),
    skillVersions.length
      ? deps.db.aiSkillVersion.findMany({ where: { OR: skillVersions.map((p) => ({ skillId: p.skillId as string, version: p.version as number })) }, select: { skillId: true, version: true, content: true } })
      : Promise.resolve([]),
  ]);
  const byFinding = new Map(findings.map((f) => [f.id, f]));
  const byVersion = new Map(versions.map((v) => [`${v.skillId}:${v.version}`, v.content]));
  const me = who.actor.staffUserId ?? null;
  const rows: ProposalRow[] = reqs.map((r) => {
    const p = payloadOf(r.payload);
    const f = r.kind === FIX_KIND && r.refId ? byFinding.get(r.refId) : undefined;
    const version = typeof p.version === 'number' ? p.version : null;
    return {
      id: r.id,
      kind: r.kind as GateKind,
      status: r.status,
      title: r.title,
      summary: r.summary,
      agentKey: r.agentKey,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt?.toISOString() ?? null,
      decidedAt: r.decidedAt?.toISOString() ?? null,
      decisionNote: r.decisionNote,
      own: !!me && p.proposedById === me,
      fix:
        r.kind === FIX_KIND
          ? { findingId: r.refId ?? '', runId: f?.runId ?? str(p.runId), severity: f?.severity ?? str(p.severity), page: f?.page ?? str(p.page), device: f?.device ?? str(p.device), reproduce: f?.reproduce ?? str(p.reproduce), fixStatus: f?.fixStatus ?? null }
          : null,
      skill:
        r.kind === SKILL_KIND
          ? { key: str(p.key) ?? '', version, isNew: p.isNew === true, changeNote: str(p.changeNote), preview: (byVersion.get(`${str(p.skillId)}:${version}`) ?? '').slice(0, PREVIEW_MAX) || null }
          : null,
    };
  });
  return { show, rows, waitingFixes, waitingSkills, approvedRecent, recentDays: RECENT_DAYS, gate: g, canApprove: held.has('health.fixes.approve'), canEdit: held.has('settings.write'), cards: { fixGate: cardOf(g) } };
}

/** The gate's switches (`settings.write`, audited, a stale version refused). */
export async function saveFixGateCard(deps: FixesDeps, who: FixesWho, input: unknown): Promise<FixesView> {
  await requirePermission(deps.db, who.actor, 'settings.write', { storeId: S });
  if (!isObj(input) || input.key !== 'fixGate') throw new FixGateError('INVALID_INPUT', 400, ['key']);
  const before = await gate(deps);
  if (input.version !== cardOf(before).version) throw new FixGateError('STALE', 409);
  const ok = healthFixGateSchema.safeParse(input.value);
  if (!ok.success) throw new FixGateError('INVALID_INPUT', 400, [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  if (ok.data.proposals !== before.proposals || ok.data.expireDays !== before.expireDays) {
    await deps.resolver.set('health.fixGate', ok.data, INSTALLATION, { actorId: who.actor.staffUserId ?? null, reason: 'Reports › Site health › Fixes to approve' });
    await audit(deps.db, who.actor, { storeId: S, action: 'health.fixGate.save', entityType: 'Setting', entityId: 'health.fixGate', before: { ...before }, after: { ...ok.data } }, who.ctx);
  }
  return fixesView(deps, who);
}

/** "Needs you now": proposals waiting for a decision, and since when (the store's fixes and the shared skills). */
export async function waitingProposals(db: PrismaClient, storeId: number, now: Date): Promise<{ n: number; oldest: Date | null }> {
  const where: Prisma.AiApprovalRequestWhereInput = { ...pending(now), AND: [{ OR: [{ storeId }, { storeId: null }] }] };
  const [n, first] = await Promise.all([db.aiApprovalRequest.count({ where }), db.aiApprovalRequest.findFirst({ where, orderBy: { createdAt: 'asc' }, select: { createdAt: true } })]);
  return { n, oldest: first?.createdAt ?? null };
}

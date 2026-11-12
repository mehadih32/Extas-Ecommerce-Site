// S15 · PR 317 — /api/admin/ai/approvals: GET the unified queue (`ai.read`, every kind together); POST {id,
// decision, note?} decides one pending request. Who may decide depends on *what* it is, not a single fixed
// permission: a `health.fix`/`ai.skill` row (PR 420's own kinds) is routed straight to `fixes.decideProposal`,
// which enforces its own `health.fixes.approve` and its own "nobody decides their own proposal" rule; every other
// kind needs `ai.control`, checked here, then decided by this file's own `decideApproval`. Either way the response
// hands back the fresh queue, the same convention `control-room-api.ts`/`cost-book-api.ts` already use.
//
// PR 323: an `ai.skill` row rejected with a reason also becomes the agent's own training example
// (`training.ts`'s own header comment explains why that one moment is the real "correction") — never a second
// decision path, only a record of what `decideProposal` already decided.
import { requirePermission } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from '../admin-auth';
import { decideProposal, GATE_KINDS, isFixGateError, SKILL_KIND } from '../admin-health/fixes';
import { isAiError } from './errors';
import { approvalsView, decideApproval, type ApprovalRow } from './approvals';
import { recordSkillCorrection } from './training';

const rowAnswer = (r: ApprovalRow) => ({
  id: r.id,
  storeId: r.storeId,
  agentKey: r.agentKey,
  kind: r.kind,
  title: r.title,
  summary: r.summary,
  payload: r.payload,
  status: r.status,
  channel: r.channel,
  refType: r.refType,
  refId: r.refId,
  decidedById: r.decidedById,
  decidedByName: r.decidedByName,
  decisionNote: r.decisionNote,
  decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
  expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
  createdAt: r.createdAt.toISOString(),
});

export async function approvalsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST') return fail(405, 'method-not-allowed');
  // ai.read is the floor for reaching this page at all (same as Control room/Cost Book); POST checks the sharper,
  // per-kind permission itself below, once it knows which kind the target row actually is.
  const g = await guardAdmin(request, deps, { permission: 'ai.read', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = { db: deps!.db, resolver: deps!.resolver, now: deps!.now };
  const withScreen = async () => {
    const view = await approvalsView(d, MOTHER_STORE_ID);
    return json({ ok: true, pending: view.pending.map(rowAnswer), decided: view.decided.map(rowAnswer) });
  };
  try {
    if (method === 'GET') return await withScreen();
    const input = await body(request);
    if (!isUuid(input.id)) return json({ ok: false, error: 'INVALID_INPUT', details: ['id'] }, { status: 400 });
    if (input.decision !== 'approve' && input.decision !== 'reject') return json({ ok: false, error: 'INVALID_INPUT', details: ['decision'] }, { status: 400 });
    if (input.note !== undefined && input.note !== null && typeof input.note !== 'string') return json({ ok: false, error: 'INVALID_INPUT', details: ['note'] }, { status: 400 });
    const note = (input.note as string | null | undefined) ?? null;

    const row = await d.db.aiApprovalRequest.findUnique({ where: { id: input.id }, select: { kind: true, refId: true, agentKey: true, payload: true } });
    if (!row) return json({ ok: false, error: 'NOT_FOUND', details: ['id'] }, { status: 404 });

    if ((GATE_KINDS as readonly string[]).includes(row.kind)) {
      // PR 420's own queue: its own permission, its own side effects (a SiteAuditFinding/AiSkill row moves too).
      const decided = await decideProposal(d, { actor: g.actor, ctx: g.ctx }, { id: input.id, decision: input.decision, reason: note });
      // PR 323: a rejected skill, with a reason, becomes a training example — see training.ts's own header.
      if (row.kind === SKILL_KIND && decided.status === 'REJECTED' && note && row.refId) {
        await recordSkillCorrection({ db: d.db }, { actor: g.actor, ctx: g.ctx }, { skillId: row.refId, agentKey: row.agentKey, payload: row.payload, reason: note });
      }
    } else {
      await requirePermission(d.db, g.actor, 'ai.control', { storeId: MOTHER_STORE_ID });
      await decideApproval(d, { actor: g.actor, ctx: g.ctx }, input.id, input.decision, note);
    }
    return await withScreen();
  } catch (e) {
    if (isFixGateError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    if (isAiError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return errorResponse(e);
  }
}

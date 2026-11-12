// S15 · PR 321 — /api/admin/ai/skills: GET the skill library (`ai.read`); POST decides which of the three write
// actions by its own `action` field (`ai.skills.write` for all three):
//   {action:'import', name, agentKey, purpose?, content?} — lib/admin-ai/skills.ts's `importSkill`
//   {action:'rollback', id}                                — `rollbackSkill`
//   {action:'enable', id, enabled}                          — `setSkillEnabled`
// Deciding the resulting approval request (approve/reject) is `fixes.decideProposal`'s own job from
// `/api/admin/ai/approvals` (`health.fixes.approve`), never this route's — see skills.ts's own header comment.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from '../admin-auth';
import { isAiError } from './errors';
import { importSkill, rollbackSkill, setSkillEnabled, skillLibraryView, type SkillRow } from './skills';

const rowAnswer = (r: SkillRow) => ({ ...r, updatedAt: r.updatedAt.toISOString() });

export async function skillsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'ai.read' : 'ai.skills.write', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = { db: deps!.db, resolver: deps!.resolver, now: deps!.now };
  const withScreen = async () => json({ ok: true, skills: (await skillLibraryView(d)).map(rowAnswer) });
  try {
    if (method === 'GET') return await withScreen();
    const input = await body(request);
    const who = { actor: g.actor, ctx: g.ctx };

    if (input.action === 'import') {
      if (typeof input.name !== 'string') return json({ ok: false, error: 'INVALID_INPUT', details: ['name'] }, { status: 400 });
      if (typeof input.agentKey !== 'string') return json({ ok: false, error: 'INVALID_INPUT', details: ['agentKey'] }, { status: 400 });
      if (input.purpose !== undefined && input.purpose !== null && typeof input.purpose !== 'string') return json({ ok: false, error: 'INVALID_INPUT', details: ['purpose'] }, { status: 400 });
      if (input.content !== undefined && input.content !== null && typeof input.content !== 'string') return json({ ok: false, error: 'INVALID_INPUT', details: ['content'] }, { status: 400 });
      await importSkill(d, who, {
        name: input.name,
        agentKey: input.agentKey,
        purpose: (input.purpose as string | null | undefined) ?? null,
        content: (input.content as string | null | undefined) ?? null,
      });
      return await withScreen();
    }

    if (input.action === 'rollback') {
      if (!isUuid(input.id)) return json({ ok: false, error: 'INVALID_INPUT', details: ['id'] }, { status: 400 });
      await rollbackSkill(d, who, input.id);
      return await withScreen();
    }

    if (input.action === 'enable') {
      if (!isUuid(input.id)) return json({ ok: false, error: 'INVALID_INPUT', details: ['id'] }, { status: 400 });
      if (typeof input.enabled !== 'boolean') return json({ ok: false, error: 'INVALID_INPUT', details: ['enabled'] }, { status: 400 });
      await setSkillEnabled(d, who, input.id, input.enabled);
      return await withScreen();
    }

    return json({ ok: false, error: 'INVALID_INPUT', details: ['action'] }, { status: 400 });
  } catch (e) {
    if (isAiError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return errorResponse(e);
  }
}

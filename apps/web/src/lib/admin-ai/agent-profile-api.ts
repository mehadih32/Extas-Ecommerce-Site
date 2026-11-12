// S15 · PR 577 — /api/admin/agents: GET the team (every fixed agent's identity and assignment counts; `ai.read`).
// /api/admin/agents/[key]: GET one agent's full 360° profile (`ai.read`); PATCH {bio?, photoUrl?, joinedOn?,
// verified?} edits the owner's own identity fields (`ai.control`, audited, a no-op patch writes once); POST
// {action: 'reward', label, note?} | {action: 'assign', title, description?, dueAt?} |
// {action: 'complete', assignmentId} does the matching write (`ai.control`) and hands back the fresh profile, the
// same "never a second GET after a tap" shape `control-room-api.ts` already uses.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { isAiAgentKey } from './agents';
import {
  agentProfileList,
  agentProfileView,
  assignAgentTask,
  completeAgentAssignment,
  giveAgentReward,
  updateAgentProfile,
} from './agent-profile';
import { isAiError } from './errors';

export async function agentsListHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'GET') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'ai.read', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  try {
    return json({ ok: true, agents: await agentProfileList({ db: deps!.db }) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function agentProfileHandler(request: Request, deps: AdminDeps | null, key: string): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PATCH' && method !== 'POST') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'ai.read' : 'ai.control', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  if (!isAiAgentKey(key)) return json({ ok: false, error: 'NOT_FOUND', details: ['key'] }, { status: 404 });
  const d = { db: deps!.db };
  const who = { actor: g.actor, ctx: g.ctx };
  const withProfile = async () => json({ ok: true, profile: await agentProfileView(d, key) });

  try {
    if (method === 'GET') return withProfile();

    if (method === 'PATCH') {
      const input = await body(request);
      await updateAgentProfile(d, who, key, {
        bio: input.bio === undefined ? undefined : input.bio === null ? null : String(input.bio),
        photoUrl: input.photoUrl === undefined ? undefined : input.photoUrl === null ? null : String(input.photoUrl),
        joinedOn: input.joinedOn === undefined ? undefined : input.joinedOn === null ? null : String(input.joinedOn),
        verified: typeof input.verified === 'boolean' ? input.verified : undefined,
      });
      return withProfile();
    }

    const input = await body(request);
    if (input.action === 'reward') {
      if (typeof input.label !== 'string') return json({ ok: false, error: 'INVALID_INPUT', details: ['label'] }, { status: 400 });
      await giveAgentReward(d, who, key, { label: input.label, note: typeof input.note === 'string' ? input.note : null });
      return withProfile();
    }
    if (input.action === 'assign') {
      if (typeof input.title !== 'string') return json({ ok: false, error: 'INVALID_INPUT', details: ['title'] }, { status: 400 });
      await assignAgentTask(d, who, key, {
        title: input.title,
        description: typeof input.description === 'string' ? input.description : null,
        dueAt: typeof input.dueAt === 'string' ? input.dueAt : null,
      });
      return withProfile();
    }
    if (input.action === 'complete') {
      if (typeof input.assignmentId !== 'string') return json({ ok: false, error: 'INVALID_INPUT', details: ['assignmentId'] }, { status: 400 });
      await completeAgentAssignment(d, who, key, input.assignmentId);
      return withProfile();
    }
    return json({ ok: false, error: 'INVALID_INPUT', details: ['action'] }, { status: 400 });
  } catch (e) {
    if (isAiError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return errorResponse(e);
  }
}

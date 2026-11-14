// S15 · PR 583 — /api/admin/ai/agents-chief: GET the chief's investigations (`ai.read`); POST {question} asks a
// new one (`ai.control`) — the chief page reads the org chart and the permission grid straight from
// `agentProfileList`/`permissionsView` itself (both already built), so this file only ever carries the chief's own
// new actions. `/close` {id} and `/warn` {agentKey, why, investigationId?} are their own routes, both `ai.control`,
// following the same guard/body/json shape every other admin-ai API in this folder uses.
import { requirePermission } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { isAiError } from './errors';
import { askTheChief, closeInvestigation, listInvestigations, warnAgent } from './investigations';

async function screen(d: { db: AdminDeps['db'] }) {
  return { ok: true, investigations: await listInvestigations(d) };
}

export async function agentsChiefHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'ai.read', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = { db: deps!.db };
  try {
    if (method === 'GET') return json(await screen(d));
    await requirePermission(d.db, g.actor, 'ai.control', { storeId: MOTHER_STORE_ID });
    const input = await body(request);
    if (typeof input.question !== 'string' || !input.question.trim()) return json({ ok: false, error: 'INVALID_INPUT', details: ['question'] }, { status: 400 });
    const investigation = await askTheChief(d, { actor: g.actor, ctx: g.ctx }, { question: input.question });
    return json({ ok: true, investigation, investigations: await listInvestigations(d) });
  } catch (e) {
    if (isAiError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return errorResponse(e);
  }
}

export async function agentsChiefCloseHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'ai.read', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = { db: deps!.db };
  try {
    await requirePermission(d.db, g.actor, 'ai.control', { storeId: MOTHER_STORE_ID });
    const input = await body(request);
    if (typeof input.id !== 'string' || !input.id) return json({ ok: false, error: 'INVALID_INPUT', details: ['id'] }, { status: 400 });
    await closeInvestigation(d, { actor: g.actor, ctx: g.ctx }, input.id);
    return json(await screen(d));
  } catch (e) {
    if (isAiError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return errorResponse(e);
  }
}

export async function agentsChiefWarnHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'ai.read', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = { db: deps!.db };
  try {
    await requirePermission(d.db, g.actor, 'ai.control', { storeId: MOTHER_STORE_ID });
    const input = await body(request);
    if (typeof input.agentKey !== 'string' || !input.agentKey) return json({ ok: false, error: 'INVALID_INPUT', details: ['agentKey'] }, { status: 400 });
    if (typeof input.why !== 'string' || !input.why.trim()) return json({ ok: false, error: 'INVALID_INPUT', details: ['why'] }, { status: 400 });
    const investigationId = typeof input.investigationId === 'string' ? input.investigationId : null;
    await warnAgent(d, { actor: g.actor, ctx: g.ctx }, input.agentKey, { why: input.why, investigationId });
    return json(await screen(d));
  } catch (e) {
    if (isAiError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return errorResponse(e);
  }
}

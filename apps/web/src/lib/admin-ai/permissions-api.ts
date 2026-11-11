// S15 · PR 318 — /api/admin/ai/permissions: GET the matrix (`ai.read`); POST {agentKey, resource, level} sets one
// cell (`ai.control`, audited). Hands back the fresh matrix, the same convention every other admin-ai API uses.
import { requirePermission } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { isAiError } from './errors';
import { permissionsView, setAgentPermission, type PermissionAgentRow } from './permissions';

const agentAnswer = (a: PermissionAgentRow) => ({
  key: a.key,
  nameEn: a.nameEn,
  nameBn: a.nameBn,
  role: a.role,
  emoji: a.emoji,
  isChief: a.isChief,
  cells: a.cells,
});

export async function permissionsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'ai.read', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = { db: deps!.db };
  const withScreen = async () => {
    const view = await permissionsView(d);
    return json({ ok: true, resources: view.resources, agents: view.agents.map(agentAnswer) });
  };
  try {
    if (method === 'GET') return await withScreen();
    await requirePermission(d.db, g.actor, 'ai.control', { storeId: MOTHER_STORE_ID });
    const input = await body(request);
    if (typeof input.agentKey !== 'string' || !input.agentKey) return json({ ok: false, error: 'INVALID_INPUT', details: ['agentKey'] }, { status: 400 });
    if (typeof input.resource !== 'string' || !input.resource) return json({ ok: false, error: 'INVALID_INPUT', details: ['resource'] }, { status: 400 });
    if (typeof input.level !== 'string' || !input.level) return json({ ok: false, error: 'INVALID_INPUT', details: ['level'] }, { status: 400 });
    await setAgentPermission(d, { actor: g.actor, ctx: g.ctx }, input.agentKey, input.resource, input.level);
    return await withScreen();
  } catch (e) {
    if (isAiError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return errorResponse(e);
  }
}

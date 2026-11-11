// S15 · PR 304 — /api/admin/ai: GET the AI 360 Control room (every agent, what it did last, today's and this
// month's cost; `ai.read`); POST {key, enabled} pauses or resumes one agent (`ai.control`, audited). Nothing here
// turns AI itself on — that is `ai.enabled` (PR 305), read but not written on this route.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { controlRoomView, isAiError, setAgentEnabled } from './control-room';

export async function controlRoomHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'ai.read' : 'ai.control', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = { db: deps!.db, resolver: deps!.resolver, now: deps!.now };
  try {
    if (method === 'GET') {
      const screen = await controlRoomView(d, MOTHER_STORE_ID);
      return json({ ok: true, ...screen });
    }
    const input = await body(request);
    const key = typeof input.key === 'string' ? input.key : '';
    const enabled = typeof input.enabled === 'boolean' ? input.enabled : undefined;
    const missing = [!key ? 'key' : null, enabled === undefined ? 'enabled' : null].filter((x): x is string => Boolean(x));
    if (missing.length) return json({ ok: false, error: 'INVALID_INPUT', details: missing }, { status: 400 });
    await setAgentEnabled(d, { actor: g.actor, ctx: g.ctx }, key, enabled!);
    const screen = await controlRoomView(d, MOTHER_STORE_ID);
    return json({ ok: true, ...screen });
  } catch (e) {
    if (isAiError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return errorResponse(e);
  }
}

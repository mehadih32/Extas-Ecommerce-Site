// S15 · PR 304 — /api/admin/ai: GET the AI 360 Control room (every agent, what it did last, today's and this
// month's cost; `ai.read`); POST {key, enabled} pauses or resumes one agent (`ai.control`, audited).
//
// S15 · PR 305 — the same POST also takes {master: boolean} (the business-wide `ai.enabled` switch) or
// {key, keepOnWhenMasterOff: boolean} (one agent's "keep running even with the master off"), both `ai.control`,
// both audited, both a no-op on a double tap. Every shape ends by handing back the fresh screen, so the page never
// needs a second GET after a tap.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { controlRoomView, isAiError, setAgentEnabled, setAgentKeepOn, setMasterEnabled } from './control-room';

export async function controlRoomHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'ai.read' : 'ai.control', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = { db: deps!.db, resolver: deps!.resolver, now: deps!.now };
  const withScreen = async () => json({ ok: true, ...(await controlRoomView(d, MOTHER_STORE_ID)) });
  try {
    if (method === 'GET') return withScreen();
    const input = await body(request);
    const who = { actor: g.actor, ctx: g.ctx };

    if (typeof input.master === 'boolean') {
      await setMasterEnabled(d, who, input.master, MOTHER_STORE_ID);
      return withScreen();
    }

    const key = typeof input.key === 'string' ? input.key : '';
    if (typeof input.keepOnWhenMasterOff === 'boolean') {
      if (!key) return json({ ok: false, error: 'INVALID_INPUT', details: ['key'] }, { status: 400 });
      await setAgentKeepOn(d, who, key, input.keepOnWhenMasterOff);
      return withScreen();
    }

    const enabled = typeof input.enabled === 'boolean' ? input.enabled : undefined;
    const missing = [!key ? 'key' : null, enabled === undefined ? 'enabled' : null].filter((x): x is string => Boolean(x));
    if (missing.length) return json({ ok: false, error: 'INVALID_INPUT', details: missing }, { status: 400 });
    await setAgentEnabled(d, who, key, enabled!);
    return withScreen();
  } catch (e) {
    if (isAiError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return errorResponse(e);
  }
}

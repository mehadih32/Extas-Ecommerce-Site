// S15 · PR 312 — /api/admin/ai/cost-book: GET the AI Cost Book (`ai.read`); POST {jobKey, modelKey} changes one
// job's own model (`ai.control`, audited, `null` resets to Claude's recommendation). Every shape ends by handing
// back the fresh screen, so the page never needs a second GET after a tap (the same convention as
// `control-room-api.ts`).
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { costBookView, isAiError, setJobSelectedModel } from './cost-book';

export async function costBookHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'ai.read' : 'ai.control', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = { db: deps!.db, resolver: deps!.resolver, now: deps!.now };
  const withScreen = async () => json({ ok: true, ...(await costBookView(d, MOTHER_STORE_ID)) });
  try {
    if (method === 'GET') return withScreen();
    const input = await body(request);
    const jobKey = typeof input.jobKey === 'string' ? input.jobKey : '';
    if (!jobKey) return json({ ok: false, error: 'INVALID_INPUT', details: ['jobKey'] }, { status: 400 });
    if (input.modelKey !== null && typeof input.modelKey !== 'string') return json({ ok: false, error: 'INVALID_INPUT', details: ['modelKey'] }, { status: 400 });
    await setJobSelectedModel(d, { actor: g.actor, ctx: g.ctx }, jobKey, input.modelKey);
    return withScreen();
  } catch (e) {
    if (isAiError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return errorResponse(e);
  }
}

// S15 · PR 578 — /api/admin/ai/appraisals: GET ?key=&period= reads the saved history for one agent and period
// (`ai.read`); POST {key, period} generates (or regenerates) it and returns the fresh row (`ai.control`, the same
// write permission every other AI 360 setter in this folder uses — generating is a write to `AiAppraisal`, even
// though the figures themselves are read-only facts the agent cannot edit).
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { appraisalHistory, generateAppraisal } from './appraisal';
import { isAiError } from './errors';

export async function appraisalHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'ai.read' : 'ai.control', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = { db: deps!.db, now: deps!.now };
  try {
    if (method === 'GET') {
      const url = new URL(request.url);
      const key = url.searchParams.get('key') ?? '';
      const period = url.searchParams.get('period') ?? undefined;
      if (!key) return json({ ok: false, error: 'INVALID_INPUT', details: ['key'] }, { status: 400 });
      const rows = await appraisalHistory(d, key, period);
      return json({ ok: true, rows });
    }
    const input = await body(request);
    const key = typeof input.key === 'string' ? input.key : '';
    const period = typeof input.period === 'string' ? input.period : '';
    if (!key || !period) return json({ ok: false, error: 'INVALID_INPUT', details: ['key', 'period'] }, { status: 400 });
    const timeZone = await deps!.resolver.value('store.timeZone', { storeId: MOTHER_STORE_ID });
    const row = await generateAppraisal(d, key, period, timeZone);
    return json({ ok: true, row });
  } catch (e) {
    if (isAiError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return errorResponse(e);
  }
}

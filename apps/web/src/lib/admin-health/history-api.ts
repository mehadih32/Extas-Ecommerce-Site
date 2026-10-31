// S21 · PR 419 (B7.3) — /api/admin/health/history: GET the run history (`health.read`; ?tool=smoke|journeys,
// ?result=failed, ?page=n) or one run with its findings and the comparison (?run=<id>). Read-only apart from keeping
// runs the server's files still hold (history.ts `catchUp`).
import { MOTHER_STORE_ID } from '@extas/db/client';
import { errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { historyRunView, historyView, isHistoryError } from './history';

export async function historyHandler(request: Request, deps: AdminDeps | null, opts: { stateDir?: string | null } = {}): Promise<Response> {
  if (request.method.toUpperCase() !== 'GET') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'health.read', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const q = new URL(request.url).searchParams;
  const d = { db: deps!.db, now: deps!.now, ...opts };
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    const run = q.get('run');
    if (run) return json({ ok: true, run: await historyRunView(d, who, run) });
    return json({ ok: true, view: await historyView(d, who, { tool: q.get('tool'), result: q.get('result'), page: q.get('page') }) });
  } catch (e) {
    if (isHistoryError(e)) return json({ ok: false, error: e.code }, { status: e.status });
    return errorResponse(e);
  }
}

// S21 · PR 424 (B7.3) — /api/admin/health/run-alerts: GET "Telegram when a test fails" with what the server last told
// (`health.read`); PUT {key: 'runAlerts', value, version} saves the switches (`settings.write`, checked again in
// run-alerts.ts). Nothing here sends a message; the server does, after each run.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { isRunAlertsError, runAlertsView, saveRunAlertsCard } from './run-alerts';

export async function runAlertsHandler(request: Request, deps: AdminDeps | null, opts: { stateDir?: string | null } = {}): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'health.read', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = { db: deps!.db, resolver: deps!.resolver, ...opts };
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    const view = method === 'GET' ? await runAlertsView(d, who) : await saveRunAlertsCard(d, who, await body(request));
    return json({ ok: true, view, cards: view.cards });
  } catch (e) {
    if (isRunAlertsError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return errorResponse(e);
  }
}

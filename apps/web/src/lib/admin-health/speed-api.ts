// S21 · PR 417 (REP-07c) — /api/admin/health/speed: GET Reports › Site health › Speed (`health.read`); PUT
// {key: 'speed', value: {months}, version} saves how many months it shows; POST {action: 'run'} is "Measure now" (both
// `settings.write`; the server's hourly check measures). The service checks each permission again.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { askSpeedRun, isSpeedPageError, saveSpeedCard, speedView } from './speed';

export async function speedHandler(request: Request, deps: AdminDeps | null, opts: { stateDir?: string | null } = {}): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT' && method !== 'POST') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'health.read', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = { db: deps!.db, resolver: deps!.resolver, now: deps!.now, ...opts };
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    let view;
    if (method === 'GET') view = await speedView(d, who);
    else if (method === 'PUT') view = await saveSpeedCard(d, who, await body(request));
    else view = await askSpeedRun(d, who, await body(request));
    return json({ ok: true, view, cards: view.cards });
  } catch (e) {
    if (isSpeedPageError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return errorResponse(e);
  }
}

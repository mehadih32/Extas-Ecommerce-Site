// S21 · PR 413 — /api/admin/health: GET the Site health hub (`health.read`); PUT {key: 'hub', value, version} saves when a
// line turns yellow (`settings.write`). The service checks each permission again. Nothing here changes the server.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { hubView, isHealthPageError, saveHubCard } from './service';

export async function healthHandler(request: Request, deps: AdminDeps | null, opts: { stateDir?: string | null } = {}): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'health.read', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = { db: deps!.db, resolver: deps!.resolver, ...opts };
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    const view = method === 'GET' ? await hubView(d, who) : await saveHubCard(d, who, await body(request));
    return json({ ok: true, view, cards: view.cards });
  } catch (e) {
    if (isHealthPageError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return errorResponse(e);
  }
}

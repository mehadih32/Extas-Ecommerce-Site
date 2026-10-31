// S18 · PR 386 — /api/admin/edge: GET the Cloudflare protection page's data (`security.read`); PUT {key: 'shield',
// value, version} saves the plan (`settings.write`; the sign-in limit by the owner only); POST {action: 'send'} sends
// it to Cloudflare (`security.write`; the mock until the token passes). The service checks each permission again.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { edgeView, isEdgePageError, saveEdgeCard, sendEdge } from './service';

export async function edgeHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT' && method !== 'POST') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'security.read', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = { db: deps!.db, resolver: deps!.resolver, vault: deps!.vault };
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    let view;
    if (method === 'GET') view = await edgeView(d, who);
    else if (method === 'PUT') view = await saveEdgeCard(d, who, await body(request));
    else {
      const b = (await body(request)) as { action?: unknown } | null;
      if (b?.action !== 'send') return json({ ok: false, error: 'INVALID_INPUT', details: ['action'] }, { status: 400 });
      view = await sendEdge(d, who);
    }
    return json({ ok: true, view, cards: view.cards });
  } catch (e) {
    if (isEdgePageError(e)) return json({ ok: false, error: e.code, details: e.details, ...e.data }, { status: e.status });
    return errorResponse(e);
  }
}

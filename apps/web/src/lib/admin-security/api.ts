// S18 · PR 380 — GET /api/admin/security (the page's data, `security.read`) and PUT {key, value, version} (one card,
// `security.write`). The service checks the permission again (lib/admin-security/service.ts).
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { isSecurityPageError, saveSecurityCard, securityView } from './service';

export async function securityHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'security.read', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = { db: deps!.db, resolver: deps!.resolver };
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    if (method === 'GET') {
      const view = await securityView(d, who);
      return json({ ok: true, view, cards: view.cards });
    }
    const view = await saveSecurityCard(d, who, await body(request));
    return json({ ok: true, view, cards: view.cards });
  } catch (e) {
    if (isSecurityPageError(e)) return json({ ok: false, error: e.code, details: e.details, ...e.data }, { status: e.status });
    return errorResponse(e);
  }
}

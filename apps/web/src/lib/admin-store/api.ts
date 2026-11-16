// S18 · PR 383 — /api/admin/store: GET the Store details page's data (`settings.read`), PUT {key: <card>, value,
// version} saves one card (PR 789: nine cards) (`settings.write`; a filler value is refused as PLACEHOLDER). The service checks
// the permission again.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { requireOwnerPin } from '../owner-pin';
import { changeWebAddress, isStorePageError, saveStoreCard, storeView } from './service';

export async function storeHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT' && method !== 'POST') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'settings.read', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = { db: deps!.db, resolver: deps!.resolver };
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    if (method === 'POST') {
      // PR 991: the web address changes only with the owner's PIN
      const b = (await body(request)) as { domain?: unknown; pin?: unknown };
      await requireOwnerPin(deps!, g.actor, g.ctx, b.pin, 'store.webAddress.change', MOTHER_STORE_ID);
      const webAddress = await changeWebAddress(d, who, b.domain);
      return json({ ok: true, webAddress });
    }
    const view = method === 'GET' ? await storeView(d, who) : await saveStoreCard(d, who, await body(request));
    return json({ ok: true, view, cards: view.cards });
  } catch (e) {
    if (isStorePageError(e)) return json({ ok: false, error: e.code, details: e.details, ...e.data }, { status: e.status });
    return errorResponse(e);
  }
}

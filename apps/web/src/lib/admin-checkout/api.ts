// PR 748 — /api/admin/settings/checkout: GET the Checkout page's cards (`settings.read`), PUT {key: 'payments' | 'form',
// value, version} saves one card (`settings.write`; a card changed by someone else answers STALE with the current version;
// Cash on Delivery only for an owner). The service checks the permission again.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { checkoutView, isCheckoutPageError, saveCheckoutCard } from './service';

export async function checkoutHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'settings.read', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = { db: deps!.db, resolver: deps!.resolver };
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    const view = method === 'GET' ? await checkoutView(d, who) : await saveCheckoutCard(d, who, await body(request));
    return json({ ok: true, cards: view.cards, owner: view.owner, unit: view.unit });
  } catch (e) {
    if (isCheckoutPageError(e)) return json({ ok: false, error: e.code, details: e.details, ...e.data }, { status: e.status });
    return errorResponse(e);
  }
}

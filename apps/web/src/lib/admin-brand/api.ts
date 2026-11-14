// PR 726 — /api/admin/website/brand: GET the Brand & menus page's data (`website.read`), PUT {key: 'brand' | 'menu' |
// 'footer', value, version} saves one card (`website.layout.write`; a card changed by someone else answers STALE with the
// current version). The service checks the permission again.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { brandView, isBrandPageError, saveBrandCard } from './service';

export async function brandHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'website.read', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = { db: deps!.db, resolver: deps!.resolver };
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    const view = method === 'GET' ? await brandView(d, who) : await saveBrandCard(d, who, await body(request));
    return json({ ok: true, view, cards: view.cards, previews: view.previews });
  } catch (e) {
    if (isBrandPageError(e)) return json({ ok: false, error: e.code, details: e.details, ...e.data }, { status: e.status });
    return errorResponse(e);
  }
}

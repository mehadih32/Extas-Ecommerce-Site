// S18 · PR 384 — /api/admin/policies: GET the Policies & texts page's data (`settings.read`); PUT {key: <page>, value,
// version} saves one help page's card (`settings.write`; a stand-in is refused as PLACEHOLDER, a token that names no
// rule value as UNKNOWN_TOKEN). The service checks the permission again.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, readCookie, type AdminDeps } from '../admin-auth';
import { ADMIN_LANG_COOKIE, pickAdminLang } from '../admin-i18n';
import { isPoliciesError, policiesView, savePolicyPage } from './service';

export async function policiesHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'settings.read', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = { db: deps!.db, resolver: deps!.resolver, now: deps!.now };
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    const locale = (await d.resolver.value('store.locale', { storeId: MOTHER_STORE_ID }).catch(() => null)) as string | null;
    const lang = pickAdminLang(readCookie(request, ADMIN_LANG_COOKIE), locale);
    const view = method === 'GET' ? await policiesView(d, who, lang) : await savePolicyPage(d, who, await body(request), lang);
    return json({ ok: true, view, cards: view.cards });
  } catch (e) {
    if (isPoliciesError(e)) return json({ ok: false, error: e.code, details: e.details, ...e.data }, { status: e.status });
    return errorResponse(e);
  }
}

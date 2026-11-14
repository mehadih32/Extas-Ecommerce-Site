// PR 718 — /api/admin/website/policies: GET the tab's data (`website.read`); PUT saves — {page, words, version} a draft,
// {page, publish: true, version} the draft goes live, {page, restore: <version>, version} an older version comes back as a
// new draft (`settings.write`; the service checks again). A stand-in is refused as PLACEHOLDER, a rule number that names
// nothing as UNKNOWN_TOKEN, a page with two people editing as STALE (409, with the newest version number).
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, readCookie, type AdminDeps } from '../admin-auth';
import { ADMIN_LANG_COOKIE, pickAdminLang } from '../admin-i18n';
import { paymentModeOf } from '../payments-gateway';
import { isPolicyTabError, policyTabView, publishPolicy, restorePolicy, savePolicyDraft } from './service';

export async function websitePoliciesHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'website.read', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = { db: deps!.db, resolver: deps!.resolver, now: deps!.now, paymentMode: paymentModeOf };
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    if (method === 'GET') return json({ ok: true, view: await policyTabView(d, who) });
    const sent = await body(request);
    const o = (sent && typeof sent === 'object' ? sent : {}) as Record<string, unknown>;
    const locale = (await d.resolver.value('store.locale', { storeId: MOTHER_STORE_ID }).catch(() => null)) as string | null;
    const lang = pickAdminLang(readCookie(request, ADMIN_LANG_COOKIE), locale);
    const view = o.publish === true ? await publishPolicy(d, who, o, lang) : o.restore !== undefined ? await restorePolicy(d, who, o) : await savePolicyDraft(d, who, o);
    return json({ ok: true, view });
  } catch (e) {
    if (isPolicyTabError(e)) return json({ ok: false, error: e.code, details: e.details, ...e.data }, { status: e.status });
    return errorResponse(e);
  }
}

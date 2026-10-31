// S18 · PR 382 — /api/admin/privacy: GET the page's data (`security.read`); PUT {key: 'keep', value, version} saves the
// card (`security.write`); POST {action: 'request', phone, reason} files an erasure request, {action: 'cancel',
// requestId} cancels one (`customers.privacy`), {action: 'erase', requestId, confirm} carries one out (the owner alone,
// the confirmation word typed as the page shows it in either admin language). The services check every permission
// again.
import { isCustomersError } from '@extas/customers';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import bn from '../../../messages/admin-privacy.bn.json';
import en from '../../../messages/admin-privacy.en.json';
import { cancelRequest, eraseNow, fileRequest, isPrivacyPageError, privacyView, saveKeepCard } from './service';

/** The confirmation word in each admin language (the page shows the one of its language). */
export const CONFIRM_WORDS = [en.prv.confirmWord, bn.prv.confirmWord] as const;

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export async function privacyHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT' && method !== 'POST') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'security.read', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const d = { db: deps!.db, resolver: deps!.resolver };
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    if (method === 'PUT') {
      const view = await saveKeepCard(d, who, await body(request));
      return json({ ok: true, view, cards: view.cards });
    }
    if (method === 'POST') {
      const b = await body(request);
      const action = str(b.action);
      if (action === 'request') await fileRequest(d, who, { phone: b.phone, reason: b.reason });
      else if (action === 'cancel') await cancelRequest(d, who, str(b.requestId));
      else if (action === 'erase') await eraseNow(d, who, str(b.requestId), str(b.confirm), CONFIRM_WORDS);
      else return fail(400, 'INVALID_INPUT', ['action']);
    }
    const view = await privacyView(d, who);
    return json({ ok: true, view, cards: view.cards });
  } catch (e) {
    if (isPrivacyPageError(e)) return json({ ok: false, error: e.code, details: e.details, ...e.data }, { status: e.status });
    if (isCustomersError(e)) return json({ ok: false, error: e.code, details: e.details, ...(e.data ?? {}) }, { status: e.status });
    return errorResponse(e);
  }
}

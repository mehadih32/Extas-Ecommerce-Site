// Go-live gate F-041 / F-054 — /api/admin/money/refunds: GET Money › Refunds & wallet (`?view=`, `payments.view`);
// PUT {key: 'refunds' | 'walletManual' | 'apology', value, version} saves one of its three money rules (`settings.write`,
// checked again in money-refunds.ts). The refund steps and the apology credit go through /api/admin/payments/….
import { MOTHER_STORE_ID } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from './admin-auth';
import { isMoneyCardError, refundsView, saveMoneyCard } from './money-refunds';
import { paymentsDeps } from './payments-api';

export async function refundsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'payments.view' : 'settings.write', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    const d = { db: deps!.db, resolver: deps!.resolver, payments: await paymentsDeps(deps!) };
    if (method === 'PUT') return json({ ok: true, cards: await saveMoneyCard(d, who, await body(request)) });
    const view = await refundsView(d, who, { view: new URL(request.url).searchParams.get('view') ?? undefined });
    return json({ ok: true, view, cards: view.cards });
  } catch (e) {
    if (isMoneyCardError(e)) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return errorResponse(e);
  }
}

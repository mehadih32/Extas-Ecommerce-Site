// PR 817 — /api/admin/settings/settlement: PUT {accounts, bkash, nagad, card, cod} saves "Where the money lands" (`settings.write`, an
// owner only, through the settings history). lib/admin-checkout/settlement.ts.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { adminDeps, body, errorResponse, fail, guardAdmin, json } from '@/lib/admin-auth';
import { settlementSave, SettlementError } from '@/lib/admin-checkout/settlement';

export const dynamic = 'force-dynamic';

export async function PUT(request: Request): Promise<Response> {
  const deps = adminDeps();
  const g = await guardAdmin(request, deps, { permission: 'settings.write', storeId: MOTHER_STORE_ID });
  if (g instanceof Response) return g;
  if (!deps) return fail(503, 'unavailable');
  try {
    const value = await settlementSave({ db: deps.db, resolver: deps.resolver }, { actor: g.actor, ctx: g.ctx }, await body(request), MOTHER_STORE_ID);
    return json({ ok: true, value });
  } catch (e) {
    if (e instanceof SettlementError) return json({ ok: false, error: e.code, details: e.details }, { status: e.status });
    return errorResponse(e);
  }
}

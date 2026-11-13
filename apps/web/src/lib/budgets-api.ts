// S28 · PR 688 (admin prototype v5, Finance › Costs & budgets) — the budgets and profit snapshot API. Every route signs the
// person in (guardAdmin), checks the permission in the store it touches (`?storeId=`, default the mother store), then calls
// @extas/inventory (budgets.ts), which checks it again, asks for the owner's PIN on every change and writes the audit log.
//
//   GET   /api/admin/money/budgets   this month's budgets against what is spent, the profit snapshot and who can approve
//                                    refunds (`books.read`)
//   POST  /api/admin/money/budgets   {fromMonth, budgets: {HEAD: amountMinor}, pin} (`fixedcosts.write`)
// Nothing here moves money.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { requireAnyPermission } from '@extas/auth';
import * as inv from '@extas/inventory';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from './admin-auth';
import { inventoryDeps } from './inventory-api';

function storeIdOf(url: URL): number | null {
  const raw = url.searchParams.get('storeId');
  const n = raw === null ? MOTHER_STORE_ID : Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/** Everything the budgets card and the profit snapshot show, for one store. */
export async function budgetsScreen(deps: inv.InventoryDeps, who: inv.Who) {
  const [budgets, snapshot, approvers] = await Promise.all([inv.budgetsView(deps, who), inv.profitSnapshot(deps, who), inv.refundApprovers(deps, who)]);
  return { budgets, snapshot, approvers };
}

export async function budgetsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const m = request.method.toUpperCase();
  if (m !== 'GET' && m !== 'POST') return fail(405, 'method-not-allowed');
  const storeId = storeIdOf(new URL(request.url));
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, m === 'GET' ? { permission: 'books.read', storeId } : { storeId });
  if (g instanceof Response) return g;
  try {
    const who: inv.Who = { actor: g.actor, storeId, ctx: g.ctx };
    const idep = await inventoryDeps(deps!);
    if (m === 'GET') return json({ ok: true, ...(await budgetsScreen(idep, who)) });
    await requireAnyPermission(deps!.db, g.actor, ['fixedcosts.write'], { storeId });
    const b = await body(request);
    return json({ ok: true, ...(await inv.setBudgets(idep, who, b as inv.SetBudgetsInput)) });
  } catch (e) {
    return errorResponse(e);
  }
}

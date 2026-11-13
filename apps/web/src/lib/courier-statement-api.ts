// S28 · PR 675 (CN-048) — "Accept the courier figure" on a courier statement line that does not match. Signs the person in
// (guardAdmin), checks `payments.settle` in the store it touches (`?storeId=`, default the mother store), then calls
// @extas/payments, which checks it again. The part of the courier's charge above ours becomes one cost entry on the books'
// delivery line (only while the books' switch for courier charges is on) and the line is resolved; a cost the books did not take
// resolves nothing (`COST_NOT_BOOKED`). Answers are `{ ok: true, … }` or `{ ok: false, error: CODE, details, data }`.
//
//   POST  /api/admin/delivery/statement-lines/:id/accept      {note?} accept the courier figure (payments.settle)
import * as pay from '@extas/payments';
import { body, fail, isUuid, type AdminDeps } from './admin-auth';
import { handle } from './courier-payouts-api';

export async function acceptFigureRoute(request: Request, deps: AdminDeps | null, lineId: string): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  if (!isUuid(lineId)) return fail(404, 'NOT_FOUND', ['lineId']);
  return handle(request, deps, 'payments.settle', async (x) => ({ accepted: await pay.acceptFigure(x.deps, x.who, lineId, await body(request)) }));
}

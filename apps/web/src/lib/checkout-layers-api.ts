// S04 · PR 558 — the Parameter for Checkout's admin API (Orders › Risk rules › Checkout advance):
//   GET  /api/admin/risk/checkout-layers   the one switch, the most layers and its choices, the layers in their order
//                                          (what counts as a flag, what each asks for), the owner's risk bands and the
//                                          score's signals with their words, and the panel's version (risk.rules.read)
//   PUT  /api/admin/risk/checkout-layers   {version, enabled, maxLayers?, layers: [...], confirm?, reason?} saves the
//                                          whole panel at once: new layers added, changed ones updated, the ones left
//                                          out archived (never deleted); a stale version is 409 STALE; switching the
//                                          feature on without `confirm` is 400 INVALID_INPUT ['confirm'] (risk.rules.write)
// Nothing here blocks anyone or changes a price, a charge or a discount: a flagged customer is only asked, at checkout,
// to pay ahead (PR 560), and only while the owner keeps it on.
import * as od from '@extas/orders';
import { body, fail, type AdminDeps } from './admin-auth';
import { handle } from './orders-api';

/** The checkout-layers route. */
export async function checkoutLayersRoute(request: Request, deps: AdminDeps | null): Promise<Response> {
  const m = request.method.toUpperCase();
  if (m === 'GET') return handle(request, deps, 'risk.rules.read', async (x) => ({ panel: await od.checkoutLayers(x.deps, x.who) }));
  if (m === 'PUT') return handle(request, deps, 'risk.rules.write', async (x) => ({ panel: await od.saveCheckoutLayers({ ...x.deps, settings: deps!.resolver }, x.who, await body(request)) }));
  return fail(405, 'method-not-allowed');
}

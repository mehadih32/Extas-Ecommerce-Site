// PR 606 — the bulk / corporate lane's routes.
//
//   POST /api/shop/bulk                                 public (same site, small body): the enquiry, while the lane is
//                                                       on; `withBag` takes this browser's bag lines with it
//   GET  /api/admin/bulk-enquiries                      the team's list (?status, ?cursor, ?limit) · orders.read
//   POST /api/admin/bulk-enquiries/:id/status           {status} the stage it is at · orders.notes (audited)
//
// Refusals come in the checkout's own codes: FORM (with the field and the problem), NOT_OPEN (the lane is off: 404),
// TOO_MANY (enough for today: 429). Nothing here prices, quotes or moves money.
import { CheckoutError, listBulkEnquiries, sendBulkEnquiry, setBulkEnquiryStatus } from '@extas/checkout';
import { body, errorResponse, fail, guardAdmin, json, requestContext, type AdminDeps } from './admin-auth';
import { storeIdOf } from './catalogue-api';
import { bagOfRequest, guard, refusal, type CheckoutApiDeps } from './shop/checkout-api';
import { bulkTrialSettings, tryBulkOnRequest } from './shop/try-bulk';

/** POST /api/shop/bulk — the customer's enquiry. */
export async function bulkEnquiryHandler(request: Request, deps: CheckoutApiDeps | null): Promise<Response> {
  const stop = guard(request, deps, ['POST']);
  if (stop || !deps) return stop!;
  try {
    const input = await body(request);
    const { visitor } = await bagOfRequest(request, deps);
    const customerId = deps.customerOf ? await deps.customerOf(request) : null;
    // PR 606: a test server's trial (/api/shop/try-bulk) takes the enquiry as if the lane were on
    const checkout = tryBulkOnRequest(request) ? { ...deps.checkout, settings: bulkTrialSettings(deps.checkout.settings) } : deps.checkout;
    const r = await sendBulkEnquiry(checkout, { storeId: deps.storeId, visitorId: visitor, customerId, ip: requestContext(request).ip ?? null, input });
    return json({ ok: true, ...r }, { status: 201 });
  } catch (e) {
    return refusal(e);
  }
}

/** GET /api/admin/bulk-enquiries · POST /api/admin/bulk-enquiries/:id/status. */
export async function bulkAdminHandler(request: Request, deps: AdminDeps | null, path: string[] = []): Promise<Response> {
  const method = request.method.toUpperCase();
  const [id, action, ...rest] = path;
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const list = !id && method === 'GET';
  const stage = id && action === 'status' && !rest.length && method === 'POST';
  if (!list && !stage) return fail(id && action !== 'status' ? 404 : 405, id && action !== 'status' ? 'not-found' : 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: list ? 'orders.read' : 'orders.notes', storeId });
  if (g instanceof Response) return g;
  const checkout = { db: deps!.db, settings: deps!.resolver, now: deps!.now };
  const who = { actor: g.actor, storeId, ctx: g.ctx };
  try {
    if (list) return json({ ok: true, ...(await listBulkEnquiries(checkout, who, Object.fromEntries([...url.searchParams.entries()].filter(([k]) => k !== 'storeId')))) });
    return json({ ok: true, ...(await setBulkEnquiryStatus(checkout, who, id!, await body(request))) });
  } catch (e) {
    if (e instanceof CheckoutError) return fail(e.status, e.code, e.details);
    return errorResponse(e);
  }
}

// S07 · PR 165 — the payments admin API (BACKEND-ARCHITECTURE §6.5.3, §9.10). No admin pages yet: the order screen's
// money panel comes with the admin UI; these routes are what it calls. Every route signs the person in (guardAdmin),
// checks the permission in the store it touches (`?storeId=`, default the mother store), then calls @extas/payments,
// which checks the permission again and writes the audit log in the same transaction. Recording money takes an
// `Idempotency-Key` header (§7.7: a repeat gets the first answer, never a second payment). Answers are `{ ok: true, … }`
// or `{ ok: false, error: CODE, details, data }`. One catch-all route (app/api/admin/payments/[[...path]]) hands every
// path to `paymentsRoute`. When money completes an order's advance, the order moves through the one order service
// (@extas/orders recordAdvance), wired here as the payments service's `orders` hook.
//
//   GET   /api/admin/payments/orders/:id            the order's money: total, paid, due, what the rider collects, the
//                                                    pill, every payment row and every mismatch with its reason (payments.view)
//   POST  /api/admin/payments/orders/:id/payments   {method, amountMinor, reference, receivedAt?, note?, confirm: true,
//                                                    purpose?} money received outside the checkout (a bKash send-money,
//                                                    a bank transfer); off until `payments.manual` is on (payments.record)
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as od from '@extas/orders';
import * as pay from '@extas/payments';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from './admin-auth';
import { ordersDeps } from './orders-api';

interface Ctx {
  deps: pay.PaymentsDeps;
  who: pay.Who;
  key: string | undefined;
}

function storeIdOf(url: URL): number | null {
  const raw = url.searchParams.get('storeId');
  const n = raw === null ? MOTHER_STORE_ID : Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/** The payments service's dependencies for one request, with the order moves money causes. */
export async function paymentsDeps(deps: AdminDeps): Promise<pay.PaymentsDeps> {
  return {
    db: deps.db,
    settings: deps.resolver,
    now: deps.now,
    orders: {
      async advancePaid(storeId, orderId, by) {
        await od.recordAdvance(await ordersDeps(deps), { storeId, orderId }, { actorType: by.actorId ? 'STAFF' : 'SYSTEM', actorId: by.actorId, source: by.source });
      },
    },
  };
}

function paymentsFail(e: unknown): Response {
  if (pay.isPaymentsError(e)) return json({ ok: false, error: e.code, ...(e.details.length ? { details: e.details } : {}), ...(e.data ? { data: e.data } : {}) }, { status: e.status });
  return errorResponse(e);
}

async function handle(request: Request, deps: AdminDeps | null, permission: pay.PaymentsPermission, fn: (c: Ctx) => Promise<Record<string, unknown>>, status = 200): Promise<Response> {
  const storeId = storeIdOf(new URL(request.url));
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission, storeId });
  if (g instanceof Response) return g;
  try {
    const key = request.headers.get('idempotency-key')?.trim() || undefined;
    return json({ ok: true, ...(await fn({ deps: await paymentsDeps(deps!), who: { actor: g.actor, storeId, ctx: g.ctx }, key })) }, { status });
  } catch (e) {
    return paymentsFail(e);
  }
}

const notAllowed = () => Promise.resolve(fail(405, 'method-not-allowed'));
const notFound = () => Promise.resolve(fail(404, 'not-found'));

/** Every payments admin route: `path` is what comes after /api/admin/payments. */
export async function paymentsRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  const [a, b, c] = path;
  if (a !== 'orders' || !b || path.length > 3) return notFound();
  if (!isUuid(b)) return Promise.resolve(fail(404, 'NOT_FOUND', ['orderId']));
  if (!c) {
    if (m !== 'GET') return notAllowed();
    return handle(request, deps, 'payments.view', async (x) => {
      const money = await pay.orderMoney(x.deps, x.who, b);
      if (!money) throw new pay.PaymentsError('NOT_FOUND', 'no such order', ['orderId']);
      return { money };
    });
  }
  if (c !== 'payments') return notFound();
  if (m !== 'POST') return notAllowed();
  return handle(request, deps, 'payments.record', async (x) => ({ result: await pay.recordPayment(x.deps, x.who, b, await body(request), { idempotencyKey: x.key }) }), 201);
}

// S28 · PR 671 (CN-048) — the courier payouts admin API: asking a courier to pay what it holds through the courier's OWN
// payment-request feature, and reading the request back. Every route signs the person in (guardAdmin), checks the
// permission in the store it touches (`?storeId=`, default the mother store), then calls @extas/payments, which checks the
// permission and the owner's switch again. Asking needs the owner's PIN (typed in the body, never stored or logged) and an
// `Idempotency-Key` (the same key is the same request, so a double press never asks the courier twice). Off until
// `delivery.courier.payouts` is switched on. Answers are `{ ok: true, … }` or `{ ok: false, error: CODE, details, data }`.
//
//   GET   /api/admin/delivery/payouts?courierAccountId=        what the courier holds, its open request, the latest (payments.view)
//   POST  /api/admin/delivery/payouts                          {courierAccountId, pin} ask the courier to pay (payments.settle + PIN)
//   POST  /api/admin/delivery/payouts/:id/check                read the request back now (payments.settle)
//   POST  /api/admin/delivery/payouts/:id/settle               mark the orders of a PAID request settled (payments.settle)
//   POST  /api/admin/delivery/payouts/:id/close                {note} close a request the courier never confirmed (payments.settle)
import type { PermissionKey } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as pay from '@extas/payments';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from './admin-auth';
import { paymentsDeps } from './payments-api';

interface Ctx {
  deps: pay.PaymentsDeps;
  who: pay.Who;
  key: string | undefined;
  storeId: number;
}

function storeIdOf(url: URL): number | null {
  const raw = url.searchParams.get('storeId');
  const n = raw === null ? MOTHER_STORE_ID : Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

function payFail(e: unknown): Response {
  if (pay.isPaymentsError(e)) return json({ ok: false, error: e.code, ...(e.details.length ? { details: e.details } : {}), ...(e.data ? { data: e.data } : {}) }, { status: e.status });
  return errorResponse(e);
}

async function handle(request: Request, deps: AdminDeps | null, permission: PermissionKey, fn: (c: Ctx) => Promise<Record<string, unknown>>, status = 200): Promise<Response> {
  const storeId = storeIdOf(new URL(request.url));
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission, storeId });
  if (g instanceof Response) return g;
  try {
    const key = request.headers.get('idempotency-key')?.trim() || undefined;
    return json({ ok: true, ...(await fn({ deps: await paymentsDeps(deps!), who: { actor: g.actor, storeId, ctx: g.ctx }, key, storeId })) }, { status });
  } catch (e) {
    return payFail(e);
  }
}

const notAllowed = () => Promise.resolve(fail(405, 'method-not-allowed'));

export async function payoutsRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  const [id, action] = path;
  if (id === undefined) {
    if (m === 'GET') {
      const courierAccountId = new URL(request.url).searchParams.get('courierAccountId') ?? '';
      if (!isUuid(courierAccountId)) return fail(400, 'INVALID_INPUT', ['courierAccountId']);
      return handle(request, deps, 'payments.view', async (x) => ({ payouts: await pay.payoutView(x.deps, x.who, courierAccountId) }));
    }
    if (m !== 'POST') return notAllowed();
    return handle(
      request,
      deps,
      'payments.settle',
      async (x) => {
        const b = (await body(request)) as Record<string, unknown>;
        const courierAccountId = typeof b?.courierAccountId === 'string' ? b.courierAccountId : '';
        if (!x.key) throw new pay.PaymentsError('INVALID_INPUT', 'an Idempotency-Key is needed', ['Idempotency-Key']);
        return { payout: await pay.requestPayout(x.deps, x.who, courierAccountId, { pin: b?.pin, requestKey: x.key }) };
      },
      201,
    );
  }
  if (path.length !== 2 || !action || !['check', 'settle', 'close'].includes(action)) return Promise.resolve(fail(404, 'not-found'));
  if (!isUuid(id)) return Promise.resolve(fail(404, 'NOT_FOUND', ['payoutId']));
  if (m !== 'POST') return notAllowed();
  return handle(request, deps, 'payments.settle', async (x) => {
    if (action === 'settle') return { payout: await pay.settlePayout(x.deps, x.who, id) };
    if (action === 'close') return { payout: await pay.closePayout(x.deps, x.who, id, await body(request)) };
    await pay.allowPayouts(x.deps, x.who);
    return { poll: await pay.pollPayouts(x.deps, x.storeId, { ids: [id], force: true }) };
  });
}

// S14 · PR 296 — the customer turns his points into wallet credit himself, from My account › Rewards:
//
//   POST /api/account/points {key}   → {ok, points, creditMinor, balance, replay}
//
// Same site only, and only for the signed-in customer. Every whole block of the owner's `redeemPoints` becomes
// `redeemMinor` of wallet credit (@extas/customers `redeemPoints`, one transaction with the wallet entry); `key` is the
// press's own id, so a double press is one turn-in. While the owner has not set both numbers the answer is
// SWITCHED_OFF (403) and nothing moves; fewer points than one block is NOT_ENOUGH_POINTS (422).
import { isCustomersError, redeemPoints } from '@extas/customers';
import { fail, json, requestContext, sameOrigin } from '../admin-auth';
import { customerOfRequest } from './account';
import { accountRefusal, type AccountApiDeps } from './account-api';

/** POST /api/account/points. */
export async function pointsHandler(request: Request, deps: AccountApiDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  if (!deps) return fail(503, 'database-not-configured');
  if (!sameOrigin(request)) return fail(403, 'cross-site-request');
  const a = deps.accounts;
  const storeId = deps.storeId;
  try {
    const auth = await customerOfRequest(request, a, storeId);
    if (!auth) return fail(401, 'SIGNED_OUT');
    const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!b || typeof b !== 'object') return fail(400, 'INVALID_INPUT', ['body']);
    const ctx = requestContext(request);
    const r = await redeemPoints({ db: a.db, settings: a.settings, ...(a.now ? { now: a.now } : {}) }, { storeId, customerId: auth.customer.id, ip: ctx.ip, userAgent: ctx.userAgent }, { key: b.key });
    return json({ ok: true, points: r.points, creditMinor: r.creditMinor, balance: r.balance, replay: r.replay });
  } catch (e) {
    if (isCustomersError(e)) return fail(e.status, e.code, e.details);
    return accountRefusal(e);
  }
}

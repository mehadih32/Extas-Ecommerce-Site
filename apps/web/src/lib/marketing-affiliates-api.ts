// S28 · PR 695 — Influencers & affiliates' admin API. Paths after /api/admin/marketing/affiliates:
//   GET   (none)       the board: partners with earned / held / paid / due, and the ledger (rules.read)
//   POST  /add         {name, handle?, platform?, code, couponId?, commissionPct?} (rules.write)
//   POST  /status      {id, status: ON|PAUSED|ARCHIVED} (rules.write)
//   POST  /pay         {affiliateId, amountMinor, method, note?} — OFF as shipped, then needs payments.record
//   POST  /reverse     {id} a correction row for a payout (payments.record)
//   POST  /settings    {value, before} the switch `marketing.affiliates` (the owner: rules.approve)
// Nothing here changes a coupon, a price or a discount.
import * as rl from '@extas/rules';
import { body, fail, isUuid, type AdminDeps } from './admin-auth';
import { notAllowed, notFound, saveV5Switch, v5Handle } from './admin-v5-api';
import { rulesDeps } from './rules-api';

export async function affiliatesRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  const [a] = path;
  if (path.length > 1) return notFound();
  const rd = (x: { admin: AdminDeps }) => rulesDeps(x.admin);
  if (a === undefined) {
    if (m !== 'GET') return notAllowed();
    return v5Handle(request, deps, 'rules.read', async (x) => ({ ...(await rl.affiliateBoard(rd(x), x.who)) }));
  }
  if (m !== 'POST') return notAllowed();
  if (a === 'settings') return v5Handle(request, deps, 'rules.approve', (x) => saveV5Switch(request, x, ['marketing.affiliates']));
  if (a === 'add') return v5Handle(request, deps, 'rules.write', async (x) => ({ ...(await rl.addAffiliate(rd(x), x.who, await body(request))) }), 201);
  if (a === 'status') return v5Handle(request, deps, 'rules.write', async (x) => (await rl.setAffiliateStatus(rd(x), x.who, await body(request)), { saved: true }));
  if (a === 'pay') return v5Handle(request, deps, 'payments.record', async (x) => ({ ...(await rl.recordAffiliatePayout(rd(x), x.who, await body(request))) }), 201);
  if (a === 'reverse') {
    return v5Handle(request, deps, 'payments.record', async (x) => {
      const b = (await body(request)) as { id?: unknown };
      if (!isUuid(b.id)) return fail(400, 'INVALID_INPUT', ['id']);
      return { ...(await rl.reverseAffiliatePayout(rd(x), x.who, b.id)) };
    }, 201);
  }
  return notFound();
}

// S07 · PR 165, 166, 170–174 — the payments admin API (BACKEND-ARCHITECTURE §6.5.3, §9.10). No admin pages yet: the order screen's
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
//   POST  /api/admin/payments/orders/:id/door       PR 166: {outcome, collectedMinor, chargeCollectedMinor?, shipmentId?,
//                                                    keptItemIds?, note?, occurredAt?, source?} what happened at the door
//                                                    and the money (Idempotency-Key) (payments.door)
//   POST  /api/admin/payments/door/:collectionId/decide   {decision: approve|reject, note?} a partial's money (payments.partials)
//   GET   /api/admin/payments/cod                   cash in transit per courier, days to settle, missing parcels, open
//                                                    mismatches by reason (payments.view)
//   POST  /api/admin/payments/settlements           {courierAccountId, reference, csv | lines, receivedAt?, receivedAs?,
//                                                    receivedAccountRef?, periodFrom?, periodTo?} a courier's COD statement,
//                                                    matched line by line (payments.settle)
//   GET   /api/admin/payments/settlements/:id       one statement with every line, its match and reason (payments.view)
//   POST  /api/admin/payments/settlements/lines/:lineId/resolve   {note} a checked mismatch marked resolved (payments.settle)
//   GET   /api/admin/payments/issues?state=failed|abandoned|waiting&limit=   PR 170 (SIM-F-026): the failed, abandoned or
//                                                    still waiting online payments, newest first (payments.view)
//   GET   /api/admin/payments/wallets/:customerId?limit=   PR 171: a customer's wallet and its ledger, newest first, with
//                                                    the balance worked out from the ledger (payments.view)
//   POST  /api/admin/payments/wallets/:customerId/entries   {direction, amountMinor, note, kind?, orderId?, confirm: true}
//                                                    a person's own credit or debit; off until `payments.wallet.manual`
//                                                    is on (Idempotency-Key) (payments.wallet)
//   POST  /api/admin/payments/wallets/entries/:entryId/reverse   {note, confirm: true} an entry put right with a new one
//                                                    the other way, once (payments.wallet)
//   GET   /api/admin/payments/apology?limit=         PR 171 (CN-018 #8): delivered orders that came late, no apology yet (payments.view)
//   POST  /api/admin/payments/orders/:id/apology     {amountMinor?, note?, confirm: true} the late-delivery apology credit,
//                                                    once per order; off until `payments.wallet.apology` is on (payments.apology)
//   GET   /api/admin/payments/refunds?state=requested|approved|failed|owed|…&orderId=&limit=   PR 172: the refunds, newest
//                                                    first, with the money owed to customers (F-041) (payments.view)
//   POST  /api/admin/payments/orders/:id/refunds    {source, amountMinor?, method?, note, paymentId?} a refund asked within
//                                                    the owner's rules (`payments.refunds`) (Idempotency-Key) (payments.refunds.request)
//   POST  /api/admin/payments/refunds/:id/approve   {method?, note?, confirm: true} the owner's OK (payments.refunds.approve)
//   POST  /api/admin/payments/refunds/:id/reject    {note} (payments.refunds.approve)
//   POST  /api/admin/payments/refunds/:id/complete  {reference?, note?, confirm: true} paid out: to the wallet, or the money a
//                                                    person sent back by hand with its reference (Idempotency-Key) (payments.refunds.execute)
//   POST  /api/admin/payments/refunds/:id/fail      {note} the payout did not go through (payments.refunds.execute)
//   GET   /api/admin/payments/orders/:id/advance    PR 173: what a pre-order's advance may be — the owner's cap, the
//                                                    default ask, what the rider collects after it (payments.view)
//   POST  /api/admin/payments/orders/:id/advance    {method, provider?, amountMinor? | full?, note?, confirm: true} a COD
//                                                    order's advance for the customer to pay online, within the cap; off
//                                                    until `payments.partial` is on (Idempotency-Key) (payments.advance)
//   POST  /api/admin/payments/statements            PR 174: {provider, reference, periodFrom, periodTo, csv | lines} a
//                                                    gateway's statement, matched line by line (payments.settle)
//   GET   /api/admin/payments/statements/:id        one gateway statement with every line, its match and reason (payments.view)
//   POST  /api/admin/payments/statements/lines/:lineId/resolve   {note} a checked mismatch marked resolved (payments.settle)
//   POST  /api/admin/payments/statements/practice   {provider, from, to} the practice gateway's statement for a period,
//                                                    only while it runs on practice money (payments.settle)
//   GET   /api/admin/payments/reconciliation?from=&to=   the reconciliation report: ours against each gateway's
//                                                    statements, every open mismatch with its reason (SIM-F-028), the COD
//                                                    position, money owed to customers, the wallet ledger check (payments.view)
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as pay from '@extas/payments';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from './admin-auth';
import { paymentsServiceDeps } from './payments-gateway';

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

/** The payments service's dependencies for one request, with the order moves money causes (payments-gateway.ts). */
export const paymentsDeps = (deps: AdminDeps): Promise<pay.PaymentsDeps> => paymentsServiceDeps(deps);

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

const badId = (field: string) => Promise.resolve(fail(404, 'NOT_FOUND', [field]));

/** PR 172 — the steps of one refund: the owner's decision, and the payout a person records. */
const REFUND_ACTIONS = {
  approve: { permission: 'payments.refunds.approve', run: (x: Ctx, id: string, b: unknown) => pay.approveRefund(x.deps, x.who, id, b) },
  reject: { permission: 'payments.refunds.approve', run: (x: Ctx, id: string, b: unknown) => pay.rejectRefund(x.deps, x.who, id, b) },
  complete: { permission: 'payments.refunds.execute', run: (x: Ctx, id: string, b: unknown) => pay.completeRefund(x.deps, x.who, id, b, { idempotencyKey: x.key }) },
  fail: { permission: 'payments.refunds.execute', run: (x: Ctx, id: string, b: unknown) => pay.failRefund(x.deps, x.who, id, b) },
} satisfies Record<string, { permission: pay.PaymentsPermission; run: (x: Ctx, id: string, b: unknown) => Promise<pay.RefundResult> }>;

/** Every payments admin route: `path` is what comes after /api/admin/payments. */
export async function paymentsRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  const [a, b, c, e] = path;
  if (a === 'cod') {
    if (path.length > 1) return notFound();
    if (m !== 'GET') return notAllowed();
    return handle(request, deps, 'payments.view', async (x) => ({ position: await pay.codPosition(x.deps, x.who) }));
  }
  if (a === 'issues') {
    if (path.length > 1) return notFound();
    if (m !== 'GET') return notAllowed();
    const u = new URL(request.url);
    return handle(request, deps, 'payments.view', async (x) => ({ rows: await pay.paymentIssues(x.deps, x.who, { state: u.searchParams.get('state') ?? undefined, limit: Number(u.searchParams.get('limit') ?? '50') }) }));
  }
  if (a === 'door') {
    if (path.length !== 3 || c !== 'decide') return notFound();
    if (!isUuid(b!)) return badId('collectionId');
    if (m !== 'POST') return notAllowed();
    return handle(request, deps, 'payments.partials', async (x) => ({ result: await pay.decidePartial(x.deps, x.who, b!, await body(request)) }));
  }
  if (a === 'settlements') {
    if (!b) {
      if (m !== 'POST') return notAllowed();
      return handle(request, deps, 'payments.settle', async (x) => ({ settlement: await pay.importSettlement(x.deps, x.who, await body(request)) }), 201);
    }
    if (b === 'lines') {
      if (path.length !== 4 || e !== 'resolve') return notFound();
      if (!isUuid(c!)) return badId('lineId');
      if (m !== 'POST') return notAllowed();
      return handle(request, deps, 'payments.settle', async (x) => ({ line: await pay.resolveLine(x.deps, x.who, c!, await body(request)) }));
    }
    if (path.length > 2) return notFound();
    if (!isUuid(b)) return badId('settlementId');
    if (m !== 'GET') return notAllowed();
    return handle(request, deps, 'payments.view', async (x) => {
      const s = await pay.getSettlement(x.deps, x.who, b);
      if (!s) throw new pay.PaymentsError('NOT_FOUND', 'no such statement', ['settlementId']);
      return { settlement: s };
    });
  }
  if (a === 'wallets') {
    if (b === 'entries') {
      if (path.length !== 4 || e !== 'reverse') return notFound();
      if (!isUuid(c!)) return badId('entryId');
      if (m !== 'POST') return notAllowed();
      return handle(request, deps, 'payments.wallet', async (x) => ({ entry: await pay.reverseWalletEntry(x.deps, x.who, c!, await body(request)) }), 201);
    }
    if (!b || path.length > 3) return notFound();
    if (!isUuid(b)) return badId('customerId');
    if (!c) {
      if (m !== 'GET') return notAllowed();
      const u = new URL(request.url);
      return handle(request, deps, 'payments.view', async (x) => {
        const wallet = await pay.walletOf(x.deps, x.who, b, { limit: Number(u.searchParams.get('limit') ?? '50') });
        if (!wallet) throw new pay.PaymentsError('NOT_FOUND', 'no such customer', ['customerId']);
        return { wallet };
      });
    }
    if (c !== 'entries') return notFound();
    if (m !== 'POST') return notAllowed();
    return handle(request, deps, 'payments.wallet', async (x) => ({ entry: await pay.adjustWallet(x.deps, x.who, b, await body(request), { idempotencyKey: x.key }) }), 201);
  }
  if (a === 'apology') {
    if (path.length > 1) return notFound();
    if (m !== 'GET') return notAllowed();
    const u = new URL(request.url);
    return handle(request, deps, 'payments.view', async (x) => ({ apology: await pay.apologyCandidates(x.deps, x.who, { limit: Number(u.searchParams.get('limit') ?? '50') }) }));
  }
  if (a === 'statements') {
    if (!b) {
      if (m !== 'POST') return notAllowed();
      return handle(request, deps, 'payments.settle', async (x) => ({ statement: await pay.importGatewayStatement(x.deps, x.who, await body(request)) }), 201);
    }
    if (b === 'practice') {
      if (path.length > 2) return notFound();
      if (m !== 'POST') return notAllowed();
      return handle(request, deps, 'payments.settle', async (x) => ({ practice: await pay.practiceStatement(x.deps, x.who, await body(request)) }));
    }
    if (b === 'lines') {
      if (path.length !== 4 || e !== 'resolve') return notFound();
      if (!isUuid(c!)) return badId('lineId');
      if (m !== 'POST') return notAllowed();
      return handle(request, deps, 'payments.settle', async (x) => ({ line: await pay.resolveGatewayLine(x.deps, x.who, c!, await body(request)) }));
    }
    if (path.length > 2) return notFound();
    if (!isUuid(b)) return badId('statementId');
    if (m !== 'GET') return notAllowed();
    return handle(request, deps, 'payments.view', async (x) => {
      const st = await pay.getGatewayStatement(x.deps, x.who, b);
      if (!st) throw new pay.PaymentsError('NOT_FOUND', 'no such statement', ['statementId']);
      return { statement: st };
    });
  }
  if (a === 'reconciliation') {
    if (path.length > 1) return notFound();
    if (m !== 'GET') return notAllowed();
    const q = new URL(request.url).searchParams;
    return handle(request, deps, 'payments.view', async (x) => ({ report: await pay.reconciliationReport(x.deps, x.who, { from: q.get('from') ?? undefined, to: q.get('to') ?? undefined }) }));
  }
  if (a === 'refunds') {
    if (!b) {
      if (m !== 'GET') return notAllowed();
      const u = new URL(request.url);
      const q = u.searchParams;
      return handle(request, deps, 'payments.view', async (x) => ({ refunds: await pay.listRefunds(x.deps, x.who, { state: q.get('state') ?? undefined, orderId: q.get('orderId') ?? undefined, limit: Number(q.get('limit') ?? '50') }) }));
    }
    if (path.length !== 3) return notFound();
    if (!isUuid(b)) return badId('refundId');
    const act = REFUND_ACTIONS[c as keyof typeof REFUND_ACTIONS];
    if (!act) return notFound();
    if (m !== 'POST') return notAllowed();
    return handle(request, deps, act.permission, async (x) => ({ refund: (await act.run(x, b, await body(request))).refund }));
  }
  if (a !== 'orders' || !b || path.length > 3) return notFound();
  if (!isUuid(b)) return badId('orderId');
  if (!c) {
    if (m !== 'GET') return notAllowed();
    return handle(request, deps, 'payments.view', async (x) => {
      const money = await pay.orderMoney(x.deps, x.who, b);
      if (!money) throw new pay.PaymentsError('NOT_FOUND', 'no such order', ['orderId']);
      return { money };
    });
  }
  if (c === 'advance' && m === 'GET') {
    return handle(request, deps, 'payments.view', async (x) => {
      const quote = await pay.advanceQuote(x.deps, x.who, b);
      if (!quote) throw new pay.PaymentsError('NOT_FOUND', 'no such order', ['orderId']);
      return { quote };
    });
  }
  if (m !== 'POST') return c === 'payments' || c === 'door' || c === 'apology' || c === 'refunds' || c === 'advance' ? notAllowed() : notFound();
  if (c === 'payments') return handle(request, deps, 'payments.record', async (x) => ({ result: await pay.recordPayment(x.deps, x.who, b, await body(request), { idempotencyKey: x.key }) }), 201);
  if (c === 'door') return handle(request, deps, 'payments.door', async (x) => ({ result: await pay.recordDoorOutcome(x.deps, x.who, b, await body(request), { idempotencyKey: x.key }) }), 201);
  if (c === 'apology') return handle(request, deps, 'payments.apology', async (x) => ({ result: await pay.giveApology(x.deps, x.who, b, await body(request)) }), 201);
  if (c === 'refunds') return handle(request, deps, 'payments.refunds.request', async (x) => ({ refund: (await pay.requestRefund(x.deps, x.who, b, await body(request), { idempotencyKey: x.key })).refund }), 201);
  if (c === 'advance') return handle(request, deps, 'payments.advance', async (x) => ({ result: await pay.requestAdvance(x.deps, x.who, b, await body(request), { idempotencyKey: x.key }) }), 201);
  return notFound();
}

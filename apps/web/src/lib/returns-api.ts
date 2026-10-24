// S08 · PR 185 — the returns and exchanges admin API (ORD-05, BACKEND-ARCHITECTURE §5.3). Every route signs the person
// in (guardAdmin), checks the permission in the store it touches (`?storeId=`, default the mother store), then calls
// @extas/orders, which checks the permission again and writes the timeline and the audit log in the same transaction.
// A decision takes the screen's `version` in the body (an older one is refused with STALE); opening one takes an
// `Idempotency-Key` header (a repeat gets the same exchange). Answers are `{ ok: true, … }` or
// `{ ok: false, error: CODE, details, data }`. One catch-all route (app/api/admin/returns/[[...path]]) hands every path
// to `returnsRoute`. Nothing here moves money, refunds anything or changes a price, a discount or COD.
//
//   GET   /api/admin/returns?status=                            the board: the exchanges, newest first (returns.view)
//   GET   /api/admin/returns/exchanges/:id                      one exchange with its pieces and money box
//   POST  /api/admin/returns/exchanges/:id/approve              {note?, version?} → the linked exchange order, its stock
//                                                               held, the pick-up opened (returns.decide)
//   POST  /api/admin/returns/exchanges/:id/refuse               {note, version?} (returns.decide)
//   GET   /api/admin/returns/orders/:orderId/choices?orderItemId=&reason=&sizeKey=&quantity=
//                                                               the window, the limits and the pieces the first tier with
//                                                               stock offers, each with its money box (returns.view)
//   POST  /api/admin/returns/orders/:orderId/exchange           {reason, reasonNote?, rootCause?, photoAssetIds?, items:
//                                                               [{orderItemId, quantity?, newVariantId, receivedSku?}]}
//                                                               (returns.decide)
//   POST  /api/admin/returns/exchanges/:id/complete             {note?, version?} — after the old piece is checked (PR 187)
//   GET   /api/admin/returns/exchanges/:id/sizes                the other sizes of each piece going out (same product and
//                                                               colour), with stock and price now (PR 188, returns.view)
//   POST  /api/admin/returns/exchanges/:id/switch               {exchangeItemId, newVariantId, version?} — another size at
//                                                               the same price, stock-checked (PR 188, returns.decide)
//   GET   /api/admin/returns/orders/:orderId/return-choices      a return after receipt: the policy (no returns after
//                                                               receipt by default), the window, the lines (PR 189)
//   POST  /api/admin/returns/orders/:orderId/return             {reason, note?, items: [{orderItemId, quantity?}]} with an
//                                                               Idempotency-Key (PR 189, returns.decide)
//   POST  /api/admin/returns/parcels/:id/close                  {note?, version?} — checked, or with a note (PR 189,
//                                                               returns.decide)
//   POST  /api/admin/returns/exchanges/:id/waive                {reason, version?} — the charge off, the reason logged
//                                                               (PR 190, returns.waive)
//   POST  /api/admin/returns/exchanges/:id/claim                {note, photoAssetIds?, version?} — his "your mistake"
//                                                               claim recorded (PR 190, returns.decide)
//   POST  /api/admin/returns/exchanges/:id/claim-decision       {accept, note?, version?} (PR 190, returns.claims.decide)
//   GET   /api/admin/returns/parcels?status=&order=             the returned parcels, newest first (returns.view or .qc)
//   GET   /api/admin/returns/parcels/:id                        one parcel with its pieces and their ERP answer
//   POST  /api/admin/returns/parcels/:id/receive                {note?, version?} — at the shop (returns.qc)
//   POST  /api/admin/returns/parcels/:id/qc                     {items: [{returnItemId, scannedSku, disposition,
//                                                               lossReason?, photoAssetIds?, note?, otherSku?}], note?,
//                                                               version?} — every piece in one save (returns.qc)
//   GET   /api/admin/returns/parcels?kind=                      only these kinds (the refused parcels, PR 191)
//   GET   /api/admin/returns/refused?state=                     the refused-parcel list a person decides, the newest
//                                                               refusal first (PR 191, returns.view)
//   POST  /api/admin/returns/refused/:id/decide                 {state: LISTED | DISMISSED | REMOVED, note?, version?} —
//                                                               a person decides one number; taking it off needs a note
//                                                               (PR 191, returns.decide). Nothing blocks an order.
import * as od from '@extas/orders';
import { body, fail, isUuid, type AdminDeps } from './admin-auth';
import { handle } from './orders-api';

const notAllowed = () => Promise.resolve(fail(405, 'method-not-allowed'));
const notFound = () => Promise.resolve(fail(404, 'not-found'));

/** The body without `version`, and the version as a decision option. */
async function decision(request: Request): Promise<{ input: Record<string, unknown>; version: number | undefined }> {
  const { version, ...input } = await body(request);
  if (version !== undefined && !(typeof version === 'number' && Number.isInteger(version) && version >= 0)) throw new od.OrdersError('INVALID_INPUT', 'the version is not valid', ['version']);
  return { input, version: version as number | undefined };
}

const list = (url: URL, key: string) => url.searchParams.getAll(key).flatMap((v) => v.split(',')).filter(Boolean);

/** Every returns admin route: `path` is what comes after /api/admin/returns. */
export async function returnsRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  const [a, b, c] = path;
  if (!a) {
    if (m !== 'GET') return notAllowed();
    return handle(request, deps, 'returns.view', async (x) => {
      const status = list(x.url, 'status');
      return { exchanges: await od.listExchanges(x.deps, x.who, status.length ? { status } : {}) };
    });
  }
  if (a === 'exchanges') {
    if (!b || !isUuid(b)) return Promise.resolve(fail(404, 'NOT_FOUND', ['exchangeId']));
    if (!c) {
      if (path.length > 2) return notFound();
      if (m !== 'GET') return notAllowed();
      return handle(request, deps, 'returns.view', async (x) => ({ exchange: await od.exchangeDetail(x.deps, x.who, b) }));
    }
    if (path.length > 3) return notFound();
    if (c === 'sizes') {
      if (m !== 'GET') return notAllowed();
      return handle(request, deps, 'returns.view', async (x) => ({ sizes: await od.exchangeSizes(x.deps, x.who, b) }));
    }
    if (m !== 'POST') return notAllowed();
    switch (c) {
      case 'switch':
        return handle(request, deps, 'returns.decide', async (x) => {
          const d = await decision(request);
          return { result: await od.switchExchangeVariant(x.deps, x.who, b, d.input, { version: d.version }) };
        });
      case 'waive':
        return handle(request, deps, 'returns.waive', async (x) => {
          const d = await decision(request);
          return { result: await od.waiveExchangeCharge(x.deps, x.who, b, d.input, { version: d.version }) };
        });
      case 'claim':
        return handle(request, deps, 'returns.decide', async (x) => {
          const d = await decision(request);
          return { result: await od.recordExchangeClaim(x.deps, x.who, b, d.input, { version: d.version }) };
        });
      case 'claim-decision':
        return handle(request, deps, 'returns.claims.decide', async (x) => {
          const d = await decision(request);
          return { result: await od.decideExchangeClaim(x.deps, x.who, b, d.input, { version: d.version }) };
        });
      case 'approve':
        return handle(request, deps, 'returns.decide', async (x) => {
          const d = await decision(request);
          return { result: await od.approveExchange(x.deps, x.who, b, d.input, { version: d.version }) };
        });
      case 'refuse':
        return handle(request, deps, 'returns.decide', async (x) => {
          const d = await decision(request);
          return { result: await od.refuseExchange(x.deps, x.who, b, d.input, { version: d.version }) };
        });
      case 'complete':
        return handle(request, deps, 'returns.decide', async (x) => {
          const d = await decision(request);
          return { result: await od.completeExchange(x.deps, x.who, b, d.input, { version: d.version }) };
        });
      default:
        return notFound();
    }
  }
  if (a === 'parcels') {
    if (!b) {
      if (m !== 'GET') return notAllowed();
      // The list is read by both roles; the order service checks returns.view or returns.qc again.
      return handle(request, deps, null, async (x) => {
        const status = list(x.url, 'status');
        const kind = list(x.url, 'kind');
        const order = x.url.searchParams.get('order')?.trim();
        return { parcels: await od.listReturns(x.deps, x.who, { ...(status.length ? { status } : {}), ...(kind.length ? { kind } : {}), ...(order ? { orderNumber: order } : {}) }) };
      });
    }
    if (!isUuid(b)) return Promise.resolve(fail(404, 'NOT_FOUND', ['returnId']));
    if (!c) {
      if (path.length > 2) return notFound();
      if (m !== 'GET') return notAllowed();
      return handle(request, deps, null, async (x) => ({ parcel: await od.returnDetail(x.deps, x.who, b) }));
    }
    if (path.length > 3) return notFound();
    if (m !== 'POST') return notAllowed();
    switch (c) {
      case 'receive':
        return handle(request, deps, 'returns.qc', async (x) => {
          const d = await decision(request);
          return { result: await od.receiveReturn(x.deps, x.who, b, d.input, { version: d.version }) };
        });
      case 'qc':
        return handle(request, deps, 'returns.qc', async (x) => {
          const d = await decision(request);
          return { result: await od.qcReturn(x.deps, x.who, b, d.input, { version: d.version }) };
        });
      case 'close':
        return handle(request, deps, 'returns.decide', async (x) => {
          const d = await decision(request);
          return { result: await od.closeReturn(x.deps, x.who, b, d.input, { version: d.version }) };
        });
      default:
        return notFound();
    }
  }
  if (a === 'refused') {
    if (!b) {
      if (m !== 'GET') return notAllowed();
      return handle(request, deps, 'returns.view', async (x) => {
        const state = list(x.url, 'state');
        return { entries: await od.listRefusedEntries(x.deps, x.who, state.length ? { state } : {}) };
      });
    }
    if (!isUuid(b)) return Promise.resolve(fail(404, 'NOT_FOUND', ['id']));
    if (path.length !== 3 || c !== 'decide') return notFound();
    if (m !== 'POST') return notAllowed();
    return handle(request, deps, 'returns.decide', async (x) => {
      const d = await decision(request);
      return { result: await od.decideRefusedEntry(x.deps, x.who, b, d.input, { version: d.version }) };
    });
  }
  if (a === 'orders') {
    if (!b || !isUuid(b)) return Promise.resolve(fail(404, 'NOT_FOUND', ['orderId']));
    if (path.length !== 3) return notFound();
    if (c === 'choices') {
      if (m !== 'GET') return notAllowed();
      return handle(request, deps, 'returns.view', async (x) => {
        const q = x.url.searchParams;
        const quantity = q.get('quantity');
        return {
          choices: await od.exchangeChoices(x.deps, x.who, b, {
            orderItemId: q.get('orderItemId') ?? '',
            reason: q.get('reason') ?? '',
            ...(q.get('sizeKey') ? { sizeKey: q.get('sizeKey') } : {}),
            ...(quantity ? { quantity: Number(quantity) } : {}),
          }),
        };
      });
    }
    if (c === 'exchange') {
      if (m !== 'POST') return notAllowed();
      return handle(request, deps, 'returns.decide', async (x) => ({ exchange: await od.openExchange(x.deps, x.who, b, await body(request), x.opts) }), 201);
    }
    if (c === 'return-choices') {
      if (m !== 'GET') return notAllowed();
      return handle(request, deps, 'returns.view', async (x) => ({ choices: await od.returnChoices(x.deps, x.who, b) }));
    }
    if (c === 'return') {
      if (m !== 'POST') return notAllowed();
      return handle(request, deps, 'returns.decide', async (x) => ({ result: await od.openReturn(x.deps, x.who, b, await body(request), x.opts) }), 201);
    }
    return notFound();
  }
  return notFound();
}

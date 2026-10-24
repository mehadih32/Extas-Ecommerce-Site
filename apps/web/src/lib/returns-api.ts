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
    if (m !== 'POST') return notAllowed();
    switch (c) {
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
      default:
        return notFound();
    }
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
    return notFound();
  }
  return notFound();
}

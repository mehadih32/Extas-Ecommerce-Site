// CN-028 · PR 612–614 (CN-029 Phase 1) — the returns and exchanges admin API on ERP contract v6, under
// /api/admin/returns (lib/returns-api.ts hands `handback/*` and `erp/*` here). Every route signs the person in, checks
// the permission in the store it touches (`?storeId=`, default the mother store) and calls @extas/orders, which checks
// it again, writes the timeline and the audit log, and talks only to the store's own ERP with the store's own key.
// Answers are `{ ok: true, … }` or `{ ok: false, error: CODE, details, data }`. Nothing here moves money, refunds
// anything, or changes a price, a discount or COD.
//
// PR 612 · the hand-back desk:
//   GET   /api/admin/returns/handback                                the desk: open lists, the last ones sent, couriers
//   POST  /api/admin/returns/handback/lists                          {courier, handedBackAt} → a new open list
//   GET   /api/admin/returns/handback/lists/:id                      one list with its parcels and the ERP's answer
//   POST  /api/admin/returns/handback/lists/:id/scan                 {code, receivedCount, note?, photoAssetId?, unexpected?}
//   POST  /api/admin/returns/handback/lists/:id/parcels/:pid/fix     {receivedCount?, note?, photoAssetId?} (list open)
//   POST  /api/admin/returns/handback/lists/:id/close                close and send it to the ERP now
//   POST  /api/admin/returns/handback/lists/:id/send                 send a waiting list again now
//   POST  /api/admin/returns/handback/lists/:id/resend               {parcelIds?} → the refused parcels on a new list
// All need `returns.handback` (reading: `returns.handback` or `returns.view`).
import * as od from '@extas/orders';
import { body, fail, isUuid, type AdminDeps } from './admin-auth';
import { handle } from './orders-api';

const notAllowed = () => Promise.resolve(fail(405, 'method-not-allowed'));
const notFound = () => Promise.resolve(fail(404, 'not-found'));

function found<T>(v: T | null, what: string): T {
  if (v === null) throw new od.OrdersError('NOT_FOUND', `no such ${what}`, [what]);
  return v;
}

/** The hand-back desk: `path` is what comes after /api/admin/returns/handback. */
async function handbackRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  const [a, id, c, pid, e] = path;
  if (!a) {
    if (m !== 'GET') return notAllowed();
    return handle(request, deps, null, async (x) => ({ desk: await od.handbackDesk(x.deps, x.who) }));
  }
  if (a !== 'lists') return notFound();
  if (!id) {
    if (m !== 'POST') return notAllowed();
    return handle(request, deps, 'returns.handback', async (x) => ({ list: await od.openHandbackList(x.deps, x.who, await body(request)) }), 201);
  }
  if (!isUuid(id)) return Promise.resolve(fail(404, 'NOT_FOUND', ['listId']));
  if (!c) {
    if (m !== 'GET') return notAllowed();
    return handle(request, deps, null, async (x) => ({ list: found(await od.handbackList(x.deps, x.who, id), 'listId') }));
  }
  if (m !== 'POST') return notAllowed();
  if (c === 'parcels') {
    if (!pid || !isUuid(pid) || e !== 'fix' || path.length !== 5) return notFound();
    return handle(request, deps, 'returns.handback', async (x) => ({ list: await od.fixHandbackParcel(x.deps, x.who, id, pid, await body(request)) }));
  }
  if (path.length !== 3) return notFound();
  switch (c) {
    case 'scan':
      return handle(request, deps, 'returns.handback', async (x) => ({ list: await od.scanHandbackParcel(x.deps, x.who, id, await body(request)) }));
    case 'close':
      return handle(request, deps, 'returns.handback', async (x) => ({ list: await od.closeHandbackList(x.deps, x.who, id) }));
    case 'send':
      return handle(request, deps, 'returns.handback', async (x) => ({ list: await od.sendHandbackList(x.deps, x.who, id) }));
    case 'resend':
      return handle(request, deps, 'returns.handback', async (x) => ({ list: await od.resendRefusedParcels(x.deps, x.who, id, await body(request)) }), 201);
    default:
      return notFound();
  }
}

/** `handback/*` (PR 612) and, from PR 613, `erp/*`: `path` starts with that word. */
export async function returnsErpRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const [a, ...rest] = path;
  if (a === 'handback') return handbackRoute(request, deps, rest);
  return notFound();
}

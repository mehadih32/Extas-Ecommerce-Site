// S05 · PR 138, 144, 145, 147, 153 — the order admin API (BACKEND-ARCHITECTURE §9.10). No admin pages yet: the order
// screens come with the admin UI; these routes are what they call. Every route signs the person in (guardAdmin), checks
// the permission in the store it touches (`?storeId=`, default the mother store), then calls @extas/orders, which
// checks the permission again and writes the timeline and the audit log in the same transaction. A command takes the
// screen's `version` in the body ([ver]: an older one is refused with STALE and the fresh version) and an
// `Idempotency-Key` header (§7.7: a repeat gets the first answer). Answers are `{ ok: true, … }` or
// `{ ok: false, error: CODE, details, data }`; a refusal of the machine carries the commands open now in `data.allowed`.
// One catch-all route (app/api/admin/orders/[[...path]]) hands every path to `ordersRoute`.
//
//   GET   /api/admin/orders?view=&status=&q=&cursor=&limit=    the list with the count of every view (orders.read)
//   GET   /api/admin/orders/reasons                           the cancel and hold reasons, the customer's, the flags
//   GET   /api/admin/orders/reviews?status=open|decided|all   the duplicate review queue (orders.risk.read)
//   POST  /api/admin/orders/reviews/:alertId                  {decision: approve|decline|hold|ask|merge, note?, holdReasonKey?, mergeWith?}
//   POST  /api/admin/orders/merge                             {orderIds: [a, b], note?} one parcel (orders.merge)
//   GET   /api/admin/orders/:id                               one order: lines, money, shipment, payments, refund
//                                                             requests, reviews, notes, timeline, the commands open now
//   POST  /api/admin/orders/:id/confirm                       {version?} (orders.confirm)
//   POST  /api/admin/orders/:id/hold                          {reasonKey, note?, version?} (orders.hold)
//   POST  /api/admin/orders/:id/release                       {note?, version?} (orders.hold)
//   POST  /api/admin/orders/:id/cancel                        {reasonCode, note?, version?} before booking (orders.cancel)
//   POST  /api/admin/orders/:id/cancel-request/approve        {note?} the customer's request (orders.cancelRequests)
//   POST  /api/admin/orders/:id/cancel-request/refuse         {note?}
//   POST  /api/admin/orders/:id/cancel-after-booking          {reasonCode?, note?, version?} (orders.cancelAfterBooking)
//   POST  /api/admin/orders/:id/courier-cancel                {answer: confirmed|refused, courierPerson?, courierRef?, note?}
//   GET   /api/admin/orders/:id/notes?archived=1              the notes (orders.read)
//   POST  /api/admin/orders/:id/notes                         {body, isInternal?} (orders.notes)
//   POST  /api/admin/orders/:id/notes/:noteId/archive         (orders.notes)
//   POST  /api/admin/orders/:id/flags                         {flags, version?} (orders.notes)
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as od from '@extas/orders';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from './admin-auth';
import { inventoryDeps } from './inventory-api';

interface Ctx {
  deps: od.OrdersDeps;
  who: od.Who;
  url: URL;
  opts: od.CommandOptions;
}

function storeIdOf(url: URL): number | null {
  const raw = url.searchParams.get('storeId');
  const n = raw === null ? MOTHER_STORE_ID : Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/** The order service's dependencies for one request (the inventory's, with the ERP connection, for the D6 push). */
export async function ordersDeps(deps: AdminDeps): Promise<od.OrdersDeps> {
  return { db: deps.db, settings: deps.resolver, now: deps.now, inventory: await inventoryDeps(deps) };
}

/** A refusal of the order service with what the screen needs (`data`: the commands open now, the fresh version). */
function ordersFail(e: unknown): Response {
  if (od.isOrdersError(e)) return json({ ok: false, error: e.code, ...(e.details.length ? { details: e.details } : {}), ...(e.data ? { data: e.data } : {}) }, { status: e.status });
  return errorResponse(e);
}

async function handle(request: Request, deps: AdminDeps | null, permission: od.OrdersPermission, fn: (c: Ctx) => Promise<Record<string, unknown>>, status = 200): Promise<Response> {
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission, storeId });
  if (g instanceof Response) return g;
  try {
    const key = request.headers.get('idempotency-key')?.trim() || undefined;
    const out = await fn({ deps: await ordersDeps(deps!), who: { actor: g.actor, storeId, ctx: g.ctx }, url, opts: { idempotencyKey: key } });
    return json({ ok: true, ...out }, { status });
  } catch (e) {
    return ordersFail(e);
  }
}

const notAllowed = () => Promise.resolve(fail(405, 'method-not-allowed'));
const notFound = () => Promise.resolve(fail(404, 'not-found'));

/** The body without `version`, and the version as a command option. */
async function command(request: Request, opts: od.CommandOptions): Promise<{ input: Record<string, unknown>; opts: od.CommandOptions }> {
  const { version, ...input } = await body(request);
  if (version !== undefined && !(typeof version === 'number' && Number.isInteger(version) && version >= 0)) throw new od.OrdersError('INVALID_INPUT', 'the version is not valid', ['version']);
  return { input, opts: { ...opts, version: version as number | undefined } };
}

const query = (url: URL, keys: string[]) => Object.fromEntries(keys.flatMap((k) => (url.searchParams.has(k) ? [[k, url.searchParams.get(k)!]] : [])));

/** Every order admin route: `path` is what comes after /api/admin/orders. */
export async function ordersRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  const [a, b, c, e] = path;
  if (!a) {
    if (m !== 'GET') return notAllowed();
    return handle(request, deps, 'orders.read', async (x) => ({ ...(await od.listOrders(x.deps, x.who, query(x.url, ['view', 'status', 'q', 'cursor', 'limit']))) }));
  }
  if (a === 'reasons') {
    if (path.length > 1) return notFound();
    if (m !== 'GET') return notAllowed();
    return handle(request, deps, 'orders.read', async (x) => ({ reasons: await od.reasonLists(x.deps, x.who.storeId) }));
  }
  if (a === 'reviews') {
    if (!b) {
      if (m !== 'GET') return notAllowed();
      return handle(request, deps, 'orders.risk.read', async (x) => ({ ...(await od.reviewQueue(x.deps, x.who, query(x.url, ['status', 'cursor', 'limit']))) }));
    }
    if (path.length > 2) return notFound();
    if (!isUuid(b)) return Promise.resolve(fail(404, 'NOT_FOUND', ['alertId']));
    if (m !== 'POST') return notAllowed();
    return handle(request, deps, 'orders.risk.decide', async (x) => ({ result: await od.decideReview(x.deps, x.who, b, await body(request)) }));
  }
  if (a === 'merge') {
    if (path.length > 1) return notFound();
    if (m !== 'POST') return notAllowed();
    return handle(request, deps, 'orders.merge', async (x) => ({ result: await od.mergeOrders(x.deps, x.who, await body(request)) }));
  }
  if (!isUuid(a)) return Promise.resolve(fail(404, 'NOT_FOUND', ['orderId']));
  const id = a;
  if (!b) {
    if (m !== 'GET') return notAllowed();
    return handle(request, deps, 'orders.read', async (x) => ({ ...(await od.getOrder(x.deps, x.who, id)) }));
  }
  if (b === 'notes') {
    if (!c) {
      if (m === 'GET') return handle(request, deps, 'orders.read', async (x) => ({ notes: await od.listNotes(x.deps, x.who, id, { archived: x.url.searchParams.get('archived') === '1' }) }));
      if (m === 'POST') return handle(request, deps, 'orders.notes', async (x) => ({ note: await od.addNote(x.deps, x.who, id, await body(request)) }), 201);
      return notAllowed();
    }
    if (e !== 'archive' || path.length > 4) return notFound();
    if (!isUuid(c)) return Promise.resolve(fail(404, 'NOT_FOUND', ['noteId']));
    if (m !== 'POST') return notAllowed();
    return handle(request, deps, 'orders.notes', async (x) => ({ note: await od.archiveNote(x.deps, x.who, id, c) }));
  }
  if (m !== 'POST') return notAllowed();
  const run = (perm: od.OrdersPermission, fn: (x: Ctx, input: Record<string, unknown>, opts: od.CommandOptions) => Promise<od.CommandResult>) =>
    handle(request, deps, perm, async (x) => {
      const cmd = await command(request, x.opts);
      return { result: await fn(x, cmd.input, cmd.opts) };
    });
  const one = path.length === 2;
  switch (b) {
    case 'confirm':
      return one ? run('orders.confirm', (x, _i, o) => od.confirmOrder(x.deps, x.who, id, o)) : notFound();
    case 'hold':
      return one ? run('orders.hold', (x, i, o) => od.holdOrder(x.deps, x.who, id, i, o)) : notFound();
    case 'release':
      return one ? run('orders.hold', (x, i, o) => od.releaseOrder(x.deps, x.who, id, i, o)) : notFound();
    case 'cancel':
      return one ? run('orders.cancel', (x, i, o) => od.cancelOrder(x.deps, x.who, id, i, o)) : notFound();
    case 'cancel-request':
      if (path.length !== 3) return notFound();
      if (c === 'approve') return run('orders.cancelRequests', (x, i, o) => od.approveCancelRequest(x.deps, x.who, id, i, o));
      if (c === 'refuse') return run('orders.cancelRequests', (x, i, o) => od.refuseCancelRequest(x.deps, x.who, id, i, o));
      return notFound();
    case 'cancel-after-booking':
      return one ? run('orders.cancelAfterBooking', (x, i, o) => od.cancelAfterBooking(x.deps, x.who, id, i, o)) : notFound();
    case 'courier-cancel':
      return one
        ? run('orders.cancelAfterBooking', (x, i, o) => {
            const { answer, ...rest } = i;
            if (answer !== 'confirmed' && answer !== 'refused') throw new od.OrdersError('INVALID_INPUT', 'the answer is confirmed or refused', ['answer']);
            return od.recordCourierCancel(x.deps, x.who, id, answer, rest, o);
          })
        : notFound();
    case 'flags':
      return one ? run('orders.notes', (x, i, o) => od.setFlags(x.deps, x.who, id, i, o)) : notFound();
    default:
      return notFound();
  }
}

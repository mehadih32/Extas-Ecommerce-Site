// S05 · PR 138, 144, 145, 147, 151, 153 — the order admin API (BACKEND-ARCHITECTURE §9.10). No admin pages yet: the order
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
//   GET   /api/admin/orders/reviews/:alertId                  PR 521: the alert summary — why it fired, the matched orders,
//                                                             what the riders wrote, the customer's history and the
//                                                             decisions open to this person, proposed first (orders.risk.read)
//   POST  /api/admin/orders/reviews/:alertId                  {decision: approve|decline|hold|ask|merge, note?, holdReasonKey?, mergeWith?}
//   POST  /api/admin/orders/merge                             {orderIds: [a, b], note?} one parcel (orders.merge)
//   GET   /api/admin/orders/calls?reason=&status=open|closed|all&cursor=&limit=
//                                                             PR 563: the call queue (address unclear, address check …)
//   GET   /api/admin/orders/export?view=&status=&q=&payment=&source=
//   POST  /api/admin/orders/export                            {view?, status?, q?, payment?, source?, ids?} PR 151: the
//                                                             list's orders (or the ticked ones) as a CSV file
//                                                             (orders.export; personal columns with orders.exportPersonal)
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
//   POST  /api/admin/orders/:id/lines                         {variantId, quantity?, version?} PR 127: a line added
//                                                             before booking, priced as its product page (orders.lines)
//   POST  /api/admin/orders/:id/lines/:lineId/remove          {version?} an added line taken out again (orders.lines)
//   POST  /api/admin/orders/:id/edit                          PR 142: {reasonKey, channel?, note?, customerName?, phone?,
//                                                             address?, deliveryNote?, lines?: [{lineId, variantId} |
//                                                             {lineId, remove: true}], version?} (orders.edit); the dialog
//                                                             may send each line as `line:<lineId>`: keep | remove | <variantId>
//   POST  /api/admin/orders/:id/two-size                      PR 146: {key, keep: all | <sizeId>, note?, version?} the
//                                                             customer's two-size answer; "only M" takes the other sizes out (orders.edit)
//   GET   /api/admin/orders/:id/phone-history                 PR 157: the number's other orders and what became of them
//                                                             (refused, our fault and not counted, cancelled …) (orders.read)
//   GET   /api/admin/orders/:id/identity                      PR 519: the order's identity — the same person's other orders,
//                                                             how each is tied (phone, device, name and address), his other
//                                                             numbers and what those orders came to (orders.risk.read)
//   GET   /api/admin/orders/:id/risk                          PR 160: the risk panel — the stored score, every signal with
//                                                             its weight, earlier scores, rules changed since (orders.risk.read)
//   POST  /api/admin/orders/:id/risk/assess                   PR 160: "score again" — a new dated score with today's rules;
//                                                             the old one stays; nothing is blocked or held (orders.risk.decide)
//   POST  /api/admin/orders/:id/advance/request               PR 542: {kind: delivery | partial | full | codOff, channels:
//                                                             [SMS | WHATSAPP | CALL], note?, version?} "Request advance": the
//                                                             order waits for it, the pay link, its messages and a call task
//                                                             (orders.advance.request; nothing moves money or changes COD)
//   POST  /api/admin/orders/:id/advance/resend                PR 542: {channels, note?, version?} "Send again" (orders.advance.request)
//   GET   /api/admin/orders/:id/erp                           PR 610, 611 (ERP contract v6): the order at the ERP — its
//                                                             pieces, holds, bill and identification — and the Partial
//                                                             delivery box (orders.read; the box needs delivery.read);
//                                                             `erp: null` in v5
//   POST  /api/admin/orders/:id/erp/lines/:lineId             PR 610: {action: WAIT | REPLACE | CANCEL, sku?, grade?,
//                                                             reason?} a short line's decision, sent to the ERP (orders.lines)
//   POST  /api/admin/orders/:id/erp/partial-delivery          PR 611: {keptLineIds, paidMinor, discountGivenMinor,
//                                                             phoneConfirmed, note?} the Partial delivery box, sent as the
//                                                             delivery result's mark (delivery.outcomes); nothing moves money
import { MOTHER_STORE_ID } from '@extas/db/client';
import { decideErpLine, erpOrderView } from '@extas/inventory';
import * as od from '@extas/orders';
import { partialBoxView, savePartialDelivery } from '@extas/shipping';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from './admin-auth';
import { inventoryDeps } from './inventory-api';
import { shippingFail } from './shipping-api';

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

/** One admin request of the order service: the store, the session and the permission, then `fn`, its refusals as JSON (PR 544's risk routes too). */
/** `permission` null: signed in only — the order service itself checks which of several permissions is enough (PR 187). */
export async function handle(request: Request, deps: AdminDeps | null, permission: od.OrdersPermission | null, fn: (c: Ctx) => Promise<Record<string, unknown>>, status = 200): Promise<Response> {
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission: permission ?? undefined, storeId });
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

/** A read that found no order in this store is the order service's NOT_FOUND. */
function found<T>(v: T | null): T {
  if (v === null) throw new od.OrdersError('NOT_FOUND', 'no such order', ['orderId']);
  return v;
}

/** PR 151: the CSV file itself (not the `{ ok }` envelope): filters from the address (GET) or the body (POST, with ids). */
async function exportCsv(request: Request, deps: AdminDeps | null, m: string): Promise<Response> {
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission: 'orders.export', storeId });
  if (g instanceof Response) return g;
  try {
    const input = m === 'POST' ? await body(request) : query(url, ['view', 'status', 'q', 'payment', 'source']);
    const x = await od.exportOrders(await ordersDeps(deps!), { actor: g.actor, storeId, ctx: g.ctx }, input);
    return new Response(x.csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${x.fileName}"`,
        'cache-control': 'no-store',
        'x-rows': String(x.rows),
        'x-personal': x.personal ? '1' : '0',
      },
    });
  } catch (e) {
    return ordersFail(e);
  }
}
const notFound = () => Promise.resolve(fail(404, 'not-found'));

/** The body without `version`, and the version as a command option. */
async function command(request: Request, opts: od.CommandOptions): Promise<{ input: Record<string, unknown>; opts: od.CommandOptions }> {
  const { version, ...input } = await body(request);
  if (version !== undefined && !(typeof version === 'number' && Number.isInteger(version) && version >= 0)) throw new od.OrdersError('INVALID_INPUT', 'the version is not valid', ['version']);
  return { input, opts: { ...opts, version: version as number | undefined } };
}

const query = (url: URL, keys: string[]) => Object.fromEntries(keys.flatMap((k) => (url.searchParams.has(k) ? [[k, url.searchParams.get(k)!]] : [])));

/**
 * PR 142 — the edit dialog's flat form as the service's input: each `line:<lineId>` field is "keep" (nothing), "remove",
 * or the id of the size it changes to; every other field goes as it is (the service skips what did not change).
 */
export function editBody(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const lines: { lineId: string; variantId?: string; remove?: true }[] = Array.isArray(input.lines) ? (input.lines as never[]) : [];
  for (const [k, v] of Object.entries(input)) {
    if (k === 'lines') continue;
    if (!k.startsWith('line:')) {
      out[k] = v;
      continue;
    }
    const lineId = k.slice('line:'.length);
    if (v === 'remove') lines.push({ lineId, remove: true });
    else if (typeof v === 'string' && isUuid(v)) lines.push({ lineId, variantId: v });
    else if (v !== 'keep') throw new od.OrdersError('INVALID_INPUT', 'a line is kept, taken out or changed to a size', ['lines']);
  }
  if (lines.length) out.lines = lines;
  return out;
}

/**
 * PR 610, 611 — `/api/admin/orders/:id/erp[/…]` (ERP contract v6). The services check the permission again (the line
 * decision `orders.lines`, the box `delivery.outcomes`) and write the timeline and the audit row; their refusals
 * (inventory or courier codes) are answered as JSON. Nothing here calls the ERP: the documents are queued and the relay
 * sends them.
 */
async function erpRoute(request: Request, deps: AdminDeps | null, orderId: string, m: string, rest: string[]): Promise<Response> {
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const [c, lineId] = rest;
  const permission = !c ? 'orders.read' : c === 'lines' ? 'orders.lines' : c === 'partial-delivery' ? 'delivery.outcomes' : null;
  if (!permission || (c === 'lines' && (!lineId || rest.length !== 2)) || (c === 'partial-delivery' && rest.length !== 1)) return fail(404, 'not-found');
  if ((!c && m !== 'GET') || (c && m !== 'POST')) return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission, storeId });
  if (g instanceof Response) return g;
  const who = { actor: g.actor, storeId, ctx: g.ctx };
  const base = { db: deps!.db, settings: deps!.resolver, now: deps!.now };
  try {
    if (!c) {
      const erp = await erpOrderView(await inventoryDeps(deps!), who, orderId);
      const box = erp ? await partialBoxView(base, who, orderId).catch(() => null) : null;
      return json({ ok: true, erp, box });
    }
    const input = await body(request);
    if (c === 'lines') return json({ ok: true, result: await decideErpLine(await inventoryDeps(deps!), who, { ...input, orderId, lineId: decodeURIComponent(lineId!) } as never) });
    return json({ ok: true, result: await savePartialDelivery(base, who, { ...input, orderId } as never) });
  } catch (e) {
    return shippingFail(e);
  }
}

/** Every order admin route: `path` is what comes after /api/admin/orders. */
export async function ordersRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  const [a, b, c, e] = path;
  if (!a) {
    if (m !== 'GET') return notAllowed();
    return handle(request, deps, 'orders.read', async (x) => ({ ...(await od.listOrders(x.deps, x.who, query(x.url, ['view', 'status', 'q', 'payment', 'source', 'risk', 'section', 'sort', 'cursor', 'limit']))) }));
  }
  if (a === 'reasons') {
    if (path.length > 1) return notFound();
    if (m !== 'GET') return notAllowed();
    return handle(request, deps, 'orders.read', async (x) => ({ reasons: await od.reasonLists(x.deps, x.who.storeId) }));
  }
  if (a === 'reviews') {
    if (!b) {
      if (m !== 'GET') return notAllowed();
      return handle(request, deps, 'orders.risk.read', async (x) => ({ ...(await od.reviewQueue(x.deps, x.who, query(x.url, ['status', 'section', 'cursor', 'limit']))) }));
    }
    if (path.length > 2) return notFound();
    if (!isUuid(b)) return Promise.resolve(fail(404, 'NOT_FOUND', ['alertId']));
    if (m === 'GET') return handle(request, deps, 'orders.risk.read', async (x) => ({ summary: found(await od.alertSummary(x.deps, x.who, b)) }));
    if (m !== 'POST') return notAllowed();
    return handle(request, deps, 'orders.risk.decide', async (x) => ({ result: await od.decideReview(x.deps, x.who, b, await body(request)) }));
  }
  if (a === 'export') {
    if (path.length > 1) return notFound();
    if (m !== 'GET' && m !== 'POST') return notAllowed();
    return exportCsv(request, deps, m);
  }
  if (a === 'calls') {
    if (path.length > 1) return notFound();
    if (m !== 'GET') return notAllowed();
    return handle(request, deps, 'orders.read', async (x) => ({ ...(await od.callQueue(x.deps, x.who, query(x.url, ['reason', 'status', 'cursor', 'limit']))) }));
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
  // S06 · PR 157: the number's history beside the order
  if (b === 'phone-history') {
    if (path.length > 2) return notFound();
    if (m !== 'GET') return notAllowed();
    return handle(request, deps, 'orders.read', async (x) => ({ history: found(await od.orderPhoneHistory(x.deps, x.who, id)) }));
  }
  // S06 · PR 519: the order's identity — the same person's other orders (by phone, device, name and address) and numbers
  if (b === 'identity') {
    if (path.length > 2) return notFound();
    if (m !== 'GET') return notAllowed();
    return handle(request, deps, 'orders.risk.read', async (x) => ({ identity: found(await od.identityView(x.deps, x.who, id)) }));
  }
  // S06 · PR 160: the risk panel (why the score is what it is) and "score again"
  if (b === 'risk') {
    if (!c) {
      if (path.length > 2) return notFound();
      if (m !== 'GET') return notAllowed();
      return handle(request, deps, 'orders.risk.read', async (x) => ({ risk: found(await od.orderRisk(x.deps, x.who, id)) }));
    }
    if (c !== 'assess' || path.length > 3) return notFound();
    if (m !== 'POST') return notAllowed();
    return handle(request, deps, 'orders.risk.decide', async (x) => ({ result: await od.reassessOrder(x.deps, x.who, id) }));
  }
  // PR 610, 611 (ERP contract v6): the order at the ERP, a short line's decision, the Partial delivery box
  if (b === 'erp') return erpRoute(request, deps, id, m, path.slice(2));
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
    case 'edit':
      return one ? run('orders.edit', (x, i, o) => od.editOrder(x.deps, x.who, id, editBody(i), o)) : notFound();
    case 'delivery-area':
      // review R1 (M2): the team sets the band (its own charge) or the place of an order the checkout could not settle
      return one ? run('orders.edit', (x, i, o) => od.setDeliveryArea(x.deps, x.who, id, i, o)) : notFound();
    case 'two-size':
      return one ? run('orders.edit', (x, i, o) => od.answerTwoSize(x.deps, x.who, id, i, o)) : notFound();
    case 'advance': {
      // S06 · PR 542: "Request advance" and "Send again" (the answer carries the pay link's page)
      if (path.length !== 3 || (c !== 'request' && c !== 'resend')) return notFound();
      return handle(request, deps, 'orders.advance.request', async (x) => {
        const cmd = await command(request, x.opts);
        const r = c === 'request' ? await od.requestAdvance(x.deps, x.who, id, cmd.input, cmd.opts) : await od.resendAdvance(x.deps, x.who, id, cmd.input, cmd.opts);
        return { result: r.command, link: { path: od.payLinkPath(r.token), paymentId: r.paymentId, channels: r.channels, callTaskId: r.callTaskId } };
      });
    }
    case 'lines':
      if (one) return run('orders.lines', (x, i, o) => od.addLine(x.deps, x.who, id, i, o));
      if (path.length !== 4 || e !== 'remove') return notFound();
      if (!isUuid(c)) return Promise.resolve(fail(404, 'NOT_FOUND', ['lineId']));
      return run('orders.lines', (x, _i, o) => od.removeLine(x.deps, x.who, id, c, o));
    default:
      return notFound();
  }
}

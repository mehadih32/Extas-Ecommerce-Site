// CN-028 · PR 615, 616 — the Money → Books admin API. Every route signs the person in (guardAdmin), checks the permission
// in the store it touches (`?storeId=`, default the mother store), then calls @extas/inventory, which checks the
// permission again, reads only that store's own ERP link and writes the audit log in the same transaction as a change.
// Answers are `{ ok: true, … }` or `{ ok: false, error: CODE, details }`. One catch-all route
// (app/api/admin/books/[[...path]]) hands every path to `booksRoute`. Nothing here moves money: a payment to the ERP is
// only written down.
//
//   GET   /api/admin/books/account                     PR 615: the account at a glance (erp.account.read)
//   GET   /api/admin/books/entries?page=&kind=&from=&to=&q=   the ledger, newest first, a page at a time (erp.account.read)
//   GET   /api/admin/books/payments                    the "paid to ERP" records and their match (erp.account.read)
//   GET   /api/admin/books/pipeline?page=&state=&q=    the pieces in the pipeline (erp.account.read)
//   POST  /api/admin/books/payments                    {paidOn, amountMinor, method?, reference?, note?} (erp.payments.record)
//   POST  /api/admin/books/payments/:id/reverse        {reason} a reversing record, never an edit (erp.payments.record)
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as inv from '@extas/inventory';
import type { PermissionKey } from '@extas/auth';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from './admin-auth';
import { inventoryDeps } from './inventory-api';

export interface BooksCtx {
  deps: inv.InventoryDeps;
  who: inv.Who;
  url: URL;
  request: Request;
}

function storeIdOf(url: URL): number | null {
  const raw = url.searchParams.get('storeId');
  const n = raw === null ? MOTHER_STORE_ID : Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

export async function booksHandle(request: Request, deps: AdminDeps | null, permission: PermissionKey, fn: (c: BooksCtx) => Promise<Record<string, unknown>>, status = 200): Promise<Response> {
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission, storeId });
  if (g instanceof Response) return g;
  try {
    return json({ ok: true, ...(await fn({ deps: await inventoryDeps(deps!), who: { actor: g.actor, storeId, ctx: g.ctx }, url, request })) }, { status });
  } catch (e) {
    return errorResponse(e);
  }
}

const params = (url: URL, keys: readonly string[]) => Object.fromEntries(keys.filter((k) => url.searchParams.has(k)).map((k) => [k, url.searchParams.get(k) ?? '']));
const notAllowed = () => Promise.resolve(fail(405, 'method-not-allowed'));
const notFound = () => Promise.resolve(fail(404, 'not-found'));

/** Every books admin route: `path` is what comes after /api/admin/books. */
export async function booksRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  const [a, b, c] = path;
  if (a === 'account' && !b) return m === 'GET' ? booksHandle(request, deps, 'erp.account.read', async (x) => ({ account: await inv.accountOverview(x.deps, x.who) })) : notAllowed();
  if (a === 'entries' && !b) return m === 'GET' ? booksHandle(request, deps, 'erp.account.read', async (x) => inv.accountEntries(x.deps, x.who, params(x.url, ['page', 'kind', 'from', 'to', 'q'])) as unknown as Promise<Record<string, unknown>>) : notAllowed();
  if (a === 'pipeline' && !b) return m === 'GET' ? booksHandle(request, deps, 'erp.account.read', async (x) => inv.pipelinePieces(x.deps, x.who, params(x.url, ['page', 'state', 'q'])) as unknown as Promise<Record<string, unknown>>) : notAllowed();
  if (a === 'payments' && !b) {
    if (m === 'GET') return booksHandle(request, deps, 'erp.account.read', async (x) => inv.accountPayments(x.deps, x.who) as unknown as Promise<Record<string, unknown>>);
    if (m === 'POST')
      return booksHandle(
        request,
        deps,
        'erp.payments.record',
        async (x) => {
          const r = await inv.recordErpPayment(x.deps, x.who, (await body(x.request)) as inv.ErpPaymentInput);
          return { record: { id: r.id } };
        },
        201,
      );
    return notAllowed();
  }
  if (a === 'payments' && b && c === 'reverse' && path.length === 3) {
    if (m !== 'POST') return notAllowed();
    if (!isUuid(b)) return fail(404, 'NOT_FOUND', ['recordId']);
    return booksHandle(
      request,
      deps,
      'erp.payments.record',
      async (x) => {
        const r = await inv.reverseErpPayment(x.deps, x.who, b, (await body(x.request)) as { reason: string });
        return { record: { id: r.id } };
      },
      201,
    );
  }
  return notFound();
}

// S20 · PR 407 — the invoices admin API (Orders › Packing & print › Invoices; Blueprint B2.1). Every route signs the
// person in (guardAdmin), checks the permission in the store it touches (`?storeId=`, default the mother store), then
// calls @extas/orders, which checks it again. JSON answers are `{ ok: true, … }` or `{ ok: false, error: CODE, details }`;
// a file answer is the file itself.
//
//   GET   /api/admin/invoices            ?view=all|revised|waiting&q= — the invoices of placed orders: numbers, versions,
//                                        totals; no customer's details (fulfilment.read)
//   POST  /api/admin/invoices/file       {orderIds: [...], layout: page|roll, format: pdf|jpg} — the invoices as one PDF
//                                        (each on its own pages, paper or roll) or one invoice as a JPG picture; each
//                                        order's invoice is issued first (orders.invoice)
//   GET   /api/admin/invoices/settings   the page's settings cards with their versions (fulfilment.read)
//   PUT   /api/admin/invoices/settings   {key, value, version} one card saved whole; a stale card is STALE
//                                        (orders.invoiceSettings)
//   GET   /api/admin/invoices/preview    ?design= PR 409: the latest issued invoice drawn in that design, as a picture
//                                        (never saved or sent; orders.invoice)
//   GET   /api/admin/invoices/words      PR 409: every word the invoice prints with the owner's own (fulfilment.read)
//   PUT   /api/admin/invoices/words      {words: {key: {en?, bn?}}, version} the owner's words saved (an empty one goes
//                                        back to the dictionary's; a stale list is STALE) (orders.invoiceSettings)
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as od from '@extas/orders';
import { z } from 'zod';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from './admin-auth';
import { INVOICE_DESIGNS } from '@extas/documents';
import { INVOICE_FORMATS, INVOICE_LAYOUTS, invoiceFile, invoicePreview } from './admin-invoices/print';
import { InvoiceWordsError, invoiceWords, saveInvoiceWords } from './admin-invoices/words';

function storeIdOf(url: URL): number | null {
  const raw = url.searchParams.get('storeId');
  const n = raw === null ? MOTHER_STORE_ID : Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

function invoicesFail(e: unknown): Response {
  if (od.isOrdersError(e)) return json({ ok: false, error: e.code, ...(e.details.length ? { details: e.details } : {}), ...(e.data ? { data: e.data } : {}) }, { status: e.status });
  return errorResponse(e);
}

const fileInput = z
  .object({
    orderIds: z.array(z.uuid()).min(1).max(500),
    layout: z.enum(INVOICE_LAYOUTS).default('page'),
    format: z.enum(INVOICE_FORMATS).default('pdf'),
  })
  .strict();

/** `path` is what comes after /api/admin/invoices. */
export async function invoicesRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const at = path.join('/');
  const permission =
    at === '' ? 'fulfilment.read' : at === 'file' || at === 'preview' ? 'orders.invoice' : at === 'settings' || at === 'words' ? (m === 'PUT' ? 'orders.invoiceSettings' : 'fulfilment.read') : null;
  if (permission === null) return fail(404, 'not-found');
  const allowed = at === 'file' ? ['POST'] : at === 'settings' || at === 'words' ? ['GET', 'PUT'] : ['GET'];
  if (!allowed.includes(m)) return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission, storeId });
  if (g instanceof Response) return g;
  const who: od.Who = { actor: g.actor, storeId, ctx: g.ctx };
  const d = deps!;
  try {
    if (at === '') {
      const q = url.searchParams;
      return json({ ok: true, ...(await od.invoiceList(d, who, { view: q.get('view') || undefined, q: q.get('q') || undefined })) });
    }
    if (at === 'settings') {
      const sd = { db: d.db, settings: d.resolver };
      if (m === 'GET') return json({ ok: true, cards: await od.invoiceSettings(sd, who) });
      return json({ ok: true, cards: await od.saveInvoiceSetting(sd, who, await body(request)) });
    }
    if (at === 'words') {
      const w = { actor: g.actor, ctx: g.ctx, storeId };
      return json({ ok: true, ...(m === 'GET' ? await invoiceWords(d, w) : await saveInvoiceWords(d, w, await body(request))) });
    }
    if (at === 'preview') {
      const design = INVOICE_DESIGNS.find((x) => x === url.searchParams.get('design'));
      if (!design) return fail(400, 'INVALID_INPUT', ['design']);
      const jpg = await invoicePreview(d, storeId, design);
      return new Response(new Uint8Array(jpg), { status: 200, headers: { 'content-type': 'image/jpeg', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
    }
    const input = fileInput.safeParse(await body(request));
    if (!input.success) return fail(400, 'INVALID_INPUT', input.error.issues.map((i) => i.path.join('.') || '(input)'));
    const file = await invoiceFile(d, storeId, input.data);
    return new Response(new Uint8Array(file.body), {
      status: 200,
      headers: { 'content-type': file.contentType, 'content-disposition': `inline; filename="${file.fileName}"`, 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
    });
  } catch (e) {
    if (e instanceof InvoiceWordsError) return json({ ok: false, error: e.code, ...(e.details.length ? { details: e.details } : {}) }, { status: e.status });
    return invoicesFail(e);
  }
}

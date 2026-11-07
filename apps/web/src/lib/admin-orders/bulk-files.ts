// Follow-up 222 (PR 152, 151; demo V12.3 a2List bulk bar) — the bulk bar's files for the ticked orders, each through the
// route that already makes it, with that route's own permission checked again there: Export (the orders as CSV,
// POST /api/admin/orders/export, `orders.export`) and Print invoices (one PDF, POST /api/admin/invoices/file,
// `orders.invoice`, which issues each invoice first). The page offers a button only to a person with its key.
import { INVOICE_PRINT_URL } from './model';

export type BulkFile = 'export' | 'invoices';

export const BULK_FILE_PERM: Readonly<Record<BulkFile, string>> = { export: 'orders.export', invoices: 'orders.invoice' };

/** The files this person may make from the bulk bar, in the bar's order. */
export const bulkFilesFor = (perms: { has(k: string): boolean }): BulkFile[] => (['export', 'invoices'] as const).filter((f) => perms.has(BULK_FILE_PERM[f]));

/** The request for a file of these orders (at most 500, the invoice route's own limit). */
export function bulkFileRequest(file: BulkFile, ids: readonly string[], today: string): { url: string; body: Record<string, unknown>; fileName: string; type: 'csv' | 'pdf' } {
  const orderIds = ids.slice(0, 500);
  return file === 'export'
    ? { url: '/api/admin/orders/export', body: { ids: orderIds }, fileName: `orders-${today}.csv`, type: 'csv' }
    : { url: INVOICE_PRINT_URL, body: { orderIds, layout: 'page', format: 'pdf' }, fileName: `invoices-${today}.pdf`, type: 'pdf' };
}

/** What the answer means for the person: the file, no right, or a failure. */
export function fileOutcome(status: number, contentType: string, type: 'csv' | 'pdf'): 'file' | 'forbidden' | 'failed' {
  if (status === 401 || status === 403) return 'forbidden';
  if (status !== 200) return 'failed';
  return contentType.includes(type === 'csv' ? 'text/csv' : 'application/pdf') ? 'file' : 'failed';
}

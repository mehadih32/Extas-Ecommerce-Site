// Follow-up 222 — the bulk bar's Export and Print invoices: each offered only with its own key, each through the route
// that already makes the file, and the answer read as the file, no right, or a failure.
import { describe, expect, it } from 'vitest';
import { bulkFileRequest, bulkFilesFor, fileOutcome } from './bulk-files';

describe('the bulk bar files (follow-up 222)', () => {
  it('offers each file only to a person with its key', () => {
    expect(bulkFilesFor(new Set(['orders.export', 'orders.invoice']))).toEqual(['export', 'invoices']);
    expect(bulkFilesFor(new Set(['orders.invoice']))).toEqual(['invoices']);
    expect(bulkFilesFor(new Set(['orders.read']))).toEqual([]);
  });

  it('asks the existing routes for the ticked orders', () => {
    expect(bulkFileRequest('export', ['a', 'b'], '2026-11-07')).toEqual({ url: '/api/admin/orders/export', body: { ids: ['a', 'b'] }, fileName: 'orders-2026-11-07.csv', type: 'csv' });
    expect(bulkFileRequest('invoices', ['a'], '2026-11-07')).toEqual({
      url: '/api/admin/invoices/file',
      body: { orderIds: ['a'], layout: 'page', format: 'pdf' },
      fileName: 'invoices-2026-11-07.pdf',
      type: 'pdf',
    });
    expect(
      (
        bulkFileRequest(
          'invoices',
          Array.from({ length: 600 }, (_, i) => String(i)),
          'd',
        ).body.orderIds as string[]
      ).length,
    ).toBe(500);
  });

  it('reads the answer', () => {
    expect(fileOutcome(200, 'text/csv; charset=utf-8', 'csv')).toBe('file');
    expect(fileOutcome(200, 'application/pdf', 'pdf')).toBe('file');
    expect(fileOutcome(200, 'application/json', 'pdf')).toBe('failed');
    expect(fileOutcome(403, 'application/json', 'csv')).toBe('forbidden');
    expect(fileOutcome(422, 'application/json', 'pdf')).toBe('failed');
  });
});

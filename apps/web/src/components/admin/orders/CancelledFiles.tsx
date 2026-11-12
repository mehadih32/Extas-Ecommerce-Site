'use client';
// PR 660 (CN-048) — the two buttons of the Cancelled summary: the orders of the view and days as a file for Excel (the order
// list's own export, `orders.export`, checked again by its route) and a print of the summary (the browser's "Save as PDF").
import { cancelledFileRequest } from '@/lib/admin-orders/cancelled';
import { fileOutcome } from '@/lib/admin-orders/bulk-files';
import { showToast } from '../lumen/Toast';

export function CancelledFiles({ from, to, canExport, labels }: { from?: string; to?: string; canExport: boolean; labels: { excel: string; pdf: string; failed: string; noRight: string } }) {
  const excel = async () => {
    const r = cancelledFileRequest(from, to, new Date().toISOString().slice(0, 10));
    try {
      const res = await fetch(r.url, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify(r.body) });
      const out = fileOutcome(res.status, res.headers.get('content-type') ?? '', 'csv');
      if (out !== 'file') {
        showToast({ text: out === 'forbidden' ? labels.noRight : labels.failed, tone: 'bad' });
        return;
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(await res.blob());
      a.download = r.fileName;
      a.click();
    } catch {
      showToast({ text: labels.failed, tone: 'bad' });
    }
  };
  return (
    <div className="a2-gap8" data-testid="cancelled-files">
      {canExport ? (
        <button type="button" className="a2-btn sm" onClick={excel} data-testid="cancelled-excel">
          {labels.excel}
        </button>
      ) : null}
      <button type="button" className="a2-btn sm" onClick={() => window.print()} data-testid="cancelled-pdf">
        {labels.pdf}
      </button>
    </div>
  );
}

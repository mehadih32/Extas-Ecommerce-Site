'use client';
// Follow-up 500 (PR 407) — "Print invoice" on the order page: the order's invoice on paper, on the roll or as the chat
// picture, from the same file route as Orders › Packing & print › Invoices (each press issues the invoice first; the
// API checks `orders.invoice` again). A small menu beside "Get invoice" (the customer's view); a refusal stays in the
// menu, in the page's own words, until it is closed. Nothing here changes an order, a price or money.
import { useEffect, useRef, useState } from 'react';
import { PdfButton } from '@/components/admin/fulfil/Print';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { INVOICE_PRINT_URL, invoicePrints } from '@/lib/admin-orders/model';
import type { Dict } from '@/lib/i18n';

export function InvoicePrintMenu({ dict, orderId, number, label, labels, busyLabel }: { dict: Dict; orderId: string; number: string; label: string; labels: Record<'page' | 'roll' | 'jpg', string>; busyLabel: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className="a2-more" ref={box} data-testid="order-invoice-print">
      <button type="button" className="a2-btn" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="order-invoice-print-open">
        <ShellIcon name="file" size={15} />
        {label}
        <ShellIcon name="cd" size={14} />
      </button>
      <div className="a2-morepop" hidden={!open}>
        <div className="a2-menu a2-menu-o oi-print">
          {invoicePrints(orderId, number).map((p) => (
            <PdfButton key={p.key} dict={dict} url={INVOICE_PRINT_URL} body={p.body} label={labels[p.key]} busyLabel={busyLabel} tone="ghost" testId={`order-invoice-print-${p.key}`} fileName={p.fileName} />
          ))}
        </div>
      </div>
    </div>
  );
}

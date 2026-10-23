// PR 136 — "Download invoice": the same invoice as one self-contained file (it opens anywhere and prints the same), for
// the same people as the invoice page. Not theirs, or switched off: back to the invoice page, which says why.
import { shopContext } from '@/lib/shop/context';
import { invoiceDocumentHtml, invoiceFileName } from '@/lib/shop/invoice';
import { loadInvoice } from '@/lib/shop/invoice-load';
import { hrefIn } from '@/lib/shop/lang';
import { ROUTES } from '@/lib/shop/routes';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ number: string }> }) {
  const number = decodeURIComponent((await params).number).slice(0, 40);
  const c = await shopContext();
  const inv = await loadInvoice(c, number);
  if (inv.kind !== 'ok' || !inv.download) return new Response(null, { status: 303, headers: { location: hrefIn(c.lang, ROUTES.invoice(number)), 'cache-control': 'no-store' } });
  return new Response(invoiceDocumentHtml(inv.view), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-disposition': `attachment; filename="${invoiceFileName(inv.view.invoiceNo)}"`,
      'cache-control': 'private, no-store',
      'x-robots-tag': 'noindex',
    },
  });
}

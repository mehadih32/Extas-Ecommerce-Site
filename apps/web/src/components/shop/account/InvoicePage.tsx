// PR 136 — the invoice of an order, at /account/orders/<number>/invoice (demo 52-thanks.js §53 inv_modalHTML, V12.2):
// the line that says which invoice it is, the sheet itself (lib/shop/invoice.ts, drawn from the order as stored), and
// the two ways to keep it pinned under it — "Download invoice" (one file) and "Print / Save as PDF" (the browser's own
// print, which on a phone gives "Save as PDF") — then the way back to the order. On a phone it reads like the demo's
// sheet, full width; printing leaves out the shop's header, footer and these buttons (account.css).
// R16 lesson: the sheet is drawn in the page itself, never inside a frame that a phone refuses to print.
import './account.css';
import type { Receipt } from '@extas/checkout';
import type { ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { invoiceCss, invoiceSheetHtml, type InvoiceView } from '@/lib/shop/invoice';
import { invoiceLead } from '@/lib/shop/invoice-view';
import { ROUTES } from '@/lib/shop/routes';
import { Icon } from '../Icon';
import { AccountCrumbs } from './AccountShell';
import { InvoiceActions } from './InvoiceActions';

export function InvoicePage({ c, r, v, download }: { c: ShopContext; r: Receipt; v: InvoiceView; download: boolean }) {
  const t = c.t;
  const orderHref = hrefIn(c.lang, ROUTES.order(r.number));
  return (
    <div className="container acc-page inv-page" data-testid="invoice-page" data-invoice={v.invoiceNo}>
      <div className="inv-chrome">
        <AccountCrumbs
          c={c}
          trail={[
            [t('account.title'), hrefIn(c.lang, ROUTES.account)],
            [t('account.order.crumb', { number: r.number }), orderHref],
            [t('account.invoice.crumb'), null],
          ]}
        />
        <p className="small text2 inv-lead">{invoiceLead(c, r, v.invoiceNo)}</p>
      </div>
      <style dangerouslySetInnerHTML={{ __html: invoiceCss('.inv-doc', '.inv-doc ') }} />
      <div className="inv-doc" id="inv-doc" role="document" aria-label={t('account.invoice.pageTitle', { invoice: v.invoiceNo })} data-testid="invoice-sheet" dangerouslySetInnerHTML={{ __html: invoiceSheetHtml(v) }} />
      <div className="inv-acts inv-chrome" data-testid="invoice-acts">
        <InvoiceActions
          downloadHref={download ? hrefIn(c.lang, ROUTES.invoiceFile(r.number)) : null}
          words={{ download: t('account.invoice.download'), print: t('account.invoice.print'), note: t('account.invoice.printNote') }}
        />
        <p className="xs muted inv-hint">{t('account.invoice.printHint')}</p>
      </div>
      <a className="btn btn-ghost acc-start inv-chrome" href={orderHref} data-testid="invoice-back">
        <Icon name="back" size={16} />
        {t('account.invoice.back')}
      </a>
    </div>
  );
}

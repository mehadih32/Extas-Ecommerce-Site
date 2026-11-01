// S20 · PR 407 — Orders → Packing & print → Invoices (docs/ADMIN-ARCHITECTURE.md §4.2 "invoice designs"; Blueprint
// B2.1): every placed order's invoice, issued by itself and kept — its number, its version (a new one only after the
// order was edited, "Revised n"), when it was issued and the order's stored total. Views: all, revised, waiting (no
// invoice yet); a search by order or invoice number. "Print n on paper" / "on the roll" makes one PDF of the invoices
// shown (up to the owner's "most per print"); each row prints its own on paper, on the roll, or as the chat picture,
// and opens the customer's view. Under the list: "Invoice content" (what every invoice says — the same setting the
// customer's page reads) and "Printing"; "More options" holds the chat picture and issuing (CN-018).
//
// The list shows no customer's name, phone or address (`fulfilment.read`); printing needs `orders.invoice` and
// changing the cards `orders.invoiceSettings`, both checked again by the API. Nothing here moves money or changes an
// order, a price or COD.
// S20 · PR 409 (ORD-04d): "Invoice design" — seven designs with a live preview of the latest invoice in each
// (`documents.invoice.design`), and "Every word on the invoice" — the owner's own English and Bengali for each word the
// invoice prints (kept in `language.labels`); both saved with `orders.invoiceSettings`.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as od from '@extas/orders';
import { INVOICE_BLOCKS, INVOICE_DPIS, INVOICE_IMAGE_FORMATS, INVOICE_PAPERS, INVOICE_ROLLS } from '@extas/settings';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PdfButton } from '@/components/admin/fulfil/Print';
import { InvoiceDesigns } from '@/components/admin/invoices/InvoiceDesigns';
import { InvoiceWords } from '@/components/admin/invoices/InvoiceWords';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { printedAt } from '@/lib/admin-fulfil/handover';
import { adminDeps } from '@/lib/admin-auth';
import { withInvoice } from '@/lib/admin-invoices/i18n';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { hasIssuedInvoice } from '@/lib/admin-invoices/print';
import { invoiceWords } from '@/lib/admin-invoices/words';
import { INVOICE_DESIGNS } from '@extas/documents';
import '../../../settings-cards.css';
import './invoices.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/orders/packing/invoices';
const API = '/api/admin/invoices/file';
const SETTINGS = '/api/admin/invoices/settings';

export async function generateMetadata(): Promise<Metadata> {
  const view = withInvoice(await adminView());
  return { title: `${t(view.dict, 'inv.title')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

type Search = { view?: string; q?: string };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('fulfilment.read', deps, MOTHER_STORE_ID)]);
  const view = withInvoice(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="packingInvoices" text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="fulfilment.read" />
      </div>
    );
  const who: od.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const sd = { db: access.deps.db, settings: access.deps.resolver };
  const current: od.InvoiceListView = (od.INVOICE_VIEWS as readonly string[]).includes(sp.view ?? '') ? (sp.view as od.InvoiceListView) : 'all';
  const q = (sp.q ?? '').trim().slice(0, 60);
  const [cards, currency, words, issued] = await Promise.all([
    od.invoiceSettings(sd, who),
    sd.settings.value('store.currency', { storeId: MOTHER_STORE_ID }),
    invoiceWords(access.deps, { actor: access.guard.actor, ctx: access.guard.ctx, storeId: MOTHER_STORE_ID }),
    hasIssuedInvoice(access.deps, MOTHER_STORE_ID),
  ]);
  // the list shows as many as one print takes (the owner's "most per print"); the rest wait for the next print
  const max = cards['documents.invoice.print'].value.maxPerPdf;
  const list = await od.invoiceList(sd, who, { view: current, q: q || undefined, limit: max });
  const held = access.guard.permissions;
  const canPrint = held?.has('orders.invoice') ?? false;
  const canEdit = held?.has('orders.invoiceSettings') ?? false;
  const n = (x: number) => formatNumber(x, view.locale);
  const money = moneyOf(currency, view.locale);
  const batch = list.rows;
  const later = Math.max(0, list.counts[current] - batch.length);
  const ids = batch.map((r) => r.orderId);
  // the print button's words, with this page's own refusal for "invoices are off"
  const ful = d.ful as Dict;
  const fd: Dict = { ful: { ...ful, err: { ...(ful.err as Dict), INVOICE_OFF: t(d, 'inv.err.INVOICE_OFF') } } };
  const link = (v: od.InvoiceListView) => `${HERE}?view=${v}${q ? `&q=${encodeURIComponent(q)}` : ''}`;

  // ---- the settings cards: words and fields from here, values from the API ----
  const s = (k: string, vars: Record<string, string> = {}) => t(d, `inv.set.${k}`, vars);
  const texts = (card: string): FieldsCardTexts => ({
    h: s(`${card}.h`),
    d: s(`${card}.d`),
    save: s('save'),
    saving: s('saving'),
    saved: s('saved'),
    discard: s('discard'),
    unsaved: s('unsaved'),
    readOnly: s('readOnly'),
    pairHelp: s('content.pairHelp'),
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'forbidden', 'unauthorized', 'network', 'other'].map((c) => [c, s(`err.${c}`)])),
  });
  const opts = (prefix: string, values: readonly (string | number)[]) => values.map((v) => ({ value: String(v), label: t(d, `${prefix}.${v}`) === `${prefix}.${v}` ? String(v) : t(d, `${prefix}.${v}`) }));
  const content: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: s('content.enabled'), help: s('content.enabledHelp') },
    { kind: 'text', path: 'number', label: s('content.number'), help: s('content.numberHelp'), max: 40 },
    { kind: 'checks', path: 'blocks', label: s('content.blocks'), options: INVOICE_BLOCKS.map((b) => ({ value: b, label: s(`content.block.${b}`) })) },
    { kind: 'pair', path: 'note', label: { en: s('content.noteEn'), bn: s('content.noteBn') }, help: s('content.noteHelp'), max: 400 },
    { kind: 'pair', path: 'footer', label: { en: s('content.footerEn'), bn: s('content.footerBn') }, help: s('content.footerHelp'), max: 300 },
    { kind: 'switch', path: 'download', label: s('content.download') },
  ];
  const print: FieldsCardField[] = [
    { kind: 'select', path: 'paper', label: s('print.paper'), options: opts('inv.set.print.papers', INVOICE_PAPERS) },
    { kind: 'select', path: 'roll', label: s('print.roll'), options: opts('inv.set.print.rolls', INVOICE_ROLLS) },
    { kind: 'select', path: 'dpi', label: s('print.dpi'), numeric: true, options: INVOICE_DPIS.map((x) => ({ value: String(x), label: n(x) })) },
    { kind: 'select', path: 'lang', label: s('print.lang'), options: opts('inv.set.print.langs', ['en', 'bn']) },
    { kind: 'switch', path: 'barcode', label: s('print.barcode') },
    { kind: 'switch', path: 'logo', label: s('print.logo') },
    { kind: 'number', path: 'maxPerPdf', label: s('print.maxPerPdf'), min: 1, max: 500 },
  ];
  const image: FieldsCardField[] = [
    { kind: 'select', path: 'format', label: s('image.format'), options: opts('inv.set.image.formats', INVOICE_IMAGE_FORMATS) },
    { kind: 'number', path: 'widthPx', label: s('image.widthPx'), min: 600, max: 2400 },
    { kind: 'number', path: 'quality', label: s('image.quality'), min: 50, max: 100 },
  ];
  const issue: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: s('issue.enabled') },
    { kind: 'number', path: 'everyMinutes', label: s('issue.everyMinutes'), min: 1, max: 1440 },
    { kind: 'number', path: 'perRun', label: s('issue.perRun'), min: 1, max: 5000 },
    { kind: 'number', path: 'lookbackDays', label: s('issue.lookbackDays'), min: 1, max: 3650 },
  ];
  const screen = <K extends od.InvoiceSettingKey>(k: K) => ({ key: k, value: cards[k].value as unknown as Record<string, unknown>, version: cards[k].version });

  return (
    <div className="a2-z" data-testid="invoices">
      <PageHead
        view={view}
        place={locateKey('packingInvoices')}
        title={t(d, 'inv.title')}
        sub={t(d, 'inv.sub')}
        right={
          canPrint ? (
            <span className="a2-gap8" style={{ flexWrap: 'wrap' }}>
              <PdfButton dict={fd} url={API} body={{ orderIds: ids, layout: 'page', format: 'pdf' }} label={t(d, 'inv.printPage', { n: n(ids.length) })} busyLabel={t(d, 'inv.printing')} tone="pri" size="" testId="invoices-print-page" disabled={!ids.length} fileName="invoices.pdf" />
              <PdfButton dict={fd} url={API} body={{ orderIds: ids, layout: 'roll', format: 'pdf' }} label={t(d, 'inv.printRoll', { n: n(ids.length) })} busyLabel={t(d, 'inv.printing')} tone="ghost" size="" testId="invoices-print-roll" disabled={!ids.length} fileName="invoices-roll.pdf" />
            </span>
          ) : null
        }
      />
      <SectionTabs view={view} current="packingInvoices" />
      <div className="a2-kpis a2-mt12" data-testid="invoice-counts">
        {od.INVOICE_VIEWS.map((k) => (
          <div key={k} className="a2-card a2-kpi">
            <div className="a2-kl">{t(d, `inv.counts.${k}`)}</div>
            <div className="a2-kv">{n(list.counts[k])}</div>
          </div>
        ))}
      </div>
      <div className="a2-between a2-mt12" style={{ flexWrap: 'wrap', gap: 8 }}>
        <nav className="a2-seg" aria-label={t(d, 'inv.views.label')}>
          {od.INVOICE_VIEWS.map((v) => (
            <Link key={v} className={v === current ? 'on' : undefined} href={link(v)} scroll={false} aria-current={v === current ? 'page' : undefined} data-testid={`invoices-view-${v}`}>
              {t(d, `inv.views.${v}`)} · {n(list.counts[v])}
            </Link>
          ))}
        </nav>
        <form method="get" action={HERE} className="a2-gap8" role="search" data-testid="invoices-search">
          <input type="hidden" name="view" value={current} />
          <input className="a2-inp" name="q" defaultValue={q} maxLength={60} placeholder={t(d, 'inv.search')} aria-label={t(d, 'inv.search')} />
          <button type="submit" className="a2-btn">
            {t(d, 'inv.searchGo')}
          </button>
          {q ? (
            <Link className="a2-btn ghost" href={`${HERE}?view=${current}`}>
              {t(d, 'inv.clear')}
            </Link>
          ) : null}
        </form>
      </div>
      {!canPrint ? <p className="a2-xs a2-mute a2-mt6">{t(d, 'inv.noPrint')}</p> : current === 'waiting' && list.rows.length ? <p className="a2-xs a2-mute a2-mt6">{t(d, 'inv.waitingNote')}</p> : null}
      {later > 0 ? <p className="a2-xs a2-mute a2-mt6">{t(d, 'inv.more', { n: n(later), max: n(max) })}</p> : null}
      {list.rows.length ? (
        <div className="a2-tblw a2-mt12" data-testid="invoice-list">
          <table className="a2-tbl">
            <thead>
              <tr>
                <th>{t(d, 'inv.col.order')}</th>
                <th>{t(d, 'inv.col.invoice')}</th>
                <th>{t(d, 'inv.col.version')}</th>
                <th>{t(d, 'inv.col.issued')}</th>
                <th className="r">{t(d, 'inv.col.total')}</th>
                <th className="w0" />
              </tr>
            </thead>
            <tbody>
              {list.rows.map((r) => (
                <tr key={r.orderId} data-testid="invoice-row" data-version={r.invoice?.version ?? 0}>
                  <td className="a2-tdh">
                    <b>
                      <Link className="a2-lnk" href={`/admin/orders/${r.orderId}`}>
                        {r.orderNumber}
                      </Link>
                    </b>
                  </td>
                  <td data-l={t(d, 'inv.col.invoice')}>
                    <span className="a2-mono">{r.invoice?.number ?? '—'}</span>
                  </td>
                  <td data-l={t(d, 'inv.col.version')}>
                    {!r.invoice ? (
                      <span className="a2-pill line">{t(d, 'inv.pill.waiting')}</span>
                    ) : r.invoice.version > 1 ? (
                      <span className="a2-pill warn" title={r.invoice.revisedAt ? t(d, 'inv.revisedOn', { date: printedAt(r.invoice.revisedAt.toISOString(), view.timeZone) }) : undefined}>
                        {t(d, 'inv.pill.revised', { n: n(r.invoice.version) })}
                      </span>
                    ) : (
                      <span className="a2-pill line">{t(d, 'inv.pill.first')}</span>
                    )}
                  </td>
                  <td data-l={t(d, 'inv.col.issued')}>{r.invoice ? printedAt(r.invoice.issuedAt.toISOString(), view.timeZone) : '—'}</td>
                  <td className="r" data-l={t(d, 'inv.col.total')}>
                    <b className="a2-num">{formatMoney(r.totalMinor, r.currency === money.currency ? money : moneyOf(r.currency, view.locale))}</b>
                  </td>
                  <td className="a2-tdw">
                    <span className="a2-cmds">
                      {canPrint ? (
                        <>
                          <PdfButton dict={fd} url={API} body={{ orderIds: [r.orderId], layout: 'page', format: 'pdf' }} label={t(d, 'inv.one.page')} busyLabel={t(d, 'inv.printing')} tone="ghost" testId="invoice-print-page" fileName={`invoice-${r.orderNumber}.pdf`} />
                          <PdfButton dict={fd} url={API} body={{ orderIds: [r.orderId], layout: 'roll', format: 'pdf' }} label={t(d, 'inv.one.roll')} busyLabel={t(d, 'inv.printing')} tone="ghost" testId="invoice-print-roll" fileName={`invoice-${r.orderNumber}-roll.pdf`} />
                          <PdfButton dict={fd} url={API} body={{ orderIds: [r.orderId], layout: 'page', format: 'jpg' }} label={t(d, 'inv.one.jpg')} busyLabel={t(d, 'inv.printing')} tone="ghost" testId="invoice-print-jpg" fileName={`invoice-${r.orderNumber}.jpg`} />
                          <Link className="a2-btn sm ghost" href={`/account/orders/${encodeURIComponent(r.orderNumber)}/invoice`} target="_blank" rel="noopener" data-testid="invoice-view">
                            {t(d, 'inv.one.view')}
                          </Link>
                        </>
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="a2-state a2-mt12" data-testid="invoices-empty">
          <div className="a2-sti">
            <ShellIcon name="print" size={26} />
          </div>
          <h3>{t(d, 'inv.empty')}</h3>
          <p>{t(d, 'inv.emptySub')}</p>
        </div>
      )}
      <InvoiceDesigns dict={{ inv: d.inv as Dict }} designs={INVOICE_DESIGNS} current={cards['documents.invoice.design'].value.design} version={cards['documents.invoice.design'].version} canEdit={canEdit} canPreview={held?.has('orders.invoice') ?? false} hasInvoice={issued} />
      <FieldsCard url={SETTINGS} screen={screen('account.invoice')} fields={content} texts={texts('content')} canEdit={canEdit} testId="invoice-content" />
      <InvoiceWords dict={{ inv: d.inv as Dict }} words={words.words} version={words.version} canEdit={canEdit} />
      <FieldsCard url={SETTINGS} screen={screen('documents.invoice.print')} fields={print} texts={texts('print')} canEdit={canEdit} testId="invoice-print" />
      <details className="a2-card a2-mt12" data-testid="invoice-more">
        <summary className="a2-h4">{s('more')}</summary>
        <p className="a2-xs a2-mute a2-mt6">{s('moreSub')}</p>
        <FieldsCard url={SETTINGS} screen={screen('documents.invoice.image')} fields={image} texts={texts('image')} canEdit={canEdit} testId="invoice-image" />
        <FieldsCard url={SETTINGS} screen={screen('documents.invoice.issue')} fields={issue} texts={texts('issue')} canEdit={canEdit} testId="invoice-issue" />
      </details>
    </div>
  );
}

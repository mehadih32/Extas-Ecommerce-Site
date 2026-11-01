// S08 · PR 179 — Orders → Packing & print → Print run (ORD-04a; Blueprint B1.4; demo V12.3 97s print run): every booked
// parcel still with us (the courier has not picked it up), in packing order — the category and style with the most
// pieces first — with its courier, the courier's consignment id, how many pieces, and whether its sticker was printed.
// "Print new stickers" makes one PDF of the ones not printed yet (up to the owner's "per print"); a row's Print or
// Reprint prints that one (a reprint says REPRINT n on the sticker). A parcel whose amount or receiver changed after
// booking is shown with its reason and is never printed (SIM-F-004). The sticker's size, printer dots, language and
// exact-amount line are the owner's delivery settings, shown here with a sample sticker. The list shows no customer's
// details; printing needs `fulfilment.print`, which the API checks again.
//
// PR 180 (B1.5): the page is seen with `fulfilment.read`; a reprint asks a short reason (the owner's "ask why on a
// reprint") and is never a second parcel; each press carries a key, so a press repeated after a lost answer is the
// same print; "Recent prints" lists the last prints (stickers and handover sheets) with who, when and why.
//
// S20 · PR 404 (ORD-04a; demo V12.4 97s print run): the queue preview — each parcel's pieces (style, colour, size,
// how many; no price) under a heading where its category group starts — and the print settings on the page itself
// (CN-018): "What to print" (`fulfilment.printRun`: stickers, each sticker then its invoice, or the invoices only, in
// packing order; an invoice in the run on paper or on the roll) and "Sticker and printer" (`delivery.sticker.layout`:
// the size for the owner's printer, its dots, the sticker's language, type size, the shop's line, how many per print).
// Saving them needs `fulfilment.printSettings`; a print with invoices needs `orders.invoice` too. A row's own Print /
// Reprint is always its sticker.
import type { Metadata } from 'next';
import '../../../settings-cards.css';
import '../packing.css';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as sh from '@extas/shipping';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PrintCheck } from '@/components/admin/fulfil/PrintCheck';
import { PdfButton } from '@/components/admin/fulfil/Print';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PRINT_RUN_INVOICE_LAYOUTS, PRINT_RUN_WHATS, STICKER_DPIS, STICKER_SIZES } from '@extas/settings';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { formatNumber } from '@/components/admin/products/model';
import { printedAt } from '@/lib/admin-fulfil/handover';
import { adminDeps } from '@/lib/admin-auth';
import { withFulfil } from '@/lib/admin-fulfil/i18n';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { packingSettingCards } from '@/lib/packing-settings-api';
import { t, type Dict } from '@/lib/i18n';
import { shippingDeps } from '@/lib/shipping-api';

export const dynamic = 'force-dynamic';

const HERE = '/admin/orders/packing/print';
const API = '/api/admin/packing/stickers';
const SETTINGS = '/api/admin/packing/settings';
/** How many order numbers one line of "Recent prints" shows. */
const SHOWN = 6; // hardcode-ok: the line's own length, not a business number

export async function generateMetadata(): Promise<Metadata> {
  const view = withFulfil(await adminView());
  return { title: `${t(view.dict, 'ful.packing.printTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function PrintRunPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('fulfilment.read', deps, MOTHER_STORE_ID)]);
  const view = withFulfil(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="packingPrint" text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="fulfilment.read" />
      </div>
    );
  const who: sh.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const sd = await shippingDeps(access.deps);
  const [run, layout, exact, recent, queue, cards, invoicePrint] = await Promise.all([
    sh.printRun(sd, who),
    sd.settings.value('delivery.sticker.layout', { storeId: MOTHER_STORE_ID }),
    sd.settings.value('delivery.sticker.exactAmount', { storeId: MOTHER_STORE_ID }),
    sh.printJobs(sd, who),
    sd.settings.value('delivery.sticker.queue', { storeId: MOTHER_STORE_ID }),
    packingSettingCards(access.deps, { actor: access.guard.actor, ctx: access.guard.ctx }),
    sd.settings.value('documents.invoice.print', { storeId: MOTHER_STORE_ID }),
  ]);
  const held = access.guard.permissions;
  const canPrint = held?.has('fulfilment.print') ?? false;
  const canInvoice = held?.has('orders.invoice') ?? false;
  const canSettings = held?.has('fulfilment.printSettings') ?? false;
  const what = cards['fulfilment.printRun'].value.what as (typeof PRINT_RUN_WHATS)[number];
  const withInvoice = what !== 'sticker';
  const listed = (nums: string[]) => [...nums.slice(0, SHOWN), ...(nums.length - SHOWN > 0 ? ['…'] : [])].join(', ');
  const fd: Dict = { ful: d.ful as Dict };
  const n = (x: number) => formatNumber(x, view.locale);
  // the main press: new stickers (and their invoices), or — invoices only — every parcel that can print; one print
  // takes as many as the sticker's and (with invoices) the invoice's "per print" allow
  const fresh = run.rows.filter((r) => !r.problem && (what === 'invoice' || r.printCount === 0));
  const perPress = withInvoice ? Math.min(run.maxPerPdf, invoicePrint.maxPerPdf) : run.maxPerPdf;
  const batch = fresh.slice(0, perPress);
  const printed = run.rows.filter((r) => r.printCount > 0).length;
  const problems = run.rows.filter((r) => r.problem).length;
  const later = fresh.length - batch.length;
  const pressLabel = t(d, `ful.printRun.press.${what}`, { n: n(batch.length) });
  const blocked = withInvoice && !canInvoice;
  const catName = (c: sh.PrintRunRow['category']) => (c.en ? (view.lang === 'bn' && c.bn) || c.en : t(d, 'ful.printRun.noCategory'));
  const piecesOf = (r: sh.PrintRunRow) => r.items.map((i) => [i.name, i.colour, i.size].filter(Boolean).join(' · ') + (i.quantity > 1 ? ` ×${n(i.quantity)}` : '')).join(', ');
  const groupSize = new Map<string, number>();
  for (const r of run.rows) groupSize.set(r.category.en, (groupSize.get(r.category.en) ?? 0) + 1);

  // ---- the settings cards (CN-018: on the page where they are used); words here, values from the API ----
  const ps = (k: string, vars: Record<string, string> = {}) => t(d, `ful.printRun.set.${k}`, vars);
  const texts = (card: string): FieldsCardTexts => ({
    h: ps(`${card}.h`),
    d: ps(`${card}.d`),
    save: ps('save'),
    saving: ps('saving'),
    saved: ps('saved'),
    discard: ps('discard'),
    unsaved: ps('unsaved'),
    readOnly: ps('readOnly'),
    pairHelp: ps('readOnly'),
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'forbidden', 'unauthorized', 'network', 'other'].map((c) => [c, ps(`err.${c}`)])),
  });
  const whatFields: FieldsCardField[] = [
    { kind: 'select', path: 'what', label: ps('what.what'), help: ps('what.whatHelp'), options: PRINT_RUN_WHATS.map((v) => ({ value: v, label: ps(`what.whats.${v}`) })) },
    { kind: 'select', path: 'invoiceLayout', label: ps('what.layout'), options: PRINT_RUN_INVOICE_LAYOUTS.map((v) => ({ value: v, label: ps(`what.layouts.${v}`) })) },
  ];
  const stickerFields: FieldsCardField[] = [
    { kind: 'select', path: 'size', label: ps('sticker.size'), help: ps('sticker.sizeHelp'), options: STICKER_SIZES.map((v) => ({ value: v, label: v === 'custom' ? t(d, 'ful.packing.size.custom', { w: n(layout.customMm.width), h: n(layout.customMm.height) }) : t(d, `ful.packing.size.${v}`) })) },
    { kind: 'select', path: 'dpi', label: ps('sticker.dpi'), numeric: true, options: STICKER_DPIS.map((v) => ({ value: String(v), label: n(v) })) },
    { kind: 'select', path: 'lang', label: ps('sticker.lang'), options: (['en', 'bn'] as const).map((v) => ({ value: v, label: t(d, `ful.packing.lang.${v}`) })) },
    { kind: 'number', path: 'scalePercent', label: ps('sticker.scale'), min: 70, max: 150 },
    { kind: 'number', path: 'minScalePercent', label: ps('sticker.minScale'), help: ps('sticker.minScaleHelp'), min: 50, max: 100 },
    { kind: 'switch', path: 'showShop', label: ps('sticker.showShop') },
    { kind: 'number', path: 'maxPerPdf', label: ps('sticker.maxPerPdf'), min: 1, max: 500 },
  ];
  // PR 408: the print check's size names, and the print quality card
  const checkSizes: Record<string, string> = {
    ...Object.fromEntries(STICKER_SIZES.map((v) => [v, v === 'custom' ? t(d, 'ful.packing.size.custom', { w: n(layout.customMm.width), h: n(layout.customMm.height) }) : t(d, `ful.packing.size.${v}`)])),
    ...Object.fromEntries(['a4', 'a5', 'roll80', 'roll58'].map((v) => [v, t(d, `ful.check.size.${v}`)])),
  };
  const qs = (k: string) => t(d, `ful.check.set.${k}`);
  const qualityTexts: FieldsCardTexts = { ...texts('what'), h: qs('h'), d: qs('d') };
  const qualityFields: FieldsCardField[] = [
    { kind: 'switch', path: 'logoOnLists', label: qs('logoOnLists'), help: qs('logoOnListsHelp') },
    { kind: 'number', path: 'edgeMm', label: qs('edgeMm'), help: qs('edgeMmHelp'), min: 0, max: 5 },
  ];
  const size = layout.size === 'custom' ? t(d, 'ful.packing.size.custom', { w: n(layout.customMm.width), h: n(layout.customMm.height) }) : t(d, `ful.packing.size.${layout.size}`);
  const counts: [string, number][] = [
    ['waiting', run.rows.length],
    ['new', fresh.length],
    ['printed', printed],
    ['problems', problems],
  ];

  return (
    <div className="a2-z" data-testid="print-run">
      <PageHead
        view={view}
        place={locateKey('packingPrint')}
        title={t(d, 'ful.packing.printTitle')}
        sub={t(d, 'ful.packing.printSub')}
        right={canPrint ? <PdfButton dict={fd} url={API} body={{ shipmentIds: batch.map((r) => r.shipmentId) }} label={pressLabel} busyLabel={t(d, 'ful.packing.printing')} tone="pri" size="" testId="print-new" disabled={!batch.length || blocked} keyed fileName={what === 'invoice' ? 'invoices.pdf' : 'stickers.pdf'} /> : null}
      />
      <SectionTabs view={view} current="packingPrint" />
      <div className="a2-kpis a2-mt12" data-testid="print-counts">
        {counts.map(([k, v]) => (
          <div key={k} className="a2-card a2-kpi">
            <div className="a2-kl">{t(d, `ful.packing.counts.${k}`)}</div>
            <div className="a2-kv">{n(v)}</div>
          </div>
        ))}
      </div>
      <section className="a2-card tight a2-mt12" aria-label={t(d, 'ful.packing.stickerTitle')} data-testid="sticker-settings">
        <div className="a2-between">
          <div>
            <h2 className="a2-h4">{t(d, 'ful.packing.stickerTitle')}</h2>
            <div className="a2-gap8 a2-mt6" style={{ flexWrap: 'wrap' }}>
              <span className="a2-pill line">{size}</span>
              <span className="a2-pill line">{t(d, 'ful.packing.dpi', { dpi: n(layout.dpi) })}</span>
              <span className="a2-pill line">{t(d, `ful.packing.lang.${layout.lang}`)}</span>
              <span className={`a2-pill ${exact.enabled ? 'ok' : ''}`}>{t(d, exact.enabled ? 'ful.packing.exactOn' : 'ful.packing.exactOff')}</span>
              <span className="a2-pill line">{t(d, 'ful.packing.perPrint', { n: n(run.maxPerPdf) })}</span>
              <span className="a2-pill line">{t(d, queue.reprintReason ? 'ful.packing.reasonOn' : 'ful.packing.reasonOff')}</span>
            </div>
            <p className="a2-xs a2-mute a2-mt6">{t(d, 'ful.packing.settingsNote')}</p>
          </div>
          {canPrint ? (
            <div className="a2-cmds">
              <PdfButton dict={fd} url={`${API}/sample`} method="GET" label={t(d, 'ful.packing.sample')} busyLabel={t(d, 'ful.packing.printing')} tone="ghost" testId="sample-sticker" refresh={false} fileName="sample-sticker.pdf" />
            </div>
          ) : null}
        </div>
      </section>
      <p className="a2-xs a2-mute a2-mt6" data-testid="print-what">
        <span className={`a2-pill ${withInvoice ? 'ok' : 'line'}`}>{ps(`what.whats.${what}`)}</span> {blocked ? t(d, 'ful.printRun.needInvoice') : t(d, `ful.printRun.whatNote.${what}`)}
      </p>
      {later ? <p className="a2-xs a2-mute a2-mt6">{t(d, 'ful.packing.more', { n: n(later), max: n(perPress) })}</p> : null}
      {run.rows.length ? (
        <div className="a2-tblw a2-mt12" data-testid="print-list">
          <table className="a2-tbl">
            <thead>
              <tr>
                <th>{t(d, 'ful.packing.col.order')}</th>
                <th>{t(d, 'ful.printRun.col.items')}</th>
                <th>{t(d, 'ful.packing.col.courier')}</th>
                <th>{t(d, 'ful.packing.col.consignment')}</th>
                <th className="r">{t(d, 'ful.packing.col.pieces')}</th>
                <th>{t(d, 'ful.packing.col.printed')}</th>
                <th className="w0" />
              </tr>
            </thead>
            <tbody>
              {run.rows.map((r, i) => [
                i === 0 || run.rows[i - 1]!.category.en !== r.category.en ? (
                  <tr key={`g-${r.shipmentId}`} className="pr-group" data-testid="print-group">
                    <td colSpan={7}>
                      <b>{catName(r.category)}</b> <span className="a2-xs a2-mute">{t(d, 'ful.printRun.groupCount', { n: n(groupSize.get(r.category.en) ?? 0) })}</span>
                    </td>
                  </tr>
                ) : null,
                <tr key={r.shipmentId} data-testid="print-row">
                  <td className="a2-tdh">
                    <div className="a2-cell">
                      <b>
                        <Link className="a2-lnk" href={`/admin/orders/${r.orderId}`}>{r.orderNumber}</Link>
                      </b>
                      {r.problem ? <span style={{ color: 'var(--bad)' }}>{t(d, `ful.sticker.problem.${r.problem}`)}</span> : null}
                    </div>
                  </td>
                  <td data-l={t(d, 'ful.printRun.col.items')} data-testid="print-items">
                    <span className="a2-xs">{piecesOf(r)}</span>
                  </td>
                  <td data-l={t(d, 'ful.packing.col.courier')}>
                    <span>
                      {r.courierName} {r.practice ? <span className="a2-pill gold">{t(d, 'ful.packing.pill.practice')}</span> : null}
                    </span>
                  </td>
                  <td data-l={t(d, 'ful.packing.col.consignment')}>
                    <span className="a2-mono">{r.consignmentId}</span>
                  </td>
                  <td className="r" data-l={t(d, 'ful.packing.col.pieces')}>
                    <b className="a2-num">{n(r.pieces)}</b>
                  </td>
                  <td data-l={t(d, 'ful.packing.col.printed')}>{r.printCount ? <span className="a2-pill warn">{t(d, 'ful.packing.pill.printed', { n: n(r.printCount) })}</span> : <span className="a2-pill line">{t(d, 'ful.packing.pill.new')}</span>}</td>
                  <td className="a2-tdw">
                    {r.problem || !canPrint ? null : (
                      <PdfButton dict={fd} url={API} body={{ shipmentIds: [r.shipmentId], single: true }} label={t(d, r.printCount ? 'ful.packing.reprintOne' : 'ful.packing.printOne')} busyLabel={t(d, 'ful.packing.printing')} tone="ghost" testId="print-one" keyed fileName={`sticker-${r.orderNumber}.pdf`} />
                    )}
                  </td>
                </tr>,
              ])}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="a2-state a2-mt12" data-testid="print-empty">
          <div className="a2-sti">
            <ShellIcon name="print" size={26} />
          </div>
          <h3>{t(d, 'ful.packing.empty')}</h3>
          <p>{t(d, 'ful.packing.emptySub')}</p>
        </div>
      )}
      <FieldsCard url={SETTINGS} screen={cards['fulfilment.printRun']} fields={whatFields} texts={texts('what')} canEdit={canSettings} testId="print-run-what" />
      <FieldsCard url={SETTINGS} screen={cards['delivery.sticker.layout']} fields={stickerFields} texts={texts('sticker')} canEdit={canSettings} testId="print-run-sticker" />
      {canPrint ? <PrintCheck dict={fd} url="/api/admin/packing/stickers/check" sizeLabel={checkSizes} testId="print-check" /> : null}
      <FieldsCard url={SETTINGS} screen={cards['documents.printQuality']} fields={qualityFields} texts={qualityTexts} canEdit={canSettings} testId="print-quality" />
      <section className="a2-card tight a2-mt12" aria-label={t(d, 'ful.recent.title')} data-testid="print-recent">
        <h2 className="a2-h4">{t(d, 'ful.recent.title')}</h2>
        {recent.length ? (
          <ul className="a2-stack a2-mt6" style={{ gap: 6, listStyle: 'none', padding: 0, margin: 0 }}>
            {recent.map((j) => (
              <li key={j.id} className="a2-xs" data-testid="print-recent-row">
                <b>{t(d, `ful.recent.kind.${j.kind}`)}</b> · {t(d, j.kind === 'PICKING_LIST' ? 'ful.recent.orders' : 'ful.recent.parcels', { n: n(j.parcels) })} · {printedAt(j.at, view.timeZone)}
                {j.by ? ` · ${j.by}` : ''}
                {j.isReprint ? (
                  <>
                    {' '}
                    <span className="a2-pill warn">{t(d, 'ful.recent.again')}</span>
                  </>
                ) : null}
                {j.reason ? <span className="a2-mute"> · {t(d, 'ful.recent.reason', { reason: j.reason })}</span> : null}
                {j.orderNumbers.length ? <span className="a2-mute"> · {listed(j.orderNumbers)}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-xs a2-mute a2-mt6">{t(d, 'ful.recent.empty')}</p>
        )}
      </section>
    </div>
  );
}

// S08 · PR 179–181 follow-up 435 (Blueprint B1.3 "a column shows which document each order already has") — the
// orders list's Documents column and its line under the table: the courier sticker (printed, or printed again ×n), the
// invoice (and its revision), the picking lists the order was on, and its handover sheet (printed, or handed over on
// it). Words only, read from what was kept (@extas/shipping documentsOf, the booking's print count); nothing changes.
import type { PackDocs } from '@extas/shipping';
import type { AdminView } from '../admin-page';
import { t } from '../i18n';
import { formatNumber } from '@/components/admin/products/model';
import type { Chip } from './list';

/** An order's documents as the list's chips (empty: none yet). */
export function docChips(view: AdminView, x: PackDocs): Chip[] {
  const d = view.dict;
  const n = (v: number) => formatNumber(v, view.locale);
  const title = t(d, 'orders.list.cols.docs');
  const out: Chip[] = [];
  if (x.sticker) out.push({ label: x.sticker > 1 ? t(d, 'orders.list.docs.stickerAgain', { n: n(x.sticker) }) : t(d, 'orders.list.docs.sticker'), tone: x.sticker > 1 ? 'warn' : 'line', icon: 'print', title });
  if (x.invoice) out.push({ label: x.invoice > 1 ? t(d, 'orders.list.docs.invoiceRevised', { n: n(x.invoice) }) : t(d, 'orders.list.docs.invoice'), tone: 'line', icon: 'file', title });
  if (x.picking) out.push({ label: x.picking > 1 ? t(d, 'orders.list.docs.pickingAgain', { n: n(x.picking) }) : t(d, 'orders.list.docs.picking'), tone: 'line', icon: 'box', title });
  if (x.handover !== 'none') out.push({ label: t(d, `orders.list.docs.handover.${x.handover}`), tone: x.handover === 'handed' ? 'ok' : 'line', icon: 'truck', title });
  return out;
}

/** The line under the table: how many orders on this page have each document (null: no row has any). */
export function docsSummaryLine(view: AdminView, all: readonly PackDocs[]): string | null {
  const d = view.dict;
  const n = (v: number) => formatNumber(v, view.locale);
  const count = (f: (x: PackDocs) => boolean) => all.filter(f).length;
  const parts: [string, number][] = [
    ['sticker', count((x) => x.sticker > 0)],
    ['stickerAgain', count((x) => x.sticker > 1)],
    ['invoice', count((x) => !!x.invoice)],
    ['picking', count((x) => x.picking > 0)],
    ['sheet', count((x) => x.handover === 'printed')],
    ['handed', count((x) => x.handover === 'handed')],
  ];
  const said = parts.filter(([, v]) => v > 0).map(([k, v]) => t(d, `orders.list.docs.sum.${k}`, { n: n(v) }));
  return said.length ? t(d, 'orders.list.docs.sum.line', { list: said.join(' · ') }) : null;
}

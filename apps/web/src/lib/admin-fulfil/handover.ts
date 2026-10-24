// S08 · PR 180 — the rider's handover sheet as a PDF on the server (Blueprint B1.5): the sheet from @extas/shipping
// (what was put on the batch), the owner's sheet settings (`delivery.handover.sheet`: paper, printer dots, language,
// the receiver's name, the signature lines), the shop's letterhead (name, address, phone from the settings), and the
// sheet's own words in the language the owner chose (messages/admin-fulfil.<lang>.json `ful.handover.sheet`), drawn by
// @extas/documents' paper list. Amounts and numbers in Western digits (what riders and the courier's hub read).
import { listPdf, PAPER_MM, sharpText, type ListColumn, type ListDocument, type TextEngine } from '@extas/documents';
import type { HandoverSheetSettings } from '@extas/settings';
import type { HandoverSheet } from '@extas/shipping';
import { formatMoney } from '@/lib/shop/lang';
import { t } from '@/lib/i18n';
import { fulfilDicts } from './i18n';

/** The shop's letterhead: its name, address and phone (owner data; a missing line is left out). */
export interface Letterhead {
  name: string | null;
  address: string | null;
  phone: string | null;
}

const money = (minor: number, currency: string) => formatMoney(minor, currency, 'en', false, 'en', '');

/** A moment in the store's time zone, as the sheets print it (Western digits). */
export function printedAt(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

/** The sheet as the paper list's data. */
export function handoverDocument(sheet: HandoverSheet, cfg: HandoverSheetSettings, head: Letterhead, timeZone: string): ListDocument {
  const d = fulfilDicts[cfg.lang];
  const w = (k: string, v?: Record<string, string | number>) => t(d, `ful.handover.sheet.${k}`, v);
  const names = cfg.receiverName && sheet.lines.some((l) => l.receiverName);
  const columns: ListColumn[] = [
    { title: '#', width: 1 },
    { title: w('col.order'), width: 3 },
    { title: w('col.consignment'), width: 4 },
    ...(names ? [{ title: w('col.receiver'), width: 4 }] : []),
    { title: w('col.pieces'), width: 1.5, align: 'right' as const },
    { title: w('col.collect'), width: 3, align: 'right' as const },
  ];
  const total = money(sheet.totals.collectMinor, sheet.currency);
  const [widthMm, heightMm] = PAPER_MM[cfg.paper];
  return {
    widthMm,
    heightMm,
    dpi: cfg.dpi,
    letterhead: [head.name, head.address, head.phone],
    title: w('title', { courier: sheet.courierName }),
    summary: [
      w('summary', { parcels: sheet.totals.parcels, pieces: sheet.totals.pieces, amount: total }),
      w('printed', { at: printedAt(sheet.printedAt, timeZone), n: sheet.printCount }),
      ...(sheet.printCount > 1 ? [w('again', { n: sheet.printCount })] : []),
      ...(sheet.practice ? [w('practice')] : []),
    ],
    columns,
    rows: sheet.lines.map((l, i) => ({
      cells: [String(i + 1), l.orderNumber, l.consignmentId, ...(names ? [l.receiverName ?? ''] : []), String(l.pieces), l.collectMinor > 0 ? money(l.collectMinor, sheet.currency) : w('paid')],
      tick: true,
    })),
    after: [w('total', { amount: total, parcels: sheet.totals.parcels })],
    signatures: cfg.signatures ? [w('handedBy'), w('receivedBy')] : [],
    foot: w('foot', { batch: sheet.batchId.slice(-8).toUpperCase(), n: sheet.printCount }),
    pageWords: w('page'),
    empty: w('empty'),
  };
}

/** The sheet as a PDF. */
export async function handoverPdf(sheet: HandoverSheet, cfg: HandoverSheetSettings, head: Letterhead, timeZone: string, engine: TextEngine = sharpText()): Promise<Buffer> {
  const doc = handoverDocument(sheet, cfg, head, timeZone);
  return listPdf(doc, engine, { title: doc.title });
}

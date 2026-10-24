// S08 · PR 181 — the daily picking list as a PDF on the server (Blueprint B1.6, B1.7): the list from @extas/shipping,
// the owner's list settings (`delivery.picking.list`: paper, printer dots, language, shortages), the shop's letterhead,
// and the list's own words in the language the owner chose (messages/admin-fulfil.<lang>.json `ful.picking.sheet`),
// drawn by @extas/documents' paper list: the summary line at the top, then category → style → colour → size rows, a
// tick box on every size row, SHORT in a black box where the stock is short, the held orders at the end.
import { listPdf, PAPER_MM, sharpText, type ListDocument, type ListRow, type TextEngine } from '@extas/documents';
import type { PickingListSettings } from '@extas/settings';
import type { PickingList } from '@extas/shipping';
import { t } from '@/lib/i18n';
import { printedAt, type Letterhead } from './handover';
import { fulfilDicts } from './i18n';

/** A category's name in the list's language ('' = no category). */
export function categoryName(list: Pick<PickingList, 'categoryBn'>, name: string, lang: 'en' | 'bn', none: string): string {
  if (!name) return none;
  return (lang === 'bn' && list.categoryBn[name]) || name;
}

/** The list as the paper list's data. */
export function pickingDocument(list: PickingList, cfg: PickingListSettings, head: Letterhead, timeZone: string, at: string): ListDocument {
  const d = fulfilDicts[cfg.lang];
  const w = (k: string, v?: Record<string, string | number>) => t(d, `ful.picking.sheet.${k}`, v);
  const none = w('noCategory');
  const s = list.summary;
  const rows: ListRow[] = [];
  for (const g of list.groups) {
    rows.push({ cells: [categoryName(list, g.category, cfg.lang, none), String(g.pieces)], bold: true, ruleAbove: rows.length > 0 });
    for (const st of g.styles) {
      rows.push({ cells: [st.style, String(st.pieces)], bold: true, indent: 1 });
      for (const c of st.colours) {
        rows.push({ cells: [c.colour ?? w('noColour'), String(c.pieces)], indent: 2 });
        for (const z of c.sizes) rows.push({ cells: [z.size ?? w('noSize'), String(z.quantity)], indent: 3, tick: true, mark: z.short > 0 ? w('short', { n: z.short }) : null });
      }
    }
  }
  const range = list.range.from || list.range.to ? w('range', { from: list.range.from ?? '…', to: list.range.to ?? '…' }) : w('allDays');
  const [widthMm, heightMm] = PAPER_MM[cfg.paper];
  return {
    widthMm,
    heightMm,
    dpi: cfg.dpi,
    letterhead: [head.name, head.address, head.phone],
    title: w('title'),
    summary: [
      w('counts', { orders: s.orders, pieces: s.pieces, lines: s.lineItems }),
      w('categories', { list: s.categories.map((c) => `${categoryName(list, c.name, cfg.lang, none)} ${c.pieces}`).join(' · ') || '—' }),
      list.shortagesMarked ? (s.shortages ? w('shortages', { n: s.shortages, pieces: s.shortPieces }) : w('noShortages')) : w('shortagesOff'),
      s.held ? w('held', { n: s.held }) : w('noHeld'),
      range,
    ],
    columns: [
      { title: w('col.item'), width: 6 },
      { title: w('col.pieces'), width: 1.5, align: 'right' },
    ],
    rows,
    after: list.held.length ? [w('heldTitle'), ...list.held.map((h) => w('heldLine', { order: h.orderNumber, reason: t(d, `ful.picking.reason.${h.reason}`), pieces: h.pieces }))] : [],
    signatures: [w('pickedBy'), w('checkedBy')],
    foot: w('foot', { at: printedAt(at, timeZone) }),
    pageWords: w('page'),
    empty: w('empty'),
  };
}

/** The list as a PDF. */
export async function pickingPdf(list: PickingList, cfg: PickingListSettings, head: Letterhead, timeZone: string, at: string, engine: TextEngine = sharpText()): Promise<Buffer> {
  const doc = pickingDocument(list, cfg, head, timeZone, at);
  return listPdf(doc, engine, { title: doc.title });
}

// S08 · PR 185 — what the Returns & exchanges board shows, without React: which column each exchange sits in (demo
// 97s-adm2-orders2.js a2Board: Requested / Approved · on the way / Received & QC / Done), the tone of its reason pill,
// and the page's own address with a case or a start step open; PR 188's size buttons. The words come from
// messages/admin-returns.*.json.
import type { ExchangeSizes, ExchangeView } from '@extas/orders';

/** One size button of the size switcher (PR 188); `why` says what stops it (another price, none free), null = free. */
export interface SizeChip {
  variantId: string;
  label: string;
  current: boolean;
  why: string | null;
}

/**
 * The size buttons of one piece going out: the current size, and each other size with what stops it — another price
 * now (an exchange never changes a price), or none free while the exchange is only requested (after approval the
 * order's edit checks the stock under the row locks).
 */
export function sizeChips(s: ExchangeSizes, requested: boolean, words: { price: string; out: string }): SizeChip[] {
  return s.sizes.map((z) => ({
    variantId: z.variantId,
    label: z.sizeLabel ?? z.sku,
    current: z.current,
    why: z.current ? null : !z.samePrice ? words.price : requested && z.sellable < 1 ? words.out : null,
  }));
}

export const BOARD_COLUMNS = ['requested', 'approved', 'qc', 'done'] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number];

const COLUMN_OF: Readonly<Record<string, BoardColumn>> = {
  REQUESTED: 'requested',
  APPROVED: 'approved',
  PICKUP_BOOKED: 'approved',
  RECEIVED: 'qc',
  QC_PASSED: 'qc',
  QC_FAILED: 'qc',
  COMPLETED: 'done',
  REJECTED: 'done',
  CANCELLED: 'done',
};

/** How many finished cases the Done column keeps on the board (the newest; the rest stay on the order's timeline). */
export const DONE_ON_BOARD = 12;

/** The exchanges in the board's four columns, newest first in each; Done keeps only the newest few. */
export function boardOf(rows: readonly ExchangeView[]): Record<BoardColumn, ExchangeView[]> {
  const out: Record<BoardColumn, ExchangeView[]> = { requested: [], approved: [], qc: [], done: [] };
  for (const r of rows) out[COLUMN_OF[r.status] ?? 'done'].push(r);
  out.done = out.done.slice(0, DONE_ON_BOARD);
  return out;
}

/** The reason pill's tone: our mistake red, a size exchange blue. */
export const reasonTone = (reason: string) => (reason === 'wrong' || reason === 'defect' || reason === 'damage' ? 'bad' : 'info');

/** The status pill's tone. */
export function statusTone(status: string): string {
  if (status === 'REQUESTED') return 'warn';
  if (status === 'QC_FAILED' || status === 'REJECTED') return 'bad';
  if (status === 'COMPLETED' || status === 'QC_PASSED') return 'ok';
  if (status === 'CANCELLED') return 'line';
  return 'info';
}

export const RETURNS_HREF = '/admin/orders/returns';

/** The page's address with these query values (empty ones left out). */
export function returnsHref(q: Record<string, string | null | undefined> = {}): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `${RETURNS_HREF}?${s}` : RETURNS_HREF;
}

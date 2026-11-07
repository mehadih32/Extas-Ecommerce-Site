'use client';
// S08 · PR 179, 181 — follow-up 439: ticks on the print run. The table stays the page's own (drawn on the server); this
// wraps it, gives each parcel row a tick box and the table's head an "every parcel shown" box, and adds a bar with two
// presses:
// - "Print the ticked · n": the ticked parcels that can print (never one with a problem), in packing order, printing
//   what the owner's "What to print" says, like the main press (a reprint asks its reason; a press carries a key).
// - "Picking list for these orders · n": the picking list (PR 181) for the orders behind the ticked parcels — or, with
//   nothing ticked, behind every parcel shown (the page's filter) — the same list and rules, narrowed to those orders.
// Only parcels the page shows now can be ticked; a tick never survives the list changing.
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { PdfButton } from '@/components/admin/fulfil/Print';
import { t, type Dict } from '@/lib/i18n';

export interface PrintTickRow {
  shipmentId: string;
  orderId: string;
  orderNumber: string;
  /** No problem: its sticker can print. */
  printable: boolean;
}

interface Ticks {
  dict: Dict;
  rows: PrintTickRow[];
  ticked: Set<string>;
  flip: (shipmentId: string) => void;
  setAll: (on: boolean) => void;
}

const TickContext = createContext<Ticks | null>(null);
const useTicks = (): Ticks => {
  const c = useContext(TickContext);
  if (!c) throw new Error('PrintTicks: a tick outside its table');
  return c;
};

/** Holds the ticks of the rows shown now; the table goes inside. */
export function PrintTicks({ dict, rows, children }: { dict: Dict; rows: PrintTickRow[]; children: ReactNode }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const shown = useMemo(() => new Set(rows.map((r) => r.shipmentId)), [rows]);
  // a tick the list no longer holds is gone
  const ticked = useMemo(() => new Set([...picked].filter((id) => shown.has(id))), [picked, shown]);
  const value: Ticks = {
    dict,
    rows,
    ticked,
    flip: (id) =>
      setPicked((s) => {
        const next = new Set([...s].filter((x) => shown.has(x)));
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    setAll: (on) => setPicked(on ? new Set(shown) : new Set()),
  };
  return <TickContext.Provider value={value}>{children}</TickContext.Provider>;
}

/** One parcel's tick box (44 px). */
export function PrintTick({ shipmentId, orderNumber }: { shipmentId: string; orderNumber: string }) {
  const c = useTicks();
  return (
    <label className="ps-tick ps-one pt-tick">
      <input type="checkbox" checked={c.ticked.has(shipmentId)} onChange={() => c.flip(shipmentId)} data-testid="print-tick" />
      <span className="a2-sr">{t(c.dict, 'ful.printRun.tick.one', { n: orderNumber })}</span>
    </label>
  );
}

/** The head's box: every parcel shown, or none. */
export function PrintTickAll() {
  const c = useTicks();
  const all = c.rows.length > 0 && c.ticked.size === c.rows.length;
  return (
    <label className="ps-tick pt-tick">
      <input type="checkbox" checked={all} onChange={() => c.setAll(!all)} data-testid="print-tick-all" />
      <span className="a2-sr">{t(c.dict, 'ful.printRun.tick.all')}</span>
    </label>
  );
}

interface BarProps {
  /** May print stickers (`fulfilment.print`). */
  canPrint: boolean;
  /** The main press is blocked (invoices without the invoice key): the ticked press is too. */
  blocked: boolean;
  /** The picking list takes at most this many orders. */
  maxOrders: number;
  stickerFile: string;
}

/** The bar: how many are ticked, and the two presses. */
export function PrintTickBar({ canPrint, blocked, maxOrders, stickerFile }: BarProps) {
  const c = useTicks();
  const d = c.dict;
  const chosen = c.rows.filter((r) => c.ticked.has(r.shipmentId));
  const toPrint = chosen.filter((r) => r.printable);
  const behind = chosen.length ? chosen : c.rows;
  const orderIds = [...new Set(behind.map((r) => r.orderId))];
  const tooMany = orderIds.length > maxOrders;
  const n = (x: number) => String(x);
  if (!c.rows.length) return null;
  return (
    <div className="a2-card tight ps-bar a2-mt12" data-testid="print-tick-bar">
      <div className="a2-gap8 ps-acts">
        <span className="a2-xs" data-testid="print-tick-count" role="status">
          {chosen.length ? t(d, 'ful.printRun.tick.count', { n: n(chosen.length) }) : t(d, 'ful.printRun.tick.none')}
        </span>
        {canPrint && toPrint.length ? (
          <PdfButton dict={d} url="/api/admin/packing/stickers" body={{ shipmentIds: toPrint.map((r) => r.shipmentId) }} label={t(d, 'ful.printRun.tick.print', { n: n(toPrint.length) })} busyLabel={t(d, 'ful.packing.printing')} size="" keyed disabled={blocked} fileName={stickerFile} testId="print-ticked" />
        ) : null}
        <PdfButton
          dict={d}
          url="/api/admin/packing/picking"
          body={{ orderIds }}
          label={t(d, chosen.length ? 'ful.printRun.tick.pickingTicked' : 'ful.printRun.tick.picking', { n: n(orderIds.length) })}
          busyLabel={t(d, 'ful.packing.printing')}
          tone="ghost"
          size=""
          disabled={!orderIds.length || tooMany}
          fileName="picking-list.pdf"
          testId="print-picking"
        />
      </div>
      <p className="a2-xs a2-mute" style={{ margin: 0 }}>
        {tooMany ? t(d, 'ful.printRun.tick.tooMany', { max: n(maxOrders) }) : t(d, 'ful.printRun.tick.note')}
      </p>
    </div>
  );
}

'use client';
// S20 · PR 411 (Blueprint B1.3: "pick a date or a status, select orders, then act in this order: Book courier → Print
// stickers") — the Pack screen's order list with a tick per order and the two acts for the ticked ones:
// - "Book selected": the ticked orders not booked yet, with one courier account, through the Delivery booking (its own
//   checks: never a cancelled, held or in-review order; each refusal comes back with its reason). A person presses it;
//   nothing books by itself.
// - "Print selected": the ticked orders' parcels in one press, in packing order (the server puts them in it), printing
//   what the owner's "What to print" says (stickers, sticker + invoice, or invoices). A reprint asks its reason; a press
//   carries a key, so pressing again after a lost answer is the same print.
// Only rows the server listed (the screen's own filter) can be ticked; a tick never survives the list changing.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useMemo, useState } from 'react';
import { call } from '@/components/admin/api';
import { PdfButton } from '@/components/admin/fulfil/Print';
import { fulError } from '@/lib/admin-fulfil/words';
import { t, type Dict } from '@/lib/i18n';

export interface PackSelectRow {
  orderId: string;
  orderNumber: string;
  href: string;
  on: boolean;
  title: string;
  sub: string;
  docs: string;
  /** The live parcel, when booked. */
  shipmentId: string | null;
  /** Booked with the courier's consignment id (a sticker can print). */
  printable: boolean;
}

interface Props {
  dict: Dict;
  rows: PackSelectRow[];
  /** Ticks are offered (not on the Handed over step). */
  selectable: boolean;
  canBook: boolean;
  canPrint: boolean;
  couriers: { id: string; name: string }[];
  codeWords: Record<string, string>;
}

type Msg = { ok: boolean; text: string } | null;

export function PackSelect({ dict, rows, selectable, canBook, canPrint, couriers, codeWords }: Props) {
  const router = useRouter();
  const id = useId();
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [courierAccountId, setCourier] = useState(couriers[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  // only what the server listed now can be ticked
  const chosen = useMemo(() => rows.filter((r) => ticked.has(r.orderId)), [rows, ticked]);
  const toBook = chosen.filter((r) => !r.shipmentId);
  const toPrint = chosen.filter((r) => r.printable && r.shipmentId);
  const all = rows.length > 0 && chosen.length === rows.length;
  const flip = (orderId: string) =>
    setTicked((s) => {
      const next = new Set(s);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  const book = async () => {
    if (!toBook.length || !courierAccountId) return;
    setBusy(true);
    setMsg(null);
    const a = await call('POST', '/api/admin/delivery/bookings', { courierAccountId, orderIds: toBook.map((r) => r.orderId) });
    setBusy(false);
    if (!a.data.ok) {
      setMsg({ ok: false, text: a.status === 0 ? fulError(dict, 'network') : fulError(dict, a.data.error, ((a.data.details as string[] | undefined) ?? []).join(', ')) });
      return;
    }
    const results = (a.data.results as { orderId?: string; number?: string; outcome?: string; code?: string | null }[] | undefined) ?? [];
    const numberOf = new Map(toBook.map((r) => [r.orderId, r.orderNumber]));
    const booked = results.filter((r) => r.outcome === 'booked').length;
    const not = results.filter((r) => r.outcome !== 'booked').map((r) => `${r.number ?? numberOf.get(r.orderId ?? '') ?? ''} (${(r.code && codeWords[r.code]) || t(dict, 'ful.err.default')})`);
    setMsg({ ok: !not.length, text: [t(dict, 'ful.pack.sel.booked', { n: String(booked) }), not.length ? t(dict, 'ful.pack.sel.notBooked', { list: not.join(', ') }) : ''].filter(Boolean).join(' ') });
    router.refresh();
  };
  return (
    <div className="a2-stack" style={{ gap: 8 }}>
      {selectable && rows.length ? (
        <div className="a2-card tight ps-bar" data-testid="pack-select-bar">
          <label className="ps-tick">
            <input type="checkbox" checked={all} onChange={() => setTicked(all ? new Set() : new Set(rows.map((r) => r.orderId)))} data-testid="pack-select-all" />
            <span>{chosen.length ? t(dict, 'ful.pack.sel.count', { n: String(chosen.length) }) : t(dict, 'ful.pack.sel.all')}</span>
          </label>
          {chosen.length ? (
            <div className="a2-gap8 ps-acts">
              {canBook && toBook.length ? (
                couriers.length ? (
                  <span className="a2-gap8">
                    <label className="a2-sr" htmlFor={`${id}-c`}>
                      {t(dict, 'ful.pack.bookPick')}
                    </label>
                    <select id={`${id}-c`} className="a2-sel" value={courierAccountId} onChange={(e) => setCourier(e.target.value)} disabled={busy} data-testid="pack-select-courier">
                      {couriers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="a2-btn pri" onClick={book} disabled={busy || !courierAccountId} data-testid="pack-select-book">
                      {busy ? t(dict, 'ful.pack.booking') : t(dict, 'ful.pack.sel.book', { n: String(toBook.length) })}
                    </button>
                  </span>
                ) : (
                  <span className="a2-xs a2-mute">{t(dict, 'ful.pack.noCourier')}</span>
                )
              ) : null}
              {canPrint && toPrint.length ? (
                <PdfButton dict={dict} url="/api/admin/packing/stickers" body={{ shipmentIds: toPrint.map((r) => r.shipmentId) }} label={t(dict, 'ful.pack.sel.print', { n: String(toPrint.length) })} busyLabel={t(dict, 'ful.packing.printing')} size="" keyed fileName="print-run.pdf" testId="pack-select-print" />
              ) : null}
            </div>
          ) : null}
          {msg ? (
            <span className={`a2-xs ${msg.ok ? 'a2-mute' : ''}`} role={msg.ok ? 'status' : 'alert'} style={msg.ok ? undefined : { color: 'var(--bad)' }} data-testid="pack-select-said">
              {msg.text}
            </span>
          ) : null}
          <p className="a2-xs a2-mute" style={{ margin: 0 }}>
            {t(dict, 'ful.pack.sel.note')}
          </p>
        </div>
      ) : null}
      {rows.map((r) => (
        <div key={r.orderId} className="ps-row">
          {selectable ? (
            <label className="ps-tick ps-one">
              <input type="checkbox" checked={ticked.has(r.orderId)} onChange={() => flip(r.orderId)} data-testid="pack-select-one" />
              <span className="a2-sr">{t(dict, 'ful.pack.sel.one', { n: r.orderNumber })}</span>
            </label>
          ) : null}
          <Link className={`a2-qi${r.on ? ' on' : ''}`} href={r.href} aria-current={r.on ? 'true' : undefined} data-testid="pack-row">
            <div>
              <b>{r.title}</b>
              <span>{r.sub}</span>
              <span data-testid="pack-docs">{r.docs}</span>
            </div>
          </Link>
        </div>
      ))}
    </div>
  );
}

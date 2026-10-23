'use client';
// PR 140 — the order list's table (demo V12.3 a2List, 97r ORD-01): one row per order with the four separate status
// chips, the courier and the flags; a table on a computer, one card per order on a phone (shell.css). A tap on a row
// opens the order; the order number is its link for the keyboard and screen readers. The tick boxes select orders for
// the bulk bar (its commands are PR 152); the selection is this page's only (a new page or view starts empty).
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type MouseEvent } from 'react';
import type { Chip, OrderRowView } from '@/lib/admin-orders/list';
import { t, type Dict } from '@/lib/i18n';
import { ShellIcon } from '../shell/ShellIcon';

export function Chips({ chips, empty }: { chips: readonly Chip[]; empty?: string }) {
  if (!chips.length) return empty ? <span className="a2-faint">{empty}</span> : null;
  return (
    <span className="a2-st4">
      {chips.map((c, i) => (
        <span key={`${c.label}-${i}`} className={`a2-pill ${c.tone}`} title={c.title}>
          {c.icon ? <ShellIcon name={c.icon} size={12} /> : null}
          {c.title ? <span className="a2-sr">{`${c.title}: `}</span> : null}
          {c.label}
        </span>
      ))}
    </span>
  );
}

/** What the bulk bar may offer this person (null: no tick boxes). */
export interface BulkSetup {
  commands: string[];
}

export function OrderTable({ dict: d, rows, bulk }: { dict: Dict; rows: OrderRowView[]; bulk: BulkSetup | null }) {
  const router = useRouter();
  const [sel, setSel] = useState<ReadonlySet<string>>(new Set());
  const col = (k: string) => t(d, `orders.list.cols.${k}`);
  const dash = t(d, 'orders.list.none');
  const allOn = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const toggle = (id: string, on: boolean) =>
    setSel((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  const open = (ev: MouseEvent<HTMLTableRowElement>, href: string) => {
    if ((ev.target as HTMLElement).closest('a,button,input,select,label')) return;
    router.push(href);
  };
  const chosen = rows.filter((r) => sel.has(r.id));
  return (
    <>
      <div className="a2-tblw">
        <table className="a2-tbl" data-testid="orders-table">
          <thead>
            <tr>
              {bulk ? (
                <th className="w0">
                  <label className="a2-chkw">
                    <input type="checkbox" className="a2-chk" checked={allOn} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} aria-label={t(d, 'orders.list.selectAll')} />
                  </label>
                </th>
              ) : null}
              <th>{col('order')}</th>
              <th>{col('items')}</th>
              <th className="r">{col('total')}</th>
              <th>{col('status')}</th>
              <th>{col('courier')}</th>
              <th>{col('flags')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const on = sel.has(r.id);
              return (
                <tr key={r.id} className={on ? 'sel' : undefined} onClick={(ev) => open(ev, r.href)} data-testid="order-row" data-order={r.number}>
                  {bulk ? (
                    <td className="w0 a2-tdc">
                      <label className="a2-chkw">
                        <input type="checkbox" className="a2-chk" checked={on} onChange={(e) => toggle(r.id, e.target.checked)} aria-label={t(d, 'orders.list.select', { n: r.number })} />
                      </label>
                    </td>
                  ) : null}
                  <td className="a2-tdh">
                    <div className="a2-cell">
                      <Link href={r.href} className="a2-b" aria-label={t(d, 'orders.list.open', { n: r.number })}>
                        {r.number}
                      </Link>
                      <span className="a2-oname">{r.name || dash}</span>
                      <span className="a2-nowrap" title={r.placed}>
                        {r.phone ? `${r.age} · ${r.phone}` : r.age}
                      </span>
                    </div>
                  </td>
                  <td className="a2-tdm" data-l={col('items')}>
                    <div className="a2-cell">
                      <b>{r.items}</b>
                      {r.firstItem ? <span className="a2-ell">{r.firstItem}</span> : null}
                    </div>
                  </td>
                  <td className="r" data-l={col('total')}>
                    <div className="a2-cell">
                      <b className="a2-num">{r.total}</b>
                      {r.method ? <span>{r.method}</span> : null}
                    </div>
                  </td>
                  <td className="a2-tdw" data-l={col('status')}>
                    <Chips chips={r.chips} />
                  </td>
                  <td data-l={col('courier')}>
                    {r.courier ? (
                      <div className="a2-cell">
                        <b>{r.courier.name}</b>
                        {r.courier.tracking ? <span className="a2-mono a2-nowrap">{r.courier.tracking}</span> : null}
                      </div>
                    ) : (
                      <span className="a2-faint">{dash}</span>
                    )}
                  </td>
                  <td className="a2-tdx" data-l={col('flags')}>
                    <Chips chips={r.flags} empty={dash} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {bulk && chosen.length ? (
        <div className="a2-bulk" role="region" aria-label={t(d, 'orders.bulk.aria')} data-testid="orders-bulk">
          <b>{t(d, 'orders.bulk.selected', { n: chosen.length })}</b>
          <button type="button" className="a2-btn sm ghost a2-bclr" onClick={() => setSel(new Set())}>
            {t(d, 'orders.bulk.clear')}
          </button>
        </div>
      ) : null}
    </>
  );
}

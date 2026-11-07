// PR 140 — the order list's table (demo V12.3 a2List, 97r ORD-01): one row per order with the four separate status
// chips, the courier and the flags; a table on a computer, one card per order on a phone (shell.css). A tap on a row
// opens the order; the order number is its link for the keyboard and screen readers. The tick boxes select orders for
// the bulk bar (PR 152, BulkBar.tsx); the selection is this page's only (a new page or view starts empty).
// Follow-up 223: a cheap row. The table is drawn by the server: no row carries a React handler, a hook or a prefetching
// Link (the order number is a plain link the picker routes), and the tick boxes are the browser's own. OrderPicker.tsx
// holds the one click and change listener and the bulk bar; on a phone the cards off screen skip layout and paint
// (content-visibility, shell.css). The owner's page size (orders.list.pageSize) is untouched.
import type { BulkCommand } from '@/lib/admin-orders/bulk';
import type { Chip, OrderRowView } from '@/lib/admin-orders/list';
import type { BulkFile } from '@/lib/admin-orders/bulk-files';
import type { FieldOption } from '@/lib/admin-orders/spec';
import { t, type Dict } from '@/lib/i18n';
import { ShellIcon } from '../shell/ShellIcon';
import { OrderPicker } from './OrderPicker';

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
  commands: BulkCommand[];
  holdOptions: FieldOption[];
  /** Follow-up 222: Export and Print invoices, by the person's keys. */
  files?: BulkFile[];
}

export function OrderTable({ dict: d, rows, bulk }: { dict: Dict; rows: OrderRowView[]; bulk: BulkSetup | null }) {
  const col = (k: string) => t(d, `orders.list.cols.${k}`);
  const dash = t(d, 'orders.list.none');
  return (
    <OrderPicker
      dict={d}
      rows={rows.map((r) => ({
        id: r.id,
        number: r.number,
        href: r.href,
        facts: r.facts,
      }))}
      bulk={bulk}
    >
      <table className="a2-tbl" data-testid="orders-table">
        <thead>
          <tr>
            {bulk ? (
              <th className="w0">
                <label className="a2-chkw">
                  <input type="checkbox" className="a2-chk" data-pick-all="" aria-label={t(d, 'orders.list.selectAll')} />
                </label>
              </th>
            ) : null}
            <th>{col('order')}</th>
            <th>{col('items')}</th>
            <th className="r">{col('total')}</th>
            <th>{col('status')}</th>
            <th>{col('risk')}</th>
            <th>{col('courier')}</th>
            <th>{col('flags')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            return (
              <tr key={r.id} data-href={r.href} data-testid="order-row" data-order={r.number}>
                {bulk ? (
                  <td className="w0 a2-tdc">
                    <label className="a2-chkw">
                      <input type="checkbox" className="a2-chk" data-pick={r.id} aria-label={t(d, 'orders.list.select', { n: r.number })} />
                    </label>
                  </td>
                ) : null}
                <td className="a2-tdh">
                  <div className="a2-cell">
                    <a href={r.href} className="a2-b" data-row-link="" aria-label={t(d, 'orders.list.open', { n: r.number })}>
                      {r.number}
                    </a>
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
                <td data-l={col('risk')} data-testid="order-risk">
                  {r.risk.band || r.risk.section ? (
                    <div className="a2-cell">
                      <Chips chips={[r.risk.band, r.risk.section].filter((c): c is Chip => c !== null)} />
                    </div>
                  ) : (
                    <span className="a2-faint">{dash}</span>
                  )}
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
    </OrderPicker>
  );
}

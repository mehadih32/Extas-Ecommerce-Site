// S22 · PR 436 — one table of Support › Analytics (by channel, or by person): chats, answers, tickets, the first answer
// and the solution (middle, average under it), late tickets, chat → order (orders under it), sales (delivered; the
// ordered value under it), follow-ups sent and ordered. A rate or a time with nothing under it shows "—". On a phone
// the shell's a2-tbl turns each row into a card with each value's label.
import type { SupportAnalyticsRow } from '@extas/support';

export interface AnalyticsTexts {
  col: Record<'channel' | 'person' | 'chats' | 'replies' | 'tickets' | 'first' | 'resolve' | 'late' | 'conversion' | 'orders' | 'sales' | 'followUps', string>;
  none: string;
}

export interface AnalyticsCell {
  n: (x: number) => string;
  m: (minor: number) => string;
  pct: (x: number | null) => string;
  mins: (x: number | null) => string;
  avg: (x: number | null) => string;
  ordered: (x: number) => string;
  sent: (sent: number, ordered: number) => string;
}

export function SupportAnalyticsTable({
  rows,
  first,
  texts,
  cell,
  label,
  sub,
  testId,
}: {
  rows: readonly SupportAnalyticsRow[];
  first: 'channel' | 'person';
  texts: AnalyticsTexts;
  cell: AnalyticsCell;
  label: (r: SupportAnalyticsRow) => string;
  sub: (r: SupportAnalyticsRow) => string;
  testId: string;
}) {
  if (!rows.length) return <p className="a2-sm a2-mute a2-mt6">{texts.none}</p>;
  const c = texts.col;
  return (
    <div className="a2-tblw a2-mt12">
      <table className="a2-tbl sp-an-tbl" data-testid={testId}>
        <thead>
          <tr>
            <th>{c[first]}</th>
            <th className="r">{c.chats}</th>
            <th className="r">{c.replies}</th>
            <th className="r">{c.tickets}</th>
            <th className="r">{c.first}</th>
            <th className="r">{c.resolve}</th>
            <th className="r">{c.late}</th>
            <th className="r">{c.conversion}</th>
            <th className="r">{c.sales}</th>
            <th className="r">{c.followUps}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} data-testid="support-analytics-row" data-kind={r.kind}>
              <td className="a2-tdh">
                <b>{label(r)}</b>
                {sub(r) ? <span className="sp-an-sub">{sub(r)}</span> : null}
              </td>
              <td className="r" data-l={c.chats}>
                {cell.n(r.chats)}
              </td>
              <td className="r" data-l={c.replies}>
                {cell.n(r.replies)}
              </td>
              <td className="r" data-l={c.tickets}>
                {cell.n(r.tickets)}
              </td>
              <td className="r sp-an-num" data-l={c.first}>
                {cell.mins(r.firstMedian)}
                {r.firstAverage !== null ? <span className="sp-an-sub">{cell.avg(r.firstAverage)}</span> : null}
              </td>
              <td className="r sp-an-num" data-l={c.resolve}>
                {cell.mins(r.resolveMedian)}
                {r.resolveAverage !== null ? <span className="sp-an-sub">{cell.avg(r.resolveAverage)}</span> : null}
              </td>
              <td className={`r sp-an-num${r.late ? ' sp-late' : ''}`} data-l={c.late}>
                {cell.pct(r.lateRate)}
                <span className="sp-an-sub">{cell.n(r.late)}</span>
              </td>
              <td className="r sp-an-num" data-l={c.conversion}>
                {cell.pct(r.conversion)}
                <span className="sp-an-sub">{cell.ordered(r.orders)}</span>
              </td>
              <td className="r sp-an-num" data-l={c.sales}>
                {cell.m(r.salesMinor)}
                <span className="sp-an-sub">{cell.m(r.orderedMinor)}</span>
              </td>
              <td className="r sp-an-num" data-l={c.followUps}>
                {cell.sent(r.followUpsSent, r.followUpsOrdered)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

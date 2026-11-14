// S28 · PR 714-717 — small parts the four v5 report pages share (server components): a table in its own scroll frame, and the
// "How these figures are worked out" fold, which is this report's version of the "explain this number" view (each figure says
// what it counts and where the full figure lives).
import type { ReactNode } from 'react';
import { t, type Dict } from '@/lib/i18n';

export interface Col {
  h: string;
  right?: boolean;
}

export function ReportTable({ cols, rows, testId, rowId, empty }: { cols: readonly Col[]; rows: readonly (readonly ReactNode[])[]; testId: string; rowId: string; empty: string }) {
  if (!rows.length) return <p className="a2-sm a2-mute" data-testid={`${testId}-empty`}>{empty}</p>;
  return (
    <div style={{ overflowX: 'auto' }} data-testid={testId}>
      <table className="a2-table">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.h} style={c.right ? { textAlign: 'right' } : undefined}>
                {c.h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} data-testid={rowId}>
              {r.map((v, n) => (
                <td key={n} style={cols[n]?.right ? { textAlign: 'right', whiteSpace: 'nowrap' } : undefined}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HowFigures({ dict, items, testId }: { dict: Dict; items: readonly { label: string; how: string; href?: string; linkText?: string }[]; testId: string }) {
  return (
    <details className="a2-card a2-mt12" data-testid={testId}>
      <summary className="a2-h4">{t(dict, 'reportsV5.common.howH')}</summary>
      <p className="a2-xs a2-mute a2-mt6">{t(dict, 'reportsV5.common.howSub')}</p>
      <div className="a2-mt12">
        {items.map((x) => (
          <div key={x.label} className="a2-rule">
            <span>
              <b>{x.label}</b>
              <span className="a2-xs a2-mute cl-sub">{x.how}</span>
            </span>
            <span />
            {x.href ? (
              <a className="a2-lnk cr-link" href={x.href}>
                {x.linkText}
              </a>
            ) : (
              <span />
            )}
          </div>
        ))}
      </div>
    </details>
  );
}

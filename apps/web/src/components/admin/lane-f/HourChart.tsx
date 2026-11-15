// Inbox › Response times: one column chart by hour of the day (prototype v5 A.chart.columns). Plain HTML bars, the hour
// under each, and the figures as text for a screen reader.
import { type ReactNode } from 'react';

export function HourChart({ title, sub, hours, values, tone = 'ac', testId }: { title: string; sub: string; hours: readonly number[]; values: readonly number[]; tone?: 'ac' | 'ok'; testId: string }): ReactNode {
  const max = Math.max(1, ...values);
  return (
    <section className="a2-card lf-hc" data-testid={testId}>
      <h2 className="a2-h3">{title}</h2>
      <p className="a2-xs a2-mute">{sub}</p>
      <ol className="lf-hc-cols" aria-label={title}>
        {hours.map((h, i) => {
          const v = values[i] ?? 0;
          return (
            <li key={h} className="lf-hc-col" title={`${h}:00 · ${v}`}>
              <span className="lf-hc-v">{v || ''}</span>
              <span className={`lf-hc-bar ${tone}`} style={{ height: `${Math.round((v / max) * 100)}%` }} aria-hidden="true" />
              <span className="lf-hc-h">{h}</span>
              <span className="a2-sr">{`${h}:00 — ${v}`}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// Parity round 3, lane F2 (PR 823) — the three cards the prototype v5 puts above the offers list: "Awaiting your approval",
// "Heads up" (offers that could apply to the same cart) and the 5-week "Calendar" with the line for today. Pure display: the
// screen gives the rows and the words; colours are --lm-* tokens.
import type { ReactNode } from 'react';
import './offer-parts.css';

export interface AwaitingItem {
  id: string;
  name: string;
  line: string;
}

export function AwaitingCard({ title, sub, items, review, onReview }: { title: string; sub: string; items: readonly AwaitingItem[]; review: string; onReview: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <section className="rh-card of-aw-card" data-testid="of-awaiting" aria-label={title}>
      <div className="rh-cardhd">
        <div>
          <h3>{title}</h3>
          <p className="rh-hint">{sub}</p>
        </div>
      </div>
      {items.map((x) => (
        <div key={x.id} className="of-aw" data-testid={`of-aw-${x.id}`}>
          <div className="of-awt">
            <div className="of-n">{x.name}</div>
            <div className="of-sub">{x.line}</div>
          </div>
          <button type="button" className="ad-btn ad-btn-primary ad-btn-sm" onClick={() => onReview(x.id)}>
            {review}
          </button>
        </div>
      ))}
    </section>
  );
}

export interface HeadItem {
  id: string;
  text: string;
  href: string;
}

export function HeadsUp({ title, sub, none, items, open }: { title: string; sub: string; none: string; items: readonly HeadItem[]; open: string }) {
  return (
    <section className="rh-card" data-testid="of-heads" aria-label={title}>
      <div className="rh-cardhd">
        <div>
          <h3>{title}</h3>
          <p className="rh-hint">{sub}</p>
        </div>
      </div>
      {items.length ? (
        items.slice(0, 4).map((x) => (
          <div key={x.id} className="of-warn">
            <span>{x.text}</span>
            <a className="of-open" href={x.href}>
              {open}
            </a>
          </div>
        ))
      ) : (
        <p className="of-sub">{none}</p>
      )}
    </section>
  );
}

export interface CalItem {
  id: string;
  name: string;
  /** 0–100, from the start of the window. */
  left: number;
  width: number;
  scheduled: boolean;
}

export function OfferCalendar({ title, sub, none, items, todayAt, ticks }: { title: string; sub: string; none: string; items: readonly CalItem[]; todayAt: number; ticks: readonly string[] }): ReactNode {
  return (
    <section className="rh-card" data-testid="of-calendar" aria-label={title}>
      <div className="rh-cardhd">
        <div>
          <h3>{title}</h3>
          <p className="rh-hint">{sub}</p>
        </div>
      </div>
      {items.length ? (
        <div className="of-cal">
          {items.map((x) => (
            <div key={x.id} className="of-cr">
              <span className="of-nm" title={x.name}>
                {x.name}
              </span>
              <span className="of-tr">
                <span className={`of-bar${x.scheduled ? ' sch' : ''}`} style={{ left: `${x.left}%`, width: `${Math.max(2, x.width)}%` }} />
                <span className="of-today" style={{ left: `${todayAt}%` }} />
              </span>
            </div>
          ))}
          <div className="of-ax">
            <span />
            <div>
              {ticks.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <p className="of-sub">{none}</p>
      )}
    </section>
  );
}

const DAY = 86_400_000; // hardcode-ok: ms in a day
/** The calendar window: 1 week back and 5 weeks forward from today, as the prototype draws it (pure). */
export function calendarOf(rows: readonly { id: string; name: string; startsAt: string | null; endsAt: string | null; scheduled: boolean }[], now: Date, fmt: (d: Date) => string): { items: CalItem[]; todayAt: number; ticks: string[] } {
  const start = now.getTime() - 7 * DAY; // hardcode-ok: a week back
  const span = 42 * DAY; // hardcode-ok: six weeks shown
  const pc = (ms: number) => Math.max(0, Math.min(100, ((ms - start) / span) * 100)); // hardcode-ok: percent
  const items = rows.slice(0, 9).map((r) => {
    const a = r.startsAt ? pc(Date.parse(r.startsAt)) : 0;
    const b = r.endsAt ? pc(Date.parse(r.endsAt)) : 100; // hardcode-ok: percent
    return { id: r.id, name: r.name, left: a, width: Math.max(0, b - a), scheduled: r.scheduled };
  });
  return { items, todayAt: pc(now.getTime()), ticks: [0, 14, 28, 42].map((n) => fmt(new Date(start + n * DAY))) }; // hardcode-ok: two-week ticks
}

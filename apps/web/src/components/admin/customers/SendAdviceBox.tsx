'use client';
// S14 · PR 294 — "Who and when" on an e-mail send's form (Messages › E-mail › a draft send): the saved segments ranked by
// how many of their people bought recently and can get offer e-mails, and the hours and weekday the store's orders come
// in (outside the quiet hours), each with its numbers. "Use this segment" picks it in the form; "Send at that time"
// fills the time (once the draft is saved), at the store's hour (advice-time.ts). Advice only: the person still saves and schedules, and scheduling asks.
// Shown only while `customers.sendAdvice` is on (the page reads it with @extas/customers sendAdvice).
import type { SendAdvice } from '@extas/customers';
import { t, type Dict } from '@/lib/i18n';
import { nextStoreHour } from './advice-time';

export interface SendAdviceBoxProps {
  dict: Dict;
  advice: SendAdvice;
  /** The page's locale for weekday names (bn-BD, en-GB …). */
  locale: string;
  segmentId: string;
  canPickTime: boolean;
  disabled?: boolean;
  onSegment: (id: string) => void;
  onTime: (local: string) => void;
}

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
const pct = (a: number, b: number) => String(b ? Math.round((a / b) * 100) : 0);

/** A weekday's name (0 = Sunday) in the page's language. */
const dayName = (d: number, locale: string) => new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 4 + d)));

export function SendAdviceBox({ dict: d, advice: a, locale, segmentId, canPickTime, disabled, onSegment, onTime }: SendAdviceBoxProps) {
  const x = (k: string, v?: Record<string, string>) => t(d, `cus.advice.${k}`, v);
  const tm = a.timing;
  return (
    <div className="mail-advice" data-testid="send-advice">
      <h2 className="a2-h3">{x('title')}</h2>
      <p className="a2-xs a2-mute">{x('sub', { days: String(a.lookbackDays) })}</p>
      <h3 className="a2-sm a2-b">{x('who')}</h3>
      {a.segments.length ? (
        a.segments.map((s) => (
          <div key={s.id} className="mail-advice-row" data-testid="send-advice-segment">
            <div className="a2-prt">
              <b>{s.name}</b>
              <span className="a2-xs a2-mute">{x('why', { buyers: String(s.buyers), people: String(s.people), pct: pct(s.buyers, s.people), days: String(a.lookbackDays), reach: String(s.reachable) })}</span>
            </div>
            {s.id === segmentId ? (
              <span className="a2-pill ok">{x('picked')}</span>
            ) : (
              <button type="button" className="a2-btn" disabled={disabled} onClick={() => onSegment(s.id)} data-testid="send-advice-use">
                {x('useSegment')}
              </button>
            )}
          </div>
        ))
      ) : (
        <p className="a2-xs a2-mute">{x('noSegments')}</p>
      )}
      <h3 className="a2-sm a2-b">{x('when')}</h3>
      {tm.ok ? (
        <div className="mail-advice-row" data-testid="send-advice-time">
          <div className="a2-prt">
            <b>{x('window', { from: hh(tm.fromHour), to: hh(tm.toHour) })}</b>
            <span className="a2-xs a2-mute">
              {x('windowWhy', { n: String(tm.inWindow), total: String(tm.orders), pct: pct(tm.inWindow, tm.orders) })} {x('dayWhy', { day: dayName(tm.weekday, locale), n: String(tm.onWeekday) })}
              {a.quiet ? ` ${x('quietWhy', { from: hh(a.quiet.fromHour), to: hh(a.quiet.toHour) })}` : ''}
            </span>
          </div>
          {canPickTime ? (
            <button type="button" className="a2-btn" disabled={disabled} onClick={() => onTime(nextStoreHour(tm.fromHour, a.timeZone))} data-testid="send-advice-time-use">
              {x('useTime')}
            </button>
          ) : null}
        </div>
      ) : (
        <p className="a2-xs a2-mute">{tm.blocked ? x('quietBlocked') : x('fewOrders', { n: String(tm.orders), needed: String(tm.needed) })}</p>
      )}
    </div>
  );
}

// S13 · PR 282 — the marketing calendar's bars (demo 97x-adm2-marketing.js x2Cal): a header with the view's first day and
// each first of the month, one row per item with its bar across the view's days (or a festive rule's band days as
// marks), and the legend. Used on Marketing › Calendar and, the same view, on Marketing › Campaigns. Reads only.
import Link from 'next/link';
import { t, type Dict } from '@/lib/i18n';
import { barOf, CALENDAR_LANES, itemsOn, markAt, monthMarks, type CalendarItem, type CalendarRange } from '@/lib/marketing/calendar-model';

export interface CalendarViewWords {
  /** The lane names (plan, campaign, ads, …). */
  lane: Record<string, string>;
  state: Record<string, string>;
  mark: string;
  open: string;
  empty: string;
}

/** The bars' words from the page's dictionary (messages/admin-calendar.*.json, `mc.*`). */
export function calendarWords(d: Dict): CalendarViewWords {
  const g = (k: string) => t(d, `mc.${k}`);
  return {
    lane: Object.fromEntries(CALENDAR_LANES.map((l) => [l, g(`lane.${l}`)])),
    state: Object.fromEntries(['live', 'scheduled', 'ended', 'off'].map((s) => [s, g(`state.${s}`)])),
    mark: g('mark'),
    open: g('openEnd'),
    empty: g('bars.empty'),
  };
}

export const itemTitle = (i: CalendarItem, bn: boolean) => (bn && i.title.bn) || i.title.en;

export function CalendarBars({ items, range, locale, bn, w, testId = 'mc-bars' }: { items: CalendarItem[]; range: CalendarRange; locale: string; bn: boolean; w: CalendarViewWords; testId?: string }) {
  const short = (day: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(`${day}T00:00:00Z`));
  if (!items.length) return <p className="a2-sm a2-mute" data-testid={`${testId}-empty`}>{w.empty}</p>;
  return (
    <div data-testid={testId}>
      <div className="mc-cal" role="list">
        <div className="mc-row mc-head" aria-hidden="true">
          <span className="mc-t" />
          <div className="mc-b">
            {monthMarks(range).map((m) => (
              <span key={m.day} style={{ left: `${m.left}%` }}>
                {short(m.day)}
              </span>
            ))}
          </div>
        </div>
        {items.map((i) => {
          const title = itemTitle(i, bn);
          const when = i.marks?.length ? i.marks.map((m) => `${m.label} ${short(m.day)}`).join(', ') : `${short(i.starts)}${i.ends ? ` – ${short(i.ends)}` : i.open ? ` – ${w.open}` : ''}`;
          const label = `${w.lane[i.lane] ?? i.lane} · ${title} · ${when} · ${w.state[i.state] ?? i.state}`;
          const bar = barOf(i, range);
          return (
            <div key={i.id} className="mc-row" role="listitem" data-testid="mc-bar" data-lane={i.lane} data-state={i.state}>
              <span className="mc-t" title={label}>
                {i.href ? <Link href={i.href}>{title}</Link> : title}
              </span>
              <div className="mc-b" aria-label={label}>
                {i.marks?.length ? (
                  i.marks.map((m, n) => {
                    const at = markAt(m.day, range);
                    return at === null ? null : <b key={`${m.day}-${n}`} style={{ left: `${at}%` }} title={`${m.label} · ${short(m.day)}`} />;
                  })
                ) : (
                  <i className={i.state} style={{ left: `${bar.left}%`, width: `${bar.width}%` }} />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="a2-legend a2-mt12">
        {(['live', 'scheduled', 'ended', 'off'] as const).map((s) => (
          <span key={s}>
            <i className={`mc-lg ${s}`} aria-hidden="true" />
            {w.state[s]}
          </span>
        ))}
        <span>
          <i className="mc-lg mark" aria-hidden="true" />
          {w.mark}
        </span>
      </div>
    </div>
  );
}

/** Follow-up 656 — the month view's words (`mc.month.*`). */
export interface MonthWords {
  /** "+{n} more" on a day with more items than shown. */
  more: (n: number) => string;
  empty: string;
}

/**
 * Follow-up 656 — the month as a grid of weeks (the shop's own locale's first weekday): each day with its number and
 * the items running on it (a festive rule on its band days), coloured by state; days outside the month are faded.
 * On a phone each item is a dot with its title for screen readers, so the seven columns fit; the day-by-day list below
 * names them. Reads only.
 */
export function CalendarMonth({ items, weeks, today, locale, bn, w, mw, perDay, testId = 'mc-month' }: { items: CalendarItem[]; weeks: { day: string; out: boolean }[][]; today: string; locale: string; bn: boolean; w: CalendarViewWords; mw: MonthWords; perDay: number; testId?: string }) {
  const dow = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  const num = new Intl.NumberFormat(locale, { numberingSystem: 'latn' });
  const long = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC', numberingSystem: 'latn' });
  const at = (day: string) => new Date(`${day}T00:00:00Z`);
  return (
    <div data-testid={testId}>
      <div className="mc-month" role="table">
        <div className="mc-week mc-dow" role="row">
          {(weeks[0] ?? []).map((c) => (
            <span key={c.day} role="columnheader">
              {dow.format(at(c.day))}
            </span>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]!.day} className="mc-week" role="row">
            {week.map((c) => {
              const on = c.out ? [] : itemsOn(items, c.day);
              const shown = on.slice(0, perDay);
              return (
                <div key={c.day} role="cell" className={`mc-day${c.out ? ' out' : ''}${c.day === today ? ' today' : ''}`} aria-label={`${long.format(at(c.day))}${on.length ? ` · ${on.map((i) => itemTitle(i, bn)).join(', ')}` : ''}`} data-testid="mc-day" data-day={c.day} data-n={on.length}>
                  <span className="mc-dn" aria-hidden="true">
                    {num.format(Number(c.day.slice(8)))}
                  </span>
                  {shown.map((i) => (
                    <span key={i.id} className={`mc-chip ${i.state}`} data-lane={i.lane} title={`${w.lane[i.lane] ?? i.lane} · ${itemTitle(i, bn)} · ${w.state[i.state] ?? i.state}`} aria-hidden="true">
                      <span className="mc-ct">{itemTitle(i, bn)}</span>
                    </span>
                  ))}
                  {on.length > shown.length ? (
                    <span className="mc-more" aria-hidden="true">
                      {mw.more(on.length - shown.length)}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {items.length ? null : <p className="a2-sm a2-mute a2-mt12" data-testid={`${testId}-empty`}>{mw.empty}</p>}
    </div>
  );
}

// S13 · PR 282 — the marketing calendar's bars (demo 97x-adm2-marketing.js x2Cal): a header with the view's first day and
// each first of the month, one row per item with its bar across the view's days (or a festive rule's band days as
// marks), and the legend. Used on Marketing › Calendar and, the same view, on Marketing › Campaigns. Reads only.
import Link from 'next/link';
import { t, type Dict } from '@/lib/i18n';
import { barOf, CALENDAR_LANES, markAt, monthMarks, type CalendarItem, type CalendarRange } from '@/lib/marketing/calendar-model';

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

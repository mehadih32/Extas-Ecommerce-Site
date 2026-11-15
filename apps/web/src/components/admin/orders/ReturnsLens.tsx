// PR 828 (prototype v5, Orders › Returns & exchanges): above the board, the date bar (Any date, Today, Yesterday, 7 days,
// This month, Last month, Custom), the reminder strip (what needs a person today) and the chip tabs with their counts.
// Drawn on the server; every chip is a link, so the page opens the same from a shared address. Nothing here changes a case.
import Link from 'next/link';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { formatNumber } from '@/components/admin/products/model';
import type { AdminView } from '@/lib/admin-page';
import { DATE_PRESETS, dayOf, presetOf, presetRange } from '@/lib/admin-orders/range';
import { RETURN_TABS, type ReturnTab, type Reminders } from '@/lib/admin-returns/lens';
import { returnsHref } from '@/lib/admin-returns/model';
import { t } from '@/lib/i18n';

type Counts = Record<Exclude<ReturnTab, 'handed'>, number>;

const lt = (view: AdminView, k: string, vars?: Record<string, string | number>) => t(view.dict, `returns.lens.${k}`, vars);

export function ReturnsLens({ view, tab, from, to, counts, reminders, handbackHref, now }: { view: AdminView; tab: string | null; from: string | undefined; to: string | undefined; counts: Counts; reminders: Reminders; handbackHref: string | null; now: Date }) {
  const n = (x: number) => formatNumber(x, view.locale);
  const today = dayOf(now, view.timeZone);
  const cur = presetOf(from, to, today);
  const custom = !!(from || to) && !cur;
  const href = (over: Record<string, string | null>) => returnsHref({ tab, from: from ?? null, to: to ?? null, ...over });
  const strip: { key: Exclude<ReturnTab, 'handed'>; count: number; text: string; tone: 'warn' }[] = [
    { key: 'requests', count: reminders.requests, text: lt(view, 'rem.requests'), tone: 'warn' },
    { key: 'coming', count: reminders.comingSoon, text: lt(view, 'rem.coming'), tone: 'warn' },
    { key: 'waiting', count: reminders.waiting, text: lt(view, 'rem.waiting'), tone: 'warn' },
  ];
  return (
    <div data-testid="returns-lens">
      <nav className="a2-views a2-dbar a2-mt12" aria-label={lt(view, 'dateLabel')} data-testid="returns-datebar">
        <Link className={`a2-view${!from && !to ? ' on' : ''}`} href={href({ from: null, to: null })} scroll={false} aria-current={!from && !to ? 'page' : undefined}>
          {lt(view, 'date.any')}
        </Link>
        {DATE_PRESETS.map((p) => {
          const r = presetRange(p, today);
          return (
            <Link key={p} className={`a2-view${cur === p ? ' on' : ''}`} href={href({ from: r.from, to: r.to })} scroll={false} aria-current={cur === p ? 'page' : undefined}>
              {lt(view, `date.${p}`)}
            </Link>
          );
        })}
        <span className={`a2-view${custom ? ' on' : ''}`} aria-hidden="true">
          {lt(view, 'date.custom')}
        </span>
      </nav>
      <form className="a2-gap8 a2-mt6 d4-range" method="get" action={returnsHref()} data-testid="returns-range">
        {tab ? <input type="hidden" name="tab" value={tab} /> : null}
        <label className="a2-xs">
          {lt(view, 'date.from')}
          <input className="a2-inp" type="date" name="from" defaultValue={from ?? ''} />
        </label>
        <label className="a2-xs">
          {lt(view, 'date.to')}
          <input className="a2-inp" type="date" name="to" defaultValue={to ?? ''} />
        </label>
        <button type="submit" className="a2-btn">
          {lt(view, 'date.go')}
        </button>
      </form>
      <div className="d4-rem a2-mt12" role="list" aria-label={lt(view, 'rem.label')} data-testid="returns-reminders">
        {strip.map((x) => (
          <Link key={x.key} role="listitem" className={`d4-rem-i ${x.count ? x.tone : 'ok'}`} href={href({ tab: x.key })} scroll={false} data-testid={`returns-rem-${x.key}`}>
            <ShellIcon name={x.count ? 'alert' : 'check'} size={15} />
            <span>
              <b>{n(x.count)}</b> · {x.text}
            </span>
          </Link>
        ))}
      </div>
      <nav className="a2-views a2-mt12" aria-label={lt(view, 'tabs')} data-testid="returns-tabs">
        {RETURN_TABS.map((k) =>
          k === 'handed' ? (
            handbackHref ? (
              <Link key={k} className="a2-view" href={handbackHref} data-testid="returns-tab-handed">
                {lt(view, 'tab.handed')}
              </Link>
            ) : null
          ) : (
            <Link key={k} className={`a2-view${tab === k ? ' on' : ''}`} href={href({ tab: tab === k ? null : k })} scroll={false} aria-current={tab === k ? 'page' : undefined} data-testid={`returns-tab-${k}`}>
              {lt(view, `tab.${k}`)}
              <span className="a2-cnt">{n(counts[k])}</span>
            </Link>
          ),
        )}
      </nav>
    </div>
  );
}


// S28 · PR 705 — Settings → Activity log: who changed what, and who looked at a customer's details. Read-only: no button
// here edits or removes anything. Filters are a plain form (the address carries them), the CSV is a link to the route.
// PR 1162 (p101, prototype v5 m-settings.js `renderActivity`): a "Changes" card (search, one chip per person, When / Who /
// What) and under it a "Who viewed customer data" card (When / Staff / What, "Every phone number or address opened is
// recorded"); "Download" sits in the page head. Every event key is shown in plain words (lib/activity-words.ts), never as
// its code name. The views card's "See all" opens the whole views list with paging (kind=views).
import Link from 'next/link';
import { t, type Dict } from '@/lib/i18n';
import type { ActivityRow, ActivityView } from '@/lib/activity-log';
import { actionWords } from '@/lib/activity-words';

export interface ActivityScreenProps {
  dict: Dict;
  view: ActivityView;
  tz: string;
}

const HERE = '/admin/settings/activity';
type Q = Partial<Record<'kind' | 'who' | 'text' | 'from' | 'to' | 'page', string | number | null>>;

/** The query string for this page with some filters changed. */
export function activityQs(v: ActivityView, o: Q): string {
  const f = v.filters;
  const m = { kind: f.kind, who: f.who, text: f.text, from: f.from, to: f.to, page: f.page, ...o };
  const u = new URLSearchParams();
  for (const [k, val] of Object.entries(m)) if (val !== null && val !== '' && val !== undefined && !(k === 'page' && val === 1) && !(k === 'kind' && val === 'changes')) u.set(k, String(val));
  return u.toString();
}

/** The "Download" button of the page head (the filtered rows as CSV). */
export function ActivityDownload({ dict, view }: { dict: Dict; view: ActivityView }) {
  return (
    <a className="a2-btn" href={`/api/admin/activity-log?${activityQs(view, { page: 1 })}&format=csv`} data-testid="al-csv">
      {t(dict, 'people.activity.download')}
    </a>
  );
}

export function ActivityScreen(p: ActivityScreenProps) {
  const c = (k: string, vars?: Record<string, string | number>) => t(p.dict, `people.activity.${k}`, vars);
  const v = p.view;
  const f = v.filters;
  const qs = (o: Q) => activityQs(v, o);
  const when = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: p.tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
  const viewWords = (r: ActivityRow) => {
    const key = `views.${r.action.replace(/[.:-]/g, '_')}`;
    const name = r.customer || c('views.someone');
    const s = c(key, { name });
    return s === `people.activity.${key}` ? c('views.other', { name }) : s;
  };
  const chips = (kind: 'changes' | 'views') => (
    <div className="s28-row" role="group" aria-label={c('filters.who')} data-testid="al-people">
      {/* prototype v5: the search box sits first in the row, before the person chips */}
      <form method="get" action={HERE} role="search" data-testid="al-search">
        {kind === 'views' ? <input type="hidden" name="kind" value="views" /> : null}
        {f.who ? <input type="hidden" name="who" value={f.who} /> : null}
        {f.from ? <input type="hidden" name="from" value={f.from} /> : null}
        {f.to ? <input type="hidden" name="to" value={f.to} /> : null}
        <input className="a2-inp" type="search" name="text" defaultValue={f.text} maxLength={60} placeholder={c('filters.search')} aria-label={c('filters.text')} style={{ maxWidth: 260 }} />
      </form>
      {[{ id: '', name: c('filters.anyone') }, ...v.people].map((x) => (
        <Link key={x.id || 'all'} className="s28-chip" href={`${HERE}?${qs({ kind, who: x.id || null, page: 1 })}`} aria-current={(f.who ?? '') === x.id ? 'page' : undefined} style={(f.who ?? '') === x.id ? { fontWeight: 700 } : undefined}>
          {x.name}
        </Link>
      ))}
    </div>
  );
  const viewsTable = (rows: readonly ActivityRow[]) =>
    rows.length ? (
      <div className="tbl-wrap a2-mt6" data-testid="al-views">
        <table className="a2-tbl">
          <thead>
            <tr>
              <th>{c('cols.when')}</th>
              <th>{c('cols.staff')}</th>
              <th>{c('cols.what')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="a2-xs">{when(r.at)}</td>
                <td>
                  <b>{r.who || c(`actor.${r.whoType}`)}</b>
                </td>
                <td className="a2-sm">{viewWords(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <p className="a2-sm a2-mute a2-mt6">{c('viewsEmpty')}</p>
    );
  const paging = (
    <div className="s28-row a2-mt12">
      {f.page > 1 ? <Link className="a2-btn" href={`${HERE}?${qs({ page: f.page - 1 })}`}>{c('newer')}</Link> : null}
      <span className="a2-xs a2-mute">{c('page', { n: f.page })}</span>
      {v.more ? <Link className="a2-btn" href={`${HERE}?${qs({ page: f.page + 1 })}`}>{c('older')}</Link> : null}
    </div>
  );
  const search = (
    <details className="a2-mt6" open={Boolean(f.from || f.to)}>
      <summary className="a2-xs">{c('filters.more')}</summary>
      <form method="get" action={HERE} className="s28-row a2-mt6" data-testid="al-filters">
        {f.kind === 'views' ? <input type="hidden" name="kind" value="views" /> : null}
        {f.who ? <input type="hidden" name="who" value={f.who} /> : null}
        {f.text ? <input type="hidden" name="text" value={f.text} /> : null}
        <label>{c('filters.from')}<input className="a2-inp" type="date" name="from" defaultValue={f.from ?? ''} /></label>
        <label>{c('filters.to')}<input className="a2-inp" type="date" name="to" defaultValue={f.to ?? ''} /></label>
        <button type="submit" className="a2-btn">{c('filters.apply')}</button>
        <Link className="a2-btn" href={`${HERE}${f.kind === 'views' ? '?kind=views' : ''}`}>{c('filters.clear')}</Link>
      </form>
    </details>
  );

  if (f.kind === 'views')
    return (
      <>
        <section className="a2-card a2-mt12" aria-labelledby="al-views-h">
          <div className="s28-row">
            <h2 className="a2-h3" id="al-views-h">{c('kinds.views')}</h2>
            <span className="grow" />
            <Link className="s28-chip" href={`${HERE}?${qs({ kind: 'changes', page: 1 })}`}>{c('kinds.changes')}</Link>
          </div>
          <p className="a2-xs a2-mute">{c('sub.views')}</p>
          <div className="a2-mt6">{chips('views')}</div>
          {search}
          {viewsTable(v.rows)}
          {paging}
        </section>
        <p className="a2-xs a2-mute a2-mt12">{c('note')}</p>
      </>
    );

  return (
    <>
      <section className="a2-card a2-mt12" aria-labelledby="al-changes-h">
        <h2 className="a2-h3" id="al-changes-h">{c('kinds.changes')}</h2>
        <p className="a2-xs a2-mute">{c('sub.changes')}</p>
        <div className="a2-mt6">{chips('changes')}</div>
        {search}
        {v.rows.length ? (
          <div className="tbl-wrap a2-mt12" data-testid="al-rows">
            <table className="a2-tbl">
              <thead>
                <tr>
                  <th>{c('cols.when')}</th>
                  <th>{c('cols.who')}</th>
                  <th>{c('cols.what')}</th>
                </tr>
              </thead>
              <tbody>
                {v.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="a2-xs">{when(r.at)}</td>
                    <td>
                      <b className="a2-sm">{r.who || c(`actor.${r.whoType}`)}</b>
                    </td>
                    <td className="a2-sm">
                      {actionWords(p.dict, r.action)}
                      {r.fields.length ? <div className="a2-xs a2-mute">{c('fields', { list: r.fields.join(', ') })}</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="a2-sm a2-mute a2-mt12" data-testid="al-empty">{c('empty')}</p>
        )}
        {paging}
      </section>
      <section className="a2-card a2-mt12" aria-labelledby="al-views-h">
        <div className="s28-row">
          <h2 className="a2-h3" id="al-views-h">{c('kinds.views')}</h2>
          <span className="grow" />
          <Link className="a2-btn" href={`${HERE}?${qs({ kind: 'views', page: 1, text: null })}`}>{c('seeAll')}</Link>
        </div>
        <p className="a2-xs a2-mute">{c('sub.views')}</p>
        {viewsTable(v.views)}
      </section>
      <p className="a2-xs a2-mute a2-mt12">{c('note')}</p>
    </>
  );
}

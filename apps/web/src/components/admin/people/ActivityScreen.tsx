// S28 · PR 705 — Settings → Activity log: who changed what, and who looked at a customer's details. Read-only: no button
// here edits or removes anything. Filters are a plain form (the address carries them), the CSV is a link to the route.
import Link from 'next/link';
import { t, type Dict } from '@/lib/i18n';
import type { ActivityView } from '@/lib/activity-log';

export interface ActivityScreenProps {
  dict: Dict;
  view: ActivityView;
  tz: string;
}

const HERE = '/admin/settings/activity';

export function ActivityScreen(p: ActivityScreenProps) {
  const c = (k: string, vars?: Record<string, string | number>) => t(p.dict, `people.activity.${k}`, vars);
  const v = p.view;
  const f = v.filters;
  const qs = (o: Partial<Record<'kind' | 'who' | 'text' | 'from' | 'to' | 'page', string | number | null>>) => {
    const m = { kind: f.kind, who: f.who, text: f.text, from: f.from, to: f.to, page: f.page, ...o };
    const u = new URLSearchParams();
    for (const [k, val] of Object.entries(m)) if (val !== null && val !== '' && val !== undefined && !(k === 'page' && val === 1)) u.set(k, String(val));
    return u.toString();
  };
  const when = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: p.tz, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  const kinds = ['changes', 'views'] as const;
  return (
    <>
      <div className="s28-row a2-mt12" role="tablist">
        {kinds.map((k) => (
          <Link key={k} className="s28-chip" href={`${HERE}?${qs({ kind: k, page: 1 })}`} aria-current={f.kind === k ? 'page' : undefined} style={f.kind === k ? { fontWeight: 700 } : undefined}>{c(`kinds.${k}`)}</Link>
        ))}
        <span className="grow" />
        <a className="a2-btn" href={`/api/admin/activity-log?${qs({ page: 1 })}&format=csv`} data-testid="al-csv">{c('download')}</a>
      </div>
      <p className="a2-xs a2-mute a2-mt6">{c(`sub.${f.kind}`)}</p>
      <form method="get" action={HERE} className="s28-row a2-mt6" data-testid="al-filters">
        <input type="hidden" name="kind" value={f.kind} />
        <label>{c('filters.who')}
          <select className="a2-inp" name="who" defaultValue={f.who ?? ''}>
            <option value="">{c('filters.anyone')}</option>
            {v.people.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <label>{c('filters.text')}<input className="a2-inp" name="text" defaultValue={f.text} maxLength={60} /></label>
        <label>{c('filters.from')}<input className="a2-inp" type="date" name="from" defaultValue={f.from ?? ''} /></label>
        <label>{c('filters.to')}<input className="a2-inp" type="date" name="to" defaultValue={f.to ?? ''} /></label>
        <button type="submit" className="a2-btn">{c('filters.apply')}</button>
        <Link className="a2-btn" href={`${HERE}?kind=${f.kind}`}>{c('filters.clear')}</Link>
      </form>
      {v.rows.length ? (
        <div className="tbl-wrap a2-mt12" data-testid="al-rows">
          <table className="a2-tbl">
            <thead>
              <tr>
                <th>{c('cols.when')}</th>
                <th>{c('cols.who')}</th>
                <th>{c('cols.what')}</th>
                <th>{c('cols.record')}</th>
              </tr>
            </thead>
            <tbody>
              {v.rows.map((r) => (
                <tr key={r.id}>
                  <td className="a2-xs">{when(r.at)}</td>
                  <td>{r.who || c(`actor.${r.whoType}`)}</td>
                  <td>
                    {r.action}
                    {r.fields.length ? <div className="a2-xs a2-mute">{c('fields', { list: r.fields.join(', ') })}</div> : null}
                  </td>
                  <td className="a2-xs">{r.entity}{r.entityId ? ` ${r.entityId.slice(0, 8)}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="a2-sm a2-mute a2-mt12" data-testid="al-empty">{c('empty')}</p>
      )}
      <div className="s28-row a2-mt12">
        {f.page > 1 ? <Link className="a2-btn" href={`${HERE}?${qs({ page: f.page - 1 })}`}>{c('newer')}</Link> : null}
        <span className="a2-xs a2-mute">{c('page', { n: f.page })}</span>
        {v.more ? <Link className="a2-btn" href={`${HERE}?${qs({ page: f.page + 1 })}`}>{c('older')}</Link> : null}
      </div>
      <p className="a2-xs a2-mute a2-mt12">{c('note')}</p>
    </>
  );
}

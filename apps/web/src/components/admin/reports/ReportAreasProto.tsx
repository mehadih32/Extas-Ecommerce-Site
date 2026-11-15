// PR 798 (prototype v5 Reports › Areas): the report as the prototype draws it — the answers box, four figures and two chips, the map-like
// view (a heat tile per place, or bars) with the path Bangladesh › division › district › thana › area on top, the top products of the place,
// "Where it sells" for a product or category, and the table of every place (a row goes one level deeper, or opens the orders at the
// last level). Server component; the path, metric and view live in the address, so every tap is a link. Figures come from lib/reports-v5/areas.ts.
import Link from 'next/link';
import { BarList } from './ReportCharts';
import { ReportAnswers, type AnswerLine } from './ReportAnswers';
import { SortTable, type STRow } from './SortTable';
import { SummaryTiles, type SummaryTile } from '../lumen/SummaryTiles';
import { AREA_METRICS, areaStats, inPath, metricOf, tileHeat, topProducts, whereItSells, type AreaMetric, type AreaStat, type GeoOrder } from '@/lib/reports-v5/areas';
import type { ReportFmt } from '@/lib/reports-v5/fmt';
import { PLACE_LEVELS, nameAt } from '@/lib/reports-v5/geo';
import { change } from '@/lib/reports-v5/model';
import './report-answers.css';
import './report-areas.css';

type C = (k: string, v?: Record<string, string | number>) => string;

export interface AreasProtoProps {
  orders: readonly GeoOrder[];
  prev: readonly GeoOrder[];
  path: readonly string[];
  metric: AreaMetric;
  view: 'map' | 'bars';
  pick: string;
  cmp: boolean;
  c: C;
  f: ReportFmt;
  locale: string;
  /** The address of this page with some parts changed (`path` is the slash-joined path, `metric`, `view`, `pick`). */
  href: (over: { path?: readonly string[]; m?: AreaMetric; view?: string; pick?: string }) => string;
  /** Categories (id, name) for "Where it sells". */
  cats: readonly { id: string; name: string }[];
  /** A category's own and sub-category ids. */
  catIds: (id: string) => readonly string[];
  /** The shop's other page parameters a form must keep. */
  keep: Record<string, string>;
  action: string;
}

const sgn = (x: number | null) => (x === null ? '—' : `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 100))}%`);

export function ReportAreasProto(p: AreasProtoProps) {
  const { c, f, path } = p;
  const lvl = path.length;
  const last = PLACE_LEVELS.length - 1;
  const leaf = lvl >= last;
  const level = PLACE_LEVELS[Math.min(lvl, last)]!;
  const cur = p.orders.filter((o) => inPath(o, path));
  const was = p.prev.filter((o) => inPath(o, path));
  const kids = areaStats(cur, (o) => nameAt(o.place, level));
  const kidsWas = areaStats(was, (o) => nameAt(o.place, level));
  const T = areaStats(cur, () => 'all')[0] ?? { key: 'all', orders: [], n: 0, pcs: 0, mrp: 0, v: 0, d: 0, rt: 0, rr: 0, col: 0, pr: 0, aov: 0 };
  const Q = areaStats(was, () => 'all')[0] ?? { ...T, n: 0, pcs: 0, mrp: 0, v: 0, d: 0, rt: 0, rr: 0, col: 0, pr: 0, aov: 0 };
  const here = lvl ? path[lvl - 1]! : c('bangladesh');
  const mf = (x: AreaStat) => metricOf(p.metric, x);
  const valid = (x: AreaStat) => (p.metric === 'rr' ? x.d + x.rt >= 3 : true); // hardcode-ok: the prototype's floor for a return rate
  const sorted = [...kids].sort((a, b) => mf(b) - mf(a));
  const shown = sorted.filter(valid);
  const pctOf = (x: number) => `${Math.round(x)}%`;
  const fmtM = (m: AreaMetric, v: number) => (m === 'v' || m === 'pr' ? f.amount(v) : m === 'rr' ? pctOf(v) : f.num(v));
  const dl = (x: number | null) => (p.cmp ? x : undefined);

  const lines: AnswerLine[] = [];
  const top = [...kids].sort((a, b) => b.v - a.v)[0];
  if (top && T.v) lines.push({ text: c('ans.top', { name: top.key, pct: pctOf((top.v / T.v) * 100), here, v: f.amount(top.v), n: f.num(top.n) }) });
  const grow = kids
    .map((x) => ({ ...x, ch: change(x.v, kidsWas.find((y) => y.key === x.key)?.v ?? 0) }))
    .filter((x) => x.v > 0 && x.ch !== null)
    .sort((a, b) => (b.ch ?? 0) - (a.ch ?? 0))[0];
  if (grow && p.cmp && (grow.ch ?? 0) > 0) lines.push({ text: c('ans.grow', { name: grow.key, chg: sgn(grow.ch) }), tone: 'good', act: { label: c('ans.localAd'), href: '/admin/marketing/campaigns' } });
  const badR = kids.filter((x) => x.d + x.rt >= 6 && x.rr > Math.max(10, T.rr * 1.4)).sort((a, b) => b.rr - a.rr)[0]; // hardcode-ok: the prototype's own thresholds for "returns far above the rest"
  if (badR) lines.push({ text: c('ans.bad', { name: badR.key, pct: pctOf(badR.rr), here, all: pctOf(T.rr) }), tone: 'bad', act: { label: c('ans.charge'), href: '/admin/rules' } });
  else {
    const aovTop = kids.filter((x) => x.n >= 5).sort((a, b) => b.aov - a.aov)[0]; // hardcode-ok: the prototype's floor of 5 orders
    if (aovTop) lines.push({ text: c('ans.aov', { name: aovTop.key, v: f.amount(aovTop.aov), avg: f.amount(T.aov) }) });
  }

  const nf = { kind: 'number', locale: p.locale } as const;
  const tiles: SummaryTile[] = [
    { key: 'orders', label: c('kOrders'), value: T.n, shown: f.num(T.n), format: nf, delta: dl(change(T.n, Q.n)), vs: c('kPieces', { n: f.num(T.pcs) }) },
    { key: 'mrp', label: c('kValue'), value: T.mrp, shown: f.amount(T.mrp), format: f.format, delta: dl(change(T.mrp, Q.mrp)) },
    { key: 'del', label: c('kDelivered'), value: T.d, shown: f.num(T.d), format: nf, delta: dl(change(T.d, Q.d)) },
    { key: 'rr', label: c('kReturnRate'), value: T.rr, shown: `${f.pctOf(T.rr)}`, format: nf, delta: dl(change(T.rr, Q.rr)), good: 'down', vs: c('kReturned', { n: f.num(T.rt) }) },
  ];

  const tone = p.metric === 'rr' ? 'var(--lm-bad)' : p.metric === 'pr' ? 'var(--lm-ok)' : 'var(--lm-ac)';
  const max = Math.max(1e-9, ...shown.map(mf));
  const mname = (m: AreaMetric) => c(`metric.${m}`);
  const mapBody = shown.length ? (
    p.view === 'map' ? (
      <>
        <div className="ar-tiles" style={{ ['--tone' as string]: tone }} data-testid="ar-tiles">
          {shown.map((x, i) => {
            const h = tileHeat(mf(x), max);
            const inner = (
              <>
                <span className="rk">#{i + 1}</span>
                <b>{x.key}</b>
                <span className="v">{fmtM(p.metric, mf(x))}</span>
                <span className="s">{c('tileSub', { n: f.num(x.n), pct: pctOf(x.rr) })}</span>
              </>
            );
            const cls = `ar-tile${h > 55 ? ' hot' : ''}`; // hardcode-ok: the prototype's "hot" tile threshold
            return leaf ? (
              <div key={x.key} className={cls} style={{ ['--h' as string]: h }} data-testid="ar-tile">
                {inner}
              </div>
            ) : (
              <Link key={x.key} className={cls} style={{ ['--h' as string]: h }} href={p.href({ path: [...path, x.key] })} data-testid="ar-tile">
                {inner}
              </Link>
            );
          })}
        </div>
        <div className="ar-scale" style={{ ['--tone' as string]: tone }}>
          {c('low')}
          <i />
          {c('high')} · {mname(p.metric)}
          {leaf ? '' : ` · ${c('clickDeeper')}`}
        </div>
      </>
    ) : (
      <BarList testId="ar-bars" items={shown.slice(0, 14).map((x) => ({ key: x.key, label: `${x.key} · ${x.n}`, value: mf(x), shown: fmtM(p.metric, mf(x)) }))} />
    )
  ) : (
    <p className="a2-sm a2-mute a2-mt6">{c('noneHere')}</p>
  );

  const seg = (items: readonly { id: string; label: string; href: string; on: boolean }[], aria: string, testId: string) => (
    <nav className="rpseg" aria-label={aria} data-testid={testId}>
      {items.map((x) => (
        <Link key={x.id} href={x.href} className={x.on ? 'on' : ''} aria-current={x.on ? 'true' : undefined}>
          {x.label}
        </Link>
      ))}
    </nav>
  );

  const tops = topProducts(cur, 6);
  const picks = [...p.cats.map((x) => ({ id: `cat:${x.id}`, label: c('pickCat', { name: x.name }) })), ...topProducts(p.orders as GeoOrder[], 25).map((x) => ({ id: `p:${x.pid}`, label: x.name }))];
  const pick = picks.some((x) => x.id === p.pick) ? p.pick : (picks[0]?.id ?? '');
  const byLevel = PLACE_LEVELS[lvl === 0 ? 1 : Math.min(lvl, last)]!;
  const sells = pick ? whereItSells(cur, pick, byLevel, 8, (id) => p.catIds(id)) : [];
  const sellsTotal = sells.reduce((n, x) => n + x.qty, 0);

  const rows: STRow[] = kids.map((x) => ({
    key: x.key,
    cells: [<b key="k">{x.key}</b>, f.num(x.n), f.num(x.pcs), f.amount(x.mrp), f.num(x.d), f.num(x.rt), <span key="r" style={x.rr > 12 ? { color: 'var(--lm-bad)' } : undefined}>{pctOf(x.rr)}</span>, f.amount(x.col), f.amount(x.pr), f.amount(x.aov)], // hardcode-ok: the prototype colours a return rate above 12% red
    sort: [x.key, x.n, x.pcs, x.mrp, x.d, x.rt, x.rr, x.col, x.pr, x.aov],
    ...(leaf
      ? { drawer: { title: x.key, sub: c('drawerSub', { n: f.num(x.orders.length) }), items: x.orders.map((o) => ({ label: o.number, sub: `${o.customerName ?? '—'} · ${o.day} · ${o.status}`, value: f.amount(o.totalMinor), href: `/admin/orders/${o.id}` })), empty: c('noneHere') } }
      : { href: p.href({ path: [...path, x.key] }) }),
  }));
  const lvName = leaf ? c('level.area') : c(`level.${level}`);
  const cols = [
    { h: lvName },
    { h: c('colOrders'), right: true },
    { h: c('colPieces'), right: true, hide: true },
    { h: c('colValue'), right: true, hide: true },
    { h: c('colDelivered'), right: true, hide: true },
    { h: c('colReturned'), right: true, hide: true },
    { h: c('colReturnPct'), right: true },
    { h: c('colCollected'), right: true, hide: true },
    { h: c('colProfit'), right: true },
    { h: c('colAvg'), right: true, hide: true },
  ];

  return (
    <div data-testid="areas-proto">
      <ReportAnswers kicker={c('answers')} question={c('ans.q')} lines={lines} empty={c('ans.none')} />
      <SummaryTiles className="a2-mt12" tiles={tiles} label={c('tilesLabel')} testId="areas-proto-tiles" />
      <div className="rp-ks" data-testid="areas-chips">
        <div>
          <span>{c('kCollected')}</span>
          <b>{f.amount(T.col)}</b>
          {p.cmp ? <span>{sgn(change(T.col, Q.col))}</span> : null}
        </div>
        <div>
          <span>{c('kProfit')}</span>
          <b>{f.amount(T.pr)}</b>
          {p.cmp ? <span>{sgn(change(T.pr, Q.pr))}</span> : null}
          <span>{c('kAvgOrder', { v: f.amount(T.aov) })}</span>
        </div>
      </div>

      <div className="rp-grid3 a2-mt12">
        <section className="a2-card" data-testid="ar-map-card">
          <h2 className="a2-h3">{c('mapTitle', { here, level: leaf ? c('level.areaLower') : c(`level.${level}Lower`) })}</h2>
          <div className="ar-bar">
            <nav className="ar-crumb" aria-label={c('path')} data-testid="ar-crumb">
              <Link href={p.href({ path: [] })} className={lvl ? '' : 'on'}>
                {c('bangladesh')}
              </Link>
              {path.map((x, i) => (
                <span key={`${x}-${i}`} className="ar-crumb-i">
                  <span className="sep" aria-hidden="true">
                    ›
                  </span>
                  <Link href={p.href({ path: path.slice(0, i + 1) })} className={i === lvl - 1 ? 'on' : ''}>
                    {x}
                  </Link>
                </span>
              ))}
            </nav>
            <div className="ar-ctrls">
              {seg(AREA_METRICS.map((m) => ({ id: m, label: mname(m), href: p.href({ m }), on: p.metric === m })), c('metricLabel'), 'ar-metric')}
              {seg(
                (['map', 'bars'] as const).map((v) => ({ id: v, label: c(`view.${v}`), href: p.href({ view: v }), on: p.view === v })),
                c('viewLabel'),
                'ar-view',
              )}
            </div>
          </div>
          <div className="a2-mt12">{mapBody}</div>
        </section>
        <div className="ar-side">
          <section className="a2-card" data-testid="ar-top">
            <h2 className="a2-h3">{c('topTitle', { here })}</h2>
            <p className="a2-cs">{c('topSub')}</p>
            {tops.length ? (
              <ul className="cr-rows">
                {tops.map((x, i) => (
                  <li key={x.pid}>
                    <div>
                      <Link className="cr-link" href={`/admin/products/${x.pid}`}>
                        {i + 1}. {x.name}
                      </Link>
                    </div>
                    <b>
                      {f.num(x.qty)} {c('pcs')} · {f.amount(x.value)}
                    </b>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="a2-sm a2-mute a2-mt6">{c('noSales')}</p>
            )}
          </section>
          <section className="a2-card" data-testid="ar-sells">
            <h2 className="a2-h3">{c('sellsTitle')}</h2>
            <p className="a2-cs">{c('sellsSub')}</p>
            <form action={p.action} method="get" className="rpf">
              {Object.entries({ ...p.keep, path: path.join('/'), m: p.metric, view: p.view })
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <input key={k} type="hidden" name={k} value={v} />
                ))}
              <label className="a2-xs a2-mute" htmlFor="ar-pick">
                {c('sellsPick')}
              </label>
              <select id="ar-pick" name="pick" className="a2-inp" defaultValue={pick} data-testid="ar-pick">
                {picks.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
              <button type="submit" className="a2-btn sm cr-tap">
                {c('apply')}
              </button>
            </form>
            {sells.length ? <BarList testId="ar-sells-bars" items={sells.map((x) => ({ key: x.name, label: x.name, value: x.qty, shown: `${f.num(x.qty)} ${c('pcs')} · ${pctOf((x.qty / Math.max(1, sellsTotal)) * 100)}` }))} /> : <p className="a2-sm a2-mute a2-mt6">{c('notSold')}</p>}
          </section>
        </div>
      </div>

      <section className="a2-card a2-mt12" data-testid="ar-table-card">
        <h2 className="a2-h3">{c('tableTitle')}</h2>
        <p className="a2-cs">{leaf ? c('tableSubLeaf') : c('tableSub')}</p>
        <SortTable cols={cols} rows={rows} sortCol={1} limit={10} texts={{ more: c('showAll'), less: c('showLess'), close: c('close'), empty: c('noneHere') }} testId="ar-table" rowId="ar-row" />
      </section>
    </div>
  );
}

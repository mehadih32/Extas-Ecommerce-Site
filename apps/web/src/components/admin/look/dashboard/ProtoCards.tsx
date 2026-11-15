// PR 722 (admin prototype v5 parity, Home design A "Command"): the five cards the approved prototype has under the sales
// trend — "Do now" (Urgent / Today / This week, from the same waiting lists the sidebar badges and the To-do drawer
// count), "Products: what to do" (best sellers of the period with how many days their stock lasts), "Ads: are they
// paying?" (spend, delivered sales, sales per 1 of spend), "In short" (three plain sentences worked out from the same
// figures) and "Month target" (the monthly goal of Page settings, drawn only when it is on). Nothing here is added up
// again: every number is a figure the Dashboard loader already read, and a card whose figure the person may not read
// (`metrics.read`, `books.read`) is left out. No new setting: the goal and its amount stay where Page settings keep them.
import Link from 'next/link';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { nameIn } from '@/components/admin/products/model';
import { salesPerUnit } from '@/lib/admin-look/dashboard-data';
import type { ShellIconName } from '@/lib/admin-shell/icons';
import type { ReactNode } from 'react';
import { change, trailingAverage } from '@/lib/admin-look/chart';
import { Bar, Card, Delta, Empty, LineChart, Lnk, Pill, Spark } from '../kit';
import { can, rangeText, type DashProps } from './common';

/** Slow stock and set-up lists are "This week"; bad-tone lists are "Urgent"; the rest is "Today" (the same split as design B). */
const WEEK_LISTS: ReadonlySet<string> = new Set(['lowStock', 'countsReview', 'launch', 'agentFixes', 'erpKeptAtSwitch', 'ordersTwoSizes']);

/**
 * Prototype v5 "Do now": the dashed line under the list, "Nightly page check (03:00): N pages checked · all fine / N failed — pages",
 * a link to the website analytics. Shown for a person who may read site health; "no run kept yet" before the first nightly run.
 */
export function PageCheckLine({ p }: { p: DashProps }) {
  const { f, data } = p;
  if (!data.parts.has('pageCheck')) return null;
  const pc = data.pageCheck;
  const clock = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat(f.locale, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: f.timeZone, numberingSystem: 'latn' }).format(d);
  };
  const text = pc
    ? f.t('dsh.proto.pcLine', { at: clock(pc.at), pages: f.n(pc.pages), result: pc.failed.length ? f.t('dsh.proto.pcFailed', { n: f.n(pc.failed.length), names: pc.failed.slice(0, 2).join(', ') }) : f.t('dsh.proto.pcOk') })
    : f.t('dsh.proto.pcNone');
  return (
    <Link className="a3-pchk" href="/admin/reports/health/smoke" data-testid="dash-pagecheck">
      <ShellIcon name={pc && pc.failed.length ? 'alert' : 'check'} size={15} />
      <span>{text}</span>
    </Link>
  );
}

/** Prototype v5 "ERP link" card: connection, when stock was last pulled, orders sent today and what the shop owes the ERP (or paid ahead). */
export function ErpCard({ p }: { p: DashProps }) {
  const { f, data } = p;
  const e = data.erp;
  if (!e) return null;
  const state = !e.linked ? 'off' : e.failed > 0 ? 'needs' : 'ok';
  const owed = e.owedMinor ?? 0;
  return (
    <Card title={f.t('dsh.proto.erpTitle')} right={<Lnk href="/admin/settings/erp-link">{f.t('dsh.proto.erpDetails')}</Lnk>} testId="dash-erp">
      <div className="a3-prob">
        <span>
          <b>{f.t('dsh.proto.erpConn')}</b>
        </span>
        <span className={`a2-pill ${state === 'ok' ? 'ok' : state === 'needs' ? 'warn' : ''}`}>{f.t(`dsh.proto.erp_${state}`)}</span>
      </div>
      <div className="a3-prob">
        <span>
          <b>{f.t('dsh.proto.erpStock')}</b>
        </span>
        <span className="a3-cap c">{e.stockAt ? f.ago(e.stockAt) : f.t('dsh.proto.erpNever')}</span>
      </div>
      <div className="a3-prob">
        <span>
          <b>{f.t('dsh.proto.erpSent')}</b>
        </span>
        <b className="a3-num">{f.n(e.sentToday)}</b>
      </div>
      <div className="a3-prob">
        <span>
          <b>{owed >= 0 ? f.t('dsh.proto.erpOwed') : f.t('dsh.proto.erpAhead')}</b>
        </span>
        <b className="a3-num">{e.owedMinor === null ? '—' : f.money(Math.abs(owed))}</b>
      </div>
    </Card>
  );
}

/** Prototype v5 "Latest orders": the newest orders (number, name, place, total, status, how long ago), each a link to the order. */
export function LatestOrders({ p }: { p: DashProps }) {
  const { f, data } = p;
  const rows = data.feed;
  if (!rows) return null;
  return (
    <Card title={f.t('dsh.proto.feedTitle')} right={<Lnk href="/admin/orders">{f.t('dsh.proto.feedAll')}</Lnk>} testId="dash-latest">
      {rows.length ? (
        rows.map((r) => {
          const area = f.lang === 'bn' && r.areaBn ? r.areaBn : r.areaEn;
          return (
            <Link key={r.id} className="a3-latest" href={`/admin/orders/${r.id}`} data-testid="dash-latest-row">
              <span className="a3-lt-n">
                <b>#{r.number}</b> · {r.name ?? f.t('dsh.lm.someone')}
                {area ? <span className="a3-cap c"> · {area}</span> : null}
              </span>
              <b className="a3-num">{f.money(r.totalMinor)}</b>
              <span className="a2-pill">{f.t(`orders.st.${r.status}`)}</span>
              <span className="a3-cap c a3-lt-ago">{f.ago(r.placedAt)}</span>
            </Link>
          );
        })
      ) : (
        <Empty text={f.t('dsh.lm.noFeed')} />
      )}
    </Card>
  );
}

export function DoNow({ p }: { p: DashProps }) {
  const { f, data } = p;
  const q = data.queues ?? [];
  const groups = (['urgent', 'today', 'week'] as const)
    .map((g) => ({ g, rows: q.filter((r) => (r.def.tone === 'bad' ? 'urgent' : WEEK_LISTS.has(r.id) ? 'week' : 'today') === g) }))
    .filter((x) => x.rows.length > 0);
  const total = q.reduce((n, r) => n + r.n, 0);
  return (
    <Card title={f.t('dsh.proto.doNow')} sub={groups.length ? f.t('dsh.proto.doSub', { n: f.n(total) }) : undefined} testId="dash-donow">
      {groups.length ? (
        groups.map((x) => (
          <div key={x.g} data-testid={`dash-donow-${x.g}`}>
            <p className="a3-cap">{f.t(`dsh.lm.grp${x.g === 'urgent' ? 'Urgent' : x.g === 'today' ? 'Today' : 'Week'}`)}</p>
            {x.rows.map((r) => (
              <Link key={r.id} className="a3-prob" href={r.def.href}>
                <span className={`a3-pi ${r.def.tone === 'bad' ? 'bad' : r.def.tone === 'warn' ? 'gold' : 'mute'}`}>
                  <ShellIcon name={r.def.icon as ShellIconName} size={16} />
                </span>
                <span>
                  <b>{f.t(`dash.queue.${r.id}`)}</b>
                  <span>{r.oldest ? f.t('dash.queue.sub', { n: f.n(r.n), age: f.ago(r.oldest) }) : f.t('shell.nav.waiting', { n: f.n(r.n) })}</span>
                </span>
                <b className="a3-num">{f.n(r.n)}</b>
              </Link>
            ))}
          </div>
        ))
      ) : (
        <Empty text={f.t('dsh.prob.none')} />
      )}
      <PageCheckLine p={p} />
    </Card>
  );
}

export function ProductsToDo({ p }: { p: DashProps }) {
  const { f, data, s, viewer } = p;
  const top = data.top ?? [];
  const low = data.lowStock ?? [];
  return (
    <Card title={f.t('dsh.proto.prodTitle')} sub={f.t('dsh.proto.prodSub', { n: f.n(s.courierDays) })} right={can(viewer, 'catalogue.read') ? <Lnk href="/admin/products/ranking">{f.t('dsh.proto.prodLink')}</Lnk> : null} testId="dash-prodtodo">
      {top.length ? (
        top.map((r) => {
          // The days the product's stock lasts: its fastest-running size (the low-stock list's own figure); no size on that list = enough
          const days = low.filter((l) => l.productId === r.productId && l.daysLeft !== null).map((l) => l.daysLeft as number);
          const least = days.length ? Math.min(...days) : null;
          return (
            <div className="a3-prob" key={r.productId}>
              <span>
                <b>{nameIn(f.lang, { nameEn: r.nameEn, nameBn: r.nameBn })}</b>
                <span>{f.t('dsh.proto.prodSold', { n: f.n(r.units), v: f.money(r.valueMinor) })}</span>
              </span>
              <span className={`a2-pill ${least !== null ? 'warn' : 'ok'}`}>{least !== null ? f.t('dsh.proto.daysLeft', { n: f.n(least) }) : f.t('dsh.proto.stockOk')}</span>
            </div>
          );
        })
      ) : (
        <Empty text={f.t('dsh.proto.prodNone')} />
      )}
    </Card>
  );
}

/** The verdict of one channel from its sales per 1 spent, against the owner's three limits (`admin.dashboardDesigns`). */
export function adsVerdict(per: number | null, s: { adsScaleAt: number; adsKeepAt: number; adsFixAt: number }): 'scale' | 'keep' | 'fix' | 'stop' | null {
  if (per === null) return null;
  return per >= s.adsScaleAt ? 'scale' : per >= s.adsKeepAt ? 'keep' : per >= s.adsFixAt ? 'fix' : 'stop';
}
const VERDICT_TONE = { scale: 'ok', keep: 'line', fix: 'gold', stop: 'bad' } as const;

export function AdsPaying({ p }: { p: DashProps }) {
  const { f, data, viewer, s } = p;
  const pf = data.profit;
  const rows = data.ads?.rows ?? [];
  if (!pf && !rows.length) return null;
  const link = can(viewer, 'marketing.campaigns.read') ? <Lnk href="/admin/marketing/campaigns">{f.t('dsh.proto.adsCampaigns')}</Lnk> : null;
  if (rows.length) {
    // the prototype's table: one row per ad channel with what it cost, what it brought, sales for each 1 and a verdict
    return (
      <Card title={f.t('dsh.lm.roasTitle')} sub={f.t('dsh.proto.adsSub')} right={link} testId="dash-adspay">
        <div className="a3-tblw">
          <table className="a3-tbl" data-testid="dash-ads-table">
            <thead>
              <tr>
                <th>{f.t('dsh.proto.adsChannel')}</th>
                <th className="r">{f.t('dsh.lm.roasSpend')}</th>
                <th className="r">{f.t('dsh.lm.roasSales')}</th>
                <th className="r">{f.t('dsh.proto.adsRoas')}</th>
                <th>{f.t('dsh.proto.adsVerdict')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const v = adsVerdict(r.per, s);
                return (
                  <tr key={r.key} data-testid={`dash-ads-${r.key}`}>
                    <td>
                      <b>{f.t(`dsh.proto.ch.${r.key.replace('ads:', '')}`)}</b>
                    </td>
                    <td className="r a3-num">{r.spendMinor === null ? '—' : f.money(r.spendMinor)}</td>
                    <td className="r a3-num">{f.money(r.salesMinor)}</td>
                    <td className="r a3-num">
                      <b>{r.per === null ? '—' : `${r.per.toFixed(1)}x`}</b>
                    </td>
                    <td>{v ? <Pill tone={VERDICT_TONE[v]}>{f.t(`dsh.proto.v.${v}`)}</Pill> : <span className="a3-dl0">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    );
  }
  if (!pf) return null;
  const per = salesPerUnit(pf.cur.salesMinor, pf.cur.adsMinor);
  return (
    <Card title={f.t('dsh.lm.roasTitle')} sub={f.t('dsh.lm.roasSub')} right={link} testId="dash-adspay">
      <div className="a3-tt" role="table" aria-label={f.t('dsh.lm.roasTitle')}>
        <div className="a3-prob" role="row">
          <span>
            <b>{f.t('dsh.lm.roasSpend')}</b>
          </span>
          <b className="a3-num">{pf.cur.adsMinor === null ? '—' : f.money(pf.cur.adsMinor)}</b>
        </div>
        <div className="a3-prob" role="row">
          <span>
            <b>{f.t('dsh.lm.roasSales')}</b>
          </span>
          <b className="a3-num">{f.money(pf.cur.salesMinor)}</b>
        </div>
        <div className="a3-prob" role="row">
          <span>
            <b>{f.t('dsh.proto.roas')}</b>
          </span>
          <b className="a3-num">{per === null ? '—' : `${per.toFixed(1)}x`}</b>
        </div>
      </div>
      {per === null ? <p className="a3-cap c">{f.t(pf.cur.adsMinor === null ? 'dsh.lm.roasUnknown' : 'dsh.lm.roasNone')}</p> : null}
    </Card>
  );
}

export function InShort({ p }: { p: DashProps }) {
  const { f, data } = p;
  const lines: string[] = [];
  const m = data.money;
  if (m && m.prev.sales.itemsMinor > 0) {
    const ch = (m.cur.sales.itemsMinor - m.prev.sales.itemsMinor) / m.prev.sales.itemsMinor;
    lines.push(f.t(ch >= 0 ? 'dsh.proto.shortUp' : 'dsh.proto.shortDown', { pct: f.pct(Math.abs(ch), 0), n: f.n(data.range.days) }));
  }
  const pf = data.profit;
  if (pf && pf.cur.netMinor !== null && pf.cur.salesMinor > 0) {
    const was = pf.prev.netMinor !== null && pf.prev.salesMinor > 0 ? pf.prev.netMinor / pf.prev.salesMinor : null;
    lines.push(f.t(was === null ? 'dsh.proto.shortKeep' : 'dsh.proto.shortKeepWas', { keep: f.per100(pf.cur.netMinor / pf.cur.salesMinor), hundred: f.hundred, was: was === null ? '' : f.per100(was) }));
  }
  const best = data.top?.[0];
  if (best) lines.push(f.t('dsh.proto.shortBest', { name: nameIn(f.lang, { nameEn: best.nameEn, nameBn: best.nameBn }), v: f.money(best.valueMinor) }));
  return (
    <Card title={f.t('dsh.proto.shortTitle')} testId="dash-inshort">
      {lines.length ? (
        lines.map((l) => (
          <p className="a3-prob" key={l}>
            <ShellIcon name="info" size={15} />
            <span>{l}</span>
          </p>
        ))
      ) : (
        <Empty text={f.t('dsh.proto.shortNone')} />
      )}
    </Card>
  );
}

export function MonthTarget({ p }: { p: DashProps }) {
  const { f, data } = p;
  const g = data.goal;
  if (!g) {
    return (
      <Card title={f.t('dsh.lm.goalOff')} testId="dash-monthtarget-off">
        <Empty title={f.t('dsh.lm.goalOffNone')} text={f.t('dsh.lm.goalOffText')} />
      </Card>
    );
  }
  const done = g.goalMinor > 0 ? g.salesMinor / g.goalMinor : 0;
  return (
    <Card title={f.t('dsh.lm.goalOff')} testId="dash-monthtarget">
      <p className="a3-cap">
        {f.t('dsh.proto.targetLine', { goal: f.money(g.goalMinor), pct: f.pct(done, 0) })}
      </p>
      <Bar p={done} />
      <p className="a3-cap c">{f.t('dsh.proto.targetSold', { sales: f.money(g.salesMinor), n: f.n(g.daysLeft) })}</p>
    </Card>
  );
}

/** Prototype "Profit snapshot": three periods side by side (today, the last 7 days, this month), each with sales against costs and the part you keep. Always drawn; empty figures show a dash. */
export function ProfitSnap({ p }: { p: DashProps }) {
  const { f, data, viewer } = p;
  const pf = data.profit;
  const snaps = pf?.snap?.length
    ? pf.snap
    : [{ key: 'today' as const, cur: pf?.cur, prev: pf?.prev }].filter((x) => x.cur && x.prev).map((x) => ({ key: x.key, cur: x.cur!, prev: x.prev! }));
  return (
    <Card title={f.t('dsh.proto.snapTitle')} sub={f.t('dsh.proto.snapSub')} right={can(viewer, 'books.read') ? <Lnk href="/admin/money">{f.t('dsh.proto.snapLink')}</Lnk> : null} testId="dash-profitsnap">
      <div className="a3-snap3">
        {(snaps.length ? snaps : [null, null, null]).map((x, i) => {
          const net = x ? x.cur.netMinor : null;
          const sales = x ? x.cur.salesMinor : 0;
          const keep = net !== null && sales > 0 ? Math.max(0, Math.min(1, net / sales)) : 0;
          const prevNet = x ? x.prev.netMinor : null;
          const key = x?.key ?? (['today', '7d', 'month'] as const)[i]!;
          return (
            <div className="a3-snapc" key={key} data-testid={`dash-snap-${key}`}>
              <div className="a3-snaph">
                <span className="a3-cap">{f.t(`dsh.proto.snap_${key}`)}</span>
                <Delta f={f} x={net !== null && prevNet !== null && prevNet !== 0 ? (net - prevNet) / Math.abs(prevNet) : null} />
              </div>
              <b className="a3-num a3-snapv">{net === null ? '—' : f.money(net)}</b>
              <Bar p={keep} />
              <div className="a3-snap-r">
                <span>{f.t('dsh.proto.snapSales', { v: f.money(sales) })}</span>
                <span>{f.t('dsh.proto.snapCosts', { v: net === null ? '—' : f.money(Math.max(0, sales - net)) })}</span>
              </div>
              <span className="a3-cap c">{f.t(`dsh.proto.snapVs_${key}`)}</span>
            </div>
          );
        })}
      </div>
      <p className="a3-cap c">{f.t('dsh.proto.snapNote')}</p>
    </Card>
  );
}

/** Prototype's six figures with a small line each: orders, delivered sales, net profit, money with couriers, return rate, ad spend. */
export function SixTiles({ p }: { p: DashProps }) {
  const { f, data } = p;
  const m = data.money;
  const pf = data.profit;
  type T = { key: string; href: string; icon: ShellIconName; label: string; value: string; sub?: string; line?: readonly number[]; color: string };
  const tiles: T[] = [];
  if (m) {
    tiles.push({ key: 'orders', href: '/admin/orders', icon: 'bag', label: f.t('dsh.proto.tOrders'), value: f.n(m.cur.ordered.orders), sub: f.money(m.cur.ordered.valueMinor), line: m.chart.orders, color: 'var(--a3-c1)' });
    tiles.push({ key: 'sales', href: '/admin/reports/orders', icon: 'truck', label: f.t('dsh.proto.tSales'), value: f.money(m.cur.sales.itemsMinor), sub: f.t('dsh.proto.tDelivered', { n: f.n(m.cur.sales.orders) }), line: m.chart.sales, color: 'var(--a3-c2, var(--a3-c1))' });
  }
  if (pf && pf.cur.netMinor !== null) tiles.push({ key: 'net', href: '/admin/money', icon: 'chart', label: f.t('dsh.proto.tNet'), value: f.money(pf.cur.netMinor), sub: pf.cur.salesMinor > 0 ? f.t('dsh.proto.shortKeep', { keep: f.per100(pf.cur.netMinor / pf.cur.salesMinor), hundred: f.hundred }) : undefined, color: 'var(--a3-c1)' });
  if (data.cod) tiles.push({ key: 'cod', href: '/admin/money', icon: 'wallet', label: f.t('dsh.proto.tCod'), value: f.money(data.cod.minor), sub: f.t('dsh.proto.tParcels', { n: f.n(data.cod.parcels) }), color: 'var(--a3-c1)' });
  if (data.delivery) tiles.push({ key: 'ret', href: '/admin/reports/delivery', icon: 'undo', label: f.t('dsh.proto.tReturn'), value: f.pct(data.delivery.returnRate), sub: f.t('dsh.proto.tOfFinished', { n: f.n(data.delivery.finished) }), color: 'var(--a3-c1)' });
  if (pf) {
    const per = salesPerUnit(pf.cur.salesMinor, pf.cur.adsMinor);
    tiles.push({ key: 'ads', href: '/admin/marketing', icon: 'mega', label: f.t('dsh.proto.tAds'), value: pf.cur.adsMinor === null ? '—' : f.money(pf.cur.adsMinor), sub: per === null ? undefined : `${per.toFixed(1)}x`, color: 'var(--a3-c1)' });
  }
  if (!tiles.length) return null;
  return (
    <div className="a3-six" data-testid="dash-six">
      {tiles.map((t) => (
        <Link className="a3-card a3-kpi" href={t.href} key={t.key} data-testid={`dash-six-${t.key}`}>
          <span className="a3-cap a3-six-h">
            <i className="a3-six-i" aria-hidden="true">
              <ShellIcon name={t.icon} size={15} />
            </i>
            {t.label}
          </span>
          <b className="a3-num a3-six-v">{t.value}</b>
          {t.sub ? <span className="a3-cap c">{t.sub}</span> : null}
          {t.line && t.line.length > 1 ? <Spark id={`six-${t.key}`} values={t.line} color={t.color} w={120} h={32} /> : null}
        </Link>
      ))}
    </div>
  );
}

/** The sales trend card the prototype draws beside "Do now": delivered sales against the period before, with ordered value. */
export function TrendCard({ p, id }: { p: DashProps; id: string }) {
  const { f, data, s } = p;
  const m = data.money;
  if (!m) return null;
  return (
    <Card title={f.t('dsh.proto.trendTitle')} sub={f.t('dsh.proto.trendSub')} testId="dash-trend">
      <div className="a3-trsum">
        <div>
          <span>{f.t('dsh.ordered')}</span>
          <b className="a3-num">{f.money(m.cur.ordered.valueMinor)}</b> <Delta f={f} x={change(m.cur.ordered.valueMinor, m.prev.ordered.valueMinor)} />
        </div>
        <div>
          <span>{f.t('dsh.sales')}</span>
          <b className="a3-num">{f.money(m.cur.sales.itemsMinor)}</b> <Delta f={f} x={change(m.cur.sales.itemsMinor, m.prev.sales.itemsMinor)} />
        </div>
      </div>
      <LineChart
        id={id}
        labels={m.chart.days.map((d) => f.day(d, true))}
        xl={m.chart.days.map((d) => f.day(d))}
        series={[
          { v: trailingAverage(m.chart.ordered, s.smoothDays), color: 'var(--a3-c1)', name: f.t('dsh.ordered'), shown: m.chart.ordered.map((v) => f.money(v)) },
          { v: trailingAverage(m.chart.sales, s.smoothDays), color: 'var(--a3-s2)', name: f.t('dsh.sales'), shown: m.chart.sales.map((v) => f.money(v)) },
          { v: trailingAverage(m.chart.prevSales, s.smoothDays), color: 'var(--a3-cprev)', name: f.t('dsh.prevPeriod'), dash: true, w: 1.6, shown: m.chart.prevSales.map((v) => f.money(v)) },
        ]}
        h={220}
        label={f.t('dsh.chartLabel', { range: rangeText(f, data) })}
        yfmt={(v) => f.short(v)}
        foot={m.chart.days.map((_, i) => f.t('dsh.foot', { amount: f.money(m.chart.sales[i] ?? 0), n: f.n(m.chart.orders[i] ?? 0) }))}
      />
      {s.smoothDays > 1 ? <p className="a3-chn2">{f.t('dsh.smoothNote', { n: f.n(s.smoothDays) })}</p> : null}
    </Card>
  );
}

/** The prototype's first row: the sales chart (left, two thirds) with "Do now" beside it (right); the chart alone when nothing is waiting-list readable. */
export function ChartDoNow({ p, lead }: { p: DashProps; lead: ReactNode }) {
  const has = !!p.data.queues;
  return (
    <div className={`a3-chdo${has ? '' : ' solo'}`} data-testid="dash-chdo">
      <div className="a3-chdo-l">{lead}</div>
      {has ? (
        <div className="a3-chdo-r">
          <DoNow p={p} />
        </div>
      ) : null}
    </div>
  );
}

/** The prototype's second row: "Products: what to do", "Ads: are they paying?" (with `mid` under it), then "In short" with "Month target". */
export function ProtoLower(p: DashProps & { mid?: ReactNode }) {
  const { data, viewer, mid } = p;
  const canMoney = can(viewer, 'metrics.read');
  const cols: ReactNode[] = [];
  if (data.top) cols.push(<div className="a3-stk" key="l"><ProductsToDo p={p} /></div>);
  if (data.profit || data.ads?.rows.length || mid)
    cols.push(
      <div className="a3-stk" key="m">
        <AdsPaying p={p} />
        {mid}
      </div>,
    );
  if (canMoney || data.erp)
    cols.push(
      <div className="a3-stk" key="r">
        {canMoney ? <InShort p={p} /> : null}
        {canMoney ? <MonthTarget p={p} /> : null}
        <ErpCard p={p} />
      </div>,
    );
  if (!cols.length && !data.feed) return null;
  return (
    <>
      {cols.length ? (
        <div className="a3-dg3 a3-proto" style={{ ['--n' as string]: cols.length }} data-testid="dash-proto">
          {cols}
        </div>
      ) : null}
      {data.feed ? (
        <div className="a3-stk a3-latest-w">
          <LatestOrders p={p} />
        </div>
      ) : null}
    </>
  );
}

/** The prototype's profit snapshot and six figures (design A; D draws its own six tiles). */
export function CodStrip({ p }: { p: DashProps }) {
  const { f, data } = p;
  const o = data.cod?.old;
  if (!o || !o.parcels) return null;
  return (
    <div className="a3-codstrip" data-testid="dash-codstrip">
      <ShellIcon name="alert" size={16} />
      <span>
        <b>{f.t('dsh.proto.codOldBold', { n: f.n(o.parcels) })}</b> {f.t('dsh.proto.codOldRest', { v: f.money(o.minor) })}
      </span>
      <Link className="a2-btn sm" href="/admin/money">
        {f.t('dsh.proto.codOldList')}
      </Link>
    </div>
  );
}

export function ProtoTop(p: DashProps) {
  if (!can(p.viewer, 'metrics.read')) return null;
  return (
    <>
      <CodStrip p={p} />
      <ProfitSnap p={p} />
      <SixTiles p={p} />
    </>
  );
}

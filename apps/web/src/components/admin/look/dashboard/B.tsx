// PR 631 (CN-036) — Dashboard design B, "Today" in the Lumen look (docs/demo/admin-look/LUMEN-SPEC.md §4, the prototype
// ADMIN-LOOKS-V1.html "ঘ · Lumen" Home). It is the Lumen standard; design A (the V12.4 "Calm overview") stays one
// click away in the "…" menu and in Settings → Admin look (CN-025: nothing deleted). It draws the same figures through
// the one loader (lib/admin-look/dashboard-data.ts) and the same keys decide who sees what:
// - the hero: Sales (delivered orders only, the one KPI definition of PR 155, provisional until settlements are
//   matched) with the period before as a dashed line, Ordered value, orders and the average order beside it;
// - "Needs you": every waiting list this person may open (confirm, prepaid, review/risky COD, cancels, low stock, …,
//   each list's own rule and threshold in its own settings) plus the packed parcels not booked with a courier; each
//   row has one clear button that opens its page (nothing is done from here, so nothing needs an Undo);
// - tiles: orders, delivery success, returned parcels; the order pipeline (a bar opens All orders on that status);
//   the live feed of the newest orders (`admin.today.liveRows`); the monthly goal ring (`admin.today.goal`, off as
//   shipped); top products, couriers and stock running out; the "Money & marketing" view one click away.
// The page root carries data-lm-ready, so it follows dark mode; everything is drawn with --lm-* tokens.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { EmptyState } from '@/components/admin/lumen/EmptyState';
import { HeroChart, type HeroRange } from '@/components/admin/lumen/HeroChart';
import { Queue, type QueueRow as LmQueueRow } from '@/components/admin/lumen/Queue';
import { SettingCards, type SettingCardDef } from '@/components/admin/lumen/SettingCards';
import { SummaryTiles, type SummaryTile } from '@/components/admin/lumen/SummaryTiles';
import { moneyOf } from '@/components/admin/products/model';
import { PlaceGuide } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import type { DashPart } from '@/lib/admin-look/dashboard-data';
import { change } from '@/lib/admin-look/chart';
import { rangeHref } from '@/lib/admin-look/range';
import type { CountFormat } from '@/lib/admin-lumen/model';
import type { ShellIconName } from '@/lib/admin-shell/icons';
import type { LookDesign } from '../types';
import { Bar, Delta } from '../kit';
import { CsvButton, LookMenu } from '../LookMenu';
import { RangeSeg } from '../RangeSeg';
import type { Fmt } from '../fmt';
import { LowStock, MoneyView, TopProducts } from './A';
import { aov, can, prevText, rangeText, type DashProps } from './common';

/** Which icon a waiting list wears in "Needs you" (its row in lib/admin-shell/queues.ts says where it opens). */
const NEED_ICON: Record<string, ShellIconName> = {
  ordersConfirm: 'phone',
  ordersPrepaid: 'wallet',
  ordersAwaitingAdvance: 'wallet',
  ordersTwoSizes: 'shirt',
  ordersReview: 'shield',
  ordersCancelRequests: 'x',
  ordersCancelPending: 'uturn',
  launch: 'shirt',
  lowStock: 'box',
  countsReview: 'check',
  erpFailed: 'sync',
  erpHold: 'alert',
  booksDifferences: 'wallet',
  jobsDead: 'alert',
  agentFixes: 'shield',
  handoverWaiting: 'truck',
};

function moneyFormat(f: Fmt): CountFormat {
  return { kind: 'money', locale: f.locale, currency: f.currency, digits: moneyOf(f.currency, f.locale).digits };
}

function Head({ p, views }: { p: DashProps; views: ReactNode }) {
  const { f, head } = p;
  const waiting = (p.data.queues ?? []).reduce((s, q) => s + q.n, 0) + (p.data.stages?.toBook ?? 0);
  return (
    <header className="lm-ph" data-testid="dash-head">
      <div className="lm-ph-t">
        <h1>{head.title}</h1>
        <p className="lm-sub">
          <span>{head.date}</span> · <span className="lm-live">{f.t('dsh.live', { time: head.time })}</span>
          {p.data.queues ? <> · {waiting ? f.t('dsh.lm.waiting', { n: f.n(waiting) }) : f.t('dsh.lm.calm')}</> : null}
        </p>
      </div>
      <div className="lm-ph-a">
        <PlaceGuide view={p.view} place={head.place} />
        {views}
        {head.range ? <RangeSeg {...head.range} /> : null}
        {head.csv ? <CsvButton csv={head.csv} label={f.t('dsh.download')} /> : null}
        <LookMenu {...head.menu} />
      </div>
    </header>
  );
}

function Hero({ p }: { p: DashProps }) {
  const { f, data } = p;
  const m = data.money!;
  const a = aov(m.cur.sales);
  const range: HeroRange = {
    key: 'cur',
    label: rangeText(f, data),
    total: m.cur.sales.itemsMinor,
    shown: f.money(m.cur.sales.itemsMinor),
    delta: change(m.cur.sales.itemsMinor, m.prev.sales.itemsMinor),
    vs: f.t('dsh.vsAmount', { vs: prevText(f, data), amount: f.money(m.prev.sales.itemsMinor) }),
    points: m.chart.days.map((d, i) => ({ label: f.day(d, true), value: m.chart.sales[i] ?? 0, shown: f.money(m.chart.sales[i] ?? 0), prevShown: f.money(m.chart.prevSales[i] ?? 0) })),
    prev: m.chart.prevSales,
    mini: [
      { label: f.t('dsh.ordersPlaced'), shown: f.n(m.cur.ordered.orders) },
      { label: f.t('dsh.aov'), shown: a === null ? '—' : f.money(a) },
    ],
  };
  return (
    <div className="lm-today-hero" data-testid="dash-hero">
      <HeroChart title={`${f.t('dsh.sales')} · ${rangeText(f, data)}`} ranges={[range]} format={moneyFormat(f)} seriesName={f.t('dsh.sales')} prevName={f.t('dsh.prevPeriod')} testId="dash-kpi-sales" numClass="a3-num" />
      <p className="lm-note lm-ordv" data-testid="dash-kpi-ordered" title={f.t('dash.tile.orderedTitle')}>
        <b>{f.t('dsh.ordered')}</b> <span className="a3-num">{f.money(m.cur.ordered.valueMinor)}</span> <Delta f={f} x={change(m.cur.ordered.valueMinor, m.prev.ordered.valueMinor)} /> · {f.t('dsh.orderedNote', { n: f.n(m.cur.ordered.orders) })}
      </p>
      <p className="lm-note" title={f.t('dsh.provisionalTip')}>
        {f.t('dsh.salesNote')} · {f.t('dash.status.provisional')}
      </p>
    </div>
  );
}

function needsRows(p: DashProps): LmQueueRow[] {
  const { f, data } = p;
  const rows: LmQueueRow[] = (data.queues ?? []).map((q) => ({
    id: q.id,
    title: f.t(`dash.queue.${q.id}`),
    sub: q.oldest ? f.t('dash.queue.sub', { n: f.n(q.n), age: f.ago(q.oldest) }) : f.t('shell.nav.waiting', { n: f.n(q.n) }),
    meta: <span className={`lm-need-n ${q.def.tone}`}>{f.n(q.n)}</span>,
    act: { kind: 'open', label: f.t('dsh.lm.open'), href: q.def.href },
  }));
  const st = data.stages;
  if (st?.toBook && can(p.viewer, 'orders.read'))
    rows.push({
      id: 'toBook',
      title: f.t('dsh.lm.toBook', { n: f.n(st.toBook) }),
      sub: f.t('dsh.lm.toBookSub'),
      meta: <span className="lm-need-n info">{f.n(st.toBook)}</span>,
      act: { kind: 'open', label: f.t('dsh.lm.open'), href: '/admin/orders/packing' },
    });
  return rows;
}

function Needs({ p }: { p: DashProps }) {
  const { f } = p;
  const rows = needsRows(p);
  return (
    <div className="lm-today-needs" data-testid="dash-needs">
      <Queue title={f.t('dsh.lm.needs')} sub={f.t('dsh.lm.needsSub')} rows={rows} empty={{ title: f.t('dsh.lm.caught'), text: f.t('dsh.prob.none') }} refresh={false} testId="dash-problems" />
      <p className="lm-note">{f.t('dsh.prob.later', { a: f.t('dsh.stage.S21'), b: f.t('dsh.stage.S22') })}</p>
    </div>
  );
}

function Tiles({ p }: { p: DashProps }) {
  const { f, data, viewer } = p;
  const m = data.money;
  const dl = data.delivery;
  const tiles: SummaryTile[] = [];
  const num: CountFormat = { kind: 'number', locale: f.locale };
  const pct: CountFormat = { kind: 'percent', locale: f.locale, digits: 1 };
  if (m)
    tiles.push({
      key: 'orders',
      label: f.t('dsh.orders'),
      value: m.cur.ordered.orders,
      shown: f.n(m.cur.ordered.orders),
      format: num,
      delta: change(m.cur.ordered.orders, m.prev.ordered.orders),
      vs: f.t('dsh.avgOrdered', { amount: m.cur.ordered.orders ? f.money(Math.round(m.cur.ordered.valueMinor / m.cur.ordered.orders)) : '—' }),
      href: can(viewer, 'orders.read') ? '/admin/orders' : undefined,
      icon: 'bag',
    });
  if (dl) {
    tiles.push({
      key: 'success',
      label: f.t('dsh.success'),
      value: dl.rate ?? 0,
      shown: f.pct(dl.rate),
      format: pct,
      delta: dl.rate !== null && dl.prevRate !== null ? dl.rate - dl.prevRate : null,
      deltaText: dl.rate !== null && dl.prevRate !== null ? f.t('dsh.pts', { n: Math.abs((dl.rate - dl.prevRate) * 100).toFixed(1) }) : undefined,
      vs: dl.finished ? f.t('dsh.accepted', { kept: f.n(dl.kept), n: f.n(dl.finished) }) : f.t('dsh.noneFinished', { n: f.n(dl.days) }),
      href: can(viewer, 'delivery.read') ? '/admin/delivery' : undefined,
      icon: 'truck',
    });
    tiles.push({
      key: 'returns',
      label: f.t('dsh.returned'),
      value: dl.returnRate ?? 0,
      shown: f.pct(dl.returnRate),
      format: pct,
      delta: dl.returnRate !== null && dl.prevReturnRate !== null ? dl.returnRate - dl.prevReturnRate : null,
      deltaText: dl.returnRate !== null && dl.prevReturnRate !== null ? f.t('dsh.pts', { n: Math.abs((dl.returnRate - dl.prevReturnRate) * 100).toFixed(1) }) : undefined,
      good: 'down',
      vs: f.t('dsh.cameBack', { n: f.n(dl.returned) }),
      href: can(viewer, 'delivery.read') ? '/admin/delivery' : undefined,
      icon: 'uturn',
    });
  }
  return tiles.length ? <SummaryTiles tiles={tiles} label={f.t('dsh.lm.tiles')} testId="dash-tile" /> : null;
}

function Pipeline({ p }: { p: DashProps }) {
  const { f, data, s } = p;
  const st = data.stages!;
  const steps = [
    { id: 'new', c: 'c1', label: f.t('dsh.pipe.new'), n: st.placed, sub: st.placed ? f.t('dsh.pipe.oldest', { age: f.ago(st.oldestNew) }) : f.t('dsh.pipe.noneWaiting'), href: '/admin/orders/confirm' },
    { id: 'confirmed', c: 'c3', label: f.t('dsh.pipe.confirmed'), n: st.confirmed, sub: f.t('dsh.pipe.toPack'), href: '/admin/orders?view=confirmed' },
    { id: 'packed', c: 'c4', label: f.t('dsh.pipe.packed'), n: st.packed, sub: st.toBook ? f.t('dsh.pipe.toBook', { n: f.n(st.toBook) }) : f.t('dsh.pipe.allBooked'), href: '/admin/orders?view=packed' },
    { id: 'courier', c: 'c5', label: f.t('dsh.pipe.courier'), n: st.withCourier, sub: st.byCourier.map((c) => `${c.name} ${f.n(c.n)}`).join(' · ') || '—', href: '/admin/orders?view=courier' },
    { id: 'today', c: 'c2', label: f.t('dsh.pipe.today'), n: st.deliveredToday, sub: f.t('dsh.pipe.yesterday', { n: f.n(st.deliveredYesterdayByNow) }), href: '/admin/orders?view=delivered' },
  ];
  const max = Math.max(1, ...steps.map((x) => x.n));
  return (
    <section className="lm-card lm-in lm-pipe" data-testid="dash-pipe" aria-labelledby="lm-pipe-h">
      <div className="lm-card-h">
        <h2 id="lm-pipe-h">{f.t('dsh.pipe.title')}</h2>
        <Link className="lm-btn gh sm" href="/admin/orders">
          {f.t('dsh.pipe.go')}
        </Link>
      </div>
      <p className="lm-sub">{f.t('dsh.pipe.open', { n: f.n(st.open) })}</p>
      <ul className="lm-bars">
        {steps.map((x) => (
          <li key={x.id}>
            <Link href={x.href} data-testid={`dash-stage-${x.id}`} aria-label={`${x.label}: ${f.n(x.n)} — ${x.sub}`}>
              <span className="lm-bar-l">{x.label}</span>
              <span className="lm-bar-t" aria-hidden="true">
                <i className={x.c} style={{ width: `${Math.max(x.n ? 4 : 0, Math.round((x.n / max) * 100))}%` }} />
              </span>
              <b className="lm-bar-n">{f.n(x.n)}</b>
              <small className="lm-bar-s">{x.sub}</small>
            </Link>
          </li>
        ))}
      </ul>
      <p className="lm-sub lm-o2c">
        {f.t('dsh.pipe.o2c')}: <b>{st.o2cHours !== null ? f.t('dsh.hours', { n: f.n(st.o2cHours) }) : '—'}</b>
        {st.o2cHours !== null && st.o2cPrevHours !== null && st.o2cPrevHours > 0 ? (
          <> · {f.t(st.o2cHours <= st.o2cPrevHours ? 'dsh.pipe.faster' : 'dsh.pipe.slower', { n: f.n(Math.abs(st.o2cHours - st.o2cPrevHours)) })}</>
        ) : null}
        {s.targetHours ? <> · {f.t('dsh.pipe.target', { n: f.n(s.targetHours) })}</> : st.o2cHours === null ? <> · {f.t('dsh.pipe.noO2c')}</> : null}
      </p>
    </section>
  );
}

function Feed({ p }: { p: DashProps }) {
  const { f } = p;
  const rows = p.data.feed!;
  return (
    <section className="lm-card lm-in lm-feed" data-testid="dash-feed" aria-labelledby="lm-feed-h">
      <div className="lm-card-h">
        <h2 id="lm-feed-h">{f.t('dsh.lm.feed')}</h2>
        <span className="lm-tag ok">{f.t('dsh.lm.now')}</span>
      </div>
      {rows.length ? (
        <ul className="lm-feed-l">
          {rows.map((r) => {
            const area = f.lang === 'bn' && r.areaBn ? r.areaBn : r.areaEn;
            return (
              <li key={r.id}>
                <Link href={`/admin/orders/${r.id}`} data-testid="dash-feed-row">
                  <span className={`lm-fdot st-${r.status.toLowerCase()}`} aria-hidden="true" />
                  <span className="lm-feed-m">
                    <b>{f.t('dsh.lm.placed', { name: r.name ?? f.t('dsh.lm.someone'), number: r.number })}</b>
                    <small>{[f.money(r.totalMinor), area, f.ago(r.placedAt), f.t(`orders.st.${r.status}`)].filter(Boolean).join(' · ')}</small>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title={f.t('dsh.lm.noFeed')} tone="calm" icon="bag" testId="dash-feed-empty" />
      )}
    </section>
  );
}

function Goal({ p }: { p: DashProps }) {
  const { f } = p;
  const g = p.data.goal!;
  const share = g.goalMinor > 0 ? g.salesMinor / g.goalMinor : null;
  const r = 44;
  const len = 2 * Math.PI * r;
  const shown = share === null ? 0 : Math.min(1, share);
  return (
    <section className="lm-card lm-in lm-goal" data-testid="dash-goal" aria-labelledby="lm-goal-h">
      <h2 id="lm-goal-h">{f.t('dsh.lm.goal', { month: new Intl.DateTimeFormat(f.locale, { month: 'long', timeZone: 'UTC' }).format(new Date(`${g.to}T00:00:00Z`)) })}</h2>
      <div className="lm-goal-b">
        <svg viewBox="0 0 100 100" className="lm-ring" role="img" aria-label={share === null ? f.t('dsh.lm.goalNone') : f.t('dsh.lm.goalAria', { pct: f.pct(share, 0) })}>
          <circle cx="50" cy="50" r={r} className="lm-ring-bg" />
          <circle cx="50" cy="50" r={r} className="lm-ring-fg" strokeDasharray={`${(shown * len).toFixed(1)} ${len.toFixed(1)}`} transform="rotate(-90 50 50)" />
          <text x="50" y="50" className="lm-ring-t">
            {share === null ? '—' : f.pct(share, 0)}
          </text>
        </svg>
        <div className="lm-goal-x">
          <b className="lm-goal-n">{f.money(g.salesMinor)}</b>
          <span>{share === null ? f.t('dsh.lm.goalNone') : f.t('dsh.lm.goalOf', { goal: f.money(g.goalMinor), n: f.n(g.daysLeft) })}</span>
        </div>
      </div>
    </section>
  );
}

function Couriers({ p }: { p: DashProps }) {
  const { f, viewer } = p;
  const dl = p.data.delivery!;
  const list = dl.couriers.filter((c) => c.finished > 0);
  return (
    <section className="lm-card lm-in a3-B" data-testid="dash-couriers" aria-labelledby="lm-cour-h">
      <div className="lm-card-h">
        <h2 id="lm-cour-h">{f.t('dsh.cour.title')}</h2>
        {can(viewer, 'delivery.read') ? (
          <Link className="lm-btn gh sm" href="/admin/delivery">
            {f.t('shell.sec.delivery')}
          </Link>
        ) : null}
      </div>
      <p className="lm-sub">{f.t('dsh.cour.sub', { n: f.n(dl.days) })}</p>
      {list.length ? (
        list.map((c) => (
          <div className="a3-cour" key={c.id}>
            <div className="a3-ct2">
              <b>{c.name}</b>
              <span className="a3-pc a3-num">{f.pct(c.rate)}</span>
              <Delta f={f} x={c.rate !== null && c.prevRate !== null ? c.rate - c.prevRate : null} pts />
            </div>
            <Bar p={c.rate ?? 0} />
            <div className="a3-meta">
              {f.t('dsh.cour.returns', { pct: f.pct(c.finished ? c.returned / c.finished : null) })}
              {c.avgDays !== null ? f.t('dsh.cour.reaches', { n: c.avgDays.toFixed(1) }) : ''}
            </div>
          </div>
        ))
      ) : (
        <EmptyState title={f.t(dl.finished ? 'dsh.cour.noCourier' : 'dsh.noneFinished', { n: f.n(dl.days) })} tone="calm" icon="truck" />
      )}
      {dl.bestBand ? (
        <p className="lm-tip">
          <ShellIcon name="zap" size={16} />
          <span>{f.t('dsh.cour.best', { band: f.lang === 'bn' && dl.bestBand.nameBn ? dl.bestBand.nameBn : dl.bestBand.nameEn, courier: dl.bestBand.courier, pct: f.pct(dl.bestBand.rate, 0) })}</span>
        </p>
      ) : null}
    </section>
  );
}

function ListCard({ id, title, sub, link, children, testId }: { id: string; title: string; sub: string; link: { href: string; label: string } | null; children: ReactNode; testId?: string }) {
  return (
    <section className="lm-card lm-in a3-B" data-testid={testId} aria-labelledby={`lm-${id}-h`}>
      <div className="lm-card-h">
        <h2 id={`lm-${id}-h`}>{title}</h2>
        {link ? (
          <Link className="lm-btn gh sm" href={link.href}>
            {link.label}
          </Link>
        ) : null}
      </div>
      <p className="lm-sub">{sub}</p>
      {children}
    </section>
  );
}

/** The owner's two cards for this page (`admin.today`, `settings.write`): the live feed and the monthly goal. */
function PageSettings({ p }: { p: DashProps }) {
  const { f } = p;
  const t = p.today;
  if (!t || !can(p.viewer, 'settings.write')) return null;
  const unit = 10 ** moneyOf(f.currency, f.locale).digits;
  const cards: SettingCardDef[] = [
    { key: 'feed', title: f.t('dsh.lm.setFeed'), text: f.t('dsh.lm.setFeedText'), on: t.liveRows > 0, fields: [{ name: 'rows', label: f.t('dsh.lm.setRows'), kind: 'number', value: t.liveRows || 6, min: 1, max: 20, step: 1 }] },
    {
      key: 'goal',
      title: f.t('dsh.lm.setGoal'),
      text: f.t('dsh.lm.setGoalText'),
      on: t.goal.on,
      fields: [{ name: 'amount', label: f.t('dsh.lm.setAmount'), kind: 'number', value: Math.round(t.goal.amountMinor / unit), min: 0, max: 1_000_000_000, step: 1, unit: f.currency }],
    },
  ];
  return (
    <details className="a2-more-opts lm-today-set" data-testid="dash-settings">
      <summary>{f.t('dsh.lm.settings')}</summary>
      <SettingCards cards={cards} save={{ method: 'PUT', url: '/api/admin/dashboard/today' }} testId="dash-setcards" />
    </details>
  );
}

function Overview(p: DashProps) {
  const { f, data, viewer, s } = p;
  return (
    <>
      <div className="lm-today-top">
        {data.money ? <Hero p={p} /> : null}
        {data.queues ? <Needs p={p} /> : null}
      </div>
      <Tiles p={p} />
      <div className="lm-today-g3">
        {data.stages ? <Pipeline p={p} /> : null}
        {data.feed ? <Feed p={p} /> : null}
        {data.goal ? <Goal p={p} /> : null}
      </div>
      <div className="lm-today-g3">
        {data.top ? (
          <ListCard id="top" title={f.t('dsh.top.title')} sub={f.t('dsh.top.sub', { n: f.n(s.courierDays) })} link={can(viewer, 'catalogue.read') ? { href: '/admin/products', label: f.t('dsh.all') } : null} testId="dash-top">
            <TopProducts f={f} rows={data.top} />
          </ListCard>
        ) : null}
        {data.delivery ? <Couriers p={p} /> : null}
        {data.lowStock ? (
          <ListCard id="low" title={f.t('dsh.low.title')} sub={f.t('dsh.low.sub')} link={{ href: '/admin/stock#st-low', label: f.t('dsh.low.link') }}>
            <LowStock f={f} rows={data.lowStock} />
          </ListCard>
        ) : null}
      </div>
      <PageSettings p={p} />
    </>
  );
}

function DashboardB(p: DashProps) {
  const { f, data, viewer } = p;
  const canMoney = can(viewer, 'metrics.read');
  const view = canMoney && p.q.view === 'money' ? 'money' : 'overview';
  const base = rangeHref(data.range.kind === 'custom' ? { kind: 'custom', from: data.range.from, to: data.range.to } : { kind: 'preset', days: data.range.days }, p.q.design);
  const views = canMoney ? (
    <div className="a3-seg" role="group" aria-label={f.t('dsh.viewAria')} data-testid="dash-views">
      <Link className={view === 'overview' ? 'on' : ''} href={base} aria-current={view === 'overview' ? 'true' : undefined} scroll={false}>
        <span>{f.t('dsh.viewOverview')}</span>
      </Link>
      <Link className={view === 'money' ? 'on' : ''} href={`${base}&view=money`} aria-current={view === 'money' ? 'true' : undefined} scroll={false}>
        <span>{f.t('dsh.viewMoney')}</span>
      </Link>
    </div>
  ) : null;
  return (
    <div className="a2-z lm-today" data-testid="dash" data-design="B" data-view={view} data-lm-ready="">
      <Head p={p} views={views} />
      {data.offSite?.length ? (
        // CN-035 (PR 391): the copies away from the server — the yellow line until both places are connected.
        <Link className="lm-banner warn" href="/admin/settings/system/backups" data-testid="dash-offsite">
          <ShellIcon name="alert" size={18} />
          <span>
            <b>{f.t('dsh.offSite.title')}</b> {f.t('dsh.offSite.text', { places: data.offSite.map((k) => f.t(`dsh.offSite.${k}`)).join(', ') })}
          </span>
        </Link>
      ) : null}
      {view === 'money' ? (
        // The money view's cards are the V12.4 ones (their figures arrive with S08/S13/S16); a light island until then.
        <div className="a3-B a3-dash lm-island" data-testid="dash-money">
          <MoneyView {...p} />
        </div>
      ) : (
        <Overview {...p} />
      )}
    </div>
  );
}

/** The small picture on Settings → Admin look (240 × 150), drawn with the theme's tokens. */
function ThumbB() {
  return (
    <svg viewBox="0 0 240 150" width="240" height="150" aria-hidden="true" className="lm-thumb">
      <rect width="240" height="150" fill="var(--lm-bg)" />
      <rect x="10" y="10" width="140" height="70" rx="10" fill="var(--lm-hero-solid)" />
      <path d="M18 66 L40 58 L62 62 L84 46 L106 52 L128 34 L142 38" fill="none" stroke="var(--lm-c1)" strokeWidth="3" strokeLinecap="round" />
      <rect x="158" y="10" width="72" height="70" rx="10" fill="var(--lm-sf)" />
      {[22, 38, 54].map((y) => (
        <rect key={y} x="166" y={y} width="56" height="9" rx="4" fill="var(--lm-chip)" />
      ))}
      {[10, 87, 164].map((x, i) => (
        <rect key={x} x={x} y="88" width="66" height="52" rx="10" fill="var(--lm-sf)" stroke={i === 2 ? 'var(--lm-c3)' : 'none'} />
      ))}
      <rect x="18" y="100" width="40" height="6" rx="3" fill="var(--lm-c1)" />
      <rect x="18" y="112" width="28" height="6" rx="3" fill="var(--lm-c3)" />
      <rect x="18" y="124" width="34" height="6" rx="3" fill="var(--lm-c2)" />
      <circle cx="197" cy="114" r="15" fill="none" stroke="var(--lm-c3)" strokeWidth="5" />
    </svg>
  );
}

export const dashboardB: LookDesign<DashProps, DashPart> = {
  key: 'B',
  name: { en: 'Today (Lumen)', bn: 'আজ (Lumen)' },
  desc: {
    en: 'The Lumen look: today’s sales in a big hero chart, what needs you with one button each, where orders are, the newest orders as they come in, an optional monthly goal and the cards that matter. Follows dark mode.',
    bn: 'Lumen চেহারা: বড় গ্রাফে বিক্রি, কী আপনার জন্য অপেক্ষা করছে (প্রতিটায় একটা বোতাম), অর্ডার এখন কোথায়, নতুন অর্ডার আসার সাথে সাথে, চাইলে মাসের লক্ষ্য, আর দরকারি কার্ডগুলো। ডার্ক মোডেও চলে।',
  },
  parts: ['money', 'stages', 'delivery', 'top', 'lowStock', 'queues', 'offSite', 'feed', 'goal'],
  Render: DashboardB,
  Thumb: ThumbB,
};


// PR 12 (CN-025, CN-027) — Dashboard design A, "Calm overview": the V12.4 default (demo 97z-adm2-rd2-dash.js
// a3DashB1/a3DashB2, the demo's design B). For launch it is the Dashboard's one design; the demo's other two (the V12.3
// classic cards and the command center) come after launch (PROGRESS.md follow-up 380). Overview: one big delivered-sales story with the period before as a dashed line and
// Ordered value beside it (never called sales), three short tiles (orders, delivery success, returned parcels), where
// every open order is right now, and four cards (top products, couriers, stock running out, what customers run into).
// "Money & marketing" (with metrics.read) is one click away; its figures (ad spend, ROAS, COD held by couriers, the cost
// of returns, the profit steps) have no store yet, so each card names the stage that brings it.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ResponsiveImage, altFor } from '@/components/media/ResponsiveImage';
import { nameIn } from '@/components/admin/products/model';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import type { DashPart, LowRow, TopRow } from '@/lib/admin-look/dashboard-data';
import { change, trailingAverage } from '@/lib/admin-look/chart';
import { rangeHref } from '@/lib/admin-look/range';
import type { ShellIconName } from '@/lib/admin-shell/icons';
import type { LookDesign } from '../types';
import { LookThumb } from '../thumbs';
import { Bar, BarsChart, Card, Delta, Empty, LineChart, Lnk, Pill, Soon, Spark, Tile } from '../kit';
import type { Fmt } from '../fmt';
import { can, DashHead, prevText, rangeText, type DashProps } from './common';

export function Photo({ image, name, lang, cls = 'sm' }: { image: TopRow['image']; name: string; lang: 'bn' | 'en'; cls?: 'xs' | 'sm' }) {
  return (
    <span className={`a3-ph ${cls}`} style={{ background: 'var(--a3-ph)' }}>
      {image ? <ResponsiveImage image={image} slot="thumb" sizes="40px" alt={altFor(image, lang, name)} /> : <ShellIcon name="shirt" size={cls === 'xs' ? 15 : 18} />}
    </span>
  );
}

const C1 = 'var(--a3-c1)';
const CBAD = 'var(--a3-cbad)';

export function TopProducts({ f, rows, testId }: { f: Fmt; rows: readonly TopRow[]; testId?: string }) {
  return rows.length ? (
    <div data-testid={testId}>
      {rows.map((r) => {
        const name = nameIn(f.lang, r);
        return (
          <Link key={r.productId} className="a3-row" href={`/admin/products/${r.productId}`}>
            <Photo image={r.image} name={name} lang={f.lang} />
            <span className="a3-nm">
              <b>{name}</b>
              <span>{f.t('dsh.top.orders', { n: f.n(r.orders) })}</span>
            </span>
            <span className="a3-rv">
              <b className="a3-num">{f.money(r.valueMinor)}</b>
              <span>{f.t('dsh.pcs', { n: f.n(r.units) })}</span>
            </span>
          </Link>
        );
      })}
    </div>
  ) : (
    <Empty text={f.t('dsh.top.none')} testId={testId} />
  );
}

export function LowStock({ f, rows }: { f: Fmt; rows: readonly LowRow[] }) {
  return rows.length ? (
    <div data-testid="dash-low">
      {rows.map((x) => {
        const name = nameIn(f.lang, x);
        const colour = f.lang === 'bn' && x.colourBn ? x.colourBn : x.colourEn;
        return (
          <Link key={x.variantId} className="a3-row" href={`/admin/products/${x.productId}`}>
            <Photo image={x.image} name={name} lang={f.lang} />
            <span className="a3-nm">
              <b>{name}</b>
              <span>{[colour, x.size].filter(Boolean).join(' · ')}</span>
            </span>
            <span className="a3-rv">
              {x.available ? <Pill tone="gold">{f.t('dsh.low.left', { n: f.n(x.available) })}</Pill> : <Pill tone="bad">{f.t('dsh.low.out')}</Pill>}
              <span>{x.available === 0 ? (x.waiting ? f.t('dsh.low.want', { n: f.n(x.waiting) }) : f.t('dsh.low.restock')) : x.daysLeft !== null ? f.t('dsh.low.days', { n: f.n(x.daysLeft) }) : f.t('dsh.low.slow')}</span>
            </span>
          </Link>
        );
      })}
    </div>
  ) : (
    <Empty text={f.t('dsh.low.none')} testId="dash-low" />
  );
}

/** The waiting lists that are a customer's problem, the most pressing first (B's "What customers are running into"). */
export function problemsOf(p: DashProps): { icon: ShellIconName; tone: 'bad' | 'gold' | 'mute'; title: string; sub: string; href: string }[] {
  const q = p.data.queues ?? [];
  const pick = (id: string) => q.find((r) => r.id === id);
  const out: ReturnType<typeof problemsOf> = [];
  const add = (id: string, icon: ShellIconName, tone: 'bad' | 'gold' | 'mute') => {
    const r = pick(id);
    if (r) out.push({ icon, tone, title: p.f.t(`dash.queue.${r.id}`), sub: r.oldest ? p.f.t('dash.queue.sub', { n: p.f.n(r.n), age: p.f.ago(r.oldest) }) : p.f.t('shell.nav.waiting', { n: p.f.n(r.n) }), href: r.def.href });
  };
  // PR 619 (qa-gate I4): the ERP's hold stops every new order — first
  add('erpHold', 'alert', 'bad');
  add('ordersCancelRequests', 'uturn', 'bad');
  add('ordersCancelPending', 'clock', 'gold');
  add('ordersReview', 'shield', 'gold');
  add('lowStock', 'box', 'mute');
  return out.slice(0, 4);
}

function Overview(p: DashProps) {
  const { f, data, s, viewer } = p;
  const m = data.money;
  const dl = data.delivery;
  const cd = data.chart.days;
  const hero = m ? (
    <section className="a3-card a3-hero" data-testid="dash-hero">
      <div className="a3-herot">
        <div data-testid="dash-kpi-sales">
          <div className="a3-kl">
            {f.t('dsh.sales')}
            <small>{f.t('dsh.salesNote')}</small>
          </div>
          <div className="a3-hv a3-num">{f.money(m.cur.sales.itemsMinor)}</div>
          <div className="a3-hm">
            <Delta f={f} x={change(m.cur.sales.itemsMinor, m.prev.sales.itemsMinor)} />
            <span>{f.t('dsh.vsAmount', { vs: prevText(f, data), amount: f.money(m.prev.sales.itemsMinor) })}</span>
            <Pill tone="gold" title={f.t('dsh.provisionalTip')}>
              {f.t('dash.status.provisional')}
            </Pill>
          </div>
        </div>
        <div className="a3-lg">
          <span>
            <i />
            {f.t('dsh.legend.cur', { n: f.n(cd) })}
          </span>
          <span>
            <i className="dash" />
            {f.t('dsh.legend.prev', { n: f.n(cd) })}
          </span>
        </div>
      </div>
      <div className="a3-ordv" data-testid="dash-kpi-ordered" title={f.t('dash.tile.orderedTitle')}>
        <span>{f.t('dsh.ordered')}</span>
        <b className="a3-num">{f.money(m.cur.ordered.valueMinor)}</b>
        <span>{f.t('dsh.orderedNote', { n: f.n(m.cur.ordered.orders) })}</span>
        <Delta f={f} x={change(m.cur.ordered.valueMinor, m.prev.ordered.valueMinor)} />
      </div>
      <LineChart
        id="dsh-b-sales"
        labels={m.chart.days.map((d) => f.day(d, true))}
        xl={m.chart.days.map((d) => f.day(d))}
        series={[
          { v: trailingAverage(m.chart.prevSales, s.smoothDays), color: 'var(--a3-cprev)', name: f.t('dsh.prevPeriod'), dash: true, w: 1.6, shown: m.chart.prevSales.map((v) => f.money(v)) },
          { v: trailingAverage(m.chart.sales, s.smoothDays), color: C1, name: f.t('dsh.sales'), area: true, w: 2.2, shown: m.chart.sales.map((v) => f.money(v)) },
        ]}
        h={196}
        label={f.t('dsh.chartLabel', { range: rangeText(f, data) })}
        yfmt={(v) => f.short(v)}
        foot={m.chart.days.map((_, i) => f.t('dsh.foot', { amount: f.money(m.chart.sales[i] ?? 0), n: f.n(m.chart.orders[i] ?? 0) }))}
      />
      {s.smoothDays > 1 ? <p className="a3-chn2">{f.t('dsh.smoothNote', { n: f.n(s.smoothDays) })}</p> : null}
    </section>
  ) : null;

  const tiles: ReactNode[] = [];
  if (m)
    tiles.push(
      <Tile key="o" className="a3-card a3-tile" href={can(viewer, 'orders.read') ? '/admin/orders' : undefined} testId="dash-tile-orders">
        <div className="a3-tx">
          <div className="a3-kl">{f.t('dsh.orders')}</div>
          <div className="a3-tv a3-num">{f.n(m.cur.ordered.orders)}</div>
          <div className="a3-tn">
            <Delta f={f} x={change(m.cur.ordered.orders, m.prev.ordered.orders)} />
            <span>{f.t('dsh.avgOrdered', { amount: m.cur.ordered.orders ? f.money(Math.round(m.cur.ordered.valueMinor / m.cur.ordered.orders)) : '—' })}</span>
          </div>
        </div>
        <Spark id="dsh-b-sp-o" values={m.chart.orders.slice(-p.sparkDays)} w={92} h={40} />
      </Tile>,
    );
  if (dl) {
    tiles.push(
      <Tile key="d" className="a3-card a3-tile" href={can(viewer, 'delivery.read') ? '/admin/delivery' : undefined} testId="dash-tile-success">
        <div className="a3-tx">
          <div className="a3-kl">{f.t('dsh.success')}</div>
          <div className="a3-tv a3-num">{f.pct(dl.rate)}</div>
          <div className="a3-tn">
            <Delta f={f} x={dl.rate !== null && dl.prevRate !== null ? dl.rate - dl.prevRate : null} pts />
            <span>{dl.finished ? f.t('dsh.accepted', { kept: f.n(dl.kept), n: f.n(dl.finished) }) : f.t('dsh.noneFinished', { n: f.n(dl.days) })}</span>
          </div>
        </div>
        <Spark id="dsh-b-sp-d" values={dl.weekly} w={92} h={40} />
      </Tile>,
      <Tile key="r" className="a3-card a3-tile" href={can(viewer, 'delivery.read') ? '/admin/delivery' : undefined} testId="dash-tile-returns">
        <div className="a3-tx">
          <div className="a3-kl">{f.t('dsh.returned')}</div>
          <div className="a3-tv a3-num">{f.pct(dl.returnRate)}</div>
          <div className="a3-tn">
            <Delta f={f} x={dl.returnRate !== null && dl.prevReturnRate !== null ? dl.returnRate - dl.prevReturnRate : null} pts good="down" />
            <span>{f.t('dsh.cameBack', { n: f.n(dl.returned) })}</span>
          </div>
        </div>
        <Spark id="dsh-b-sp-r" values={dl.weekly.map((w) => (w === null ? null : 1 - w))} color={CBAD} w={92} h={40} />
      </Tile>,
    );
  }
  const top = hero || tiles.length ? (
    <div className={`a3-dg1${hero ? '' : ' solo'}`}>
      {hero}
      {tiles.length ? <div className="a3-tiles">{tiles}</div> : null}
    </div>
  ) : null;

  const st = data.stages;
  const stg = (dot: string, label: string, n: number, sub: string, href: string, id: string) => (
    <Link className="a3-stg" href={href} key={id} data-testid={`dash-stage-${id}`}>
      <span className="a3-sl">
        <i style={{ background: dot }} />
        {label}
      </span>
      <b className="a3-num">{f.n(n)}</b>
      <span className="a3-ss">{sub}</span>
    </Link>
  );
  const pipe = st ? (
    <section className="a3-card a3-pipe" data-testid="dash-pipe">
      <div className="a3-pipeh">
        <h2>{f.t('dsh.pipe.title')}</h2>
        <p>{f.t('dsh.pipe.open', { n: f.n(st.open) })}</p>
        <Lnk href="/admin/orders">{f.t('dsh.pipe.go')}</Lnk>
      </div>
      <div className="a3-stages">
        {stg('var(--a3-s1)', f.t('dsh.pipe.new'), st.placed, st.placed ? f.t('dsh.pipe.oldest', { age: f.ago(st.oldestNew) }) : f.t('dsh.pipe.noneWaiting'), '/admin/orders/confirm', 'new')}
        {stg('var(--a3-s2)', f.t('dsh.pipe.confirmed'), st.confirmed, f.t('dsh.pipe.toPack'), '/admin/orders?view=confirmed', 'confirmed')}
        {stg('var(--a3-s3)', f.t('dsh.pipe.packed'), st.packed, st.toBook ? f.t('dsh.pipe.toBook', { n: f.n(st.toBook) }) : f.t('dsh.pipe.allBooked'), '/admin/orders?view=packed', 'packed')}
        {stg('var(--a3-s4)', f.t('dsh.pipe.courier'), st.withCourier, st.byCourier.map((c) => `${c.name} ${f.n(c.n)}`).join(' · ') || '—', '/admin/orders?view=courier', 'courier')}
        {stg('var(--a3-s5)', f.t('dsh.pipe.today'), st.deliveredToday, f.t('dsh.pipe.yesterday', { n: f.n(st.deliveredYesterdayByNow) }), '/admin/orders?view=delivered', 'today')}
      </div>
      <div className="a3-avgt">
        <span>{f.t('dsh.pipe.o2c')}</span>
        <b className="a3-num">{st.o2cHours !== null ? f.t('dsh.hours', { n: f.n(st.o2cHours) }) : '—'}</b>
        <span>
          {st.o2cHours !== null && st.o2cPrevHours !== null && st.o2cPrevHours > 0 ? (
            <>
              <Delta
                f={f}
                x={(st.o2cHours - st.o2cPrevHours) / st.o2cPrevHours}
                good="down"
                raw={f.t(st.o2cHours <= st.o2cPrevHours ? 'dsh.pipe.faster' : 'dsh.pipe.slower', { n: f.n(Math.abs(st.o2cHours - st.o2cPrevHours)) })}
              />
              {s.targetHours ? ' · ' : ''}
            </>
          ) : null}
          {s.targetHours ? f.t('dsh.pipe.target', { n: f.n(s.targetHours) }) : st.o2cHours === null ? f.t('dsh.pipe.noO2c') : ''}
        </span>
      </div>
    </section>
  ) : null;

  const cards: ReactNode[] = [];
  if (data.top)
    cards.push(
      <Card key="top" title={f.t('dsh.top.title')} sub={f.t('dsh.top.sub', { n: f.n(s.courierDays) })} right={can(viewer, 'catalogue.read') ? <Lnk href="/admin/products">{f.t('dsh.all')}</Lnk> : null} testId="dash-top">
        <TopProducts f={f} rows={data.top} />
      </Card>,
    );
  if (dl)
    cards.push(
      <Card key="cour" title={f.t('dsh.cour.title')} sub={f.t('dsh.cour.sub', { n: f.n(dl.days) })} right={can(viewer, 'delivery.read') ? <Lnk href="/admin/delivery">{f.t('shell.sec.delivery')}</Lnk> : null} testId="dash-couriers">
        {dl.couriers.filter((c) => c.finished > 0).length ? (
          dl.couriers
            .filter((c) => c.finished > 0)
            .map((c) => (
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
          <Empty text={f.t(dl.finished ? 'dsh.cour.noCourier' : 'dsh.noneFinished', { n: f.n(dl.days) })} />
        )}
        {dl.bestBand ? (
          <div className="a3-tip2">
            <ShellIcon name="zap" size={15} />
            <span>{f.t('dsh.cour.best', { band: f.lang === 'bn' && dl.bestBand.nameBn ? dl.bestBand.nameBn : dl.bestBand.nameEn, courier: dl.bestBand.courier, pct: f.pct(dl.bestBand.rate, 0) })}</span>
          </div>
        ) : null}
      </Card>,
    );
  if (data.lowStock)
    cards.push(
      <Card key="low" title={f.t('dsh.low.title')} sub={f.t('dsh.low.sub')} right={<Lnk href="/admin/stock#st-low">{f.t('dsh.low.link')}</Lnk>}>
        <LowStock f={f} rows={data.lowStock} />
      </Card>,
    );
  if (data.queues) {
    const pr = problemsOf(p);
    cards.push(
      <Card key="prob" title={f.t('dsh.prob.title')} sub={f.t('dsh.prob.sub')} testId="dash-problems">
        {pr.length ? (
          pr.map((x) => (
            <Link key={x.href} className="a3-prob" href={x.href}>
              <span className={`a3-pi ${x.tone}`}>
                <ShellIcon name={x.icon} size={16} />
              </span>
              <span>
                <b>{x.title}</b>
                <span>{x.sub}</span>
              </span>
            </Link>
          ))
        ) : (
          <Empty text={f.t('dsh.prob.none')} />
        )}
        <p className="a3-cap c">{f.t('dsh.prob.later', { a: f.t('dsh.stage.S21'), b: f.t('dsh.stage.S22') })}</p>
      </Card>,
    );
  }
  return (
    <>
      {top}
      {pipe}
      {cards.length ? (
        <div className="a3-dg3" style={{ ['--n' as string]: cards.length }}>
          {cards}
        </div>
      ) : null}
    </>
  );
}

function SoonKpi({ f, label, stage, what }: { f: Fmt; label: string; stage: string; what: string }) {
  return (
    <div className="a3-card a3-kpi" data-testid={`dash-soon-${stage}`}>
      <div className="a3-kl">{label}</div>
      <div className="a3-kv a3-num a3-faint">—</div>
      <div className="a3-tn">
        <span>{f.t('dsh.soonShort', { what, stage: f.t(`dsh.stage.${stage}`) })}</span>
      </div>
    </div>
  );
}

function MoneyView(p: DashProps) {
  const { f, data } = p;
  const m = data.money;
  return (
    <>
      <div className="a3-k4">
        <SoonKpi f={f} label={f.t('dsh.mv.ad')} stage="S13" what={f.t('dsh.mv.adWhat')} />
        <SoonKpi f={f} label={f.t('dsh.mv.roas')} stage="S13" what={f.t('dsh.mv.roasWhat')} />
        <SoonKpi f={f} label={f.t('dsh.mv.cod')} stage="S08" what={f.t('dsh.mv.codWhat')} />
        <SoonKpi f={f} label={f.t('dsh.mv.rto')} stage="S08" what={f.t('dsh.mv.rtoWhat')} />
      </div>
      <div className="a3-dg2">
        <Card cls="a3-wfc" title={f.t('dsh.mv.water')} sub={f.t('dsh.mv.waterSub')}>
          <Soon f={f} stage="S16" what={f.t('dsh.mv.waterWhat')} />
        </Card>
        <Card cls="a3-chan" title={f.t('dsh.mv.chan')} sub={f.t('dsh.mv.chanSub')}>
          <Soon f={f} stage="S13" what={f.t('dsh.mv.chanWhat')} />
        </Card>
      </div>
      <div className="a3-dg3" style={{ ['--n' as string]: 3 }}>
        <Card title={f.t('dsh.mv.codStuck')} sub={f.t('dsh.mv.codStuckSub')}>
          <Soon f={f} stage="S08" what={f.t('dsh.mv.codWhat')} />
        </Card>
        <Card title={f.t('dsh.mv.why')} sub={f.t('dsh.mv.whySub')}>
          <Soon f={f} stage="S08" what={f.t('dsh.mv.whyWhat')} />
        </Card>
        <Card title={f.t('dsh.mv.adsSales')} sub={f.t('dsh.mv.adsSalesSub')}>
          {m ? (
            <BarsChart
              labels={m.chart.days.map((d) => f.day(d, true))}
              xl={m.chart.days.map((d) => f.day(d))}
              series={[{ v: m.chart.sales, color: C1, name: f.t('dsh.sales'), shown: m.chart.sales.map((v) => f.money(v)) }]}
              h={170}
              label={f.t('dsh.chartLabel', { range: rangeText(f, data) })}
              yfmt={(v) => f.short(v)}
            />
          ) : null}
          <p className="a3-cap c">{f.t('dsh.soonShort', { what: f.t('dsh.mv.adWhat'), stage: f.t('dsh.stage.S13') })}</p>
        </Card>
      </div>
    </>
  );
}

function DashboardA(p: DashProps) {
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
    <div className="a2-z a3-B a3-dash" data-testid="dash" data-design="A" data-view={view}>
      <DashHead p={p} views={views} />
      {view === 'money' ? <MoneyView {...p} /> : <Overview {...p} />}
    </div>
  );
}

export const dashboardA: LookDesign<DashProps, DashPart> = {
  key: 'A',
  name: { en: 'Calm overview', bn: 'শান্ত সারসংক্ষেপ' },
  desc: {
    en: 'One big delivered-sales story with a comparison line, where every order is right now, and four short cards. A money & marketing view sits one click away.',
    bn: 'একটা বড় ডেলিভারি বিক্রির গ্রাফ আর তুলনা, অর্ডার এখন কোথায়, আর চারটা ছোট কার্ড। টাকা ও মার্কেটিং এক ক্লিকে।',
  },
  parts: ['money', 'stages', 'delivery', 'top', 'lowStock', 'queues'],
  Render: DashboardA,
  // The demo's sketch of this design (its key there is B).
  Thumb: () => <LookThumb page="dashboard" id="B" />,
};

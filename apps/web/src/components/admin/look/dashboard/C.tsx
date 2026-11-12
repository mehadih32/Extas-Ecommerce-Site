// PR 655 (CN-025, CN-044 ERP lane, follow-up 380) — Dashboard design C, "Classic cards" (the demo's own letter for
// this one is A — the V12.3 dashboard, 97q-adm2-dash.js, kept here under its own next-free key since our "B" is the
// Lumen "Today" design, PR 631/CN-036: CN-025's rule is nothing deleted, nothing renamed, only added). Headline KPI
// cards (Delivered sales, Orders, Delivery success, Returned parcels), the delivered-sales trend against the period
// before with ordered value drawn beside it, "Needs you now" (every waiting list this person may open), orders by
// stage, top products and delivery success by courier. Every figure comes from the one loader
// (lib/admin-look/dashboard-data.ts); this design reads no part design A does not already read, and no new setting or
// migration is needed — it draws with the same `admin.dashboardDesigns` numbers (follow-up 380's own "numbers" line).
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import type { DashPart } from '@/lib/admin-look/dashboard-data';
import { change, trailingAverage } from '@/lib/admin-look/chart';
import type { LookDesign } from '../types';
import { LookThumb } from '../thumbs';
import { Bar, Card, Delta, Empty, LineChart, Lnk, Pill } from '../kit';
import type { Fmt } from '../fmt';
import { can, DashHead, rangeText, type DashProps } from './common';
import { TopProducts } from './A';

const GOLD = 'var(--gold)';
const C1 = 'var(--a3-c1)';

function Kpi({ label, note, value, sub, testId }: { label: string; note?: string; value: ReactNode; sub: ReactNode; testId: string }) {
  return (
    <div className="a3-card a3-kpi" data-testid={testId}>
      <div className="a3-kl">
        {label}
        {note ? <small>{note}</small> : null}
      </div>
      <div className="a3-kv a3-num">{value}</div>
      <div className="a3-tn">{sub}</div>
    </div>
  );
}

/** "Needs you now" — every waiting list this person may open, oldest first (the loader already filters by permission). */
const QUEUE_TONE: Record<string, 'bad' | 'gold' | 'mute'> = { bad: 'bad', warn: 'gold', info: 'mute' };

function NeedsNow(p: DashProps) {
  const { f, data } = p;
  const rows = data.queues ?? [];
  return (
    <Card title={f.t('dsh.need.title')} sub={rows.length ? f.t('dsh.need.sub', { n: f.n(rows.length) }) : undefined} testId="dash-need">
      {rows.length ? (
        rows.map((r) => (
          <Link key={r.id} className="a3-prob" href={r.def.href}>
            <span className={`a3-pi ${QUEUE_TONE[r.def.tone] ?? 'mute'}`}>
              <ShellIcon name={r.def.icon} size={16} />
            </span>
            <span>
              <b>{f.t(`dash.queue.${r.id}`)}</b>
              <span>{r.oldest ? f.t('dash.queue.sub', { n: f.n(r.n), age: f.ago(r.oldest) }) : f.t('shell.nav.waiting', { n: f.n(r.n) })}</span>
            </span>
          </Link>
        ))
      ) : (
        <Empty text={f.t('dsh.need.none')} />
      )}
    </Card>
  );
}

function StagesPipe(p: DashProps) {
  const { f, data, s } = p;
  const st = data.stages;
  if (!st) return null;
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
  return (
    <section className="a3-card a3-pipe" data-testid="dash-pipe">
      <div className="a3-pipeh">
        <h2>{f.t('dsh.pipe.title')}</h2>
        <p>{f.t('dsh.pipe.open', { n: f.n(st.open) })}</p>
        <Lnk href="/admin/orders">{f.t('dsh.pipe.go')}</Lnk>
      </div>
      <div className="a3-stages">
        {stg('var(--a3-s1)', f.t('dsh.pipe.new'), st.placed, st.placed ? f.t('dsh.pipe.oldest', { age: f.ago(st.oldestNew) }) : f.t('dsh.pipe.noneWaiting'), '/admin/orders/confirm', 'new')}
        {stg('var(--a3-s2)', f.t('dsh.pipe.confirmed'), st.confirmed, f.t('dsh.pipe.toPack'), '/admin/orders?view=confirmed', 'confirmed')}
        {stg(
          'var(--a3-s3)',
          f.t('dsh.pipe.packed'),
          st.packed,
          st.toBook ? f.t('dsh.pipe.toBook', { n: f.n(st.toBook) }) : f.t('dsh.pipe.allBooked'),
          '/admin/orders?view=packed',
          'packed',
        )}
        {stg(
          'var(--a3-s4)',
          f.t('dsh.pipe.courier'),
          st.withCourier,
          st.byCourier.map((c) => `${c.name} ${f.n(c.n)}`).join(' · ') || '—',
          '/admin/orders?view=courier',
          'courier',
        )}
        {stg(
          'var(--a3-s5)',
          f.t('dsh.pipe.today'),
          st.deliveredToday,
          f.t('dsh.pipe.yesterday', { n: f.n(st.deliveredYesterdayByNow) }),
          '/admin/orders?view=delivered',
          'today',
        )}
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
  );
}

function CourierCard(p: DashProps) {
  const { f, data, viewer } = p;
  const dl = data.delivery;
  if (!dl) return null;
  const active = dl.couriers.filter((c) => c.finished > 0);
  return (
    <Card
      title={f.t('dsh.cour.title')}
      sub={f.t('dsh.cour.sub', { n: f.n(dl.days) })}
      right={can(viewer, 'delivery.read') ? <Lnk href="/admin/delivery">{f.t('shell.sec.delivery')}</Lnk> : null}
      testId="dash-couriers"
    >
      {active.length ? (
        active.map((c) => (
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
          <span>
            {f.t('dsh.cour.best', {
              band: f.lang === 'bn' && dl.bestBand.nameBn ? dl.bestBand.nameBn : dl.bestBand.nameEn,
              courier: dl.bestBand.courier,
              pct: f.pct(dl.bestBand.rate, 0),
            })}
          </span>
        </div>
      ) : null}
    </Card>
  );
}

function kpisOf(f: Fmt, p: DashProps): ReactNode[] {
  const { data } = p;
  const m = data.money;
  const dl = data.delivery;
  const out: ReactNode[] = [];
  if (m) {
    out.push(
      <Kpi
        key="sales"
        testId="dash-kpi-sales"
        label={f.t('dsh.sales')}
        note={f.t('dsh.salesNote')}
        value={f.money(m.cur.sales.itemsMinor)}
        sub={
          <>
            <Delta f={f} x={change(m.cur.sales.itemsMinor, m.prev.sales.itemsMinor)} />
            <Pill tone="gold" title={f.t('dsh.provisionalTip')}>
              {f.t('dash.status.provisional')}
            </Pill>
          </>
        }
      />,
      <Kpi
        key="orders"
        testId="dash-kpi-orders"
        label={f.t('dsh.orders')}
        value={f.n(m.cur.ordered.orders)}
        sub={
          <>
            <Delta f={f} x={change(m.cur.ordered.orders, m.prev.ordered.orders)} />
            <span>{f.t('dsh.avgOrdered', { amount: m.cur.ordered.orders ? f.money(Math.round(m.cur.ordered.valueMinor / m.cur.ordered.orders)) : '—' })}</span>
          </>
        }
      />,
    );
  }
  if (dl) {
    out.push(
      <Kpi
        key="success"
        testId="dash-kpi-success"
        label={f.t('dsh.success')}
        value={f.pct(dl.rate)}
        sub={
          <>
            <Delta f={f} x={dl.rate !== null && dl.prevRate !== null ? dl.rate - dl.prevRate : null} pts />
            <span>{dl.finished ? f.t('dsh.accepted', { kept: f.n(dl.kept), n: f.n(dl.finished) }) : f.t('dsh.noneFinished', { n: f.n(dl.days) })}</span>
          </>
        }
      />,
      <Kpi
        key="returned"
        testId="dash-kpi-returned"
        label={f.t('dsh.returned')}
        value={f.pct(dl.returnRate)}
        sub={
          <>
            <Delta f={f} x={dl.returnRate !== null && dl.prevReturnRate !== null ? dl.returnRate - dl.prevReturnRate : null} pts good="down" />
            <span>{f.t('dsh.cameBack', { n: f.n(dl.returned) })}</span>
          </>
        }
      />,
    );
  }
  return out;
}

function DashboardC(p: DashProps) {
  const { f, data, s, viewer } = p;
  const m = data.money;
  const kpis = kpisOf(f, p);

  const trend = m ? (
    <Card title={f.t('dsh.chartLabel', { range: rangeText(f, data) })} testId="dash-trend">
      <LineChart
        id="dsh-c-sales"
        labels={m.chart.days.map((d) => f.day(d, true))}
        xl={m.chart.days.map((d) => f.day(d))}
        series={[
          { v: m.chart.ordered, color: GOLD, name: f.t('dsh.ordered'), shown: m.chart.ordered.map((v) => f.money(v)) },
          {
            v: trailingAverage(m.chart.prevSales, s.smoothDays),
            color: 'var(--a3-cprev)',
            name: f.t('dsh.prevPeriod'),
            dash: true,
            w: 1.6,
            shown: m.chart.prevSales.map((v) => f.money(v)),
          },
          { v: trailingAverage(m.chart.sales, s.smoothDays), color: C1, name: f.t('dsh.sales'), area: true, w: 2.2, shown: m.chart.sales.map((v) => f.money(v)) },
        ]}
        h={196}
        label={f.t('dsh.chartLabel', { range: rangeText(f, data) })}
        yfmt={(v) => f.short(v)}
        foot={m.chart.days.map((_, i) => f.t('dsh.foot', { amount: f.money(m.chart.sales[i] ?? 0), n: f.n(m.chart.orders[i] ?? 0) }))}
      />
      {s.smoothDays > 1 ? <p className="a3-chn2">{f.t('dsh.smoothNote', { n: f.n(s.smoothDays) })}</p> : null}
    </Card>
  ) : null;

  const cards: ReactNode[] = [];
  if (data.top)
    cards.push(
      <Card
        key="top"
        title={f.t('dsh.top.title')}
        sub={f.t('dsh.top.sub', { n: f.n(s.courierDays) })}
        right={can(viewer, 'catalogue.read') ? <Lnk href="/admin/products">{f.t('dsh.all')}</Lnk> : null}
        testId="dash-top"
      >
        <TopProducts f={f} rows={data.top} />
      </Card>,
    );
  if (data.delivery) cards.push(<CourierCard key="cour" {...p} />);
  if (data.queues) cards.push(<NeedsNow key="need" {...p} />);

  return (
    <div className="a2-z a3-dash" data-testid="dash" data-design="C">
      <DashHead p={p} />
      {data.offSite?.length ? (
        // CN-035 (PR 391): the same yellow "off-server backup" line as design A, so it is never missed on any design.
        <Link className="a2-note warn a3-offsite" href="/admin/settings/system/backups" data-testid="dash-offsite">
          <ShellIcon name="alert" size={15} />
          <span>
            <b>{f.t('dsh.offSite.title')}</b> {f.t('dsh.offSite.text', { places: data.offSite.map((k) => f.t(`dsh.offSite.${k}`)).join(', ') })}
          </span>
        </Link>
      ) : null}
      {kpis.length ? <div className="a3-k4">{kpis}</div> : null}
      {trend}
      <StagesPipe {...p} />
      {cards.length ? (
        <div className="a3-dg3" style={{ ['--n' as string]: cards.length }}>
          {cards}
        </div>
      ) : null}
    </div>
  );
}

export const dashboardC: LookDesign<DashProps, DashPart> = {
  key: 'C',
  name: { en: 'Classic cards', bn: 'ক্লাসিক কার্ড' },
  desc: {
    en: 'The V12.3 dashboard: headline numbers, the delivered-sales graph and the "Needs you now" list on the page.',
    bn: 'V12.3-এর ড্যাশবোর্ড: বড় সংখ্যা, বিক্রির গ্রাফ আর পাতার ওপর "এখনই করতে হবে" তালিকা।',
  },
  parts: ['money', 'stages', 'delivery', 'top', 'queues', 'offSite'],
  Render: DashboardC,
  // The demo's own key for this design is A (97z-adm2-rd2-dash.js a3Design('dashboard', 'A', …)).
  Thumb: () => <LookThumb page="dashboard" id="A" />,
};

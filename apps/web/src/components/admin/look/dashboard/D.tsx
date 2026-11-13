// PR 658 (CN-025/CN-027 follow-up 380, second half; CN-044, ERP lane, task 3 continued) — Dashboard design D, the
// demo's "Command center" (its own key there is C, 97z-adm2-rd2-dash.js A3X.designs.dashboard.C.views.home; here it
// is the registry's next free key, D, because the demo's "Classic cards" is already filed under C in PR 655/#132 —
// nothing renamed or deleted, only added, per CN-025's own rule). Six KPI tiles, the order funnel, when customers
// order (a weekday/hour heat map), couriers side by side and best sellers, plus the existing "what needs a look"
// queue card reused as-is.
//
// Two new loader parts (`funnel`, `hours` — lib/admin-look/dashboard-data.ts): every other figure reuses a part
// design A/B already read. The demo's day-by-day "orders by outcome" bar chart and its live activity feed are left
// out of this first build: the funnel already tells the same "how far did this period's orders get" story without a
// third new query, and the feed's visual language in this app (Lumen's `lm-feed`, PR 631) does not fit the `.a3-*`
// kit this design draws with — a plain new feed list is an easy, separately-filed follow-up, not a reason to hold
// this PR. Ad spend, ROAS, COD held by couriers and estimated profit have no store yet (same as designs A/B), so
// the sixth tile is "Stock running out" (real, built data) instead of a fabricated or placeholder figure.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { salesPerUnit, type DashPart } from '@/lib/admin-look/dashboard-data';
import type { LookDesign } from '../types';
import { LookThumb } from '../thumbs';
import { Bar, Card, Delta, Empty, Funnel, Heat, Lnk, Spark, Tile } from '../kit';
import type { Fmt } from '../fmt';
import { can, DashHead, rangeText, type DashProps } from './common';
import { TopProducts, problemsOf } from './A';

const S1 = 'var(--a3-s1)';
const S2 = 'var(--a3-s2)';
const S3 = 'var(--a3-s3)';
const S4 = 'var(--a3-s4)';
const S5 = 'var(--a3-s5)';

function KTile({ href, label, value, delta, spark, color, sub, testId }: { href: string; label: string; value: ReactNode; delta?: ReactNode; spark?: readonly (number | null)[]; color?: string; sub?: ReactNode; testId?: string }) {
  return (
    <Tile href={href} className="a3-ktile" testId={testId}>
      <span className="a3-kl">{label}</span>
      <span className="a3-kv a3-num">{value}</span>
      {delta ? <span className="a3-kd">{delta}</span> : null}
      {spark ? <Spark id={`d-${testId}`} values={spark} color={color ?? S1} w={160} h={34} /> : null}
      {sub ? <span className="a3-so">{sub}</span> : null}
    </Tile>
  );
}

/**
 * S28 · PR 691 (admin prototype v5, Home Command): the prototype's six tiles in its order — Orders, Sales delivered, Net profit,
 * Money with couriers, Return rate, Ad spend · sales per 1 — each only for a person who may read it. The tiles this design drew
 * before (average order, delivery success, running low on stock) stay in designs A, B and C; the low-stock work is a line in "Needs you now".
 */
function kpis(f: Fmt, p: DashProps): ReactNode[] {
  const { data } = p;
  const m = data.money;
  const dl = data.delivery;
  const pf = data.profit;
  const out: ReactNode[] = [];
  if (m)
    out.push(
      <KTile key="orders" testId="dash-kt-orders" href="/admin/orders" label={f.t('dsh.ordersPlaced')} value={f.n(m.cur.ordered.orders)} delta={<Delta f={f} x={m.prev.ordered.orders ? (m.cur.ordered.orders - m.prev.ordered.orders) / m.prev.ordered.orders : null} />} spark={m.chart.orders} color={S2} />,
      <KTile key="sales" testId="dash-kt-sales" href="/admin/orders" label={f.t('dsh.sales')} value={f.money(m.cur.sales.itemsMinor)} delta={<Delta f={f} x={m.prev.sales.itemsMinor ? (m.cur.sales.itemsMinor - m.prev.sales.itemsMinor) / m.prev.sales.itemsMinor : null} />} spark={m.chart.sales} color={S1} />,
    );
  if (pf)
    out.push(
      <KTile
        key="profit"
        testId="dash-kt-profit"
        href="/admin/money/budgets"
        label={f.t('dsh.cmd.profitTile')}
        value={pf.cur.netMinor === null ? f.t('dsh.cmd.profitUnknown') : f.money(pf.cur.netMinor)}
        delta={pf.cur.netMinor !== null && pf.prev.netMinor ? <Delta f={f} x={(pf.cur.netMinor - pf.prev.netMinor) / Math.abs(pf.prev.netMinor)} /> : undefined}
        sub={f.t('dsh.cmd.profitSub')}
      />,
    );
  if (data.cod) out.push(<KTile key="cod" testId="dash-kt-cod" href="/admin/money" label={f.t('dsh.cmd.codTile')} value={f.money(data.cod.minor)} sub={f.t('dsh.cmd.codSub', { n: f.n(data.cod.parcels) })} />);
  if (dl) out.push(<KTile key="returned" testId="dash-kt-returned" href="/admin/delivery" label={f.t('dsh.returned')} value={f.pct(dl.returnRate)} delta={<Delta f={f} x={dl.returnRate != null && dl.prevReturnRate != null ? dl.returnRate - dl.prevReturnRate : null} good="down" pts />} color={S5} />);
  if (pf) {
    const per = salesPerUnit(pf.cur.salesMinor, pf.cur.adsMinor);
    out.push(
      <KTile
        key="ads"
        testId="dash-kt-ads"
        href="/admin/marketing"
        label={f.t('dsh.cmd.adsTile')}
        value={pf.cur.adsMinor === null ? f.t('dsh.cmd.profitUnknown') : f.money(pf.cur.adsMinor)}
        sub={per === null ? f.t('dsh.cmd.adsNone') : f.t('dsh.cmd.adsPer', { x: per.toFixed(1), cur: f.currency })}
      />,
    );
  }
  return out;
}

/** S28 · PR 691: the library cards pinned to Home — a figure where Home has it, else a link to the Report library. */
function PinsCard(p: DashProps) {
  const { f, data } = p;
  const pins = data.pins ?? [];
  if (!pins.length) return null;
  return (
    <Card title={f.t('dsh.cmd.pinsTitle')} sub={f.t('dsh.cmd.pinsSub')} right={<Lnk href="/admin/reports">{f.t('dsh.cmd.pinOpen')}</Lnk>} testId="dash-pins">
      <div className="a3-kt">
        {pins.map((x) => (
          <KTile
            key={x.id}
            testId={`dash-pin-${x.id}`}
            href="/admin/reports"
            label={f.t(`dsh.cmd.pin_${x.id}`)}
            value={x.kind === 'link' ? '—' : x.now === null ? f.t('dsh.cmd.profitUnknown') : x.kind === 'money' ? f.money(x.now) : f.n(x.now)}
            delta={x.now !== null && x.prev ? <Delta f={f} x={(x.now - x.prev) / Math.abs(x.prev)} /> : undefined}
          />
        ))}
      </div>
    </Card>
  );
}

function FunnelCard(p: DashProps) {
  const { f, data } = p;
  const fn = data.funnel!;
  const steps = [
    { l: f.t('dsh.pipe.new'), n: fn.placed, color: S5 },
    { l: f.t('dsh.pipe.confirmed'), n: fn.confirmed, color: S4 },
    { l: f.t('dsh.pipe.packed'), n: fn.packed, color: S3 },
    { l: f.t('dsh.pipe.courier'), n: fn.withCourier, color: S2 },
    { l: f.t('dsh.cmd.delivered'), n: fn.delivered, color: S1, note: fn.placed ? f.t('dsh.cmd.funnelNote', { pct: Math.round((fn.delivered / fn.placed) * 100) }) : undefined },
  ];
  // The real Orders page has no per-stage deep link yet (only design A's "Go to orders" exists), so, unlike the
  // demo, each step here is plain text and the one real link sits beside the title instead.
  return (
    <Card cls="a3-func" title={f.t('dsh.cmd.funnelTitle')} sub={f.t('dsh.cmd.funnelSub', { range: rangeText(f, data) })} right={<Lnk href="/admin/orders">{f.t('dsh.pipe.go')}</Lnk>} testId="dash-funnel">
      <Funnel f={f} steps={steps} />
    </Card>
  );
}

function HeatCard(p: DashProps) {
  const { f, data } = p;
  const hr = data.hours!;
  const cols = ['12a', '2a', '4a', '6a', '8a', '10a', '12p', '2p', '4p', '6p', '8p', '10p'];
  const rows = hr.cells.map((v, i) => ({ l: f.weekday(i), v }));
  let peak = -1;
  let peakDay = '';
  let peakHour = '';
  hr.cells.forEach((row, d) => row.forEach((v, h) => { if (v > peak) { peak = v; peakDay = f.weekday(d); peakHour = cols[h]!; } }));
  const sub = f.t('dsh.cmd.hoursSub', { n: f.n(hr.days) }) + (peak > 0 ? f.t('dsh.cmd.hoursBusiest', { day: peakDay, hour: peakHour }) : '');
  return (
    <Card cls="a3-heatc" title={f.t('dsh.cmd.hoursTitle')} sub={sub} testId="dash-hours">
      <Heat rows={rows} cols={cols} every={2} label={f.t('dsh.cmd.hoursTitle')} cell={(v) => (v === 1 ? f.t('dsh.cmd.cellOne') : f.t('dsh.cmd.cell', { n: f.n(v) }))} />
      <div className="a3-hl">
        <span>{f.t('dsh.cmd.fewer')}</span>
        <i />
        <span>{f.t('dsh.cmd.more')}</span>
      </div>
    </Card>
  );
}

function NeedCard(p: DashProps) {
  const { f } = p;
  const pr = problemsOf(p);
  return (
    <Card title={f.t('dsh.prob.title')} sub={f.t('dsh.prob.sub')} testId="dash-need">
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
    </Card>
  );
}

function ScoreCard(p: DashProps) {
  const { f, data, s } = p;
  const dl = data.delivery!;
  return (
    <Card title={f.t('dsh.cmd.scoreTitle')} sub={f.t('dsh.cmd.scoreSub', { n: f.n(s.courierDays) })} right={<Lnk href="/admin/delivery">{f.t('dsh.cour.title')}</Lnk>} testId="dash-score">
      <table className="a3-tbl">
        <thead>
          <tr>
            <th>{f.t('dash.queue.courier') || f.t('dsh.cour.title')}</th>
            <th className="r">{f.t('dsh.cmd.parcels')}</th>
            <th>{f.t('dsh.success')}</th>
            <th className="r">{f.t('dsh.cmd.returns')}</th>
            <th className="r">{f.t('dsh.cmd.days')}</th>
            <th>{f.t('dsh.cmd.trend')}</th>
          </tr>
        </thead>
        <tbody>
          {dl.couriers.map((c) => (
            <tr key={c.id}>
              <td>
                <b>{c.name}</b>
              </td>
              <td className="r a3-num">{f.n(c.finished)}</td>
              <td>
                <Bar p={c.rate ?? 0} />
                <b className="a3-num">{f.pct(c.rate)}</b>
                <Delta f={f} x={c.rate != null && c.prevRate != null ? c.rate - c.prevRate : null} pts />
              </td>
              <td className="r a3-num">{f.pct(c.finished ? c.returned / c.finished : null, 0)}</td>
              <td className="r a3-num">{c.avgDays != null ? c.avgDays.toFixed(1) : '—'}</td>
              <td>
                <Spark id={`d-score-${c.id}`} values={c.weekly} color={S1} w={84} h={24} area={false} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function DashboardD(p: DashProps) {
  const { f, data, viewer } = p;
  const kt = kpis(f, p);
  const g2: ReactNode[] = [];
  if (data.funnel) g2.push(<FunnelCard key="fun" {...p} />);
  if (data.hours) g2.push(<HeatCard key="hours" {...p} />);
  if (data.queues) g2.push(<NeedCard key="need" {...p} />);
  const g3: ReactNode[] = [];
  if (data.delivery) g3.push(<ScoreCard key="score" {...p} />);
  if (data.top && can(viewer, 'products.read'))
    g3.push(
      <Card key="top" title={f.t('dsh.top.title')} sub={f.t('dsh.top.sub', { n: f.n(p.s.courierDays) })} right={<Lnk href="/admin/products">{f.t('dsh.top.title')}</Lnk>} testId="dash-top">
        <TopProducts f={f} rows={data.top} />
      </Card>,
    );
  return (
    <div className="a2-z a3-dash" data-testid="dash" data-design="D">
      <DashHead p={p} title={f.t('dsh.cmd.title')} />
      {kt.length ? <div className="a3-kt">{kt}</div> : null}
      <PinsCard {...p} />
      {g2.length ? (
        <div className="a3-dg3" style={{ ['--n' as string]: g2.length }}>
          {g2}
        </div>
      ) : null}
      {g3.length ? (
        <div className="a3-dg2" style={{ ['--n' as string]: g3.length }}>
          {g3}
        </div>
      ) : null}
    </div>
  );
}

export const dashboardD: LookDesign<DashProps, DashPart> = {
  key: 'D',
  name: { en: 'Command center', bn: 'কমান্ড সেন্টার' },
  desc: {
    en: 'Dense and data-rich: six live KPI tiles (orders, sales, net profit, money with couriers, return rate, ad spend), your pinned reports, the order funnel, when customers order, couriers side by side and best sellers.',
    bn: 'ঘন আর তথ্যে ভরা: ছয়টা KPI, অর্ডারের ধাপ, কখন অর্ডার আসে, কুরিয়ার পাশাপাশি আর সেরা বিক্রি।',
  },
  parts: ['money', 'delivery', 'top', 'lowStock', 'queues', 'funnel', 'hours', 'profit', 'cod', 'pins'],
  Render: DashboardD,
  // The demo's own key for this design is C (97z-adm2-rd2-dash.js a3Design('dashboard', 'C', …)).
  Thumb: () => <LookThumb page="dashboard" id="C" />,
};

// PR 658 (CN-025/CN-027 follow-up 380, second half; CN-044, ERP lane, task 3 continued) — Dashboard design D, the
// demo's "Command center" (its own key there is C, 97z-adm2-rd2-dash.js A3X.designs.dashboard.C.views.home; here it
// is the registry's next free key, D, because the demo's "Classic cards" is already filed under C in PR 655/#132 —
// nothing renamed or deleted, only added, per CN-025's own rule).
//
// PR 795 (prototype v5 parity, lane A2): this design is the prototype's Home design A, line by line, and nothing else: greeting,
// profit snapshot, six tiles with their icons, the sales trend with "Do now" (and the "Nightly page check" line under it),
// "Products: what to do", "Ads: are they paying?" over "Delivery: by courier", "In short", "Month target", "ERP link" and "Latest
// orders". The order funnel, "when customers order" and the couriers table this design drew before are not in the prototype and
// are gone from Home (the figures stay in Reports); their loader parts (`funnel`, `hours`) stay for the registry.
import type { ReactNode } from 'react';
import { salesPerUnit, type DashPart } from '@/lib/admin-look/dashboard-data';
import type { LookDesign } from '../types';
import { LookThumb } from '../thumbs';
import { Card, Delta, Lnk, Spark, Tile } from '../kit';
import type { Fmt } from '../fmt';
import { can, DashHead, type DashProps } from './common';
import { ChartDoNow, CourierMid, ProtoLower, ProtoTop, TrendCard } from './ProtoCards';

const S1 = 'var(--a3-s1)';
const S2 = 'var(--a3-s2)';
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

/** S28 · PR 691: the library cards pinned to Home. PR 800: no longer drawn on Home (the prototype's Home has no pinned-reports card); kept, with the pin data, for the Report library. */
export function PinsCard(p: DashProps) {
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

function DashboardD(p: DashProps) {
  const { f, data, viewer } = p;
  const kt = kpis(f, p);
  return (
    <div className="a2-z a3-dash" data-testid="dash" data-design="D">
      <DashHead p={p} />
      <ProtoTop {...p} />
      {kt.length && !can(viewer, 'metrics.read') ? <div className="a3-kt">{kt}</div> : null}
      {data.money ? <ChartDoNow p={p} lead={<TrendCard p={p} id="dsh-d-sales" />} /> : null}
      <ProtoLower {...p} mid={data.delivery ? <CourierMid {...p} /> : null} />
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
  parts: ['money', 'delivery', 'top', 'lowStock', 'queues', 'feed', 'profit', 'cod', 'pins', 'goal', 'ads', 'erp', 'pageCheck'],
  Render: DashboardD,
  // The demo's own key for this design is C (97z-adm2-rd2-dash.js a3Design('dashboard', 'C', …)).
  Thumb: () => <LookThumb page="dashboard" id="C" />,
};

// PR 655 (CN-025, CN-044 ERP lane, follow-up 380) — Dashboard design C, "Classic cards" (the demo's own letter for
// this one is A — the V12.3 dashboard, 97q-adm2-dash.js, kept here under its own next-free key since our "B" is the
// Lumen "Today" design, PR 631/CN-036: CN-025's rule is nothing deleted, nothing renamed, only added).
// PR 862 (prototype v5 parity, lane A6): the page is the prototype's Home design C "Classic", line by line
// (docs/demo/admin-proto-v5/js/m-home.js): the yellow COD line and the profit snapshot, four figure cards (orders, delivered
// sales, net profit, money with couriers), the sales trend over the full width, then "Do now", "Products: what to do" and a
// column with "Delivery: by courier" over "ERP link", and last "Ads: are they paying?" beside "Latest orders". The order
// stages, the delivery-success and returned-parcels cards and the second top-products card this design drew before are not on
// the prototype's Home and are gone from it (the figures stay in Reports). Every figure comes from the one loader
// (lib/admin-look/dashboard-data.ts); no new setting or migration.
import Link from 'next/link';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import type { DashPart } from '@/lib/admin-look/dashboard-data';
import type { LookDesign } from '../types';
import { LookThumb } from '../thumbs';
import { AdsPaying, CodStrip, CourierMid, DoNow, ErpCard, LatestOrders, ProductsToDo, ProfitSnap, SixTiles, TrendCard } from './ProtoCards';
import { can, DashHead, type DashProps } from './common';

function DashboardC(p: DashProps) {
  const { f, data, viewer } = p;
  const canMoney = can(viewer, 'metrics.read');
  const hasMid = !!data.top;
  const hasAds = !!data.profit || !!data.ads?.rows.length;
  const right = data.delivery || data.erp;
  const cols = [data.queues, hasMid, right].filter(Boolean).length;
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
      {canMoney ? (
        <>
          <CodStrip p={p} />
          <ProfitSnap p={p} />
          <SixTiles p={p} only={['orders', 'sales', 'net', 'cod']} />
        </>
      ) : null}
      {data.money ? (
        <div className="a3-stk a3-classic-trend">
          <TrendCard p={p} id="dsh-c-sales" />
        </div>
      ) : null}
      {cols ? (
        <div className="a3-dg3 a3-proto" style={{ ['--n' as string]: cols }} data-testid="dash-classic-mid">
          {data.queues ? (
            <div className="a3-stk">
              <DoNow p={p} />
            </div>
          ) : null}
          {hasMid ? (
            <div className="a3-stk">
              <ProductsToDo p={p} />
            </div>
          ) : null}
          {right ? (
            <div className="a3-stk">
              {data.delivery ? <CourierMid {...p} /> : null}
              <ErpCard p={p} />
            </div>
          ) : null}
        </div>
      ) : null}
      {hasAds || data.feed ? (
        <div className="a3-dg3 a3-proto" style={{ ['--n' as string]: hasAds && data.feed ? 2 : 1 }} data-testid="dash-classic-low">
          {hasAds ? (
            <div className="a3-stk">
              <AdsPaying p={p} />
            </div>
          ) : null}
          {data.feed ? (
            <div className="a3-stk">
              <LatestOrders p={p} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export const dashboardC: LookDesign<DashProps, DashPart> = {
  key: 'C',
  name: { en: 'Classic cards', bn: 'ক্লাসিক কার্ড' },
  desc: {
    en: 'Classic: profit snapshot, four figure cards, the sales trend, "Do now", products, delivery by courier and the ERP link, then ads beside the newest orders.',
    bn: 'ক্লাসিক: প্রফিট স্ন্যাপশট, চারটা সংখ্যার কার্ড, বিক্রির ধারা, "এখন যা করবেন", প্রোডাক্ট, কুরিয়ার অনুযায়ী ডেলিভারি আর ERP সংযোগ, শেষে বিজ্ঞাপন আর নতুন অর্ডার।',
  },

  parts: ['money', 'delivery', 'top', 'lowStock', 'queues', 'offSite', 'goal', 'profit', 'cod', 'ads', 'feed', 'erp', 'pageCheck'],
  Render: DashboardC,
  // The demo's own key for this design is A (97z-adm2-rd2-dash.js a3Design('dashboard', 'A', …)).
  Thumb: () => <LookThumb page="dashboard" id="A" />,
};

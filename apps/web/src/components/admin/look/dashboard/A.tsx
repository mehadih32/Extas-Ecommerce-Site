// PR 12 (CN-025, CN-027) — Dashboard design A, "Calm overview": the V12.4 default (demo 97z-adm2-rd2-dash.js
// a3DashB1/a3DashB2, the demo's design B). For launch it is the Dashboard's one design; the demo's other two (the V12.3
// classic cards and the command center) come after launch (PROGRESS.md follow-up 380). Overview: one big delivered-sales story with the period before as a dashed line and
// Ordered value beside it (never called sales), three short tiles (orders, delivery success, returned parcels), where
// every open order is right now, and four cards (top products, couriers, stock running out, what customers run into).
// "Money & marketing" (with metrics.read) is one click away; its figures (ad spend, ROAS, COD held by couriers, the cost
// of returns, the profit steps) have no store yet, so each card names the stage that brings it.
import Link from 'next/link';
import { ResponsiveImage, altFor } from '@/components/media/ResponsiveImage';
import { nameIn } from '@/components/admin/products/model';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import type { DashPart, LowRow, TopRow } from '@/lib/admin-look/dashboard-data';
import { rangeHref } from '@/lib/admin-look/range';
import type { ShellIconName } from '@/lib/admin-shell/icons';
import type { LookDesign } from '../types';
import { LookThumb } from '../thumbs';
import { BarsChart, Card, Empty, Pill, Soon } from '../kit';
import type { Fmt } from '../fmt';
import { can, DashHead, rangeText, type DashProps } from './common';
import { ChartDoNow, CourierMid, DoNow, ProtoLower, ProtoTop, TrendCard } from './ProtoCards';

export function Photo({ image, name, lang, cls = 'sm' }: { image: TopRow['image']; name: string; lang: 'bn' | 'en'; cls?: 'xs' | 'sm' }) {
  return (
    <span className={`a3-ph ${cls}`} style={{ background: 'var(--a3-ph)' }}>
      {image ? <ResponsiveImage image={image} slot="thumb" sizes="40px" alt={altFor(image, lang, name)} /> : <ShellIcon name="shirt" size={cls === 'xs' ? 15 : 18} />}
    </span>
  );
}

const C1 = 'var(--a3-c1)';

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

/**
 * PR 862 (prototype v5 parity, lane A6): the overview is the prototype's Home design A "Command", line by line — the same page
 * as design D (profit snapshot, six figures, the sales trend with "Do now" beside it, Products / Ads over Delivery by courier /
 * In short, Month target, ERP link, Latest orders). The order pipeline, "Needs attention" and the second top-products and
 * low-stock cards this design drew before are not on the prototype's Home and are no longer drawn here.
 */
function Overview(p: DashProps) {
  const { data } = p;
  return (
    <>
      <ProtoTop {...p} />
      {data.money ? <ChartDoNow p={p} lead={<TrendCard p={p} id="dsh-a-sales" />} /> : data.queues ? <DoNow p={p} /> : null}
      <ProtoLower {...p} mid={data.delivery ? <CourierMid {...p} /> : null} />
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

export function MoneyView(p: DashProps) {
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
      {p.data.offSite?.length ? (
        // CN-035 (PR 391): the copies away from the server come soon after go-live; until both are connected this yellow
        // line is here every day (only for someone who sees System), and it leads to the Backups page.
        <Link className="a2-note warn a3-offsite" href="/admin/settings/system/backups" data-testid="dash-offsite">
          <ShellIcon name="alert" size={15} />
          <span>
            <b>{f.t('dsh.offSite.title')}</b> {f.t('dsh.offSite.text', { places: p.data.offSite.map((k) => f.t(`dsh.offSite.${k}`)).join(', ') })}
          </span>
        </Link>
      ) : null}
      {view === 'money' ? <MoneyView {...p} /> : <Overview {...p} />}
    </div>
  );
}

export const dashboardA: LookDesign<DashProps, DashPart> = {
  key: 'A',
  name: { en: 'Calm overview', bn: 'শান্ত সারসংক্ষেপ' },
  desc: {
    en: 'Profit snapshot, six figures, the sales trend with "Do now" beside it, products and ads, delivery by courier, a short summary, the month target and the newest orders. A money & marketing view sits one click away.',
    bn: 'প্রফিট স্ন্যাপশট, ছয়টা সংখ্যা, বিক্রির ধারা আর পাশে "এখন যা করবেন", প্রোডাক্ট ও বিজ্ঞাপন, কুরিয়ার অনুযায়ী ডেলিভারি, এক কথায়, মাসের লক্ষ্য আর নতুন অর্ডার। টাকা ও মার্কেটিং এক ক্লিকে।',
  },

  parts: ['money', 'stages', 'delivery', 'top', 'lowStock', 'queues', 'offSite', 'goal', 'profit', 'cod', 'ads', 'feed', 'erp', 'pageCheck'],
  Render: DashboardA,
  // The demo's sketch of this design (its key there is B).
  Thumb: () => <LookThumb page="dashboard" id="B" />,
};

// PR 631 (CN-036) — Dashboard design B (Lumen look: docs/demo/admin-look/LUMEN-SPEC.md §4).
// PR 862 (prototype v5 parity, lane A6): the Overview is the prototype's Home design B "Calm", line by line
// (docs/demo/admin-proto-v5/js/m-home.js): the yellow COD line and the profit snapshot, then ONE navy card with this month's
// net profit, the month target ("Change target") and the "In short" sentences; "Do now" beside four figures (orders, delivered
// sales, money with couriers, return rate); the sales trend; "Products: what to do" beside "Ads: are they paying?".
// Every figure comes from the same loader (lib/admin-look/dashboard-data.ts) and the same keys decide who sees what.
// The "Money & marketing" view, the range buttons, the "…" menu and the yellow off-site backup line stay as they were.
// The Lumen hero chart, the order pipeline, the live feed, the goal ring and the courier and low-stock cards of this
// design are not on the prototype's Home and are no longer drawn here (the same figures are in Reports).
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SettingCards, type SettingCardDef } from '@/components/admin/lumen/SettingCards';
import { moneyOf } from '@/components/admin/products/model';
import { PlaceGuide } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import type { DashPart } from '@/lib/admin-look/dashboard-data';
import { rangeHref } from '@/lib/admin-look/range';
import type { LookDesign } from '../types';
import { CsvButton, LookMenu } from '../LookMenu';
import { RangeSeg } from '../RangeSeg';
import { MoneyView } from './A';
import { AdsPaying, CalmHero, CodStrip, DoNow, ProductsToDo, ProfitSnap, SixTiles, TrendCard } from './ProtoCards';
import { can, type DashProps } from './common';

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

/** The owner's two cards for this page (`admin.today`, `settings.write`): the live feed and the monthly goal. */
function PageSettings({ p }: { p: DashProps }) {
  const { f } = p;
  const t = p.today;
  if (!t || !can(p.viewer, 'settings.write')) return null;
  const unit = 10 ** moneyOf(f.currency, f.locale).digits;
  const cards: SettingCardDef[] = [
    {
      key: 'goal',
      title: f.t('dsh.lm.setGoal'),
      text: f.t('dsh.lm.setGoalText'),
      on: t.goal.on,
      fields: [{ name: 'amount', label: f.t('dsh.lm.setAmount'), kind: 'number', value: Math.round(t.goal.amountMinor / unit), min: 0, max: 1_000_000_000, step: 1, unit: f.currency }],
    },
  ];
  return (
    <details className="a2-more-opts lm-today-set" id="dash-settings" data-testid="dash-settings">
      <summary>{f.t('dsh.lm.settings')}</summary>
      <SettingCards cards={cards} save={{ method: 'PUT', url: '/api/admin/dashboard/today' }} testId="dash-setcards" />
    </details>
  );
}

function Overview(p: DashProps) {
  const { data, viewer } = p;
  const canMoney = can(viewer, 'metrics.read');
  const hasTop = !!data.top;
  const hasAds = !!data.profit || !!data.ads?.rows.length;
  return (
    <div className="a3-B a3-dash lm-island" data-testid="dash-calm">
      {canMoney ? (
        <>
          <CodStrip p={p} />
          <ProfitSnap p={p} />
          <CalmHero p={p} />
        </>
      ) : null}
      <div className={`a3-calm-g2${data.queues ? '' : ' solo'}`} data-testid="dash-calm-mid">
        {data.queues ? <DoNow p={p} /> : null}
        {canMoney ? <SixTiles p={p} only={['orders', 'sales', 'cod', 'ret']} /> : null}
      </div>
      {data.money ? <TrendCard p={p} id="dsh-b-sales" /> : null}
      {hasTop || hasAds ? (
        <div className="a3-calm-g2 even" data-testid="dash-calm-low">
          {hasTop ? <ProductsToDo p={p} /> : null}
          {hasAds ? <AdsPaying p={p} /> : null}
        </div>
      ) : null}
      <PageSettings p={p} />
    </div>
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
    en: 'Calm: profit snapshot, one navy card with this month\'s net profit, the month target and a short summary, "Do now" beside four figures, the sales trend, products and ads. Follows dark mode.',
    bn: 'শান্ত: প্রফিট স্ন্যাপশট, এক গাঢ় নীল কার্ডে এই মাসের নিট লাভ, মাসের লক্ষ্য আর এক কথায়, চারটা সংখ্যার পাশে "এখন যা করবেন", বিক্রির ধারা, প্রোডাক্ট ও বিজ্ঞাপন। ডার্ক মোডেও চলে।',
  },

  parts: ['money', 'stages', 'delivery', 'top', 'lowStock', 'queues', 'offSite', 'goal', 'profit', 'cod', 'ads', 'pageCheck'],
  Render: DashboardB,
  Thumb: ThumbB,
};


// S28 · PR 716 (CN-048; prototype v5 Reports › Marketing & ads) — Reports › Marketing & ads at /admin/reports/marketing: what the ads
// bring back, campaign by campaign, for any period with the span before beside it: marketing spend, ordered value, delivered sales,
// delivered sales per ৳1, profit after ads, a hero chart of the ad spend imported day by day, and the channels and campaigns with
// their own spend and delivered sales. Read-only: nothing is paused, raised or changed in an ad account. Every figure is Marketing ›
// Report's own (@extas/metrics `marketingReport`, switched on in Marketing › Report) and Money › Profit & loss; this tab is a
// second way in to it ("nothing moved away"). Seeing needs `marketing.campaigns.read`.
// Words: messages/admin-reports-v5.*.json (`reportsV5.marketing.*`). Guide: docs/admin-guide/pages/reports/marketing.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { HeroChart } from '@/components/admin/lumen/HeroChart';
import { SummaryTiles, type SummaryTile } from '@/components/admin/lumen/SummaryTiles';
import { ReportBar } from '@/components/admin/reports/ReportBar';
import { HowFigures, ReportTable } from '@/components/admin/reports/ReportParts';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { QUICK_PERIODS, quickPeriod } from '@/lib/cost-report';
import { t } from '@/lib/i18n';
import { makeFmt } from '@/lib/reports-v5/fmt';
import { loadMarketing } from '@/lib/reports-v5/load';
import { change, daysBetween, heroRange, previousSpan, seriesOf } from '@/lib/reports-v5/model';
import { withReportsV5 } from '@/lib/reports-v5/words';
import '../../settings-cards.css';
import '../../money/money.css';
import '../delivery/report.css';

export const dynamic = 'force-dynamic';

const KEY = 'reportsMarketing';
const HERE = '/admin/reports/marketing';

export async function generateMetadata(): Promise<Metadata> {
  const view = withReportsV5(await adminView());
  return { title: `${t(view.dict, 'reportsV5.marketing.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function MarketingReportTab({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('marketing.campaigns.read', deps, MOTHER_STORE_ID), searchParams]);
  const view = withReportsV5(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z lm-rp" data-testid="rp-marketing" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="marketing.campaigns.read" />
      </div>
    );
  const c = (k: string, v?: Record<string, string | number>) => t(d, `reportsV5.marketing.${k}`, v);
  const cc = (k: string, v?: Record<string, string | number>) => t(d, `reportsV5.common.${k}`, v);
  const canWrite = access.guard.permissions?.has('marketing.campaigns.write') ?? false;
  const m = await loadMarketing(access.deps, sp);
  const f = makeFmt(view.locale, m.now.currency);
  const { q, notes } = m.now.period;
  const before = previousSpan(q.from, q.to);
  const current = QUICK_PERIODS.find((p) => p === sp.period) ?? QUICK_PERIODS.find((p) => {
    const x = quickPeriod(p, m.now.today);
    return x.from === q.from && x.to === q.to;
  });
  const r = m.now.report;
  const w = m.was.report;
  const channelName = (k: string) => {
    const x = t(d, `reportsV5.channel.${k}`);
    return x === `reportsV5.channel.${k}` ? k.replace(/^source:/, '') : x;
  };
  const perTk = (pct: number | null) => (pct === null ? '—' : `${(pct / 100).toFixed(2)}×`);
  const maxRows = m.now.settings.maxDays;

  const header = (
    <>
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />
    </>
  );
  if (!r)
    return (
      <div className="a2-z lm-rp" data-testid="rp-marketing" data-lm-ready="">
        {header}
        <section className="a2-card a2-mt12" data-testid="rp-marketing-off">
          <h2 className="a2-h3">{c('offTitle')}</h2>
          <p className="a2-sm a2-mute a2-mt6">{canWrite ? c('offBody') : c('offAsk')}</p>
          <div className="ct-actions a2-mt12">
            <Link className="a2-btn pri cr-tap" href="/admin/marketing/report">
              {c('toReportBtn')}
            </Link>
          </div>
        </section>
      </div>
    );

  const vs = cc('vs', { from: f.day(before.from), to: f.day(before.to) });
  const tiles: SummaryTile[] = [
    r.spendMinor === null
      ? { key: 'spend', label: c('kSpend'), value: 0, shown: cc('unknown'), format: f.format, word: true, vs: c('spendNone') }
      : { key: 'spend', label: c('kSpend'), value: r.spendMinor, shown: f.amount(r.spendMinor), format: f.format, delta: change(r.spendMinor, w?.spendMinor ?? null), good: 'down', vs: r.adsImported ? c('spendSub', { ads: f.maybe(r.adSpendMinor, cc('unknown')), msg: f.amount(r.messageSpendMinor) }) : c('spendNone') },
    { key: 'ordered', label: c('kOrdered'), value: r.shop.orderedMinor, shown: f.amount(r.shop.orderedMinor), format: f.format, delta: change(r.shop.orderedMinor, w?.shop.orderedMinor ?? null), vs: c('orderedSub', { n: r.shop.orders }) },
    { key: 'sales', label: c('kSales'), value: r.shop.salesMinor, shown: f.amount(r.shop.salesMinor), format: f.format, delta: change(r.shop.salesMinor, w?.shop.salesMinor ?? null), vs: c('salesSub', { n: r.shop.delivered }) },
    { key: 'pertk', label: c('kPerTk'), value: r.roasPercent === null ? 0 : r.roasPercent / 100, shown: perTk(r.roasPercent), format: { kind: 'number', locale: view.locale }, ...(r.roasPercent === null ? { word: true } : {}), delta: change(r.roasPercent, w?.roasPercent ?? null), vs: c('perTkSub') },
    m.sales.netProfitMinor === null
      ? { key: 'profit', label: c('kProfit'), value: 0, shown: cc('unknown'), format: f.format, word: true }
      : { key: 'profit', label: c('kProfit'), value: m.sales.netProfitMinor, shown: f.amount(m.sales.netProfitMinor), format: f.format },
  ];

  const days = daysBetween(q.from, q.to, maxRows);
  const hero = heroRange({
    key: 'p',
    label: `${f.dayShort(q.from)} – ${f.dayShort(q.to)}`,
    days,
    values: seriesOf(days, m.days, (x) => x.spendMinor),
    total: r.adSpendMinor ?? m.days.reduce((s, x) => s + x.spendMinor, 0),
    amount: f.amount,
    dayLabel: f.dayShort,
    mini: [{ label: c('kPerTk'), shown: perTk(r.roasPercent) }],
  });

  return (
    <div className="a2-z lm-rp" data-testid="rp-marketing" data-lm-ready="" data-from={q.from} data-to={q.to}>
      {header}
      <ReportBar dict={d} here={HERE} id="rp" from={q.from} to={q.to} today={m.now.today} current={current} csv={`/api/admin/reports/export/marketing?from=${q.from}&to=${q.to}`} notes={notes} limitDays={maxRows} />
      <p className="a2-xs a2-mute a2-mt12">
        {cc('period', { from: f.day(q.from), to: f.day(q.to) })} · {vs}
      </p>
      <SummaryTiles className="a2-mt12" tiles={tiles} label={cc('tilesLabel')} testId="rp-tiles" />
      <div className="a2-mt12 mo-hero">
        <HeroChart title={c('heroTitle')} ranges={[hero]} format={f.format} seriesName={c('heroSeries')} testId="rp-hero" />
      </div>

      <section className="a2-card a2-mt12" aria-labelledby="rp-ch" data-testid="rp-channels">
        <h2 className="a2-h3" id="rp-ch">
          {c('channels')}
        </h2>
        <p className="a2-cs">{c('channelsSub')}</p>
        <ReportTable
          testId="rp-channels-table"
          rowId="rp-channel-row"
          empty={c('noChannels')}
          cols={[{ h: c('colName') }, { h: c('colSpend'), right: true }, { h: c('colOrders'), right: true }, { h: c('colSales'), right: true }, { h: c('colPerTk'), right: true }]}
          rows={r.channels.map((x) => [<b key="n">{channelName(x.key)}</b>, x.kind === 'ads' ? f.maybe(x.spendMinor, cc('unknown')) : '—', f.num(x.orders), f.amount(x.salesMinor), x.kind === 'ads' ? perTk(x.roasPercent) : '—'])}
        />
      </section>

      <section className="a2-card a2-mt12" aria-labelledby="rp-camp" data-testid="rp-campaigns">
        <h2 className="a2-h3" id="rp-camp">
          {c('campaigns')}
        </h2>
        <p className="a2-cs">{c('campaignsSub')}</p>
        <ReportTable
          testId="rp-campaigns-table"
          rowId="rp-campaign-row"
          empty={c('noCampaigns')}
          cols={[{ h: c('colName') }, { h: c('colSpend'), right: true }, { h: c('colOrders'), right: true }, { h: c('colSales'), right: true }, { h: c('colPerTk'), right: true }]}
          rows={r.campaigns.map((x) => [
            <Link key="n" className="a2-lnk cr-link" href={`/admin/marketing/campaigns/${x.id}`}>
              {m.now.campaigns[x.id]?.name ?? x.id}
            </Link>,
            f.maybe(x.spendMinor, cc('unknown')),
            f.num(x.orders),
            f.amount(x.salesMinor),
            perTk(x.roasPercent),
          ])}
        />
        {r.untiedSpendMinor ? <p className="a2-xs a2-mute a2-mt6">{c('untied', { amount: f.amount(r.untiedSpendMinor) })}</p> : null}
        <div className="ct-actions a2-mt12">
          <Link className="a2-btn cr-tap" href="/admin/marketing/overview" data-testid="rp-to-overview">
            {c('toOverviewBtn')}
          </Link>
          <Link className="a2-btn cr-tap" href="/admin/marketing/report" data-testid="rp-to-report">
            {c('toReportBtn')}
          </Link>
        </div>
        <p className="a2-xs a2-mute a2-mt6">
          {c('toOverview')} · {c('toReport')}
        </p>
      </section>

      <HowFigures
        dict={d}
        testId="rp-how"
        items={[
          { label: c('kSpend'), how: c('how.spend'), href: '/admin/marketing/report', linkText: c('toReportBtn') },
          { label: c('kPerTk'), how: c('how.perTk') },
          { label: c('kProfit'), how: c('how.profit'), href: `/admin/money/profit?from=${q.from}&to=${q.to}`, linkText: t(d, 'reportsV5.profit.open') },
        ]}
      />
    </div>
  );
}

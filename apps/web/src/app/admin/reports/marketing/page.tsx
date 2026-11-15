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
import { adsVerdict } from '@/components/admin/look/dashboard/ProtoCards';
import type { DashDesignSettings } from '@/lib/admin-look/dashboard-data';
import { LineChart } from '@/components/admin/look/kit';
import { SummaryTiles, type SummaryTile } from '@/components/admin/lumen/SummaryTiles';
import { ReportAnswers, type AnswerLine } from '@/components/admin/reports/ReportAnswers';
import { ReportBar } from '@/components/admin/reports/ReportBar';
import { ReportFilters, keepOf } from '@/components/admin/reports/ReportFilters';
import { Columns, Donut } from '@/components/admin/reports/ReportSalesCharts';
import { SortTable, type STRow } from '@/components/admin/reports/SortTable';
import '@/components/admin/reports/report-bar.css';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import { makeFmt } from '@/lib/reports-v5/fmt';
import { loadMarketing, loadViews, adSpendByDay } from '@/lib/reports-v5/load';
import { AD_FILTERS, adFilterOf, channelMatches, clickRate, loadCampaignDetail, platformMatches } from '@/lib/reports-v5/marketing';
import { change, daysBetween, previousSpan, seriesOf } from '@/lib/reports-v5/model';
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
  const [m, lim, views] = await Promise.all([loadMarketing(access.deps, sp), access.deps.resolver.value('admin.dashboardDesigns', { storeId: MOTHER_STORE_ID }) as Promise<DashDesignSettings>, loadViews(access, 'marketing')]);
  const f = makeFmt(view.locale, m.now.currency);
  const { q, notes } = m.now.period;
  const before = previousSpan(q.from, q.to);
  const r = m.now.report!;
  const w = m.was.report;
  const cmp = sp.cmp !== '0';
  const adF = adFilterOf(sp.adch);
  const perTk = (pct: number | null) => (pct === null ? '—' : `${(pct / 100).toFixed(2)}×`);
  const maxRows = m.now.settings.maxDays;
  const platformName = (p: string | null) => (p ? t(d, `reportsV5.marketing.platform.${p}`) : '—');
  const detail = await loadCampaignDetail(access.deps.db, r.campaigns.map((x) => x.id), m.now.currency, q.from, q.to);
  const spendWas = cmp ? await adSpendByDay(access.deps.db, m.now.currency, before.from, before.to) : [];

  const header = (
    <>
      <PageHead view={view} place={locateKey(KEY)} title={cc('pageTitle')} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />
    </>
  );
  // The ad-channel filter (the prototype's "All ad channels"): channels and campaigns of one platform; the paid-share chips stay whole-shop
  const adChAll = r.channels.filter((x) => x.kind === 'ads');
  const adCh = adChAll.filter((x) => channelMatches(x.key, adF));
  const adSalesOf = (list: typeof adChAll) => list.reduce((n, x) => n + x.salesMinor, 0);
  const adSales = adSalesOf(adCh);
  const adDelivered = adCh.reduce((n, x) => n + x.delivered, 0);
  const spendOf = (list: typeof adChAll) => (list.some((x) => x.spendMinor === null) ? null : list.reduce((n, x) => n + (x.spendMinor ?? 0), 0));
  const spend = adF === 'all' ? r.spendMinor : spendOf(adCh);
  const wasCh = (w?.channels ?? []).filter((x) => x.kind === 'ads' && channelMatches(x.key, adF));
  const spendWasN = w ? (adF === 'all' ? w.spendMinor : spendOf(wasCh)) : null;
  const adSalesWas = w ? adSalesOf(wasCh) : null;
  const adRoas = spend ? adSales / spend : null;
  const adRoasWas = spendWasN && adSalesWas !== null ? adSalesWas / spendWasN : null;
  const cpo = spend !== null && adDelivered ? Math.round(spend / adDelivered) : null;
  const dl = (x: ReturnType<typeof change>) => (cmp ? x : undefined);
  const tiles: SummaryTile[] = [
    spend === null
      ? { key: 'spend', label: c('kSpend'), value: 0, shown: cc('unknown'), format: f.format, word: true, vs: c('spendNone') }
      : { key: 'spend', label: c('kSpend'), value: spend, shown: f.amount(spend), format: f.format, delta: dl(change(spend, spendWasN)), good: 'down' },
    { key: 'adsales', label: c('kAdSales'), value: adSales, shown: f.amount(adSales), format: f.format, delta: dl(change(adSales, adSalesWas)), vs: c('kAdSalesSub') },
    { key: 'roas', label: c('kRoas'), value: adRoas ?? 0, shown: perTk(adRoas === null ? null : adRoas * 100), format: { kind: 'number', locale: view.locale }, ...(adRoas === null ? { word: true } : {}), delta: dl(change(adRoas, adRoasWas)) },
    { key: 'cpo', label: c('kCpo'), value: cpo ?? 0, shown: cpo === null ? cc('unknown') : f.amount(cpo), format: f.format, ...(cpo === null ? { word: true } : {}), good: 'down' },
  ];

  const campRows = r.campaigns.filter((x) => platformMatches(detail.get(x.id)?.platform ?? null, adF));
  const camps = campRows.filter((x) => x.roasPercent !== null && x.spendMinor !== null && x.spendMinor > 0);
  const bestCamp = [...camps].sort((x, y) => (y.roasPercent ?? 0) - (x.roasPercent ?? 0))[0];
  const worstCamp = [...camps].sort((x, y) => (x.roasPercent ?? 0) - (y.roasPercent ?? 0))[0];
  const lines: AnswerLine[] = [];
  if (spend !== null && adRoas !== null) lines.push({ text: c('ans.total', { spend: f.amount(spend), sales: f.amount(adSales), roas: perTk(adRoas * 100), was: perTk(adRoasWas === null ? null : adRoasWas * 100) }), act: { label: c('ans.campaigns'), href: '/admin/marketing/campaigns' } });
  if (bestCamp) lines.push({ text: c('ans.best', { name: m.now.campaigns[bestCamp.id]?.name ?? bestCamp.id, roas: perTk(bestCamp.roasPercent) }), tone: 'good', act: { label: c('ans.raise'), href: `/admin/marketing/campaigns/${bestCamp.id}` } });
  if (worstCamp && worstCamp.id !== bestCamp?.id && (worstCamp.roasPercent ?? 100) < 100)
    lines.push({ text: c('ans.worst', { name: m.now.campaigns[worstCamp.id]?.name ?? worstCamp.id, roas: perTk(worstCamp.roasPercent), spend: f.amount(worstCamp.spendMinor ?? 0) }), tone: 'bad', act: { label: c('ans.pause'), href: `/admin/marketing/campaigns/${worstCamp.id}` } });

  const paidOrders = adChAll.reduce((n, x) => n + x.orders, 0);
  const allOrders = r.channels.reduce((n, x) => n + x.orders, 0);
  const paidPct = allOrders ? Math.round((paidOrders / allOrders) * 100) : 0;
  const freeOrders = allOrders - paidOrders;
  const days = daysBetween(q.from, q.to, maxRows);
  const spendDays = seriesOf(days, adF === 'all' ? m.days : [], (x) => x.spendMinor);
  const wasDays = daysBetween(before.from, before.to, maxRows);
  const spendWasDays = seriesOf(wasDays, spendWas, (x) => x.spendMinor);
  const couponUses = m.coupons.reduce((n, x) => n + x.uses, 0);
  const couponCost = m.coupons.reduce((n, x) => n + x.discountMinor, 0);
  const prevAligned = Array.from({ length: days.length }, (_, i) => spendWasDays[i] ?? 0);
  const chartSeries = [
    { v: spendDays, color: 'var(--a3-c1)', name: c('heroSeries'), area: true, shown: spendDays.map((v) => f.amount(v)) },
    ...(cmp && prevAligned.some((v) => v > 0) ? [{ v: prevAligned, color: 'var(--a3-cprev)', name: c('heroPrevSeries'), dash: true, shown: prevAligned.map((v) => f.amount(v)) }] : []),
  ];
  const chRowsShown = adCh.filter((x) => x.spendMinor !== null || x.salesMinor > 0);
  const chName = (k: string) => {
    const x = t(d, `reportsV5.channel.${k}`);
    return x === `reportsV5.channel.${k}` ? k : x;
  };
  const tx = { more: cc('showAll', { n: '{n}' }), less: cc('showLess'), close: cc('close'), empty: cc('none') };
  const verdictOf = (x: (typeof r.campaigns)[number]) => {
    const per = x.roasPercent === null || !x.spendMinor ? null : x.roasPercent / 100;
    return { per, v: adsVerdict(per, lim) };
  };
  const VORDER = { stop: 0, fix: 1, keep: 2, scale: 3 } as const;
  const campTable: STRow[] = campRows.map((x) => {
    const { per, v } = verdictOf(x);
    const dt = detail.get(x.id);
    const name = m.now.campaigns[x.id]?.name ?? x.id;
    const cpoX = x.spendMinor !== null && x.orders ? Math.round(x.spendMinor / x.orders) : null;
    const spent = x.spendMinor ?? 0;
    return {
      key: x.id,
      cells: [
        <span key="n">
          <b>{name}</b>
          <span className="a2-xs a2-mute a2-blk">{`${platformName(dt?.platform ?? null)} · ${c('clicksN', { n: f.num(dt?.clicks ?? 0) })}`}</span>
        </span>,
        f.maybe(x.spendMinor, cc('unknown')),
        f.amount(x.salesMinor),
        <b key="r">{perTk(x.roasPercent)}</b>,
        cpoX === null ? '—' : f.amount(cpoX),
        v ? (
          <span key="v">
            <span className={`a2-pill ${v === 'scale' ? 'ok' : v === 'stop' ? 'bad' : v === 'fix' ? 'warn' : ''}`}>{c(`v.${v}`)}</span>
            <span className="a2-xs a2-mute a2-blk rp-why">{c(`why.${v}`, { per: (per ?? 0).toFixed(1) })}</span>
          </span>
        ) : (
          '—'
        ),
      ],
      sort: [name, spent, x.salesMinor, x.roasPercent ?? -1, cpoX ?? -1, v ? VORDER[v] : -1],
      drawer: {
        title: name,
        sub: v ? `${c(`v.${v}`)} · ${c(`why.${v}`, { per: (per ?? 0).toFixed(1) })}` : undefined,
        items: [],
        empty: cc('none'),
        body: (
          <div className="a2-stack" data-testid="rp-campaign-drawer-body">
            <div className="rp-mini">
              <div>
                <b>{f.maybe(x.spendMinor, cc('unknown'))}</b>
                <span>{c('dSpent')}</span>
              </div>
              <div>
                <b>{f.amount(x.salesMinor)}</b>
                <span>{c('dSales')}</span>
              </div>
              <div>
                <b>{perTk(x.roasPercent)}</b>
                <span>{c('dRoas')}</span>
              </div>
              <div>
                <b>{f.num(dt?.impressions ?? 0)}</b>
                <span>{c('dReached')}</span>
              </div>
              <div>
                <b>{f.pctOf(Math.round(clickRate(dt?.clicks ?? 0, dt?.impressions ?? 0) * 100) / 100)}</b>
                <span>{c('dClickRate')}</span>
              </div>
              <div>
                <b>{dt?.dailyBudgetMinor ? f.amount(dt.dailyBudgetMinor) : '—'}</b>
                <span>{c('dBudget')}</span>
              </div>
            </div>
            <div>
              <p className="a2-xs a2-mute">{c('dSpend14')}</p>
              <Columns testId="rp-campaign-spend" items={(dt?.days ?? []).map((x2) => ({ key: x2.day, label: f.dayShort(x2.day).split(' ')[0] ?? x2.day, value: x2.spendMinor, shown: f.amount(x2.spendMinor) }))} />
            </div>
          </div>
        ),
        foot: (
          <Link className="a2-btn pri cr-tap" href={`/admin/marketing/campaigns/${x.id}`} data-testid="rp-campaign-open">
            {c('dOpen')}
          </Link>
        ),
      },
    };
  });
  const couponTable: STRow[] = m.coupons.map((x) => ({
    key: x.id,
    cells: [
      <span key="c">
        <b>{x.code}</b> <span className={`a2-pill ${x.enabled ? 'ok' : ''}`}>{x.enabled ? c('on') : c('off')}</span>
      </span>,
      f.num(x.uses),
      f.amount(x.discountMinor),
      f.amount(x.orderMinor),
      x.orderMinor ? f.pctOf((x.discountMinor / x.orderMinor) * 100) : '—',
    ],
    sort: [x.code, x.uses, x.discountMinor, x.orderMinor, x.orderMinor ? x.discountMinor / x.orderMinor : 0],
    drawer: {
      title: `${c('couponWord')} ${x.code}`,
      sub: c('couponDrawerSub', { n: f.num(x.uses) }),
      empty: c('noCouponOrders'),
      items: x.list.map((o) => ({ label: o.number, sub: o.day, value: f.amount(o.totalMinor), href: `/admin/orders/${o.id}` })),
      foot: (
        <Link className="a2-btn pri cr-tap" href="/admin/rules/offers" data-testid="rp-coupon-open">
          {c('couponOpen')}
        </Link>
      ),
    },
  }));
  const keep = keepOf(sp, ['adch']);

  return (
    <div className="a2-z lm-rp" data-testid="rp-marketing" data-lm-ready="" data-from={q.from} data-to={q.to}>
      {header}
      <ReportBar dict={d} here={HERE} id="rp" from={q.from} to={q.to} today={m.now.today} p={typeof sp.p === 'string' ? sp.p : undefined} cmp={cmp} before={before} reportKey="marketing" views={views} day={f.dayShort} csv={`/api/admin/reports/export/marketing?from=${q.from}&to=${q.to}`} notes={notes} limitDays={maxRows} />
      <ReportFilters
        action={HERE}
        keep={keep}
        testId="rp-filters"
        applyLabel={cc('apply')}
        clearLabel={cc('clear')}
        fields={[{ name: 'adch', label: c('fAdChannel'), all: c('fAllAdChannels'), options: AD_FILTERS.map((x) => ({ value: x, label: platformName(x) })), value: adF }]}
      />
      {adF !== 'all' ? (
        <p className="a2-xs a2-mute a2-mt6" data-testid="rp-filter-note">
          {c('filterNote')}
        </p>
      ) : null}
      <ReportAnswers kicker={cc('answers')} question={c('ans.q')} lines={lines} empty={cc('answersNone')} />
      <SummaryTiles className="a2-mt12" tiles={tiles} label={cc('tilesLabel')} testId="rp-tiles" />
      <div className="rp-kchips" data-testid="rp-chips">
        <div>
          <span>{c('chipPaid')}</span>
          <b>{allOrders ? `${paidPct}%` : '—'}</b>
          <span>{c('chipPaidSub', { n: f.num(paidOrders) })}</span>
        </div>
        <div>
          <span>{c('chipCoupon')}</span>
          <b>{f.amount(couponCost)}</b>
          <span>{c('chipCouponSub', { n: f.num(couponUses) })}</span>
        </div>
      </div>

      <div className="rp-grid3 a2-mt12">
        <section className="a2-card" aria-labelledby="rp-sv" data-testid="rp-spendvs">
          <h2 className="a2-h3" id="rp-sv">
            {c('spendVs')}
          </h2>
          <p className="a2-cs">{c('spendVsSub')}</p>
          <LineChart id="rp-mk-spend" labels={days.map((x) => f.dayShort(x))} series={chartSeries} h={220} label={c('spendVs')} yfmt={(v) => f.amount(Math.round(v))} foot={days.map((_, i) => f.amount(spendDays[i] ?? 0))} />
        </section>

        <section className="a2-card" aria-labelledby="rp-pf" data-testid="rp-paidfree">
          <h2 className="a2-h3" id="rp-pf">
            {c('paidFree')}
          </h2>
          <Donut
            testId="rp-paidfree-donut"
            aria={c('paidFreeAria', { paid: allOrders ? paidPct : 0, free: allOrders ? 100 - paidPct : 0 })}
            center={allOrders ? `${paidPct}%` : '—'}
            parts={[
              { key: 'paid', label: c('fromAds'), value: paidOrders },
              { key: 'free', label: c('withoutAds'), value: freeOrders },
            ]}
          />
          <div className="a2-mt12" data-testid="rp-bychannel">
            <p className="a2-xs a2-mute">{c('byChannelCols')}</p>
            {chRowsShown.length ? (
              <>
                <Columns testId="rp-bychannel-spend" items={chRowsShown.map((x) => ({ key: x.key, label: chName(x.key).split(' ')[0] ?? x.key, value: x.spendMinor ?? 0, shown: f.maybe(x.spendMinor, cc('unknown')) }))} />
                <Columns testId="rp-bychannel-sales" tone="c2" items={chRowsShown.map((x) => ({ key: x.key, label: chName(x.key).split(' ')[0] ?? x.key, value: x.salesMinor, shown: f.amount(x.salesMinor) }))} />
                <p className="a2-xs a2-mute">
                  {c('legSpend')} · {c('legSales')}
                </p>
              </>
            ) : (
              <p className="a2-sm a2-mute">{c('noChannels')}</p>
            )}
          </div>
        </section>
      </div>

      <section className="a2-card a2-mt12" aria-labelledby="rp-camp" data-testid="rp-campaigns">
        <h2 className="a2-h3" id="rp-camp">
          {c('campTitle')}
        </h2>
        <p className="a2-cs">{c('campaignsSub')}</p>
        <SortTable
          testId="rp-campaigns-table"
          rowId="rp-campaign-row"
          texts={{ ...tx, empty: c('noCampaigns') }}
          sortCol={3}
          cols={[{ h: c('colCampaign') }, { h: c('colSpend'), right: true, hide: true }, { h: c('colSales'), right: true, hide: true }, { h: c('colRoas'), right: true }, { h: c('colCpo'), right: true, hide: true }, { h: c('colDo') }]}
          rows={campTable}
        />
        {r.untiedSpendMinor && adF === 'all' ? <p className="a2-xs a2-mute a2-mt6">{c('untied', { amount: f.amount(r.untiedSpendMinor) })}</p> : null}
      </section>

      <section className="a2-card a2-mt12" aria-labelledby="rp-cp" data-testid="rp-coupons">
        <h2 className="a2-h3" id="rp-cp">
          {c('coupons')}
        </h2>
        <SortTable
          testId="rp-coupons-table"
          rowId="rp-coupon-row"
          texts={{ ...tx, empty: c('noCoupons') }}
          sortCol={1}
          cols={[{ h: c('colCode') }, { h: c('colUses'), right: true }, { h: c('colDiscount'), right: true }, { h: c('colOrderValue'), right: true, hide: true }, { h: c('colCostPct'), right: true, hide: true }]}
          rows={couponTable}
        />
      </section>
    </div>
  );
}

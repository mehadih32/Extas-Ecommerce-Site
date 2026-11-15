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
import { ReportTable } from '@/components/admin/reports/ReportParts';
import '@/components/admin/reports/report-bar.css';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import { makeFmt } from '@/lib/reports-v5/fmt';
import { loadMarketing, loadViews } from '@/lib/reports-v5/load';
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
  const channelName = (k: string) => {
    const x = t(d, `reportsV5.channel.${k}`);
    return x === `reportsV5.channel.${k}` ? k.replace(/^source:/, '') : x;
  };
  const perTk = (pct: number | null) => (pct === null ? '—' : `${(pct / 100).toFixed(2)}×`);
  const maxRows = m.now.settings.maxDays;

  const header = (
    <>
      <PageHead view={view} place={locateKey(KEY)} title={cc('pageTitle')} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />
    </>
  );
  const adCh = r.channels.filter((x) => x.kind === 'ads');
  const adSales = adCh.reduce((n, x) => n + x.salesMinor, 0);
  const adOrders = adCh.reduce((n, x) => n + x.orders, 0);
  const adRoas = r.spendMinor ? adSales / r.spendMinor : null;
  const adRoasWas = w && w.spendMinor ? w.channels.filter((x) => x.kind === 'ads').reduce((n, x) => n + x.salesMinor, 0) / w.spendMinor : null;
  const cpo = r.spendMinor !== null && adOrders ? Math.round(r.spendMinor / adOrders) : null;
  const dl = (x: ReturnType<typeof change>) => (cmp ? x : undefined);
  const tiles: SummaryTile[] = [
    r.spendMinor === null
      ? { key: 'spend', label: c('kSpend'), value: 0, shown: cc('unknown'), format: f.format, word: true, vs: c('spendNone') }
      : { key: 'spend', label: c('kSpend'), value: r.spendMinor, shown: f.amount(r.spendMinor), format: f.format, delta: dl(change(r.spendMinor, w?.spendMinor ?? null)), good: 'down' },
    { key: 'adsales', label: c('kAdSales'), value: adSales, shown: f.amount(adSales), format: f.format, delta: dl(change(adSales, w ? w.channels.filter((x) => x.kind === 'ads').reduce((n, x) => n + x.salesMinor, 0) : null)), vs: c('kAdSalesSub') },
    { key: 'roas', label: c('kRoas'), value: adRoas ?? 0, shown: perTk(adRoas === null ? null : adRoas * 100), format: { kind: 'number', locale: view.locale }, ...(adRoas === null ? { word: true } : {}), delta: dl(change(adRoas, adRoasWas)) },
    { key: 'cpo', label: c('kCpo'), value: cpo ?? 0, shown: cpo === null ? cc('unknown') : f.amount(cpo), format: f.format, ...(cpo === null ? { word: true } : {}), good: 'down' },
  ];

  const camps = r.campaigns.filter((x) => x.roasPercent !== null && x.spendMinor !== null && x.spendMinor > 0);
  const bestCamp = [...camps].sort((x, y) => (y.roasPercent ?? 0) - (x.roasPercent ?? 0))[0];
  const worstCamp = [...camps].sort((x, y) => (x.roasPercent ?? 0) - (y.roasPercent ?? 0))[0];
  const lines: AnswerLine[] = [];
  if (r.spendMinor !== null && r.roasPercent !== null)
    lines.push({ text: c('ans.total', { spend: f.amount(r.spendMinor), sales: f.amount(r.shop.salesMinor), roas: perTk(r.roasPercent), was: perTk(w?.roasPercent ?? null) }), act: { label: c('ans.campaigns'), href: '/admin/marketing/campaigns' } });
  if (bestCamp) lines.push({ text: c('ans.best', { name: m.now.campaigns[bestCamp.id]?.name ?? bestCamp.id, roas: perTk(bestCamp.roasPercent) }), tone: 'good', act: { label: c('ans.raise'), href: `/admin/marketing/campaigns/${bestCamp.id}` } });
  if (worstCamp && worstCamp.id !== bestCamp?.id && (worstCamp.roasPercent ?? 100) < 100)
    lines.push({ text: c('ans.worst', { name: m.now.campaigns[worstCamp.id]?.name ?? worstCamp.id, roas: perTk(worstCamp.roasPercent), spend: f.amount(worstCamp.spendMinor ?? 0) }), tone: 'bad', act: { label: c('ans.pause'), href: `/admin/marketing/campaigns/${worstCamp.id}` } });

  const paidOrders = r.channels.filter((x) => x.kind === 'ads').reduce((n, x) => n + x.orders, 0);
  const allOrders = r.channels.reduce((n, x) => n + x.orders, 0);
  const paidPct = allOrders ? Math.round((paidOrders / allOrders) * 100) : 0;
  const freeOrders = allOrders - paidOrders;
  const days = daysBetween(q.from, q.to, maxRows);
  const spendDays = seriesOf(days, m.days, (x) => x.spendMinor);
  const couponUses = m.coupons.reduce((n, x) => n + x.uses, 0);
  const couponCost = m.coupons.reduce((n, x) => n + x.discountMinor, 0);
  const chartSeries = [
    { v: spendDays, color: 'var(--a3-c1)', name: c('heroSeries'), area: true, shown: spendDays.map((v) => f.amount(v)) },
  ];

  return (
    <div className="a2-z lm-rp" data-testid="rp-marketing" data-lm-ready="" data-from={q.from} data-to={q.to}>
      {header}
      <ReportBar dict={d} here={HERE} id="rp" from={q.from} to={q.to} today={m.now.today} p={typeof sp.p === 'string' ? sp.p : undefined} cmp={cmp} before={before} reportKey="marketing" views={views} day={f.dayShort} csv={`/api/admin/reports/export/marketing?from=${q.from}&to=${q.to}`} notes={notes} limitDays={maxRows} />
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
          <LineChart
            id="rp-mk-spend"
            labels={days.map((x) => f.dayShort(x))}
            series={chartSeries}
            h={220}
            label={c('spendVs')}
            yfmt={(v) => f.amount(Math.round(v))}
            foot={days.map((_, i) => f.amount(spendDays[i] ?? 0))}
          />
        </section>

        <section className="a2-card" aria-labelledby="rp-pf" data-testid="rp-paidfree">
          <h2 className="a2-h3" id="rp-pf">
            {c('paidFree')}
          </h2>
          {allOrders ? (
            <div className="rp-donut-row">
              <svg viewBox="0 0 42 42" width="132" height="132" role="img" aria-label={c('paidFreeAria', { paid: paidPct, free: 100 - paidPct })}>
                <circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--lm-c3, var(--ok))" strokeWidth="7" />
                <circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--lm-c1, var(--acc))" strokeWidth="7" strokeDasharray={`${paidPct} ${100 - paidPct}`} strokeDashoffset="25" />
                <text x="21" y="22.5" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="currentColor">
                  {paidPct}%
                </text>
              </svg>
              <ul className="a2-stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 8 }}>
                <li>
                  <i className="rp-dot" style={{ background: 'var(--lm-c1, var(--acc))' }} /> {c('fromAds')}: <b>{f.num(paidOrders)}</b>
                </li>
                <li>
                  <i className="rp-dot" style={{ background: 'var(--lm-c3, var(--ok))' }} /> {c('withoutAds')}: <b>{f.num(freeOrders)}</b>
                </li>
              </ul>
            </div>
          ) : (
            <div className="rp-donut-row">
              <svg viewBox="0 0 42 42" width="132" height="132" role="img" aria-label={c('paidFreeAria', { paid: 0, free: 0 })}>
                <circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--lm-sf2)" strokeWidth="7" />
                <text x="21" y="22.5" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="currentColor">
                  —
                </text>
              </svg>
              <ul className="a2-stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 8 }}>
                <li>
                  <i className="rp-dot" style={{ background: 'var(--lm-c1, var(--acc))' }} /> {c('fromAds')}: <b>0</b>
                </li>
                <li>
                  <i className="rp-dot" style={{ background: 'var(--lm-c3, var(--ok))' }} /> {c('withoutAds')}: <b>0</b>
                </li>
              </ul>
            </div>
          )}
        </section>
      </div>

      <section className="a2-card a2-mt12" aria-labelledby="rp-camp" data-testid="rp-campaigns">
        <h2 className="a2-h3" id="rp-camp">
          {c('campTitle')}
        </h2>
        <p className="a2-cs">{c('campaignsSub')}</p>
        <ReportTable
          testId="rp-campaigns-table"
          rowId="rp-campaign-row"
          empty={c('noCampaigns')}
          cols={[{ h: c('colCampaign') }, { h: c('colSpend'), right: true }, { h: c('colSales'), right: true }, { h: c('colRoas'), right: true }, { h: c('colCpo'), right: true }, { h: c('colDo') }]}
          rows={[...r.campaigns]
            .sort((x, y) => (y.roasPercent ?? -1) - (x.roasPercent ?? -1))
            .map((x) => [
              <Link key="n" className="a2-lnk cr-link" href={`/admin/marketing/campaigns/${x.id}`}>
                <b>{m.now.campaigns[x.id]?.name ?? x.id}</b>
              </Link>,
              f.maybe(x.spendMinor, cc('unknown')),
              f.amount(x.salesMinor),
              <b key="r">{perTk(x.roasPercent)}</b>,
              x.spendMinor !== null && x.orders ? f.amount(Math.round(x.spendMinor / x.orders)) : '—',
              (() => {
                const per = x.roasPercent === null || !x.spendMinor ? null : x.roasPercent / 100;
                const v = adsVerdict(per, lim);
                return v ? (
                  <span key="v">
                    <span className={`a2-pill ${v === 'scale' ? 'ok' : v === 'stop' ? 'bad' : v === 'fix' ? 'warn' : ''}`}>{c(`v.${v}`)}</span>
                    <span className="a2-xs a2-mute" style={{ display: 'block', whiteSpace: 'normal', maxWidth: 300, marginTop: 3 }}>
                      {c(`why.${v}`, { per: (per ?? 0).toFixed(1) })}
                    </span>
                  </span>
                ) : (
                  '—'
                );
              })(),
            ])}
        />
        {r.untiedSpendMinor ? <p className="a2-xs a2-mute a2-mt6">{c('untied', { amount: f.amount(r.untiedSpendMinor) })}</p> : null}
      </section>

      <section className="a2-card a2-mt12" aria-labelledby="rp-cp" data-testid="rp-coupons">
        <h2 className="a2-h3" id="rp-cp">
          {c('coupons')}
        </h2>
        <ReportTable
          testId="rp-coupons-table"
          rowId="rp-coupon-row"
          empty={c('noCoupons')}
          cols={[{ h: c('colCode') }, { h: c('colUses'), right: true }, { h: c('colDiscount'), right: true }, { h: c('colOrderValue'), right: true }, { h: c('colCostPct'), right: true }]}
          rows={m.coupons.map((x) => [
            <span key="c">
              <b>{x.code}</b> <span className={`a2-pill ${x.enabled ? 'ok' : ''}`}>{x.enabled ? c('on') : c('off')}</span>
            </span>,
            f.num(x.uses),
            f.amount(x.discountMinor),
            f.amount(x.orderMinor),
            x.orderMinor ? f.pctOf((x.discountMinor / x.orderMinor) * 100) : '—',
          ])}
        />
      </section>
    </div>
  );
}

// S28 · PR 699 (CN-048; prototype v5 Marketing › Overview + Ad campaigns; gaps M1-M3) — Marketing › Overview at
// /admin/marketing/overview: what ads cost, what delivered orders brought back per Tk 1, profit after ads, a chip per ad
// campaign (Scale / Keep / Fix / Stop from the owner's numbers), the ad campaigns table and, from the ad-level days, the ads
// whose click rate fell (tired). Sales are delivered orders only. Read-only advice: nothing is paused or changed here.
// Seeing needs `marketing.campaigns.read`; the numbers are saved under "More options" (`marketing.campaigns.write`).
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { V5Number } from '@/components/admin/v5/Parts';
import { AiLine, GuideNote, Kpi, KpiGrid, PeriodBar, TwoLines, deltaPct } from '@/components/admin/lane-f/Parts';
import { BarList } from '@/components/admin/reports/ReportCharts';
import { withLaneF } from '@/lib/admin-lane-f';
import { PERIOD_KEYS, periodKey } from '@/lib/lane-f/period';
import { moneyOf, numOf, perOf, symbolOf } from '@/lib/lane-f/format';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { withW5a } from '@/lib/admin-v5-w5a';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { marketingOverview } from '@/lib/marketing/overview';
import { locateKey } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import '../../reports/delivery/report.css';

export const dynamic = 'force-dynamic';

const KEY = 'marketingOverview';
const HERE = '/admin/marketing/overview';
const TONE = { SCALE: 'ok', KEEP: 'ok', FIX: 'warn', STOP: 'bad', NONE: '' } as const;

export async function generateMetadata(): Promise<Metadata> {
  const view = withW5a(await adminView());
  return { title: `${t(view.dict, 'w5a.ov.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function MarketingOverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('marketing.campaigns.read', deps, MOTHER_STORE_ID)]);
  const view = withLaneF(withW5a(plain));
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="mkt-overview" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="marketing.campaigns.read" />
      </div>
    );
  const c = (k: string, v?: Record<string, string | number>) => t(d, `w5a.ov.${k}`, v);
  const f = (k: string, v?: Record<string, string | number>) => t(d, `lf.${k}`, v);
  const period = periodKey(sp.period);
  const o = await marketingOverview(access.deps, period);
  const moreAds = o.adsTotal > o.ads.length;
  const canWrite = access.guard.permissions?.has('marketing.campaigns.write') ?? false;
  const cur = symbolOf(o.currency);
  const money = (minor: number | null) => moneyOf(minor, o.currency, c('unknown'));
  const num = (x: number | null, frac = 2) => numOf(x, frac);
  const chip = (v: keyof typeof TONE) => (
    <span className={`a2-pill ${TONE[v]}`} data-testid="mkt-chip" data-verdict={v}>
      {c(`v_${v}`)}
    </span>
  );
  const perTkAds = o.spendMinor && o.spendMinor > 0 ? o.adSalesMinor / o.spendMinor : null;
  const perTkAdsPrev = o.prev.spendMinor && o.prev.spendMinor > 0 ? o.prev.adSalesMinor / o.prev.spendMinor : null;
  const costPer = o.spendMinor !== null && o.adDelivered > 0 ? o.spendMinor / o.adDelivered : null;
  const costPerPrev = o.prev.spendMinor !== null && o.prev.adDelivered > 0 ? o.prev.spendMinor / o.prev.adDelivered : null;
  const chName = (k: string) => k.replace(/^ads:/, '').toLowerCase().replace(/^./, (x) => x.toUpperCase());
  const best = o.campaigns.filter((x) => x.spendMinor > 0 && x.perTk !== null).sort((a, b) => (b.perTk ?? 0) - (a.perTk ?? 0));
  const eye = o.campaigns
    .filter((x) => x.spendMinor > 0 && x.verdict !== 'KEEP' && x.verdict !== 'NONE')
    .map((x) => ({ x, tone: x.verdict === 'STOP' ? 'bad' : x.verdict === 'SCALE' ? 'ok' : 'warn', text: f(x.verdict === 'STOP' ? 'ov.eyeStop' : x.verdict === 'SCALE' ? 'ov.eyeScale' : 'ov.eyeFix', { name: x.name, spend: money(x.spendMinor), n: x.delivered, per: perOf(x.perTk, o.currency), cur }) }));
  const top = best[0];
  const low = best[best.length - 1];
  const aiText = top
    ? [f('ov.aiBestCh', { name: top.name, per: perOf(top.perTk, o.currency), cur }), low && low !== top ? f('ov.aiWeak', { name: low.name, per: perOf(low.perTk, o.currency), cur }) : ''].filter(Boolean).join(' ')
    : f('ov.aiNone');

  return (
    <div className="a2-z" data-testid="mkt-overview" data-lm-ready="">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        title={f('ov.title')}
        sub={f('ov.sub')}
        right={
          <span className="a2-gap8">
            <Link className="a2-btn" href="/admin/marketing/plan">
              {f('ov.toPlan')}
            </Link>
            <Link className="a2-btn pri" href="/admin/marketing/campaigns">
              {f('ov.toCampaigns')}
            </Link>
          </span>
        }
      />
      <SectionTabs view={view} current={KEY} />
      <PeriodBar current={period} note={f('per.vs')} items={PERIOD_KEYS.map((k) => ({ key: k, label: f(`per.${k}`), href: `${HERE}?period=${k}` }))} />
      <AiLine>{aiText}</AiLine>
      <KpiGrid cols={5}>
        <Kpi testId="mkt-spend" label={f('ov.kSpend')} value={money(o.spendMinor)} delta={deltaPct(o.spendMinor, o.prev.spendMinor)} inverse />
        <Kpi testId="mkt-sales" label={f('ov.kSales')} value={money(o.adSalesMinor)} delta={deltaPct(o.adSalesMinor, o.prev.adSalesMinor)} sub={c('delivered', { n: o.adDelivered })} />
        <Kpi testId="mkt-pertk" label={f('ov.kPer', { cur })} value={perOf(perTkAds, o.currency)} delta={deltaPct(perTkAds, perTkAdsPrev)} sub={chip(o.verdict)} />
        <Kpi testId="mkt-cost" label={f('ov.kCost')} value={money(costPer === null ? null : Math.round(costPer))} delta={deltaPct(costPer, costPerPrev)} inverse />
        <Kpi testId="mkt-profit" label={f('ov.kProfit')} value={money(o.profitMinor)} delta={deltaPct(o.profitMinor, o.prev.profitMinor)} sub={f('ov.kProfitSub')} />
      </KpiGrid>
      <div className="lf-grid lf-g3 a2-mt12">
        <section className="a2-card" data-testid="mkt-by-channel">
          <h2 className="a2-h3" style={{ marginBottom: 10 }}>
            {f('ov.byChannel', { cur })}
          </h2>
          {o.byChannel.length ? (
            <BarList testId="mkt-ch" items={o.byChannel.map((x) => ({ key: x.key, label: chName(x.key), value: x.perTk ?? 0, shown: perOf(x.perTk, o.currency) }))} />
          ) : (
            <p className="a2-sm a2-mute">{c('noCampaigns')}</p>
          )}
        </section>
        <section className="a2-card" data-testid="mkt-eye">
          <h2 className="a2-h3" style={{ marginBottom: 10 }}>
            {f('ov.eye')}
          </h2>
          {eye.length ? (
            <div className="lf-eye">
              {eye.map((e) => (
                <Link key={e.x.id} href="/admin/marketing/campaigns">
                  <span className={`a2-pill ${e.tone}`}>{c(`v_${e.x.verdict}`)}</span>
                  <span>{e.text}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="a2-sm a2-mute">{f('ov.eyeNone')}</p>
          )}
        </section>
        <section className="a2-card" data-testid="mkt-messages">
          <h2 className="a2-h3" style={{ marginBottom: 10 }}>
            {f('ov.msg')}
          </h2>
          <div className="lf-rows">
            <div>
              <span>{f('ov.msgSent')}</span>
              <b>{numOf(o.messages.sent)}</b>
            </div>
            <div>
              <span>{f('ov.msgOrders')}</span>
              <b>{numOf(o.messages.orders)}</b>
            </div>
            <div>
              <span>{f('ov.msgSales')}</span>
              <b>{money(o.messages.salesMinor)}</b>
            </div>
            <div>
              <span>{f('ov.msgCost')}</span>
              <b>{money(o.messages.costMinor)}</b>
            </div>
          </div>
        </section>
      </div>
      <section className="a2-card a2-mt12" data-testid="mkt-daily">
        <h2 className="a2-h3" style={{ marginBottom: 10 }}>
          {f('ov.daily')}
        </h2>
        <TwoLines
          testId="mkt-daily-chart"
          labels={o.daily.map((x) => x.day.slice(5))}
          series={[
            { name: f('ov.dailySales'), tone: 'ok', values: o.daily.map((x) => x.salesMinor) },
            { name: f('ov.kSpend'), tone: 'ac', values: o.daily.map((x) => x.spendMinor) },
          ]}
        />
      </section>
      <GuideNote>{f('ov.rule', { scale: o.thresholds.scale, keep: o.thresholds.keep, fix: o.thresholds.fix, cur })}</GuideNote>

      <section className="a2-card a2-mt12" data-testid="mkt-campaigns">
        <h2 className="a2-h3" style={{ marginBottom: 10 }}>
          {c('campaigns')}
        </h2>
        {o.campaigns.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="a2-table">
              <thead>
                <tr>
                  <th>{c('colName')}</th>
                  <th>{c('colPlatform')}</th>
                  <th>{c('kSpend')}</th>
                  <th>{c('kSales')}</th>
                  <th>{c('kPerTk')}</th>
                  <th>{c('colVerdict')}</th>
                </tr>
              </thead>
              <tbody>
                {o.campaigns.map((x) => (
                  <tr key={x.id} data-testid="mkt-campaign-row">
                    <td>{x.name}</td>
                    <td>{x.platform}</td>
                    <td>{money(x.spendMinor)}</td>
                    <td>{money(x.salesMinor)}</td>
                    <td>{num(x.perTk)}</td>
                    <td>{chip(x.verdict)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="a2-sm a2-mute">{c('noCampaigns')}</p>
        )}
      </section>

      <section className="a2-card a2-mt12" data-testid="mkt-ads">
        <h2 className="a2-h3" style={{ marginBottom: 10 }}>
          {c('ads')}
        </h2>
        {o.ads.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="a2-table">
              <thead>
                <tr>
                  <th>{c('colAd')}</th>
                  <th>{c('colName')}</th>
                  <th>{c('kSpend')}</th>
                  <th>{c('colClicks')}</th>
                  <th>{c('colBuys')}</th>
                  <th>{c('colRate')}</th>
                  <th>{c('colState')}</th>
                </tr>
              </thead>
              <tbody>
                {o.ads.map((x) => (
                  <tr key={x.id} data-testid="mkt-ad-row" data-tired={x.tired ? 'yes' : 'no'}>
                    <td>{x.name}</td>
                    <td>{x.campaign}</td>
                    <td>{money(x.spendMinor)}</td>
                    <td>{num(x.clicks, 0)}</td>
                    <td>{num(x.purchases, 0)}</td>
                    <td>{x.ctrNow === null ? '–' : `${num(x.ctrNow, 1)}%`}</td>
                    <td>{x.tired ? <span className="a2-pill warn">{c('tired', { n: num(x.dropPct, 0) })}</span> : <span className="a2-pill ok">{c('fine')}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="a2-sm a2-mute">{c('noAds')}</p>
        )}
        {moreAds ? <p className="a2-xs a2-mute a2-mt6">{c('shown', { n: o.ads.length, total: o.adsTotal })}</p> : null}
        <p className="a2-xs a2-mute a2-mt6">{c('tiredRule')}</p>
      </section>

      {canWrite ? (
        <details className="a2-card a2-mt12" data-testid="mkt-more">
          <summary className="a2-h4">{t(d, 'w5a.more')}</summary>
          <div className="a2-stack a2-mt12" style={{ gap: 12 }}>
            {(['scale', 'keep', 'fix'] as const).map((f) => (
              <V5Number key={f} dict={d} url="/api/admin/marketing/overview/settings" before={o.thresholds} field={f} label={c(`n_${f}`)} min={0} max={1000} save={c('save')} testId={`mkt-n-${f}`} />
            ))}
            <V5Number dict={d} url="/api/admin/marketing/overview/settings" before={o.thresholds} field="shiftPct" label={c('n_shiftPct')} min={1} max={100} save={c('save')} testId="mkt-n-shift" />
          </div>
        </details>
      ) : null}
    </div>
  );
}

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
import { PageHead, ShellState } from '@/components/admin/shell/ShellParts';
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
const PERIODS = [7, 30, 90] as const; // hardcode-ok: the one-press periods of this page
const TONE = { SCALE: 'ok', KEEP: 'ok', FIX: 'warn', STOP: 'bad', NONE: '' } as const;

export async function generateMetadata(): Promise<Metadata> {
  const view = withW5a(await adminView());
  return { title: `${t(view.dict, 'w5a.ov.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function MarketingOverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('marketing.campaigns.read', deps, MOTHER_STORE_ID)]);
  const view = withW5a(plain);
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
  const asked = typeof sp.days === 'string' ? Number(sp.days) : PERIODS[1];
  const days = (PERIODS as readonly number[]).includes(asked) ? asked : PERIODS[1];
  const o = await marketingOverview(access.deps, days);
  const canWrite = access.guard.permissions?.has('marketing.campaigns.write') ?? false;
  const digits = new Intl.NumberFormat(view.locale, { style: 'currency', currency: o.currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const money = (minor: number | null) => (minor === null ? c('unknown') : new Intl.NumberFormat(view.locale, { style: 'currency', currency: o.currency, numberingSystem: 'latn' }).format(minor / 10 ** digits));
  const num = (x: number | null, frac = 2) => (x === null ? '–' : new Intl.NumberFormat(view.locale, { numberingSystem: 'latn', maximumFractionDigits: frac }).format(x));
  const chip = (v: keyof typeof TONE) => (
    <span className={`a2-pill ${TONE[v]}`} data-testid="mkt-chip" data-verdict={v}>
      {c(`v_${v}`)}
    </span>
  );

  return (
    <div className="a2-z" data-testid="mkt-overview" data-lm-ready="">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        title={c('title')}
        sub={c('sub', { from: o.from, to: o.to })}
        right={
          <span className="a2-gap8">
            {PERIODS.map((p) => (
              <Link key={p} className={`a2-btn sm${p === days ? ' pri' : ''}`} href={`${HERE}?days=${p}`}>
                {c('lastDays', { n: p })}
              </Link>
            ))}
            <Link className="a2-btn sm" href="/admin/marketing/plan">
              {c('toPlan')}
            </Link>
          </span>
        }
      />
      <div className="a2-kpis a2-mt12">
        <div className="a2-card" data-testid="mkt-spend">
          <div className="a2-xs a2-mute">{c('kSpend')}</div>
          <div className="a2-h2">{money(o.spendMinor)}</div>
        </div>
        <div className="a2-card" data-testid="mkt-sales">
          <div className="a2-xs a2-mute">{c('kSales')}</div>
          <div className="a2-h2">{money(o.salesMinor)}</div>
          <div className="a2-xs a2-mute">{c('delivered', { n: o.delivered })}</div>
        </div>
        <div className="a2-card" data-testid="mkt-pertk">
          <div className="a2-xs a2-mute">{c('kPerTk')}</div>
          <div className="a2-h2">{num(o.perTk)}</div>
          <div className="a2-mt6">{chip(o.verdict)}</div>
        </div>
        <div className="a2-card" data-testid="mkt-profit">
          <div className="a2-xs a2-mute">{c('kProfit')}</div>
          <div className="a2-h2">{money(o.profitMinor)}</div>
        </div>
      </div>
      <p className="a2-xs a2-mute a2-mt6">{c('rule', { scale: o.thresholds.scale, keep: o.thresholds.keep, fix: o.thresholds.fix })}</p>

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
        {o.adsTotal > o.ads.length ? <p className="a2-xs a2-mute a2-mt6">{c('shown', { n: o.ads.length, total: o.adsTotal })}</p> : null}
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

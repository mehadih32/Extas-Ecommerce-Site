// S28 · PR 699 (CN-048; prototype v5 Marketing › Plan & ideas; gap M4) — Marketing › Plan at /admin/marketing/plan: a channel
// budget plan from delivered sales per Tk 1 (a share of the weakest channel's budget suggested for the strongest) and the
// calendar's two warnings: campaigns or ads running at the same time, and stock running low while something is running.
// ADVICE ONLY: nothing here moves a budget or touches an ad account. Seeing needs `marketing.campaigns.read`.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PageHead, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { withW5a } from '@/lib/admin-v5-w5a';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { marketingPlan } from '@/lib/marketing/overview';
import { locateKey } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import '../../reports/delivery/report.css';

export const dynamic = 'force-dynamic';

const KEY = 'marketingPlan';
const HERE = '/admin/marketing/plan';
const WINDOW_DAYS = 30; // hardcode-ok: the plan reads the last 30 days, said on the page
const TONE = { SCALE: 'ok', KEEP: 'ok', FIX: 'warn', STOP: 'bad', NONE: '' } as const;

export async function generateMetadata(): Promise<Metadata> {
  const view = withW5a(await adminView());
  return { title: `${t(view.dict, 'w5a.plan.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function MarketingPlanPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('marketing.campaigns.read', deps, MOTHER_STORE_ID)]);
  const view = withW5a(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="mkt-plan" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="marketing.campaigns.read" />
      </div>
    );
  const c = (k: string, v?: Record<string, string | number>) => t(d, `w5a.plan.${k}`, v);
  const p = await marketingPlan(access.deps, WINDOW_DAYS);
  const digits = new Intl.NumberFormat(view.locale, { style: 'currency', currency: p.currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const money = (minor: number) => new Intl.NumberFormat(view.locale, { style: 'currency', currency: p.currency, numberingSystem: 'latn' }).format(minor / 10 ** digits);
  const num = (x: number | null) => (x === null ? '–' : new Intl.NumberFormat(view.locale, { numberingSystem: 'latn', maximumFractionDigits: 2 }).format(x));
  const moves = p.rows.some((r) => r.moveMinor !== 0);

  return (
    <div className="a2-z" data-testid="mkt-plan" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub', { n: WINDOW_DAYS })} right={<Link className="a2-btn sm" href="/admin/marketing/overview">{c('back')}</Link>} />
      <div className="a2-note a2-mt12">{c('advice')}</div>
      <section className="a2-card a2-mt12" data-testid="mkt-plan-channels">
        <h2 className="a2-h3" style={{ marginBottom: 10 }}>
          {c('channels')}
        </h2>
        {p.rows.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="a2-table">
              <thead>
                <tr>
                  <th>{c('colChannel')}</th>
                  <th>{c('colSpend')}</th>
                  <th>{c('colSales')}</th>
                  <th>{c('colPerTk')}</th>
                  <th>{c('colVerdict')}</th>
                  <th>{c('colMove')}</th>
                </tr>
              </thead>
              <tbody>
                {p.rows.map((r) => (
                  <tr key={r.key} data-testid="mkt-plan-row">
                    <td>{r.key}</td>
                    <td>{money(r.spendMinor)}</td>
                    <td>{money(r.salesMinor)}</td>
                    <td>{num(r.perTk)}</td>
                    <td>
                      <span className={`a2-pill ${TONE[r.verdict]}`}>{c(`v_${r.verdict}`)}</span>
                    </td>
                    <td>{r.moveMinor === 0 ? '–' : `${r.moveMinor > 0 ? '+' : '−'}${money(Math.abs(r.moveMinor))}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="a2-sm a2-mute">{c('noChannels')}</p>
        )}
        <p className="a2-xs a2-mute a2-mt6">{moves ? c('moveNote', { pct: p.thresholds.shiftPct }) : c('noMove')}</p>
      </section>
      <section className="a2-card a2-mt12" data-testid="mkt-plan-overlap">
        <h2 className="a2-h3" style={{ marginBottom: 10 }}>
          {c('overlap')}
        </h2>
        {p.overlaps.length ? (
          <ul className="cr-rows" style={{ marginTop: 0 }}>
            {p.overlaps.map((x, i) => (
              <li key={i} data-testid="mkt-overlap-row">
                <div>{c('overlapRow', { a: x.a, b: x.b })}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm a2-mute">{c('noOverlap')}</p>
        )}
        <Link className="cr-link" href="/admin/marketing/calendar">
          {c('toCalendar')}
        </Link>
      </section>
      <section className="a2-card a2-mt12" data-testid="mkt-plan-stock">
        <h2 className="a2-h3" style={{ marginBottom: 10 }}>
          {c('stock')}
        </h2>
        {p.lowStockAt <= 0 ? (
          <p className="a2-sm a2-mute">{c('stockOff')}</p>
        ) : p.lowStock.length ? (
          <>
            {p.hasUpcoming ? <p className="a2-sm">{c('stockWarn', { n: p.lowStockAt })}</p> : <p className="a2-sm a2-mute">{c('stockQuiet', { n: p.lowStockAt })}</p>}
            <ul className="cr-rows" style={{ marginTop: 6 }}>
              {p.lowStock.map((x) => (
                <li key={x.id} data-testid="mkt-stock-row">
                  <div>
                    <b>{x.name}</b> · {c('left', { n: x.available })}
                  </div>
                  <Link className="cr-link" href={`/admin/products/${x.id}`}>
                    {c('open')}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="a2-sm a2-mute">{c('noStock')}</p>
        )}
      </section>
    </div>
  );
}

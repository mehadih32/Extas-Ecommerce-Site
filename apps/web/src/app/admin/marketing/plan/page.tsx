// S28 · PR 699 (CN-048; prototype v5 Marketing › Plan & ideas; gap M4) — Marketing › Plan at /admin/marketing/plan: a channel
// budget plan from delivered sales per Tk 1 (a share of the weakest channel's budget suggested for the strongest) and the
// calendar's two warnings: campaigns or ads running at the same time, and stock running low while something is running.
// ADVICE ONLY: nothing here moves a budget or touches an ad account. Seeing needs `marketing.campaigns.read`.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { withW5a } from '@/lib/admin-v5-w5a';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { marketingPlan } from '@/lib/marketing/overview';
import { salesByArea } from '@extas/metrics';
import { Delta, PeriodBar, deltaPct } from '@/components/admin/lane-f/Parts';
import { withLaneF } from '@/lib/admin-lane-f';
import { PERIOD_KEYS, periodKey } from '@/lib/lane-f/period';
import { moneyOf, numOf, perOf, symbolOf } from '@/lib/lane-f/format';
import { locateKey } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import '../../reports/delivery/report.css';

export const dynamic = 'force-dynamic';

const KEY = 'marketingPlan';
const HERE = '/admin/marketing/plan';
/** A district needs this many finished orders (delivered or returned) before its return rate advises anything. */
const DISTRICT_MIN = 3; // hardcode-ok: the prototype's own floor
/** Return rates above these two lines turn the advice to "ask the delivery charge first" and "avoid COD-only ads" (prototype rule). */
const RETURN_WARN = 0.15; // hardcode-ok: prototype rule
const RETURN_BAD = 0.25; // hardcode-ok: prototype rule
const TONE = { SCALE: 'ok', KEEP: 'ok', FIX: 'warn', STOP: 'bad', NONE: '' } as const;

export async function generateMetadata(): Promise<Metadata> {
  const view = withW5a(await adminView());
  return { title: `${t(view.dict, 'w5a.plan.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function MarketingPlanPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('marketing.campaigns.read', deps, MOTHER_STORE_ID), searchParams]);
  const view = withLaneF(withW5a(plain));
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
  const f = (k: string, v?: Record<string, string | number>) => t(d, `lf.${k}`, v);
  const period = periodKey(sp.period);
  const p = await marketingPlan(access.deps, period);
  const areas = await salesByArea(access.deps.db, MOTHER_STORE_ID, { from: p.from, to: p.to }, { timeZone: p.timeZone, level: 'district' }).catch(() => null);
  const cur = symbolOf(p.currency);
  const money = (minor: number) => moneyOf(minor, p.currency);
  const scale = 30 / p.days; // hardcode-ok: the plan is shown per 30-day month
  const plan = p.rows.map((r) => ({ ...r, now: Math.round(r.spendMinor * scale), next: Math.round((r.spendMinor + r.moveMinor) * scale) }));
  const nowTotal = plan.reduce((a, r) => a + r.now, 0);
  const nextTotal = plan.reduce((a, r) => a + r.next, 0);
  const moves = p.rows.some((r) => r.moveMinor !== 0);
  const districts = (areas?.rows ?? [])
    .map((r) => ({ id: r.areaId, name: r.nameEn, orders: r.delivered + r.returned, rate: r.returnRate ?? 0 }))
    .filter((r) => r.orders >= DISTRICT_MIN)
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 10); // hardcode-ok: a short list
  const advice = (rate: number) => (rate > RETURN_BAD ? 'bad' : rate > RETURN_WARN ? 'warn' : 'good');

  return (
    <div className="a2-z" data-testid="mkt-plan" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={f('pl.title')} sub={f('pl.sub')} right={<Link className="a2-btn sm" href="/admin/marketing/overview">{c('back')}</Link>} />
      <SectionTabs view={view} current={KEY} />
      <PeriodBar current={period} note={f('per.vs')} items={PERIOD_KEYS.map((k) => ({ key: k, label: f(`per.${k}`), href: `${HERE}?period=${k}` }))} />
      <div className="a2-note a2-mt12">{c('advice')}</div>
      <div className="lf-grid lf-g2 a2-mt12">
        <section className="a2-card" data-testid="mkt-plan-channels">
          <h2 className="a2-h3" style={{ marginBottom: 10 }}>
            {f('pl.budget')}
          </h2>
          {plan.length ? (
            <div className="a2-tblw">
              <table className="a2-tbl">
                <thead>
                  <tr>
                    <th>{f('pl.colChannel')}</th>
                    <th className="r">{f('pl.colPer', { cur })}</th>
                    <th className="r">{f('pl.colNow')}</th>
                    <th className="r">{f('pl.colNext')}</th>
                    <th>{c('colVerdict')}</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.map((r) => (
                    <tr key={r.key} data-testid="mkt-plan-row">
                      <td>
                        <b>{r.key}</b>
                      </td>
                      <td className="r a2-num">{perOf(r.perTk, p.currency)}</td>
                      <td className="r a2-num">{money(r.now)}</td>
                      <td className="r a2-num">
                        <b>{money(r.next)}</b> <Delta pct={deltaPct(r.next, r.now)} />
                      </td>
                      <td>
                        <span className={`a2-pill ${TONE[r.verdict]}`}>{c(`v_${r.verdict}`)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="a2-sm a2-mute">{c('noChannels')}</p>
          )}
          {plan.length ? <p className="a2-sm a2-mt12">{f('pl.total', { now: money(nowTotal), next: money(nextTotal) })}</p> : null}
          <p className="a2-xs a2-mute a2-mt6">{moves ? c('moveNote', { pct: p.thresholds.shiftPct }) : c('noMove')}</p>
        </section>
        <section className="a2-card" data-testid="mkt-plan-districts">
          <h2 className="a2-h3">{f('pl.district')}</h2>
          <p className="a2-xs a2-mute" style={{ marginBottom: 10 }}>
            {f('pl.districtSub')}
          </p>
          {districts.length ? (
            <div className="a2-tblw">
              <table className="a2-tbl">
                <thead>
                  <tr>
                    <th>{f('pl.colDistrict')}</th>
                    <th className="r">{f('pl.colOrders')}</th>
                    <th className="r">{f('pl.colReturn')}</th>
                    <th>{f('pl.colAdvice')}</th>
                  </tr>
                </thead>
                <tbody>
                  {districts.map((r) => (
                    <tr key={r.id} data-testid="mkt-district-row">
                      <td>
                        <b>{r.name}</b>
                      </td>
                      <td className="r a2-num">{numOf(r.orders)}</td>
                      <td className="r a2-num">{numOf(r.rate * 100, 0)}%</td>
                      <td>
                        <span className={`a2-pill ${advice(r.rate)}`}>{f(`pl.adv.${advice(r.rate)}`)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="a2-sm a2-mute">{f('pl.districtNone')}</p>
          )}
        </section>
        <section className="a2-card" data-testid="mkt-plan-ideas">
          <h2 className="a2-h3">{f('pl.ideas')}</h2>
          <p className="a2-sm a2-mute a2-mt6">{f('pl.ideasBody')}</p>
          <Link className="a2-btn sm a2-mt12" href="/admin/marketing/studio">
            {f('pl.ideasGo')}
          </Link>
        </section>
        <section className="a2-card" data-testid="mkt-plan-comp">
          <h2 className="a2-h3">{f('pl.comp')}</h2>
          <p className="a2-xs a2-mute">{f('pl.compSub')}</p>
          <p className="a2-sm a2-mute a2-mt6">{f('pl.compBody')}</p>
          <Link className="a2-btn sm a2-mt12" href="/admin/marketing/intel">
            {f('pl.compGo')}
          </Link>
        </section>
      </div>
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

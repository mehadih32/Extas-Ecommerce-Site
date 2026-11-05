// S14 · PR 303 — Reports › Customers at /admin/reports/customers (BACKEND-ARCHITECTURE §5.12 REP-04; demo V12.4
// #/admin/reports/customers): over 7, 30 or 90 days (`?days=`, default 30) the new buyers, the returning buyers, the
// buyers quiet for the owner's N+ days (churned) and the repeat rate, then the same per saved segment (only while
// segments are on), and the Support card marked Plan until the Support inbox (S22) — no sample figures. Counts only
// (@extas/customers customerReport); no money figure. Off as shipped (`customers.report`, Customers › Customer
// settings). Seeing needs `reports.read`.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cu from '@extas/customers';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { pct } from '@/components/admin/courier-report/PerfTable';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { withCustomers } from '@/lib/admin-customers/i18n';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { customersDeps } from '@/lib/customers-api';
import { t } from '@/lib/i18n';
import '../delivery/report.css';

export const dynamic = 'force-dynamic';

const KEY = 'reportsCustomers';
const HERE = '/admin/reports/customers';
const PERIODS = [7, 30, 90] as const;
const DAY_MS = 86_400_000;

export async function generateMetadata(): Promise<Metadata> {
  const view = withCustomers(await adminView());
  return { title: `${t(view.dict, 'cus.rep.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function CustomersReportPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('reports.read', deps, MOTHER_STORE_ID), searchParams]);
  const view = withCustomers(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="reports.read" />
      </div>
    );
  const c = (k: string, v?: Record<string, string | number>) => t(d, `cus.rep.${k}`, v);
  const days = (PERIODS as readonly number[]).includes(Number(sp.days)) ? Number(sp.days) : 30;
  const who: cu.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const to = new Date();
  const r = await cu.customerReport(customersDeps(access.deps), who, { from: new Date(to.getTime() - days * DAY_MS), to });
  const held = access.guard.permissions;
  const canCustomers = held?.has('customers.read') ?? false;
  const n = (x: number) => new Intl.NumberFormat(view.locale, { numberingSystem: 'latn' }).format(x);
  const day = new Intl.DateTimeFormat(view.locale, { timeZone: view.timeZone, dateStyle: 'medium', numberingSystem: 'latn' });
  const tot = r.totals;
  const kpis = tot
    ? [
        { id: 'new', l: c('kpi.new'), v: n(tot.newBuyers), note: c('kpi.newNote') },
        { id: 'returning', l: c('kpi.returning'), v: n(tot.returning), note: c('kpi.returningNote') },
        { id: 'quiet', l: c('kpi.quiet', { n: n(r.quietDays) }), v: n(tot.quiet), note: c('kpi.quietNote', { n: n(r.quietDays) }) },
        { id: 'repeat', l: c('kpi.repeat'), v: pct(tot.repeatRate, view.locale), note: c('kpi.repeatNote', { n: n(tot.repeaters), of: n(tot.buyers) }) },
      ]
    : [];

  return (
    <div className="a2-z" data-testid="customers-report" data-days={days} data-on={r.enabled ? 'yes' : 'no'}>
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />
      {!tot ? (
        <section className="a2-card a2-mt12" data-testid="report-off">
          <p className="a2-sm">{c('off')}</p>
          {canCustomers ? (
            <Link className="cr-link" href="/admin/customers/settings">
              {c('offLink')}
            </Link>
          ) : null}
        </section>
      ) : (
        <>
          <nav className="a2-views a2-mt12" aria-label={c('period.label')}>
            {PERIODS.map((p) => (
              <Link key={p} className={`a2-view cr-tap${p === days ? ' on' : ''}`} href={`${HERE}?days=${p}`} aria-current={p === days ? 'page' : undefined}>
                {c(`period.d${p}`)}
              </Link>
            ))}
          </nav>
          <p className="a2-xs a2-mute" data-testid="report-range">
            {c('range', { from: day.format(r.from), to: day.format(r.to) })}
          </p>
          <div className="a2-kpis" data-testid="customers-kpis">
            {kpis.map((k) => (
              <div key={k.id} className="a2-card a2-kpi" data-kpi={k.id}>
                <div className="a2-kl">{k.l}</div>
                <div className="a2-kv">{k.v}</div>
                <div className="a2-kn">{k.note}</div>
              </div>
            ))}
          </div>
          <div className="a2-row a2-r21 a2-mt12">
            <section className="a2-card" data-testid="report-segments">
              <div className="a2-ch">
                <div>
                  <h2 className="a2-h3">{c('segs.title')}</h2>
                  <div className="a2-cs">{c('segs.sub')}</div>
                </div>
              </div>
              {!r.segmentsOn ? (
                <p className="a2-sm a2-mute a2-mt6">{c('segs.off')}</p>
              ) : r.segments.length ? (
                <div className="a2-tblw">
                  <table className="a2-tbl" data-testid="segments-table">
                    <thead>
                      <tr>
                        <th>{c('segs.name')}</th>
                        <th className="r">{c('segs.people')}</th>
                        <th className="r">{c('segs.new')}</th>
                        <th className="r">{c('segs.returning')}</th>
                        <th className="r">{c('segs.quiet')}</th>
                        <th className="r">{c('segs.repeat')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.segments.map((s) => (
                        <tr key={s.id} data-testid="segment-row">
                          <td className="a2-tdh">
                            <b>{s.name}</b>
                          </td>
                          <td className="r" data-l={c('segs.people')}>
                            {n(s.people)}
                          </td>
                          <td className="r" data-l={c('segs.new')}>
                            {n(s.newBuyers)}
                          </td>
                          <td className="r" data-l={c('segs.returning')}>
                            {n(s.returning)}
                          </td>
                          <td className="r" data-l={c('segs.quiet')}>
                            {n(s.quiet)}
                          </td>
                          <td className="r" data-l={c('segs.repeat')}>
                            {pct(s.buyers ? s.repeaters / s.buyers : null, view.locale)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="a2-sm a2-mute a2-mt6">{c('segs.none')}</p>
              )}
              {r.segmentsMore ? <p className="a2-xs a2-mute a2-mt6">{c('segs.more', { n: n(r.segmentsMore) })}</p> : null}
              {canCustomers ? (
                <Link className="cr-link" href="/admin/customers/segments">
                  {c('segs.open')}
                </Link>
              ) : null}
            </section>
            <section className="a2-card" data-testid="report-support">
              <h2 className="a2-h3">
                {c('support.title')} <span className="a2-pill line">{c('support.plan')}</span>
              </h2>
              <p className="a2-sm a2-mute a2-mt6">{c('support.sub')}</p>
            </section>
          </div>
          <p className="a2-xs a2-mute a2-mt12">{c('note')}</p>
        </>
      )}
    </div>
  );
}

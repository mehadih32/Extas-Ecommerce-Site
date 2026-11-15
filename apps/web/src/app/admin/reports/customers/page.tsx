// S14 · PR 303 — Reports › Customers at /admin/reports/customers (BACKEND-ARCHITECTURE §5.12 REP-04), rebuilt in PR 798 to the prototype v5
// Customer report: for any period (Today … 6 months, or two dates) with the span before beside it — who ordered, new against returning,
// repeat rate, average customer value, buyers at risk, sales by grade, repeat rate by first-order month, top customers, districts and the
// at-risk list (lib/reports-v5/customers.ts; every table sorts and opens its rows). Below it, the saved-segment table and the Support card
// of PR 303 (segments only while they are on; no sample figures). An area filter narrows the orders of the two spans to one division.
// Seeing needs `reports.read`. Words: messages/admin-reports-v5.*.json (`reportsV5.customers.*`). Guide: docs/admin-guide/pages/reports/customers.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cu from '@extas/customers';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { pct } from '@/components/admin/courier-report/PerfTable';
import { ReportBar } from '@/components/admin/reports/ReportBar';
import { ReportCustomersProto } from '@/components/admin/reports/ReportCustomersProto';
import '@/components/admin/reports/report-bar.css';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { withCustomers } from '@/lib/admin-customers/i18n';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { customersDeps } from '@/lib/customers-api';
import { t } from '@/lib/i18n';
import { loadCustomers } from '@/lib/reports-v5/customers';
import { makeFmt } from '@/lib/reports-v5/fmt';
import { DIVISIONS, divisionOf } from '@/lib/reports-v5/geo';
import { loadBase, loadViews } from '@/lib/reports-v5/load';
import { withReportsV5 } from '@/lib/reports-v5/words';
import '../delivery/report.css';

export const dynamic = 'force-dynamic';

const KEY = 'reportsCustomers';
const HERE = '/admin/reports/customers';

export async function generateMetadata(): Promise<Metadata> {
  const view = withReportsV5(withCustomers(await adminView()));
  return { title: `${t(view.dict, 'reportsV5.customers.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function CustomersReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('reports.read', deps, MOTHER_STORE_ID), searchParams]);
  const view = withReportsV5(withCustomers(plain));
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z lm-rp" data-lm-ready="" data-testid="customers-report">
        <ShellState view={view} kind="denied" permission="reports.read" />
      </div>
    );
  const oc = (k: string, v?: Record<string, string | number>) => t(d, `cus.rep.${k}`, v);
  const pc = (k: string, v?: Record<string, string | number>) => t(d, `reportsV5.customers.${k}`, v);
  const cc = (k: string, v?: Record<string, string | number>) => t(d, `reportsV5.common.${k}`, v);
  const base = await loadBase(access.deps, sp);
  const { q, notes } = base.period;
  const cmp = sp.cmp !== '0';
  const div = DIVISIONS.find((x) => x === sp.div) ?? 'all';
  const who: cu.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const now = new Date();
  const [data, views, r] = await Promise.all([
    loadCustomers(access.deps, base.timeZone, q.from, q.to, base.before, now),
    loadViews(access, 'customers'),
    cu.customerReport(customersDeps(access.deps), who, { from: new Date(`${q.from}T00:00:00Z`), to: new Date(`${q.to}T23:59:59Z`) }),
  ]);
  const inDiv = <T extends { district: string | null }>(os: T[]) => (div === 'all' ? os : os.filter((o) => divisionOf(o.district) === div));
  const shown = { ...data, cur: inDiv(data.cur), prev: inDiv(data.prev) };
  const f = makeFmt(view.locale, base.currency);
  const held = access.guard.permissions;
  const canCustomers = held?.has('customers.read') ?? false;
  const n = (x: number) => f.num(x);
  const tot = r.totals;
  const monthName = (ym: string) => new Intl.DateTimeFormat(view.locale, { timeZone: 'UTC', month: 'long', year: 'numeric', numberingSystem: 'latn' }).format(new Date(`${ym}-15T00:00:00Z`));
  const keepP = typeof sp.p === 'string' ? sp.p : 'custom';
  const csv = `/api/admin/reports/export/customers?from=${q.from}&to=${q.to}`;

  return (
    <div className="a2-z lm-rp" data-lm-ready="" data-testid="customers-report" data-from={q.from} data-to={q.to} data-on={r.enabled ? 'yes' : 'no'}>
      <PageHead view={view} place={locateKey(KEY)} title={cc('pageTitle')} sub={pc('sub')} />
      <SectionTabs view={view} current={KEY} />
      <ReportBar dict={d} here={HERE} id="rp" from={q.from} to={q.to} today={base.today} p={typeof sp.p === 'string' ? sp.p : undefined} cmp={cmp} before={base.before} reportKey="customers" views={views} day={f.dayShort} csv={csv} notes={notes} limitDays={base.limits.maxDays} />
      <form className="rpf" action={HERE} method="get" data-testid="rp-filters">
        <input type="hidden" name="p" value={keepP} />
        <input type="hidden" name="from" value={q.from} />
        <input type="hidden" name="to" value={q.to} />
        {cmp ? null : <input type="hidden" name="cmp" value="0" />}
        <label className="a2-xs a2-mute" htmlFor="rp-f-div">
          {t(d, 'reportsV5.areas.fArea')}
        </label>
        <select id="rp-f-div" name="div" className="a2-inp" defaultValue={div} data-testid="rp-f-div">
          <option value="all">{t(d, 'reportsV5.areas.fAllAreas')}</option>
          {DIVISIONS.map((x) => (
            <option key={x} value={x}>
              {t(d, 'reportsV5.areas.divisionName', { name: x })}
            </option>
          ))}
        </select>
        <button type="submit" className="a2-btn sm cr-tap" data-testid="rp-f-apply">
          {t(d, 'reportsV5.areas.apply')}
        </button>
        {div === 'all' ? null : (
          <Link className="a2-btn sm ghost cr-tap" href={`${HERE}?p=${keepP}&from=${q.from}&to=${q.to}${cmp ? '' : '&cmp=0'}`} data-testid="rp-f-clear">
            {t(d, 'reportsV5.areas.fClear')}
          </Link>
        )}
      </form>
      <ReportCustomersProto data={shown} from={q.from} to={q.to} cmp={cmp} c={pc} f={f} locale={view.locale} now={now.getTime()} monthName={monthName} />
      {tot ? (
        <div className="a2-row a2-r21 a2-mt12">
          <section className="a2-card" data-testid="report-segments">
            <div className="a2-ch">
              <div>
                <h2 className="a2-h3">{oc('segs.title')}</h2>
                <div className="a2-cs">{oc('segs.sub')}</div>
              </div>
            </div>
            {!r.segmentsOn ? (
              <p className="a2-sm a2-mute a2-mt6">{oc('segs.off')}</p>
            ) : r.segments.length ? (
              <div className="a2-tblw">
                <table className="a2-tbl" data-testid="segments-table">
                  <thead>
                    <tr>
                      <th>{oc('segs.name')}</th>
                      <th className="r">{oc('segs.people')}</th>
                      <th className="r">{oc('segs.new')}</th>
                      <th className="r">{oc('segs.returning')}</th>
                      <th className="r">{oc('segs.quiet')}</th>
                      <th className="r">{oc('segs.repeat')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.segments.map((s) => (
                      <tr key={s.id} data-testid="segment-row">
                        <td className="a2-tdh">
                          <b>{s.name}</b>
                        </td>
                        <td className="r" data-l={oc('segs.people')}>
                          {n(s.people)}
                        </td>
                        <td className="r" data-l={oc('segs.new')}>
                          {n(s.newBuyers)}
                        </td>
                        <td className="r" data-l={oc('segs.returning')}>
                          {n(s.returning)}
                        </td>
                        <td className="r" data-l={oc('segs.quiet')}>
                          {n(s.quiet)}
                        </td>
                        <td className="r" data-l={oc('segs.repeat')}>
                          {pct(s.buyers ? s.repeaters / s.buyers : null, view.locale)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="a2-sm a2-mute a2-mt6">{oc('segs.none')}</p>
            )}
            {r.segmentsMore ? <p className="a2-xs a2-mute a2-mt6">{oc('segs.more', { n: n(r.segmentsMore) })}</p> : null}
            {canCustomers ? (
              <Link className="cr-link" href="/admin/customers/segments">
                {oc('segs.open')}
              </Link>
            ) : null}
          </section>
          <section className="a2-card" data-testid="report-support">
            <h2 className="a2-h3">
              {oc('support.title')} <span className="a2-pill line">{oc('support.plan')}</span>
            </h2>
            <p className="a2-sm a2-mute a2-mt6">{oc('support.sub')}</p>
          </section>
        </div>
      ) : canCustomers ? (
        <p className="a2-xs a2-mute a2-mt12" data-testid="report-off">
          {oc('off')}{' '}
          <Link className="cr-link" href="/admin/customers/settings">
            {oc('offLink')}
          </Link>
        </p>
      ) : null}
    </div>
  );
}

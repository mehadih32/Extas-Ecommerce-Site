// S08 · PR 192 — Reports › Delivery & RTO at /admin/reports/delivery (BACKEND-ARCHITECTURE §5 REP-06; demo 97y REP-06;
// SIM-F-017, SIM-F-018, SIM-F-027; CN-014 d). Read-only: delivery success, on time against the band's promise, refused at
// the door (not the shop's fault) and the exceptions on the way — per courier, per courier and zone, per district — the
// parcels past their promise now, and the RTO cost book by district, campaign, product, courier and reason (off until
// the owner switches it on; the shop's own returned parcels only, never sample rows; a part not entered is named).
// `?days=7|30|90` (default 30), `?by=` the book's dimension. Seeing needs `reports.read`; the book's switch needs
// `settings.write` (the API checks again). The fraud report of REP-06 is PR 164's.
// PR 564: the charge mismatch log — the parcels a courier charged as another band than the customer paid for, per month
// (cases, paid less, paid more) and the latest cases; a record only, behind its own switch (off as shipped).
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as sh from '@extas/shipping';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { SwitchButton } from '@/components/admin/courier-report/Parts';
import { PerfTable, pct } from '@/components/admin/courier-report/PerfTable';
import { formatMoney, moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { withCourierReport } from '@/lib/admin-courier-report';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { orderHref } from '@/lib/admin-orders/model';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { shippingDeps } from '@/lib/shipping-api';
import './report.css';

export const dynamic = 'force-dynamic';

const KEY = 'reportsDelivery';
const HERE = '/admin/reports/delivery';
const PERIODS = [7, 30, 90] as const;
const DISTRICTS_SHOWN = 15;
const LATE_SHOWN = 20;
const MISMATCH_MONTHS = 6;
const MISMATCH_SHOWN = 10;

export async function generateMetadata(): Promise<Metadata> {
  const view = withCourierReport(await adminView());
  return { title: `${t(view.dict, 'courierReport.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function DeliveryReportPage({ searchParams }: { searchParams: Promise<{ days?: string; by?: string }> }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('reports.read', deps, MOTHER_STORE_ID), searchParams]);
  const view = withCourierReport(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="reports.read" />
      </div>
    );
  const c = (k: string, v?: Record<string, string | number>) => t(d, `courierReport.${k}`, v);
  const days = (PERIODS as readonly number[]).includes(Number(sp.days)) ? Number(sp.days) : 30;
  const by = (sh.RTO_DIMENSIONS as readonly string[]).includes(sp.by ?? '') ? (sp.by as sh.RtoDimension) : 'district';
  const who: sh.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const sd = await shippingDeps(access.deps);
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const lang = view.lang === 'bn' ? 'bn' : 'en';
  const at = { storeId: MOTHER_STORE_ID };
  const [perf, book, bookSwitch, currency, mis, misSwitch] = await Promise.all([
    sh.courierPerformance(sd, who, { from, to, lang, lateRows: LATE_SHOWN }),
    sh.rtoReport(sd, who, { from, to, lang }),
    access.deps.resolver.value('delivery.courier.rtoBook', at),
    access.deps.resolver.value('store.currency', at),
    sh.chargeMismatchReport(sd, who, { months: MISMATCH_MONTHS, recent: MISMATCH_SHOWN, lang }),
    access.deps.resolver.value('delivery.chargeMismatch', at),
  ]);
  const canSwitch = access.guard.permissions?.has('settings.write') ?? false;
  const money = moneyOf(currency, view.locale);
  const m = (minor: number) => formatMoney(minor, money);
  const n = (x: number) => new Intl.NumberFormat(view.locale, { numberingSystem: 'latn' }).format(x);
  const when = new Intl.DateTimeFormat(view.locale, { timeZone: view.timeZone, dateStyle: 'medium', timeStyle: 'short', numberingSystem: 'latn' });
  const monthName = new Intl.DateTimeFormat(view.locale, { timeZone: 'UTC', month: 'long', year: 'numeric', numberingSystem: 'latn' });
  const href = (o: { days?: number; by?: string }) => `${HERE}?days=${o.days ?? days}&by=${o.by ?? by}`;
  const tot = perf.total;
  const moreDistricts = perf.byDistrict.length > DISTRICTS_SHOWN;
  const moreLate = perf.lateNow.count > perf.lateNow.rows.length;
  const groupLabel = (k: string) => {
    if (k === '-') return '—';
    if (by === 'campaign' && k.startsWith('source:')) {
      const w = t(d, `courierReport.source.${k.slice(7)}`);
      return w.startsWith('courierReport.') ? k.slice(7) : w;
    }
    return k;
  };
  const kpis: { l: string; v: string; note: string; id: string }[] = [
    { id: 'success', l: c('kpi.success'), v: pct(tot.successRate, view.locale), note: c('kpi.successNote', { n: n(tot.delivered), of: n(tot.parcels) }) },
    { id: 'onTime', l: c('kpi.onTime'), v: pct(tot.onTimeRate, view.locale), note: c('kpi.onTimeNote', { n: n(tot.onTime), of: n(tot.promised) }) },
    { id: 'refused', l: c('kpi.refused'), v: pct(tot.refusalRate, view.locale), note: c('kpi.refusedNote', { n: n(tot.refused) }) },
    { id: 'late', l: c('kpi.late'), v: n(perf.lateNow.count), note: c('kpi.lateNote') },
  ];

  return (
    <div className="a2-z" data-testid="delivery-report" data-days={days}>
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />
      <nav className="a2-views a2-mt12" aria-label={c('period.label')}>
        {PERIODS.map((p) => (
          <Link key={p} className={`a2-view cr-tap${p === days ? ' on' : ''}`} href={href({ days: p })} aria-current={p === days ? 'page' : undefined}>
            {c(`period.d${p}`)}
          </Link>
        ))}
      </nav>
      <div className="a2-kpis" data-testid="delivery-kpis">
        {kpis.map((k) => (
          <div key={k.id} className="a2-card a2-kpi" data-kpi={k.id}>
            <div className="a2-kl">{k.l}</div>
            <div className="a2-kv">{k.v}</div>
            <div className="a2-kn">{k.note}</div>
          </div>
        ))}
      </div>
      {perf.practiceLeftOut ? <p className="a2-xs a2-mute">{c('practice', { n: n(perf.practiceLeftOut) })}</p> : null}
      {perf.cut ? <p className="a2-xs cr-warn">{c('cut', { n: n(sh.PERFORMANCE_MAX_PARCELS) })}</p> : null}

      <section className="a2-card a2-mt12" data-testid="perf-couriers">
        <h2 className="a2-h3">{c('byCourier')}</h2>
        {tot.parcels ? <PerfTable dict={d} rows={perf.byCourier} first="courier" locale={view.locale} testId="perf-courier-table" /> : <p className="a2-sm a2-mute a2-mt6">{c('none')}</p>}
      </section>
      {tot.parcels ? (
        <>
          <section className="a2-card a2-mt12" data-testid="perf-zones">
            <h2 className="a2-h3">{c('byZone')}</h2>
            <PerfTable dict={d} rows={perf.byZone} first="zone" locale={view.locale} testId="perf-zone-table" />
          </section>
          <section className="a2-card a2-mt12" data-testid="perf-districts">
            <h2 className="a2-h3">{c('byDistrict')}</h2>
            {moreDistricts ? <div className="a2-cs">{c('byDistrictNote', { n: n(DISTRICTS_SHOWN) })}</div> : null}
            <PerfTable dict={d} rows={perf.byDistrict.slice(0, DISTRICTS_SHOWN)} first="district" locale={view.locale} testId="perf-district-table" />
          </section>
        </>
      ) : null}

      <section className="a2-card a2-mt12" data-testid="late-now">
        <h2 className="a2-h3">{c('lateTitle')}</h2>
        {perf.lateNow.rows.length ? (
          <>
            <ul className="cr-rows">
              {perf.lateNow.rows.map((r) => (
                <li key={r.shipmentId} data-testid="late-row">
                  <div>
                    <Link className="cr-link" href={orderHref(r.orderId)}>
                      {r.orderNumber}
                    </Link>
                    <span className="a2-xs a2-mute a2-blk">
                      {r.courier} · {c('col.due')}: {r.dueBy ? when.format(r.dueBy) : c('noPromise')}
                    </span>
                  </div>
                  <span className="a2-pill warn">{t(d, `courierReport.status.${r.status}`)}</span>
                </li>
              ))}
            </ul>
            {moreLate ? <p className="a2-xs a2-mute a2-mt6">{c('lateMore', { shown: n(perf.lateNow.rows.length), n: n(perf.lateNow.count) })}</p> : null}
          </>
        ) : (
          <p className="a2-sm a2-mute a2-mt6">{c('lateNone')}</p>
        )}
      </section>

      <section className="a2-card a2-mt12" data-testid="rto-book" data-on={book.enabled ? 'yes' : 'no'}>
        <div className="a2-ch">
          <div>
            <h2 className="a2-h3">
              {c('rto.title')} <span className={`a2-pill ${book.enabled ? 'ok' : 'line'}`}>{book.enabled ? c('rto.on') : c('rto.offPill')}</span>
            </h2>
            <div className="a2-cs">{c('rto.sub')}</div>
          </div>
          {canSwitch ? <SwitchButton dict={d as Dict} url="/api/admin/delivery/claims/settings" settingKey="delivery.courier.rtoBook" before={{ ...bookSwitch }} label={book.enabled ? c('rto.turnOff') : c('rto.turnOn')} tone={book.enabled ? '' : 'pri'} testId="rto-switch" /> : null}
        </div>
        {!book.enabled ? (
          <p className="a2-sm a2-mute a2-mt6">{c('rto.off')}</p>
        ) : (
          <>
            <nav className="a2-views a2-mt12" aria-label={c('rto.title')}>
              {sh.RTO_DIMENSIONS.map((x) => (
                <Link key={x} className={`a2-view cr-tap${x === by ? ' on' : ''}`} href={href({ by: x })} aria-current={x === by ? 'page' : undefined}>
                  {c(`rto.dims.${x}`)}
                </Link>
              ))}
            </nav>
            {book.summary.parcels ? (
              <>
                <div className="a2-tblw">
                  <table className="a2-tbl" data-testid="rto-table">
                    <thead>
                      <tr>
                        <th>{c(`rto.dims.${by}`)}</th>
                        <th className="r">{c('col.parcels')}</th>
                        <th className="r">{c('col.cost')}</th>
                        <th className="r">{c('col.share')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {book.groups[by].map((g) => (
                        <tr key={g.key} data-testid="rto-row">
                          <td className="a2-tdh">
                            <b>{groupLabel(g.key)}</b>
                          </td>
                          <td className="r" data-l={c('col.parcels')}>
                            {n(g.parcels)}
                          </td>
                          <td className="r" data-l={c('col.cost')}>
                            {m(g.knownMinor)}
                            {g.incomplete ? ' *' : ''}
                          </td>
                          <td className="r" data-l={c('col.share')}>
                            {pct(book.summary.knownMinor ? g.knownMinor / book.summary.knownMinor : null, view.locale)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="a2-sm a2-mt12" data-testid="rto-total">
                  <b>{c('rto.total', { cost: m(book.summary.knownMinor), n: n(book.summary.parcels) })}</b>
                </p>
                {by === 'product' ? <p className="a2-xs a2-mute">{c('rto.productNote')}</p> : null}
                {book.summary.incomplete ? (
                  <p className="a2-xs cr-warn">
                    * {c('rto.floor', { n: n(book.summary.incomplete) })}{' '}
                    <Link className="cr-link" href="/admin/money/fees">
                      {c('rto.fees')}
                    </Link>
                  </p>
                ) : null}
              </>
            ) : (
              <p className="a2-sm a2-mute a2-mt6">{c('rto.none')}</p>
            )}
          </>
        )}
      </section>
      <section className="a2-card a2-mt12" data-testid="mismatch-log" data-on={mis.enabled ? 'yes' : 'no'}>
        <div className="a2-ch">
          <div>
            <h2 className="a2-h3">
              {c('mismatch.title')} <span className={`a2-pill ${mis.enabled ? 'ok' : 'line'}`}>{mis.enabled ? c('mismatch.on') : c('mismatch.offPill')}</span>
            </h2>
            <div className="a2-cs">{c('mismatch.sub')}</div>
          </div>
          {canSwitch ? <SwitchButton dict={d as Dict} url="/api/admin/delivery/claims/settings" settingKey="delivery.chargeMismatch" before={{ ...misSwitch }} label={mis.enabled ? c('mismatch.turnOff') : c('mismatch.turnOn')} tone={mis.enabled ? '' : 'pri'} testId="mismatch-switch" /> : null}
        </div>
        {!mis.enabled ? <p className="a2-sm a2-mute a2-mt6">{c('mismatch.off')}</p> : null}
        {mis.enabled || mis.months.some((x) => x.cases) ? (
          <>
            <p className="a2-sm a2-mt12" data-testid="mismatch-month">
              <b>{c('mismatch.thisMonth', { n: n(mis.months[0]!.cases), under: m(mis.months[0]!.underMinor), over: m(mis.months[0]!.overMinor) })}</b>
            </p>
            <div className="a2-tblw">
              <table className="a2-tbl" data-testid="mismatch-table">
                <thead>
                  <tr>
                    <th>{c('mismatch.month')}</th>
                    <th className="r">{c('mismatch.cases')}</th>
                    <th className="r">{c('mismatch.under')}</th>
                    <th className="r">{c('mismatch.over')}</th>
                  </tr>
                </thead>
                <tbody>
                  {mis.months.map((x) => (
                    <tr key={x.month} data-testid="mismatch-row">
                      <td className="a2-tdh">
                        <b>{monthName.format(new Date(`${x.month}-15T00:00:00Z`))}</b>
                      </td>
                      <td className="r" data-l={c('mismatch.cases')}>
                        {n(x.cases)}
                      </td>
                      <td className="r" data-l={c('mismatch.under')}>
                        {m(x.underMinor)}
                      </td>
                      <td className="r" data-l={c('mismatch.over')}>
                        {m(x.overMinor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="a2-h3 a2-mt12">{c('mismatch.recent')}</h3>
            {mis.recent.length ? (
              <ul className="cr-rows">
                {mis.recent.map((r) => (
                  <li key={r.id} data-testid="mismatch-case">
                    <div>
                      <Link className="cr-link" href={orderHref(r.orderId)}>
                        {r.orderNumber}
                      </Link>
                      <span className="a2-xs a2-mute a2-blk">
                        {r.courier} · {c('mismatch.row', { paid: r.chargedBand, read: r.courierBand })}
                        {r.courierChargeMinor !== null ? ` · ${c('mismatch.charge', { charge: m(r.courierChargeMinor) })}` : ''}
                        {r.source ? ` ${c(`mismatch.source.${r.source}`)}` : ''} · {when.format(r.at)}
                      </span>
                    </div>
                    <span className={`a2-pill ${r.freeDelivery ? 'line' : 'warn'}`}>{r.freeDelivery ? c('mismatch.free') : c('mismatch.gap', { gap: m(r.gapMinor) })}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="a2-sm a2-mute a2-mt6">{c('mismatch.none')}</p>
            )}
            <p className="a2-xs a2-mute a2-mt6">{c('mismatch.cards')}</p>
          </>
        ) : null}
      </section>
    </div>
  );
}

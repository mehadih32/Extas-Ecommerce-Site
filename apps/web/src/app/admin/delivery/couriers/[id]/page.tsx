// S28 · PR 670 (CN-048, admin prototype v5, GAP-MAP C-02..C-15) — Courier 360: one courier on one page, in sections
// (`?s=`): Overview (the 30-day figures, success week by week, parcels with a problem now), Parcels (the courier's parcels,
// filtered, 30 a page), Money (the cash it holds for us, days to pay, statements, the lines that do not match), Performance
// (by delivery zone and district, late now, the charges), and Setup (connection, area pairs, rate card, default and
// backup), Payouts (PR 671) and Claims (PR 673); Messages joins with PR 674. The old page of this address (the area pairs) moved
// to `.../areas`. Seeing needs `delivery.read`; the Money section also needs `payments.view`. Practice parcels are never
// counted in a figure. Guide: docs/admin-guide/pages/delivery/courier-360.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { COURIER_MESSAGE_EVENTS, COURIER_MESSAGE_TOKENS } from '@extas/settings';
import * as pay from '@extas/payments';
import * as sh from '@extas/shipping';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { RaiseClaim } from '@/components/admin/couriers/ClaimPanel';
import { CopyText } from '@/components/admin/couriers/CopyText';
import { AskPayout, PayoutRowActions } from '@/components/admin/couriers/PayoutPanel';
import { StepButton } from '@/components/admin/courier-report/Parts';
import { PerfTable } from '@/components/admin/courier-report/PerfTable';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { withCouriers } from '@/lib/admin-couriers';
import { withCourierReport } from '@/lib/admin-courier-report';
import { withFulfil } from '@/lib/admin-fulfil/i18n';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { orderHref } from '@/lib/admin-orders/model';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { paymentsDeps } from '@/lib/payments-api';
import { shippingDeps } from '@/lib/shipping-api';
import '@/app/admin/reports/delivery/report.css';

export const dynamic = 'force-dynamic';

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The sections, in the order the page shows them. */
const COURIER_SECTIONS = ['overview', 'parcels', 'money', 'payouts', 'claims', 'performance', 'messages', 'setup'] as const;
type Section = (typeof COURIER_SECTIONS)[number];
/** How many claims and parcels the Claims section lists. */
const CLAIM_ROWS = 50;

export async function generateMetadata(): Promise<Metadata> {
  const view = withCouriers(await adminView());
  return { title: `${t(view.dict, 'shell.tab.delivery.courier360')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function CourierPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Search }) {
  const deps = adminDeps();
  const [{ id }, sp, plain, access] = await Promise.all([params, searchParams, adminView(deps), pageAccess('delivery.read', deps, MOTHER_STORE_ID)]);
  const view = withCouriers(withCourierReport(withFulfil(plain)));
  const d = view.dict;
  const want = one(sp.s);
  const section: Section = (COURIER_SECTIONS as readonly string[]).includes(want ?? '') ? (want as Section) : 'overview';
  const here = `/admin/delivery/couriers/${id}${section === 'overview' ? '' : `?s=${section}`}`;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(here)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="courier" text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="delivery.read" />
      </div>
    );
  if (!UUID.test(id)) notFound();
  const who: sh.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const sd = await shippingDeps(access.deps);
  let detail: sh.CourierDetail;
  try {
    detail = await sh.courierDetail(sd, who, id);
  } catch (e) {
    if (sh.isShippingError(e) && e.code === 'NOT_FOUND') notFound();
    throw e;
  }
  const c = detail.courier;
  const currency = await access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID });
  const money = moneyOf(currency, view.locale);
  const m = (x: number) => formatMoney(x, money);
  const n = (x: number) => formatNumber(x, view.locale);
  const cr = (k: string, v?: Record<string, string | number>) => t(d, `cr.${k}`, v);
  const pct = (x: number | null) => (x === null ? '—' : `${n(x)}%`);
  const day = new Intl.DateTimeFormat(view.locale, { timeZone: view.timeZone, dateStyle: 'medium', numberingSystem: 'latn' });
  const when = new Intl.DateTimeFormat(view.locale, { timeZone: view.timeZone, dateStyle: 'medium', timeStyle: 'short', numberingSystem: 'latn' });
  const href = (s: Section, extra: Record<string, string | number> = {}) => {
    const q = new URLSearchParams();
    if (s !== 'overview') q.set('s', s);
    for (const [k, v] of Object.entries(extra)) if (String(v) !== '' && !(k === 'page' && Number(v) <= 1) && !(k === 'f' && v === 'all')) q.set(k, String(v));
    const qs = q.toString();
    return `/admin/delivery/couriers/${id}${qs ? `?${qs}` : ''}`;
  };

  let body: React.ReactNode;
  if (section === 'overview') {
    const f = c.last30;
    body = (
      <>
        <dl className="a2-card a2-mt12" data-testid="c360-figures" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          <div>
            <dt className="a2-xs a2-mute">{cr('ov.onWay')}</dt>
            <dd>
              <b>{cr('ov.parcelsN', { n: n(c.onTheWay.parcels) })}</b>
              <span className="a2-xs a2-mute a2-blk">{m(c.onTheWay.codMinor)}</span>
            </dd>
          </div>
          <div>
            <dt className="a2-xs a2-mute">{cr('ov.success')}</dt>
            <dd>
              <b>{pct(f.successPct)}</b>
              <span className="a2-xs a2-mute a2-blk">{cr('c.pcsFinished', { n: n(f.finished), m: n(f.delivered) })}</span>
            </dd>
          </div>
          <div>
            <dt className="a2-xs a2-mute">{cr('ov.days')}</dt>
            <dd>
              <b>{f.avgDays === null ? '—' : n(f.avgDays)}</b>
            </dd>
          </div>
          <div>
            <dt className="a2-xs a2-mute">{cr('ov.cost')}</dt>
            <dd>
              <b>{f.perParcelMinor === null ? '—' : m(f.perParcelMinor)}</b>
            </dd>
          </div>
        </dl>
        {detail.exceptions ? (
          <div className="a2-note bad a2-mt12" data-testid="c360-exceptions">
            {cr('c.exceptions', { n: n(detail.exceptions) })} · <Link href={href('parcels', { f: 'problem' })}>{cr('p.f.problem')}</Link>
          </div>
        ) : null}
        <section className="a2-card a2-mt12" data-testid="c360-weeks">
          <h2 className="a2-h3">{cr('c.weeks')}</h2>
          <p className="a2-xs a2-mute">{cr('c.weeksSub')}</p>
          <div className="a2-tblw a2-mt12">
            <table className="a2-tbl">
              <tbody>
                {detail.weekly.map((w) => (
                  <tr key={w.from} data-testid="c360-week">
                    <td className="a2-tdh">{cr('c.weekOf', { day: day.format(new Date(`${w.from}T00:00:00Z`)) })}</td>
                    <td className="r" data-l={cr('ov.success')}>
                      {w.finished ? (
                        <>
                          <b>{pct(w.successPct)}</b> <span className="a2-xs a2-mute">{cr('c.pcsFinished', { n: n(w.finished), m: n(w.delivered) })}</span>
                        </>
                      ) : (
                        <span className="a2-mute">{cr('c.noWeek')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </>
    );
  } else if (section === 'parcels') {
    const f = (sh.PARCEL_FILTERS as readonly string[]).includes(one(sp.f) ?? '') ? (one(sp.f) as sh.ParcelFilter) : 'all';
    const page = Math.max(1, Math.min(10_000, Number(one(sp.page)) || 1));
    const pr = await sh.courierParcels(sd, who, id, { filter: f, page });
    body = (
      <>
        <nav className="a2-views a2-mt12" aria-label={cr('p.title')}>
          {sh.PARCEL_FILTERS.map((x) => (
            <Link key={x} className={`a2-view${x === f ? ' on' : ''}`} href={href('parcels', { f: x })} aria-current={x === f ? 'page' : undefined}>
              {cr(`p.f.${x}`)}
              <span className="a2-cnt">{n(pr.counts[x])}</span>
            </Link>
          ))}
        </nav>
        {pr.rows.length ? (
          <div className="a2-tblw a2-mt12">
            <table className="a2-tbl" data-testid="c360-parcels">
              <thead>
                <tr>
                  <th>{cr('p.order')}</th>
                  <th>{cr('p.consignment')}</th>
                  <th>{cr('p.status')}</th>
                  <th>{cr('p.moved')}</th>
                  <th className="r">{cr('p.cod')}</th>
                  <th className="r">{cr('p.collected')}</th>
                  <th className="r">{cr('p.charge')}</th>
                </tr>
              </thead>
              <tbody>
                {pr.rows.map((r) => (
                  <tr key={r.shipmentId} data-testid="c360-parcel">
                    <td className="a2-tdh">
                      <Link href={orderHref(r.orderId)}>
                        <b>{r.orderNumber}</b>
                      </Link>
                      {r.practice ? (
                        <span className="a2-pill line" style={{ marginLeft: 6 }}>
                          {cr('p.practice')}
                        </span>
                      ) : null}
                    </td>
                    <td data-l={cr('p.consignment')}>{r.consignmentId ?? '—'}</td>
                    <td data-l={cr('p.status')}>{t(d, `ful.status.${r.status}`)}</td>
                    <td data-l={cr('p.moved')}>{r.movedAt ? when.format(new Date(r.movedAt)) : '—'}</td>
                    <td className="r" data-l={cr('p.cod')}>
                      {m(r.codMinor)}
                    </td>
                    <td className="r" data-l={cr('p.collected')}>
                      {r.collectedMinor === null ? '—' : m(r.collectedMinor)}
                    </td>
                    <td className="r" data-l={cr('p.charge')}>
                      {r.chargeMinor === null ? '—' : m(r.chargeMinor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <section className="a2-card a2-mt12">
            <p className="a2-sm a2-mute">{cr('p.empty')}</p>
          </section>
        )}
        {pr.pages > 1 ? (
          <div className="a2-between a2-mt12">
            <span className="a2-xs a2-mute">{cr('p.page', { n: n(pr.page), m: n(pr.pages) })}</span>
            <span className="a2-gap8">
              {pr.page > 1 ? (
                <Link className="a2-btn sm" href={href('parcels', { f, page: pr.page - 1 })}>
                  {cr('p.prev')}
                </Link>
              ) : null}
              {pr.page < pr.pages ? (
                <Link className="a2-btn sm" href={href('parcels', { f, page: pr.page + 1 })}>
                  {cr('p.next')}
                </Link>
              ) : null}
            </span>
          </div>
        ) : null}
      </>
    );
  } else if (section === 'money') {
    if (!(access.guard.permissions?.has('payments.view') ?? false)) {
      body = (
        <section className="a2-card a2-mt12">
          <p className="a2-sm a2-mute">{cr('m.noPerm')}</p>
        </section>
      );
    } else {
      const mo = await pay.courierMoney(await paymentsDeps(access.deps), who, id, { month: one(sp.month) });
      const p = mo.position;
      const moreLines = Math.max(0, mo.openCount - mo.open.length);
      body = (
        <>
          {p ? (
            <dl className="a2-card a2-mt12" data-testid="c360-position" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
              <div>
                <dt className="a2-xs a2-mute">{cr('m.held')}</dt>
                <dd>
                  <b>{m(p.withCourierMinor)}</b>
                  <span className="a2-xs a2-mute a2-blk">{cr('m.heldSub', { n: n(p.withCourierParcels) })}</span>
                </dd>
              </div>
              <div>
                <dt className="a2-xs a2-mute">{cr('m.road')}</dt>
                <dd>
                  <b>{m(p.onTheRoadMinor)}</b>
                  <span className="a2-xs a2-mute a2-blk">{cr('m.roadSub', { n: n(p.onTheRoadParcels) })}</span>
                </dd>
              </div>
              <div>
                <dt className="a2-xs a2-mute">{cr('m.settle')}</dt>
                <dd>
                  <b>{p.settleDays.average === null ? cr('m.settleNone') : n(p.settleDays.average)}</b>
                  {p.settleDays.average !== null ? <span className="a2-xs a2-mute a2-blk">{cr('m.settleSub', { n: n(p.settleDays.lines), max: n(p.settleDays.max ?? 0) })}</span> : null}
                </dd>
              </div>
            </dl>
          ) : null}
          <section className="a2-card a2-mt12" data-testid="c360-statements">
            <h2 className="a2-h3">{cr('m.statements')}</h2>
            {mo.statements.length ? (
              <div className="a2-tblw a2-mt12">
                <table className="a2-tbl">
                  <thead>
                    <tr>
                      <th>{cr('m.reference')}</th>
                      <th>{cr('m.received')}</th>
                      <th className="r">{cr('m.paidCod')}</th>
                      <th className="r">{cr('m.deducted')}</th>
                      <th className="r">{cr('m.net')}</th>
                      <th className="r">{cr('m.lines')}</th>
                      <th className="r">{cr('m.mismatched')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mo.statements.map((s) => (
                      <tr key={s.id} data-testid="c360-statement">
                        <td className="a2-tdh">
                          <b>{s.reference}</b>
                        </td>
                        <td data-l={cr('m.received')}>{s.receivedAt ? day.format(s.receivedAt) : '—'}</td>
                        <td className="r" data-l={cr('m.paidCod')}>
                          {m(s.totalCodMinor)}
                        </td>
                        <td className="r" data-l={cr('m.deducted')}>
                          {m(s.chargesMinor)}
                        </td>
                        <td className="r" data-l={cr('m.net')}>
                          {m(s.netMinor)}
                        </td>
                        <td className="r" data-l={cr('m.lines')}>
                          {n(s.lines)}
                        </td>
                        <td className="r" data-l={cr('m.mismatched')}>
                          {n(s.mismatched)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="a2-sm a2-mute a2-mt6">{cr('m.noStatements')}</p>
            )}
            {mo.statements.length ? (
              <p className="a2-sm a2-mt12">
                {cr('m.monthBody', { n: n(mo.month.statements), ym: mo.month.ym, cod: m(mo.month.totalCodMinor), charges: m(mo.month.chargesMinor), net: m(mo.month.netMinor) })}
              </p>
            ) : null}
          </section>
          <section className="a2-card a2-mt12" data-testid="c360-open-lines">
            <h2 className="a2-h3">{cr('m.open')}</h2>
            <p className="a2-xs a2-mute">{cr('m.openSub')}</p>
            {mo.open.length ? (
              <>
                <ul className="a2-stack a2-mt12" style={{ listStyle: 'none', padding: 0 }}>
                  {mo.open.map((l) => (
                    <li key={l.lineId} className="a2-sm" data-testid="c360-open-line">
                      <b>{l.orderNumber ?? l.consignmentId ?? l.reference}</b> · {l.reasonCode ? cr(`m.reasons.${l.reasonCode}`) : l.matchState === 'LATE' ? cr('m.late') : ''}
                      <span className="a2-xs a2-mute a2-blk">
                        {cr('m.expected')}: {l.expectedMinor === null ? '—' : m(l.expectedMinor)} · {cr('m.got')}: {m(l.codMinor)}
                      </span>
                    </li>
                  ))}
                </ul>
                {moreLines ? <p className="a2-xs a2-mute">{cr('m.openMore', { n: n(moreLines) })}</p> : null}
                <p className="a2-xs a2-mute a2-mt6">{cr('m.openDetail')}</p>
              </>
            ) : (
              <p className="a2-sm a2-mute a2-mt6">{cr('m.openNone')}</p>
            )}
          </section>
        </>
      );
    }
  } else if (section === 'payouts') {
    if (!(access.guard.permissions?.has('payments.view') ?? false)) {
      body = (
        <section className="a2-card a2-mt12">
          <p className="a2-sm a2-mute">{cr('m.noPerm')}</p>
        </section>
      );
    } else {
      const py = await pay.payoutView(await paymentsDeps(access.deps), who, id);
      const canAsk = access.guard.permissions?.has('payments.settle') ?? false;
      const cd: Dict = { cr: d.cr as Dict };
      const row = (r: pay.PayoutRow) => {
        const unconfirmed = r.providerRef === null && (r.state === 'REQUESTED' || r.state === 'PROCESSING');
        const isOpen = r.state === 'REQUESTED' || r.state === 'PROCESSING';
        return (
          <li key={r.id} className="a2-card tight" data-testid="payout-row" data-state={r.state}>
            <div className="a2-between" style={{ flexWrap: 'wrap', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <span className={`a2-pill ${r.state === 'PAID' ? 'ok' : r.state === 'REJECTED' ? 'bad' : 'info'}`}>{cr(`y.state.${r.state}`)}</span> <b>{m(r.amountMinor)}</b>
                <span className="a2-xs a2-mute a2-blk">
                  {cr('y.requested')}: {when.format(r.requestedAt)} · {cr('y.mode')}: {t(d, `ful.couriers.mode.${r.mode}`)} · {cr('y.covers')}: {cr('y.coversN', { n: n(r.parcels) })}
                </span>
              </div>
              {canAsk && (isOpen || r.state === 'PAID') ? <PayoutRowActions dict={cd} payoutId={r.id} canCheck={isOpen && r.providerRef !== null} canSettle={r.state === 'PAID' && !r.settledAt} canClose={unconfirmed} /> : null}
            </div>
            {r.state === 'PAID' ? (
              <p className="a2-sm a2-mt6">
                {cr('y.paid')}: <b>{r.paidMinor === null ? '—' : m(r.paidMinor)}</b>
                {r.paymentRef ? ` · ${r.paymentRef}` : ''} · {r.settledAt ? cr('y.settled') : cr('y.notSettled')}
              </p>
            ) : null}
            {r.differenceMinor !== null ? <div className="a2-note bad a2-mt6">{cr('y.diff', { diff: m(Math.abs(r.differenceMinor)), dir: r.differenceMinor > 0 ? cr('y.dir.more') : cr('y.dir.less') })}</div> : null}
            {unconfirmed ? <div className="a2-note bad a2-mt6">{cr('y.unconfirmed')}</div> : null}
            {r.state === 'REJECTED' && r.note ? (
              <p className="a2-xs a2-mute a2-mt6">
                {cr('y.reason')}: {r.note}
              </p>
            ) : null}
          </li>
        );
      };
      body = (
        <>
          {!py.enabled ? (
            <div className="a2-note a2-mt12" data-testid="payout-off">
              {cr('y.off')} <Link href="/admin/delivery/settings">{cr('s.settingsOpen')}</Link>
            </div>
          ) : null}
          {py.supported === 'read' ? <div className="a2-note a2-mt12">{cr('y.read')}</div> : null}
          {py.supported === 'none' ? <div className="a2-note a2-mt12">{cr('y.noneCourier')}</div> : null}
          <section className="a2-card a2-mt12" data-testid="payout-holds">
            <h2 className="a2-h3">{cr('y.holds')}</h2>
            <p className="a2-sm a2-mt6">{cr('y.holdsBody', { cash: m(py.holds.cashMinor), n: n(py.holds.parcels), charges: m(py.holds.chargesMinor), net: m(py.holds.netMinor) })}</p>
            {py.courierBalanceMinor !== null ? (
              <p className="a2-xs a2-mute">
                {cr('y.balance')}: {m(py.courierBalanceMinor)}
              </p>
            ) : null}
            {py.minAmountMinor ? <p className="a2-xs a2-mute">{cr('y.minimum', { amount: m(py.minAmountMinor) })}</p> : null}
            {py.enabled && py.supported === 'request' ? (
              py.blockedBy.length ? (
                <ul className="a2-xs a2-mute a2-mt6" style={{ paddingLeft: 18 }}>
                  {py.blockedBy.map((b) => (
                    <li key={b}>{cr(`y.blocked.${b}`)}</li>
                  ))}
                </ul>
              ) : canAsk ? (
                <AskPayout dict={cd} courierId={id} label={cr('y.ask')} />
              ) : (
                <p className="a2-xs a2-mute a2-mt6">{cr('y.noPerm')}</p>
              )
            ) : null}
          </section>
          {py.open ? (
            <section className="a2-mt12" data-testid="payout-open">
              <h2 className="a2-h3">{cr('y.open')}</h2>
              <ul className="a2-stack a2-mt6" style={{ listStyle: 'none', padding: 0 }}>
                {row(py.open)}
              </ul>
            </section>
          ) : null}
          <section className="a2-mt12" data-testid="payout-history">
            <h2 className="a2-h3">{cr('y.history')}</h2>
            {py.rows.filter((r) => r.id !== py.open?.id).length ? (
              <ul className="a2-stack a2-mt6" style={{ listStyle: 'none', padding: 0 }}>
                {py.rows.filter((r) => r.id !== py.open?.id).map(row)}
              </ul>
            ) : (
              <p className="a2-sm a2-mute a2-mt6">{cr('y.noRows')}</p>
            )}
          </section>
        </>
      );
    }
  } else if (section === 'claims') {
    const pd = await paymentsDeps(access.deps);
    const [cl, claimsSwitch, parcels] = await Promise.all([
      pay.listClaims(pd, who, { courierAccountId: id, limit: CLAIM_ROWS }),
      access.deps.resolver.value('delivery.courier.claims', { storeId: MOTHER_STORE_ID }),
      access.deps.db.shipment.findMany({ where: { storeId: MOTHER_STORE_ID, courierAccountId: id }, select: { id: true, consignmentId: true, order: { select: { number: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: CLAIM_ROWS }),
    ]);
    const canClaim = access.guard.permissions?.has('delivery.claims') ?? false;
    const on = claimsSwitch.enabled;
    const API = '/api/admin/delivery/claims';
    const outcomePill = { open: 'warn', sent: 'info', won: 'ok', lost: 'line' } as const;
    body = (
      <>
        {!on ? (
          <div className="a2-note a2-mt12" data-testid="claims-off">
            {cr('k.off')} <Link href="/admin/delivery/settings">{cr('s.settingsOpen')}</Link>
          </div>
        ) : null}
        <section className="a2-card a2-mt12" data-testid="claims-totals">
          <h2 className="a2-h3">{cr('k.totals')}</h2>
          <div className="a2-gap8 a2-mt6" style={{ flexWrap: 'wrap' }}>
            <span className="a2-pill warn">{cr('k.open', { n: n(cl.open.count), amount: m(cl.open.claimedMinor) })}</span>
            {cl.late.count ? <span className="a2-pill bad" data-testid="claims-late">{cr('k.lateN', { n: n(cl.late.count), amount: m(cl.late.claimedMinor) })}</span> : null}
            <span className="a2-pill line">{cr('k.won', { n: n(cl.settled.count), paid: m(cl.settled.settledMinor), asked: m(cl.settled.claimedMinor) })}</span>
          </div>
          {on && canClaim ? <RaiseClaim dict={{ cr: d.cr as Dict, courierReport: d.courierReport as Dict }} parcels={parcels.map((p) => ({ id: p.id, label: `${p.order.number} · ${p.consignmentId ?? '—'}` }))} /> : null}
        </section>
        {cl.claimable.length ? (
          <section className="a2-card a2-mt12" data-testid="claims-claimable">
            <h2 className="a2-h3">{cr('k.claimable')}</h2>
            <ul className="a2-stack a2-mt6" style={{ listStyle: 'none', padding: 0 }}>
              {cl.claimable.map((p) => (
                <li key={`${p.shipmentId}:${p.kind}`} className="a2-between" style={{ flexWrap: 'wrap', gap: 8 }} data-testid="claimable-row">
                  <span>
                    <b>{p.orderNumber}</b> <span className="a2-pill bad">{t(d, `courierReport.claims.kind.${p.kind}`)}</span>
                    <span className="a2-xs a2-mute"> {p.declaredValueMinor !== null ? cr('k.declared', { amount: m(p.declaredValueMinor) }) : ''}</span>
                  </span>
                  {on && canClaim ? <StepButton dict={d} url={API} body={{ shipmentId: p.shipmentId, kind: p.kind }} withKey label={t(d, 'courierReport.claims.claim')} field={{ name: 'note', label: t(d, 'courierReport.claims.claimNote') }} tone="pri" testId="claim-raise" /> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section className="a2-mt12" data-testid="claims-ledger">
          <h2 className="a2-h3">{cr('k.ledger')}</h2>
          {cl.rows.length ? (
            <ul className="a2-stack a2-mt6" style={{ listStyle: 'none', padding: 0 }}>
              {cl.rows.map((r) => {
                const out = pay.claimOutcome(r);
                const dl = pay.deadlineState(r, cl.at, cl.terms.warnDays);
                return (
                  <li key={r.id} className="a2-card tight" data-testid="claim-row" data-status={r.status} data-outcome={out}>
                    <div className="a2-between" style={{ flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <Link href={orderHref(r.orderId)}>{r.orderNumber ?? '—'}</Link> <span className="a2-pill line">{t(d, `courierReport.claims.kind.${r.kind}`)}</span> <span className={`a2-pill ${outcomePill[out]}`}>{cr(`k.out.${out}`)}</span>
                        {dl ? <span className={`a2-pill ${dl === 'late' ? 'bad' : 'warn'}`} data-testid="claim-deadline">{cr(`k.dl.${dl}`)}</span> : null}
                        <span className="a2-xs a2-mute a2-blk">
                          {when.format(r.createdAt)}
                          {r.deadlineAt ? ` · ${cr('k.deadline', { date: day.format(r.deadlineAt) })}` : ''}
                          {r.courierRef ? ` · ${r.courierRef}` : ''}
                        </span>
                        <span className="a2-sm a2-blk">
                          <b>{m(r.claimedMinor)}</b>
                          {r.settledMinor !== null ? <span className="a2-mute"> · {cr('k.paidLine', { amount: m(r.settledMinor) })}</span> : null}
                        </span>
                      </div>
                      {on && canClaim && (r.status === 'OPEN' || r.status === 'SENT') ? (
                        <div className="a2-gap8" style={{ flexWrap: 'wrap' }}>
                          {r.status === 'OPEN' ? <StepButton dict={d} url={`${API}/${r.id}/move`} body={{ to: 'SENT' }} label={t(d, 'courierReport.claims.send')} field={{ name: 'courierRef', label: t(d, 'courierReport.claims.ref'), optional: true }} testId="claim-sent" /> : null}
                          <StepButton dict={d} url={`${API}/${r.id}/move`} body={{ to: 'SETTLED' }} label={t(d, 'courierReport.claims.settle')} field={{ name: 'settledMinor', label: t(d, 'courierReport.claims.paid'), money: true }} tone="pri" testId="claim-settled" />
                          <StepButton dict={d} url={`${API}/${r.id}/move`} body={{ to: 'REJECTED' }} label={t(d, 'courierReport.claims.reject')} field={{ name: 'note', label: t(d, 'courierReport.claims.why') }} testId="claim-rejected" />
                        </div>
                      ) : null}
                    </div>
                    {r.note ? <p className="a2-xs a2-mute a2-mt6" style={{ whiteSpace: 'pre-line' }}>{r.note}</p> : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="a2-sm a2-mute a2-mt6">{cr('k.none')}</p>
          )}
        </section>
      </>
    );
  } else if (section === 'performance') {
    const to = new Date();
    const perf = await sh.courierPerformance(
      sd,
      who,
      { from: new Date(to.getTime() - sh.COURIER_WINDOW_DAYS * 86_400_000), to, courierAccountId: id, lang: view.lang === 'bn' ? 'bn' : 'en', lateRows: 0 },
      'delivery.read',
    );
    const f = c.last30;
    body = (
      <>
        <section className="a2-card a2-mt12" data-testid="c360-perf">
          <h2 className="a2-h3">{cr('f.zone')}</h2>
          <p className="a2-xs a2-mute">{cr('f.sub')}</p>
          {perf.total.parcels ? (
            <PerfTable dict={d} rows={perf.byZone} first="zone" locale={view.locale} testId="c360-perf-zone" />
          ) : (
            <p className="a2-sm a2-mute a2-mt6">{t(d, 'courierReport.none')}</p>
          )}
        </section>
        {perf.total.parcels ? (
          <section className="a2-card a2-mt12">
            <h2 className="a2-h3">{cr('f.district')}</h2>
            <PerfTable dict={d} rows={perf.byDistrict} first="district" locale={view.locale} testId="c360-perf-district" />
          </section>
        ) : null}
        <section className="a2-card a2-mt12">
          <h2 className="a2-h3">{cr('f.late')}</h2>
          <p className="a2-sm a2-mt6">{perf.lateNow.count ? cr('c.exceptions', { n: n(perf.lateNow.count) }) : cr('f.lateNone')}</p>
        </section>
        <section className="a2-card a2-mt12">
          <h2 className="a2-h3">{cr('f.charges')}</h2>
          <p className="a2-sm a2-mt6">{f.perParcelMinor === null ? cr('f.chargesNone') : cr('f.chargesBody', { amount: m(f.costMinor), n: n(f.costParcels), per: m(f.perParcelMinor) })}</p>
        </section>
      </>
    );
  } else if (section === 'messages') {
    const [mc, bookingCfg] = await Promise.all([access.deps.resolver.value('delivery.courier.messages', { storeId: MOTHER_STORE_ID }), access.deps.resolver.value('delivery.courier.booking', { storeId: MOTHER_STORE_ID })]);
    const canEdit = access.guard.permissions?.has('settings.write') ?? false;
    const where = (e: (typeof COURIER_MESSAGE_EVENTS)[number]) => (e === 'booking' || e === 'delivery' || e === 'cod' ? 'note' : e === 'payout' ? 'payout' : 'copy');
    body = (
      <section className="a2-card a2-mt12" data-testid="c360-messages">
        <h2 className="a2-h3">{cr('q.title')}</h2>
        <p className="a2-xs a2-mute">{cr('q.sub')}</p>
        <p className="a2-xs a2-mute a2-mt6">{cr('s.msg.tokens', { tokens: COURIER_MESSAGE_TOKENS.join(', ') })}</p>
        {!mc.enabled ? (
          <div className="a2-note a2-mt6" data-testid="messages-off">
            {cr('q.off')}
          </div>
        ) : null}
        <ul className="a2-stack a2-mt12" style={{ listStyle: 'none', padding: 0 }}>
          {COURIER_MESSAGE_EVENTS.map((e) => (
            <li key={e} className="a2-card tight" data-testid="message-row" data-event={e}>
              <div className="a2-between" style={{ flexWrap: 'wrap', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <b>{cr(`s.msg.ev.${e}`)}</b> <span className="a2-pill line">{cr(`q.where.${where(e)}`)}</span>
                  <p className="a2-sm a2-mt6" style={{ whiteSpace: 'pre-line' }}>
                    {mc[e][view.lang]}
                  </p>
                  <p className="a2-xs a2-mute">{mc[e][view.lang === 'bn' ? 'en' : 'bn']}</p>
                </div>
                <CopyText text={mc[e][view.lang]} label={cr('q.copy')} done={cr('q.copied')} testId="message-copy" />
              </div>
            </li>
          ))}
        </ul>
        <p className="a2-xs a2-mute a2-mt6">
          {cr('q.langs')}: {cr(`q.lang.${bookingCfg.noteLang}`)}
        </p>
        {canEdit ? (
          <Link className="a2-btn sm a2-mt6" href="/admin/delivery/settings" data-testid="messages-edit">
            {cr('q.edit')}
          </Link>
        ) : null}
      </section>
    );
  } else {
    const keys = `/admin/integrations`;
    body = (
      <section className="a2-card a2-mt12" data-testid="c360-setup">
        <dl className="a2-stack">
          <div>
            <dt className="a2-xs a2-mute">{cr('s.connection')}</dt>
            <dd>
              <span className="a2-pill line">{t(d, `courier.providers.${c.providerKey}`)}</span>{' '}
              <span className={`a2-pill ${c.mode === 'LIVE' ? 'ok' : 'info'}`}>{t(d, `ful.couriers.mode.${c.mode}`)}</span>{' '}
              <span className={`a2-pill ${c.enabled ? 'ok' : 'line'}`}>{c.enabled ? cr('s.on') : cr('s.off')}</span>
              <span className="a2-xs a2-mute a2-blk">{cr('s.keysHelp')}</span>
              <Link className="a2-btn sm a2-mt6" href={keys}>
                {cr('s.keys')}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="a2-xs a2-mute">{cr('s.areas')}</dt>
            <dd>
              <span className="a2-xs a2-mute a2-blk">{cr('s.areasHelp')}</span>
              <Link className="a2-btn sm a2-mt6" href={`/admin/delivery/couriers/${id}/areas`}>
                {cr('s.areasOpen')}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="a2-xs a2-mute">{cr('s.rates')}</dt>
            <dd>
              <span className="a2-xs a2-mute a2-blk">{cr('s.ratesHelp')}</span>
              <Link className="a2-btn sm a2-mt6" href="/admin/delivery/zones">
                {cr('s.ratesOpen')}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="a2-xs a2-mute">{cr('s.default')}</dt>
            <dd>
              {c.isDefault ? cr('s.defaultIs') : null}
              {c.isBackup ? cr('s.backupIs') : null}
              {!c.isDefault && !c.isBackup ? cr('s.defaultNot', { name: (await sh.listCouriers(sd, who)).couriers[0]?.name ?? '—' }) : null}
              <span className="a2-xs a2-mute a2-blk">{cr('s.backupHelp')}</span>
              <Link className="a2-btn sm a2-mt6" href="/admin/delivery/settings">
                {cr('s.settingsOpen')}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="a2-xs a2-mute">{cr('s.routing')}</dt>
            <dd>
              <span className="a2-xs a2-mute a2-blk">{cr('s.routingHelp')}</span>
            </dd>
          </div>
        </dl>
      </section>
    );
  }

  return (
    <div className="a2-z" data-testid="courier-360" data-lm-ready="" data-section={section}>
      <PageHead
        view={view}
        place={locateKey('courier')}
        crumb={
          <Link href="/admin/delivery">
            <ShellIcon name="cl" size={12} />
            {cr('c.back')}
          </Link>
        }
        title={c.name}
        sub={
          <>
            {t(d, `courier.providers.${c.providerKey}`)} · {t(d, `ful.couriers.mode.${c.mode}`)}
            {c.isDefault ? ` · ${cr('ov.default')}` : ''}
            {c.isBackup ? ` · ${cr('ov.backup')}` : ''}
          </>
        }
      />
      <SectionTabs view={view} current="courier" />
      <nav className="a2-views a2-mt12" aria-label={cr('c.sections')} data-testid="c360-sections">
        {COURIER_SECTIONS.map((x) => (
          <Link key={x} className={`a2-view${x === section ? ' on' : ''}`} href={href(x)} aria-current={x === section ? 'page' : undefined}>
            {cr(`c.sec.${x}`)}
          </Link>
        ))}
      </nav>
      {body}
    </div>
  );
}

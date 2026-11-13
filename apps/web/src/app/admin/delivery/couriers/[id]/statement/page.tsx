// S28 · PR 675 (CN-048, admin prototype v5, GAP-MAP C-05/C-06) — one courier's monthly statement at
// /admin/delivery/couriers/[id]/statement?month=YYYY-MM: the statements it paid us that month with their totals, the lines that
// still do not match (with "Accept the courier figure" where the only difference is a charge higher than ours), the figures
// accepted that month, and the claims still to receive from it. Seeing needs `delivery.read` and `payments.view`; accepting a
// figure needs `payments.settle` (the API checks again). Practice parcels are never counted. Guide: docs/admin-guide/pages/delivery/courier-statement.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as pay from '@extas/payments';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { OpenLines } from '@/components/admin/couriers/OpenLines';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { withCouriers } from '@/lib/admin-couriers';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import { paymentsDeps } from '@/lib/payments-api';
import '@/app/admin/reports/delivery/report.css';

export const dynamic = 'force-dynamic';

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  const view = withCouriers(await adminView());
  return { title: `${t(view.dict, 'cr.z.title')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function CourierStatementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Search }) {
  const deps = adminDeps();
  const [{ id }, sp, plain, access] = await Promise.all([params, searchParams, adminView(deps), pageAccess('delivery.read', deps, MOTHER_STORE_ID)]);
  const view = withCouriers(plain);
  const d = view.dict;
  const month = one(sp.month);
  const here = `/admin/delivery/couriers/${id}/statement${month ? `?month=${encodeURIComponent(month)}` : ''}`;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(here)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="courierStatement" text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="delivery.read" />
      </div>
    );
  if (!UUID.test(id)) notFound();
  const cr = (k: string, v?: Record<string, string | number>) => t(d, `cr.${k}`, v);
  const head = (
    <PageHead
      view={view}
      place={locateKey('courierStatement')}
      crumb={
        <Link href={`/admin/delivery/couriers/${id}?s=money`}>
          <ShellIcon name="cl" size={12} />
          {cr('z.back')}
        </Link>
      }
      title={cr('z.title')}
      sub={cr('z.sub')}
    />
  );
  if (!(access.guard.permissions?.has('payments.view') ?? false))
    return (
      <div className="a2-z" data-testid="courier-statement">
        {head}
        <SectionTabs view={view} current="courierStatement" />
        <section className="a2-card a2-mt12">
          <p className="a2-sm a2-mute">{cr('m.noPerm')}</p>
        </section>
      </div>
    );
  const who: pay.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  let st: pay.MonthStatement;
  try {
    st = await pay.courierMonthStatement(await paymentsDeps(access.deps), who, id, { month });
  } catch (e) {
    if (pay.isPaymentsError(e) && e.code === 'NOT_FOUND') notFound();
    throw e;
  }
  const currency = await access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID });
  const money = moneyOf(currency, view.locale);
  const m = (x: number) => formatMoney(x, money);
  const n = (x: number) => formatNumber(x, view.locale);
  const day = new Intl.DateTimeFormat(view.locale, { timeZone: view.timeZone, dateStyle: 'medium', numberingSystem: 'latn' });
  const moreLines = Math.max(0, st.openCount - st.open.length);
  const href = (ym: string) => `/admin/delivery/couriers/${id}/statement?month=${ym}`;

  return (
    <div className="a2-z" data-testid="courier-statement" data-lm-ready="" data-month={st.ym}>
      {head}
      <SectionTabs view={view} current="courierStatement" />
      <div className="a2-between a2-mt12" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h2 className="a2-h3" data-testid="statement-month">
          {st.courier.name} · {st.ym}
        </h2>
        <nav className="a2-gap8" aria-label={cr('z.months')}>
          <Link className="a2-btn sm" href={href(st.prevYm)} data-testid="statement-prev">
            {cr('z.prev')}
          </Link>
          {st.nextYm ? (
            <Link className="a2-btn sm" href={href(st.nextYm)} data-testid="statement-next">
              {cr('z.next')}
            </Link>
          ) : null}
        </nav>
      </div>

      <dl className="a2-card a2-mt12" data-testid="statement-totals" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <div>
          <dt className="a2-xs a2-mute">{cr('z.statements')}</dt>
          <dd>
            <b>{n(st.totals.statements)}</b>
          </dd>
        </div>
        <div>
          <dt className="a2-xs a2-mute">{cr('z.cod')}</dt>
          <dd>
            <b>{m(st.totals.totalCodMinor)}</b>
          </dd>
        </div>
        <div>
          <dt className="a2-xs a2-mute">{cr('z.charges')}</dt>
          <dd>
            <b>{m(st.totals.chargesMinor)}</b>
          </dd>
        </div>
        <div>
          <dt className="a2-xs a2-mute">{cr('z.net')}</dt>
          <dd>
            <b>{m(st.totals.netMinor)}</b>
          </dd>
        </div>
      </dl>

      <section className="a2-card a2-mt12" data-testid="statement-list">
        <h2 className="a2-h3">{cr('z.list')}</h2>
        {st.statements.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="a2-table a2-mt6">
              <thead>
                <tr>
                  <th>{cr('m.reference')}</th>
                  <th>{cr('m.received')}</th>
                  <th>{cr('m.paidCod')}</th>
                  <th>{cr('m.deducted')}</th>
                  <th>{cr('m.net')}</th>
                  <th>{cr('m.lines')}</th>
                  <th>{cr('m.mismatched')}</th>
                </tr>
              </thead>
              <tbody>
                {st.statements.map((s) => (
                  <tr key={s.id} data-testid="statement-row">
                    <td>{s.reference}</td>
                    <td>{s.receivedAt ? day.format(s.receivedAt) : '—'}</td>
                    <td>{m(s.totalCodMinor)}</td>
                    <td>{m(s.chargesMinor)}</td>
                    <td>{m(s.netMinor)}</td>
                    <td>{n(s.lines)}</td>
                    <td>{n(s.mismatched)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="a2-sm a2-mute a2-mt6">{cr('z.noStatements')}</p>
        )}
      </section>

      <section className="a2-card a2-mt12" data-testid="statement-open">
        <h2 className="a2-h3">{cr('m.open')}</h2>
        <p className="a2-xs a2-mute">{cr('z.openSub')}</p>
        {st.open.length ? (
          <>
            <OpenLines dict={d} money={m} canAccept={access.guard.permissions?.has('payments.settle') ?? false} lines={st.open} />
            {moreLines ? <p className="a2-xs a2-mute">{cr('m.openMore', { n: n(moreLines) })}</p> : null}
          </>
        ) : (
          <p className="a2-sm a2-mute a2-mt6">{cr('m.openNone')}</p>
        )}
      </section>

      <section className="a2-card a2-mt12" data-testid="statement-accepted">
        <h2 className="a2-h3">{cr('z.accepted')}</h2>
        <p className="a2-xs a2-mute">{cr('z.acceptedSub')}</p>
        {st.accepted.length ? (
          <>
            <ul className="a2-stack a2-mt6" style={{ listStyle: 'none', padding: 0 }}>
              {st.accepted.map((a) => (
                <li key={a.lineId} className="a2-between a2-sm" data-testid="accepted-row">
                  <span>
                    {a.consignmentId ?? '—'} · {a.reference ?? '—'} · {day.format(a.at)}
                  </span>
                  <b>{m(a.extraMinor)}</b>
                </li>
              ))}
            </ul>
            <p className="a2-sm a2-mt6">{cr('z.acceptedTotal', { amount: m(st.acceptedMinor) })}</p>
          </>
        ) : (
          <p className="a2-sm a2-mute a2-mt6">{cr('z.acceptedNone')}</p>
        )}
      </section>

      <section className="a2-card a2-mt12" data-testid="statement-claims">
        <h2 className="a2-h3">{cr('z.claims')}</h2>
        <p className="a2-xs a2-mute">{cr('z.claimsSub')}</p>
        {st.claims.count ? (
          <p className="a2-sm a2-mt6">
            {cr('z.claimsBody', { n: n(st.claims.count), amount: m(st.claims.minor) })}
            {st.claims.late ? ` · ${cr('z.claimsLate', { n: n(st.claims.late) })}` : ''}
          </p>
        ) : (
          <p className="a2-sm a2-mute a2-mt6">{cr('z.claimsNone')}</p>
        )}
        <Link className="a2-btn sm a2-mt6" href={`/admin/delivery/couriers/${id}?s=claims`} data-testid="statement-claims-open">
          {cr('z.claimsOpen')}
        </Link>
      </section>
    </div>
  );
}

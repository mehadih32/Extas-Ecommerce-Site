// S08 · PR 192 — the two cards at the foot of one courier's page (Delivery → Couriers → a courier): its performance by
// zone over the last 30 days (delivered, on time against the band's promise, refused, exceptions), and its claims —
// lost or damaged parcels still to claim (one press raises the claim for the declared value, while the owner's
// switch is on), and the claims with their steps (sent, settled with what the courier paid, rejected with why). A claim
// is a record only: the courier pays on its own statement, nothing moves here. Seeing needs `delivery.read`; raising
// and moving need `delivery.claims`, the switch `settings.write` (the API checks again).
import Link from 'next/link';
import type * as pay from '@extas/payments';
import * as sh from '@extas/shipping';
import { StepButton, SwitchButton } from '@/components/admin/courier-report/Parts';
import { PerfTable } from '@/components/admin/courier-report/PerfTable';
import { formatMoney, moneyOf } from '@/components/admin/products/model';
import { orderHref } from '@/lib/admin-orders/model';
import { t, type Dict } from '@/lib/i18n';
import '@/app/admin/reports/delivery/report.css';

const DAYS = 30;
const API = '/api/admin/delivery/claims';

export interface CourierCardsProps {
  dict: Dict;
  locale: string;
  timeZone: string;
  lang: 'en' | 'bn';
  courierId: string;
  perfDeps: sh.ShippingDeps;
  who: sh.Who;
  claims: pay.ClaimList;
  claimsSwitch: { enabled: boolean };
  currency: string;
  can: { claim: boolean; settings: boolean };
}

export async function CourierCards({ dict: d, locale, timeZone, lang, courierId, perfDeps, who, claims, claimsSwitch, currency, can }: CourierCardsProps) {
  const c = (k: string, v?: Record<string, string | number>) => t(d, `courierReport.${k}`, v);
  const to = new Date();
  const perf = await sh.courierPerformance(perfDeps, who, { from: new Date(to.getTime() - DAYS * 86_400_000), to, courierAccountId: courierId, lang, lateRows: 0 }, 'delivery.read');
  const money = moneyOf(currency, locale);
  const m = (minor: number) => formatMoney(minor, money);
  const n = (x: number) => new Intl.NumberFormat(locale, { numberingSystem: 'latn' }).format(x);
  const when = new Intl.DateTimeFormat(locale, { timeZone, dateStyle: 'medium', numberingSystem: 'latn' });
  const on = claimsSwitch.enabled;
  const pill = (s: string) => (s === 'SETTLED' ? 'ok' : s === 'REJECTED' ? 'line' : s === 'SENT' ? 'info' : 'warn');

  return (
    <>
      <section className="a2-card a2-mt12" data-testid="courier-perf">
        <h2 className="a2-h3">{c('byZone')}</h2>
        <p className="a2-xs a2-mute">{c('period.d30')}</p>
        {perf.total.parcels ? <PerfTable dict={d} rows={perf.byZone} first="zone" locale={locale} testId="courier-perf-table" /> : <p className="a2-sm a2-mute a2-mt6">{c('none')}</p>}
      </section>

      <section className="a2-card a2-mt12" data-testid="courier-claims" data-on={on ? 'yes' : 'no'}>
        <div className="a2-between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h2 className="a2-h3">{c('claims.title')}</h2>
            <p className="a2-xs a2-mute">{c('claims.sub')}</p>
          </div>
          {can.settings ? <SwitchButton dict={d} url={`${API}/settings`} settingKey="delivery.courier.claims" before={{ ...claimsSwitch }} label={on ? c('claims.turnOff') : c('claims.turnOn')} tone={on ? '' : 'pri'} testId="claims-switch" /> : null}
        </div>
        {!on ? <div className="a2-note a2-mt6">{c('claims.off')}</div> : null}
        <div className="a2-gap8 a2-mt6" style={{ flexWrap: 'wrap' }}>
          <span className="a2-pill warn">{c('claims.open', { n: n(claims.open.count), amount: m(claims.open.claimedMinor) })}</span>
          <span className="a2-pill line">{c('claims.settled', { n: n(claims.settled.count), paid: m(claims.settled.settledMinor), asked: m(claims.settled.claimedMinor) })}</span>
        </div>

        {claims.claimable.length ? (
          <>
            <h3 className="a2-sm a2-mt12">
              <b>{c('claims.toClaim')}</b>
            </h3>
            <ul className="cr-rows">
              {claims.claimable.map((p) => (
                <li key={`${p.shipmentId}:${p.kind}`} data-testid="claimable-row">
                  <div className="a2-sm">
                    <b>{p.orderNumber}</b> <span className="a2-pill bad">{c(`claims.kind.${p.kind}`)}</span>
                    <span className="a2-xs a2-mute">
                      {p.consignmentId ? ` · ${p.consignmentId}` : ''}
                      {p.declaredValueMinor !== null ? ` · ${c('claims.declared', { amount: m(p.declaredValueMinor) })}` : ''}
                    </span>
                  </div>
                  {on && can.claim ? (
                    <div className="cr-acts">
                      <StepButton dict={d} url={API} body={{ shipmentId: p.shipmentId, kind: p.kind }} withKey label={c('claims.claim')} field={{ name: 'note', label: c('claims.claimNote') }} tone="pri" testId="claim-raise" />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <h3 className="a2-sm a2-mt12">
          <b>{c('claims.list')}</b>
        </h3>
        {claims.rows.length ? (
          <ul className="cr-rows">
            {claims.rows.map((r) => (
              <li key={r.id} data-testid="claim-row" data-status={r.status}>
                <div>
                  <div className="a2-gap8" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                    <Link className="cr-link" href={orderHref(r.orderId)}>
                      {r.orderNumber ?? '—'}
                    </Link>
                    <span className="a2-pill line">{c(`claims.kind.${r.kind}`)}</span>
                    <span className={`a2-pill ${pill(r.status)}`}>{c(`claims.state.${r.status}`)}</span>
                    <span className="a2-xs a2-mute">{when.format(r.createdAt)}</span>
                  </div>
                  <div className="a2-sm a2-mt6">
                    <b>{m(r.claimedMinor)}</b>
                    {r.settledMinor !== null ? <span className="a2-mute"> · {c('claims.paidLine', { amount: m(r.settledMinor) })}</span> : null}
                    {r.courierRef ? <span className="a2-xs a2-mute"> · {r.courierRef}</span> : null}
                  </div>
                  {r.note ? <div className="a2-xs a2-mute a2-mt6" style={{ whiteSpace: 'pre-line' }}>{r.note}</div> : null}
                </div>
                {on && can.claim && (r.status === 'OPEN' || r.status === 'SENT') ? (
                  <div className="cr-acts">
                    {r.status === 'OPEN' ? <StepButton dict={d} url={`${API}/${r.id}/move`} body={{ to: 'SENT' }} label={c('claims.send')} field={{ name: 'courierRef', label: c('claims.ref'), optional: true }} testId="claim-sent" /> : null}
                    <StepButton dict={d} url={`${API}/${r.id}/move`} body={{ to: 'SETTLED' }} label={c('claims.settle')} field={{ name: 'settledMinor', label: c('claims.paid'), money: true }} tone="pri" testId="claim-settled" />
                    <StepButton dict={d} url={`${API}/${r.id}/move`} body={{ to: 'REJECTED' }} label={c('claims.reject')} field={{ name: 'note', label: c('claims.why') }} testId="claim-rejected" />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm a2-mute">{c('claims.empty')}</p>
        )}
      </section>
    </>
  );
}

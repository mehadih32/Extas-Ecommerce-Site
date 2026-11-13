// S28 · PR 670 (CN-048, admin prototype v5, GAP-MAP C-01) — Couriers › Overview: every courier at a glance (parcels on the
// way and the cash on them, cash the courier holds for us, success and days over the last 30 days, the cost per parcel),
// the default and backup courier marked, what needs the owner (stuck parcels, statement lines that do not match), the
// success and cost comparison, and — only while "Choose the courier by cost" is on — the money per-area routing would
// have saved. Each card opens that courier's Courier 360. Practice parcels are never counted. Seeing needs `delivery.read`
// (the money lines need `payments.view` too). The old `/admin/delivery` address used to lead to Zones & charges; that
// page is its own tab now (/admin/delivery/zones). Guide: docs/admin-guide/pages/delivery/overview.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as pay from '@extas/payments';
import * as sh from '@extas/shipping';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { withCouriers } from '@/lib/admin-couriers';
import { withFulfil } from '@/lib/admin-fulfil/i18n';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import { paymentsDeps } from '@/lib/payments-api';
import { shippingDeps } from '@/lib/shipping-api';

export const dynamic = 'force-dynamic';

const HERE = '/admin/delivery';
const KEY = 'couriersOverview';

export async function generateMetadata(): Promise<Metadata> {
  const view = withCouriers(await adminView());
  return { title: `${t(view.dict, 'cr.ov.title')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function CouriersOverviewPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('delivery.read', deps, MOTHER_STORE_ID)]);
  const view = withCouriers(withFulfil(plain));
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="delivery.read" />
      </div>
    );
  const who: sh.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const sd = await shippingDeps(access.deps);
  const ov = await sh.couriersOverview(sd, who);
  const canMoney = access.guard.permissions?.has('payments.view') ?? false;
  const pd = canMoney ? await paymentsDeps(access.deps) : null;
  const [currency, moneys] = await Promise.all([
    access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID }),
    pd ? Promise.all(ov.cards.map((c) => pay.courierMoney(pd, who, c.id).catch(() => null))) : Promise.resolve(ov.cards.map(() => null)),
  ]);
  const money = moneyOf(currency, view.locale);
  const m = (x: number) => formatMoney(x, money);
  const n = (x: number) => formatNumber(x, view.locale);
  const cr = (k: string, v?: Record<string, string | number>) => t(d, `cr.${k}`, v);
  const byId = new Map(ov.cards.map((c, i) => [c.id, moneys[i]]));
  const stuckTotal = ov.cards.reduce((s, c) => s + c.stuck, 0);
  const lineTotal = moneys.reduce((s, x) => s + (x?.openCount ?? 0), 0);
  const sorted = [...ov.cards].filter((c) => !c.archived);
  const pct = (x: number | null) => (x === null ? '—' : `${n(x)}%`);

  return (
    <div className="a2-z" data-testid="couriers-overview" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={cr('ov.title')} sub={cr('ov.sub')} />
      <SectionTabs view={view} current={KEY} />
      {sorted.length === 0 ? (
        <section className="a2-card a2-mt12" data-testid="couriers-overview-empty">
          <p className="a2-sm a2-mute">{cr('ov.empty')}</p>
          <Link className="a2-btn sm a2-mt6" href="/admin/delivery/couriers">
            {t(d, 'shell.tab.delivery.couriers')}
          </Link>
        </section>
      ) : (
        <>
          <section className="a2-card a2-mt12" data-testid="couriers-needs">
            <h2 className="a2-h3">{cr('ov.needs')}</h2>
            <ul className="a2-sm a2-mt6" style={{ paddingLeft: 18 }}>
              {stuckTotal ? <li>{cr('ov.needsStuck', { n: n(stuckTotal) })}</li> : null}
              {lineTotal ? <li>{cr('ov.needsLines', { n: n(lineTotal) })}</li> : null}
              {!stuckTotal && !lineTotal ? <li className="a2-mute">{cr('ov.needsNone')}</li> : null}
            </ul>
          </section>

          <div className="a2-stack a2-mt12" data-testid="couriers-cards">
            {sorted.map((c) => {
              const mo = byId.get(c.id) ?? null;
              const f = c.last30;
              return (
                <section key={c.id} className="a2-card" data-testid="courier-card" data-default={c.isDefault ? 'yes' : 'no'}>
                  <div className="a2-between" style={{ flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <h2 className="a2-h3" style={{ overflowWrap: 'anywhere' }}>
                        {c.name}
                      </h2>
                      <div className="a2-gap8 a2-mt6" style={{ flexWrap: 'wrap' }}>
                        <span className="a2-pill line">{t(d, `courier.providers.${c.providerKey}`)}</span>
                        <span className={`a2-pill ${c.mode === 'LIVE' ? 'ok' : 'info'}`}>{t(d, `ful.couriers.mode.${c.mode}`)}</span>
                        {c.isDefault ? <span className="a2-pill ok">{cr('ov.default')}</span> : null}
                        {c.isBackup ? <span className="a2-pill warn">{cr('ov.backup')}</span> : null}
                        {!c.enabled ? <span className="a2-pill line">{t(d, 'ful.couriers.off')}</span> : null}
                        {c.stuck ? <span className="a2-pill bad">{cr('ov.stuck', { n: n(c.stuck) })}</span> : null}
                      </div>
                    </div>
                    <Link className="a2-btn sm" href={`/admin/delivery/couriers/${c.id}`} data-testid="courier-open">
                      {cr('ov.open360')}
                      <ShellIcon name="cr" size={14} />
                    </Link>
                  </div>
                  <dl className="a2-kv2 a2-mt12" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                    <div>
                      <dt className="a2-xs a2-mute">{cr('ov.onWay')}</dt>
                      <dd>
                        <b>{cr('ov.parcelsN', { n: n(c.onTheWay.parcels) })}</b>
                        <span className="a2-xs a2-mute a2-blk">{m(c.onTheWay.codMinor)}</span>
                      </dd>
                    </div>
                    {mo?.position ? (
                      <div>
                        <dt className="a2-xs a2-mute">{cr('ov.held')}</dt>
                        <dd>
                          <b>{m(mo.position.withCourierMinor)}</b>
                          <span className="a2-xs a2-mute a2-blk">{cr('ov.parcelsN', { n: n(mo.position.withCourierParcels) })}</span>
                        </dd>
                      </div>
                    ) : null}
                    <div>
                      <dt className="a2-xs a2-mute">{cr('ov.success')}</dt>
                      <dd>
                        <b>{pct(f.successPct)}</b>
                        <span className="a2-xs a2-mute a2-blk">{cr('ov.parcelsN', { n: n(f.finished) })}</span>
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
                  {c.practiceParcels ? <p className="a2-xs a2-mute a2-mt6">{cr('ov.practice', { n: n(c.practiceParcels) })}</p> : null}
                </section>
              );
            })}
          </div>

          {sorted.length > 1 ? (
            <section className="a2-card a2-mt12" data-testid="couriers-compare">
              <h2 className="a2-h3">{cr('ov.compare')}</h2>
              <p className="a2-xs a2-mute">{cr('ov.compareSub')}</p>
              <div className="a2-tblw a2-mt12">
                <table className="a2-tbl">
                  <thead>
                    <tr>
                      <th>{cr('c.pick')}</th>
                      <th className="r">{cr('ov.success')}</th>
                      <th className="r">{cr('ov.days')}</th>
                      <th className="r">{cr('ov.cost')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((c) => (
                      <tr key={c.id}>
                        <td className="a2-tdh">
                          <b>{c.name}</b>
                        </td>
                        <td className="r" data-l={cr('ov.success')}>
                          {pct(c.last30.successPct)}
                        </td>
                        <td className="r" data-l={cr('ov.days')}>
                          {c.last30.avgDays === null ? '—' : n(c.last30.avgDays)}
                        </td>
                        <td className="r" data-l={cr('ov.cost')}>
                          {c.last30.perParcelMinor === null ? '—' : m(c.last30.perParcelMinor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section className="a2-card a2-mt12" data-testid="couriers-savings">
            <h2 className="a2-h3">{cr('ov.savings')}</h2>
            {!ov.savings.enabled ? (
              <p className="a2-sm a2-mute a2-mt6">{cr('ov.savingsOff')}</p>
            ) : ov.savings.savedMinor === null ? (
              <p className="a2-sm a2-mute a2-mt6">{cr('ov.savingsNone')}</p>
            ) : (
              <p className="a2-sm a2-mt6">{cr('ov.savingsBody', { amount: m(ov.savings.savedMinor), n: n(ov.savings.compared) })}</p>
            )}
            {ov.savings.enabled && ov.savings.leftOut ? <p className="a2-xs a2-mute">{cr('ov.savingsLeft', { n: n(ov.savings.leftOut) })}</p> : null}
          </section>
        </>
      )}
    </div>
  );
}

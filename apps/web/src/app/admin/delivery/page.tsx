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
import './delivery.css';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { MakeDefaultButton } from '@/components/admin/delivery/MakeDefaultButton';
import { deliverySettingCards } from '@/lib/delivery-settings-api';
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
  const canSetDefault = access.guard.permissions?.has('delivery.charges') ?? false;
  const defCard0 = await deliverySettingCards({ db: access.deps.db, resolver: access.deps.resolver }, { actor: access.guard.actor, ctx: access.guard.ctx })
    .then((c) => c['delivery.couriers'])
    .catch(() => null);
  const claimsOf = async (courierId?: string) => {
    if (!pd) return null;
    try {
      const o = await pay.claimsOverview(pd, who, { ...(courierId ? { courierAccountId: courierId } : {}), status: 'all', page: 1 });
      return { count: o.figures.open.count + o.figures.sent.count, minor: o.figures.open.claimedMinor + o.figures.sent.claimedMinor };
    } catch {
      return null;
    }
  };
  const [currency, moneys, claimsAll, claimsBy] = await Promise.all([
    access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID }),
    pd ? Promise.all(ov.cards.map((c) => pay.courierMoney(pd, who, c.id).catch(() => null))) : Promise.resolve(ov.cards.map(() => null)),
    claimsOf(),
    Promise.all(ov.cards.map((c) => claimsOf(c.id))),
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
  const claimsOn = new Map(ov.cards.map((c, i) => [c.id, claimsBy[i] ?? null]));
  const heldAll = pd ? moneys.reduce((s, x) => s + (x?.position?.withCourierMinor ?? 0), 0) : null;
  const wayAll = sorted.reduce((s, c) => s + c.onTheWay.parcels, 0);
  const withRate = sorted.filter((c) => c.last30.successPct !== null);
  const best = [...withRate].sort((a, b) => (b.last30.successPct ?? 0) - (a.last30.successPct ?? 0))[0];
  const withDays = sorted.filter((c) => c.last30.avgDays !== null);
  const slow = [...withDays].sort((a, b) => (b.last30.avgDays ?? 0) - (a.last30.avgDays ?? 0))[0];
  const openClaimsAll = claimsAll;
  const connected = (c: (typeof sorted)[number]) => c.enabled && c.mode === 'LIVE';
  const defCard = sorted.find((c) => c.isDefault) ?? sorted[0];
  const retPct = (c: (typeof sorted)[number]) => (c.last30.finished ? Math.round((c.last30.returned / c.last30.finished) * 1000) / 10 : null);
  const hl = (v: number | null, best: number | null) => (v !== null && best !== null && v === best && sorted.length > 1 ? 'cr-hl' : '');
  const minOf = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length ? Math.min(...v) : null;
  };
  const maxOf = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length ? Math.max(...v) : null;
  };
  const bestSuccess = maxOf(sorted.map((c) => c.last30.successPct));
  const bestRet = minOf(sorted.map(retPct));
  const bestDays = minOf(sorted.map((c) => c.last30.avgDays));
  const bestCost = minOf(sorted.map((c) => c.last30.perParcelMinor));
  const kpi = (label: string, value: string, sub: string, id: string) => (
    <div className="a2-card a2-kpi" data-testid={id}>
      <div className="a2-kl">{label}</div>
      <div className="a2-kv">{value}</div>
      <div className="a2-kf">
        <span className="a2-kn">{sub}</span>
      </div>
    </div>
  );

  return (
    <div className="a2-z" data-testid="couriers-overview" data-lm-ready="">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        title={cr('ov.title')}
        sub={cr('ov.sub')}
        right={
          defCard ? (
            <Link className="a2-btn" href={`/admin/delivery/couriers/${defCard.id}`} data-testid="courier-open-default">
              {cr('ov.open360')}
            </Link>
          ) : null
        }
      />
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
          <div className="a2-kpis a2-mt12" data-testid="couriers-kpis">
            {kpi(cr('ov.k.parcels'), n(wayAll), cr('ov.k.parcelsSub'), 'couriers-kpi-parcels')}
            {kpi(cr('ov.k.cash'), heldAll === null ? '—' : m(heldAll), cr('ov.k.cashSub'), 'couriers-kpi-cash')}
            {kpi(cr('ov.k.claims'), openClaimsAll ? n(openClaimsAll.count) : '—', openClaimsAll ? cr('ov.k.claimsSub', { amount: m(openClaimsAll.minor) }) : '', 'couriers-kpi-claims')}
            {kpi(cr('ov.k.best'), best ? pct(best.last30.successPct) : '—', best ? cr('ov.k.bestSub', { name: best.name }) : '', 'couriers-kpi-best')}
          </div>

          <section className="a2-card a2-mt12" data-testid="couriers-needs">
            <h2 className="a2-h3">{cr('ov.needs')}</h2>
            <ul className="cr-list a2-mt6">
              {stuckTotal ? (
                <li>
                  <span>{cr('ov.needsStuckHours', { n: n(stuckTotal), h: n(ov.watch.stuckHours) })}</span>
                  <span className="a2-pill bad">{cr('ov.view')}</span>
                </li>
              ) : null}
              {openClaimsAll && openClaimsAll.count ? (
                <li>
                  <Link href="/admin/delivery/claims">{cr('ov.needsClaims', { n: n(openClaimsAll.count) })}</Link>
                  <span className="a2-pill warn">{cr('ov.view')}</span>
                </li>
              ) : null}
              {lineTotal ? (
                <li>
                  <Link href="/admin/money/couriers">{cr('ov.needsLines', { n: n(lineTotal) })}</Link>
                  <span className="a2-pill warn">{cr('ov.view')}</span>
                </li>
              ) : null}
              {!stuckTotal && !lineTotal && !(openClaimsAll && openClaimsAll.count) ? <li className="a2-mute">{cr('ov.needsNone')}</li> : null}
            </ul>
          </section>

          <div className="cr-cards a2-mt12" data-testid="couriers-cards">
            {sorted.map((c) => {
              const mo = byId.get(c.id) ?? null;
              const f = c.last30;
              const cl = claimsOn.get(c.id) ?? null;
              const stat = (v: string, l: string) => (
                <div>
                  <b>{v}</b>
                  <span>{l}</span>
                </div>
              );
              return (
                <section key={c.id} className="a2-card cr-card" data-testid="courier-card" data-default={c.isDefault ? 'yes' : 'no'}>
                  <div className="a2-between" style={{ flexWrap: 'nowrap' }}>
                    <h2 className="a2-h3" style={{ overflowWrap: 'anywhere' }}>
                      {c.name}
                    </h2>
                    <span className="a2-gap8" style={{ flexWrap: 'nowrap' }}>
                      {c.isDefault ? <span className="a2-pill warn">{cr('ov.default')}</span> : null}
                      {c.isBackup ? <span className="a2-pill info">{cr('ov.backup')}</span> : null}
                      <span className={`a2-pill ${connected(c) ? 'ok' : 'bad'}`}>{connected(c) ? cr('ov.connected') : cr('ov.notConnected')}</span>
                    </span>
                  </div>
                  <div className="cr-mini a2-mt12">
                    {stat(n(c.onTheWay.parcels), cr('ov.inTransit'))}
                    {stat(mo?.position ? m(mo.position.withCourierMinor) : '—', cr('ov.held'))}
                    {stat(pct(f.successPct), cr('ov.successRate'))}
                    {stat(f.avgDays === null ? '—' : n(f.avgDays), cr('ov.avgDays'))}
                    {stat(cl ? n(cl.count) : '—', cr('ov.openClaims'))}
                    {stat(n(c.stuck), cr('ov.stuckLbl'))}
                  </div>
                  <p className="a2-sm a2-mt12">
                    <span className="a2-mute">{cr('ov.payoutLbl')}: </span>
                    {mo?.statements[0] ? <b>{m(mo.statements[0].netMinor)}</b> : cr('ov.payoutNone')}
                  </p>
                  <div className="a2-gap8 a2-mt12">
                    <Link className="a2-btn sm pri" href={`/admin/delivery/couriers/${c.id}`} data-testid="courier-open">
                      {cr('ov.open360')}
                    </Link>
                    {/* PR 787 (prototype parity): "Make default" is on every courier that is not the default (the setting itself still checks the choice) */}
                    {!c.isDefault && c.enabled && canSetDefault && defCard0 ? (
                      <MakeDefaultButton courierId={c.id} version={defCard0.version} value={defCard0.value} label={cr('ov.makeDefault')} done={cr('ov.defaultDone')} failed={cr('ov.defaultFailed')} />
                    ) : !c.isDefault && !c.enabled && canSetDefault ? (
                      // PR 1122 (prototype v5): the button is there on every other courier; a switched-off one cannot be the default, so it says why
                      <button type="button" className="a2-btn sm" disabled title={cr('ov.makeDefaultOff')} data-testid="courier-make-default-off">
                        {cr('ov.makeDefault')}
                      </button>
                    ) : null}
                  </div>
                  {c.practiceParcels ? <p className="a2-xs a2-mute a2-mt6">{cr('ov.practice', { n: n(c.practiceParcels) })}</p> : null}
                </section>
              );
            })}
          </div>

          <section className="a2-card a2-mt12" data-testid="couriers-compare">
            <h2 className="a2-h3">{cr('ov.compare')}</h2>
            <p className="a2-xs a2-mute">{cr('ov.compareSub')}</p>
            <div className="a2-tblw a2-mt12">
              <table className="a2-tbl">
                <thead>
                  <tr>
                    <th>{cr('c.pick')}</th>
                    <th className="r">{cr('ov.t.parcels')}</th>
                    <th className="r">{cr('ov.t.success')}</th>
                    <th className="r">{cr('ov.t.returned')}</th>
                    <th className="r">{cr('ov.t.days')}</th>
                    <th className="r">{cr('ov.t.cost')}</th>
                    <th className="r">{cr('ov.t.cash')}</th>
                    <th className="r">{cr('ov.t.claims')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((c) => {
                    const mo = byId.get(c.id) ?? null;
                    const cl = claimsOn.get(c.id) ?? null;
                    return (
                      <tr key={c.id}>
                        <td className="a2-tdh">
                          <Link href={`/admin/delivery/couriers/${c.id}`}>
                            <b>{c.name}</b>
                          </Link>
                        </td>
                        <td className="r" data-l={cr('ov.t.parcels')}>
                          {n(c.last30.finished)}
                        </td>
                        <td className="r" data-l={cr('ov.t.success')}>
                          <span className={hl(c.last30.successPct, bestSuccess)}>{pct(c.last30.successPct)}</span>
                        </td>
                        <td className="r" data-l={cr('ov.t.returned')}>
                          <span className={hl(retPct(c), bestRet)}>{pct(retPct(c))}</span>
                        </td>
                        <td className="r" data-l={cr('ov.t.days')}>
                          <span className={hl(c.last30.avgDays, bestDays)}>{c.last30.avgDays === null ? '—' : n(c.last30.avgDays)}</span>
                        </td>
                        <td className="r" data-l={cr('ov.t.cost')}>
                          <span className={hl(c.last30.perParcelMinor, bestCost)}>{c.last30.perParcelMinor === null ? '—' : m(c.last30.perParcelMinor)}</span>
                        </td>
                        <td className="r" data-l={cr('ov.t.cash')}>
                          {mo?.position ? m(mo.position.withCourierMinor) : '—'}
                        </td>
                        <td className="r" data-l={cr('ov.t.claims')}>
                          {cl ? n(cl.count) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* PR 775 (prototype v5 parity): the guide line under the table is always there; with one courier or no finished parcels it says what is needed */}
          <p className="cr-note a2-mt12" data-testid="couriers-insight">
            {best && slow && best.id !== slow.id
              ? cr('ov.insight', { best: best.name, rate: pct(best.last30.successPct), slow: slow.name, days: n(slow.last30.avgDays ?? 0) })
              : best
                ? cr('ov.insightOne', { best: best.name, rate: pct(best.last30.successPct) })
                : cr('ov.insightNone')}
          </p>

          {ov.savings.enabled ? (
          <section className="a2-card a2-mt12" data-testid="couriers-savings">
            <h2 className="a2-h3">{cr('ov.savings')}</h2>
            {ov.savings.savedMinor === null ? (
              <p className="a2-sm a2-mute a2-mt6">{cr('ov.savingsNone')}</p>
            ) : (
              <p className="a2-sm a2-mt6">{cr('ov.savingsBody', { amount: m(ov.savings.savedMinor), n: n(ov.savings.compared) })}</p>
            )}
            {ov.savings.leftOut ? <p className="a2-xs a2-mute">{cr('ov.savingsLeft', { n: n(ov.savings.leftOut) })}</p> : null}
          </section>
          ) : null}
        </>
      )}
    </div>
  );
}

// S09 · PR 207 — the stock movement report: for a range of days, per SKU and place, what came in, what went out and the
// net, from the stock ledger every ERP change writes (one row per change, never counted twice). A row whose ledger does
// not add up to the stock now is marked. The check against the ERP itself is on the stock page. Needs `inventory.read`.
// The range opens on the last `inventory.report.defaultDays` days.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as inv from '@extas/inventory';
import { AdminFrame, AdminNotice, SystemTabs } from '@/components/admin/AdminFrame';
import { Icon } from '@/components/admin/Icon';
import { formatNumber } from '@/components/admin/products/model';
import { MOVEMENTS_HOME } from '@/components/admin/stock/text';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { one } from '@/lib/admin-products';
import { stockAccess } from '@/lib/admin-stock';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const KEY = 'stockMovements';
const DAY_MS = 86_400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function generateMetadata(): Promise<Metadata> {
  const view = await adminView();
  return { title: t(view.dict, 'stock.moves.metaTitle'), robots: { index: false, follow: false } };
}

/** A calendar day (YYYY-MM-DD) in the store's time zone. */
function dayIn(d: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** Midnight of a calendar day in the time zone, as an instant (the offset is read for that day). */
function startOf(day: string, timeZone: string): Date {
  const utc = new Date(`${day}T00:00:00Z`);
  const local = new Date(utc.toLocaleString('en-US', { timeZone }));
  const asUtc = new Date(utc.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(utc.getTime() - (local.getTime() - asUtc.getTime()));
}

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function StockMovementsPage({ searchParams }: { searchParams: Search }) {
  const deps = adminDeps();
  const [view, sp] = await Promise.all([adminView(deps), searchParams]);
  const access = await pageAccess('inventory.read', deps, MOTHER_STORE_ID);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(MOVEMENTS_HOME)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noAccess')} />;

  const s = await stockAccess(access);
  const d = view.dict;
  const days = await s.deps.settings.value('inventory.report.defaultDays');
  const now = new Date();
  const today = dayIn(now, view.timeZone);
  const rawFrom = one(sp.from);
  const rawTo = one(sp.to);
  const toDay = rawTo && DATE.test(rawTo) ? rawTo : today;
  const fromDay = rawFrom && DATE.test(rawFrom) ? rawFrom : dayIn(new Date(startOf(toDay, view.timeZone).getTime() - (days - 1) * DAY_MS), view.timeZone);
  const sku = one(sp.sku)?.trim().slice(0, 64) || undefined;
  const from = startOf(fromDay, view.timeZone);
  const to = new Date(startOf(toDay, view.timeZone).getTime() + DAY_MS);

  let report: inv.MovementReport | null = null;
  let bad = false;
  try {
    report = await inv.stockMovementReport(s.deps, s.who, { from: from.toISOString(), to: to.toISOString(), sku });
  } catch (e) {
    if (!inv.isInventoryError(e) || e.code !== 'INVALID_INPUT') throw e;
    bad = true;
  }
  const num = (n: number) => formatNumber(n, view.locale);
  const signed = (n: number) => (n > 0 ? t(d, 'stock.count.plus', { n: num(n) }) : num(n));

  return (
    <AdminFrame view={view} current={KEY}>
      <div className="ad-hd pa-hd">
        <div className="pa-hd-text">
          <div className="ad-eyebrow">{t(d, 'stock.eyebrow')}</div>
          <h1 className="ad-h1">{t(d, 'stock.moves.title')}</h1>
          <p className="ad-intro">{t(d, 'stock.moves.intro')}</p>
        </div>
      </div>
      <div className="pa-gtabs">
        <SystemTabs view={view} current={KEY} group="inventory" />
      </div>

      <form className="ad-card st-filter" method="get" action={MOVEMENTS_HOME}>
        <div className="st-fld">
          <label className="ad-label" htmlFor="st-from">
            {t(d, 'stock.moves.from')}
          </label>
          <input id="st-from" className="ad-input" type="date" name="from" defaultValue={fromDay} max={today} />
        </div>
        <div className="st-fld">
          <label className="ad-label" htmlFor="st-to">
            {t(d, 'stock.moves.to')}
          </label>
          <input id="st-to" className="ad-input" type="date" name="to" defaultValue={toDay} max={today} />
        </div>
        <div className="st-fld st-fld-sku">
          <label className="ad-label" htmlFor="st-msku">
            {t(d, 'stock.moves.sku')} <span className="opt">{t(d, 'stock.moves.optional')}</span>
          </label>
          <input id="st-msku" className="ad-input" name="sku" defaultValue={sku ?? ''} maxLength={64} autoComplete="off" spellCheck={false} />
        </div>
        <button type="submit" className="ad-btn ad-btn-primary ad-btn-sm st-fld-btn">
          <Icon name="search" size={16} />
          {t(d, 'stock.moves.show')}
        </button>
      </form>

      {bad || !report ? (
        <div className="ad-note warn">
          <Icon name="info" size={16} />
          <div>{t(d, 'stock.moves.badRange')}</div>
        </div>
      ) : (
        <>
          <div className="pa-kpis st-kpis-moves">
            <div className="pa-kpi">
              <div className="pa-kpi-v ok">{signed(report.totals.in)}</div>
              <div className="pa-kpi-l">{t(d, 'stock.moves.in')}</div>
            </div>
            <div className="pa-kpi">
              <div className="pa-kpi-v">{num(report.totals.out)}</div>
              <div className="pa-kpi-l">{t(d, 'stock.moves.out')}</div>
            </div>
            <div className="pa-kpi">
              <div className="pa-kpi-v">{signed(report.totals.net)}</div>
              <div className="pa-kpi-l">{t(d, 'stock.moves.net')}</div>
            </div>
            <div className="pa-kpi">
              <div className={`pa-kpi-v${report.totals.mismatched ? ' warn' : ' ok'}`}>{num(report.totals.mismatched)}</div>
              <div className="pa-kpi-l">{t(d, 'stock.moves.mismatched')}</div>
            </div>
          </div>
          <section className="ad-card" aria-labelledby="st-mv">
            <h2 id="st-mv">{t(d, 'stock.moves.rowsTitle', { n: num(report.rows.length) })}</h2>
            <p className="ad-sub">{t(d, 'stock.moves.rowsSub')}</p>
            {report.rows.length ? (
              <ul className="st-list">
                {report.rows.map((r) => (
                  <li key={`${r.variantId}:${r.locationId}`} className="st-li st-mrow">
                    <span className="st-li-main">
                      <b className="st-block" translate="no">
                        {r.sku}
                      </b>
                      <span className="ad-mini st-block">
                        {r.warehouseCode}
                        {t(d, 'stock.sep')}
                        {r.locationCode}
                        {t(d, 'stock.sep')}
                        {t(d, 'stock.moves.changes', { n: num(r.movements) })}
                      </span>
                      {!r.ledgerMatches ? <span className="ad-mini bad st-block">{t(d, 'stock.moves.gap', { now: num(r.onHandNow) })}</span> : null}
                    </span>
                    <span className="st-nums">
                      <span className="st-num">
                        <span className="ad-mini">{t(d, 'stock.moves.opening')}</span>
                        <b>{num(r.opening)}</b>
                      </span>
                      <span className={r.in ? 'st-num over' : 'st-num'}>
                        <span className="ad-mini">{t(d, 'stock.moves.in')}</span>
                        <b>{signed(r.in)}</b>
                      </span>
                      <span className={r.out ? 'st-num short' : 'st-num'}>
                        <span className="ad-mini">{t(d, 'stock.moves.out')}</span>
                        <b>{num(r.out)}</b>
                      </span>
                      <span className="st-num">
                        <span className="ad-mini">{t(d, 'stock.moves.closing')}</span>
                        <b>{num(r.closing)}</b>
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pa-empty">{t(d, 'stock.moves.empty')}</p>
            )}
            {report.truncated ? <p className="ad-mini">{t(d, 'stock.moves.truncated')}</p> : null}
          </section>
        </>
      )}
    </AdminFrame>
  );
}

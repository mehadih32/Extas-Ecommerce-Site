// S09 · PR 203 — stock counts by barcode: the latest counts (open ones first) and "start a count" for one location.
// Counting never changes stock — the ERP stays the master; the differences and their reasons are the ERP team's list.
// Reading needs `inventory.read`; starting and counting need `inventory.audit` for every store (the pool is shared).
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as inv from '@extas/inventory';
import { AdminFrame, AdminNotice, SystemTabs } from '@/components/admin/AdminFrame';
import { Icon } from '@/components/admin/Icon';
import { formatNumber } from '@/components/admin/products/model';
import { AuditStart, type LocationChoice } from '@/components/admin/stock/AuditStart';
import { COUNTS_HOME, countHref, dateTime } from '@/components/admin/stock/text';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { stockAccess } from '@/lib/admin-stock';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const KEY = 'stockCounts';

export async function generateMetadata(): Promise<Metadata> {
  const view = await adminView();
  return { title: t(view.dict, 'stock.counts.metaTitle'), robots: { index: false, follow: false } };
}

export default async function StockCountsPage() {
  const deps = adminDeps();
  const view = await adminView(deps);
  const access = await pageAccess('inventory.read', deps, MOTHER_STORE_ID);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(COUNTS_HOME)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noAccess')} />;

  const s = await stockAccess(access);
  const d = view.dict;
  const [audits, warehouses] = await Promise.all([inv.listStockAudits(s.deps, s.who), inv.listWarehouses(s.deps, s.who)]);
  const sep = t(d, 'stock.sep');
  const placeOf = new Map(warehouses.flatMap((w) => w.locations.map((l) => [l.id, `${w.name}${sep}${l.name}`] as const)));
  const choices: LocationChoice[] = warehouses.flatMap((w) => w.locations.filter((l) => !l.archived).map((l) => ({ id: l.id, label: `${w.name}${sep}${l.name}` })));
  const num = (n: number) => formatNumber(n, view.locale);
  const canCount = s.can('inventory.audit');

  return (
    <AdminFrame view={view} current={KEY}>
      <div className="ad-hd pa-hd">
        <div className="pa-hd-text">
          <div className="ad-eyebrow">{t(d, 'stock.eyebrow')}</div>
          <h1 className="ad-h1">{t(d, 'stock.counts.title')}</h1>
          <p className="ad-intro">{t(d, 'stock.counts.intro')}</p>
        </div>
      </div>
      <div className="pa-gtabs">
        <SystemTabs view={view} current={KEY} group="inventory" />
      </div>

      <div className="st-grid">
        <section className="ad-card st-card" aria-labelledby="st-new">
          <h2 id="st-new">{t(d, 'stock.counts.newTitle')}</h2>
          <p className="ad-sub">{t(d, 'stock.counts.newSub')}</p>
          {canCount ? choices.length ? <AuditStart dict={d} locations={choices} /> : <p className="pa-empty">{t(d, 'stock.counts.noLocations')}</p> : <p className="ad-mini">{t(d, 'stock.counts.noPermission')}</p>}
        </section>

        <section className="ad-card st-card" aria-labelledby="st-list">
          <h2 id="st-list">{t(d, 'stock.counts.listTitle')}</h2>
          {audits.length ? (
            <ul className="st-list">
              {audits.map((a) => (
                <li key={a.id} className="st-li">
                  <span className={`st-st s-${a.status}`}>{t(d, `stock.counts.status.${a.status}`)}</span>
                  <span className="st-li-main">
                    <Link className="st-name" href={countHref(a.id)}>
                      {placeOf.get(a.locationId) ?? t(d, 'stock.counts.unknownPlace')}
                    </Link>
                    <span className="ad-mini st-block">
                      {dateTime(a.createdAt, view.locale, view.timeZone)}
                      {sep}
                      {t(d, 'stock.counts.lines', { n: num(a.lines) })}
                    </span>
                  </span>
                  <Link className="ad-iconbtn" href={countHref(a.id)} aria-label={t(d, 'stock.counts.open')}>
                    <Icon name="right" size={18} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pa-empty">{t(d, 'stock.counts.empty')}</p>
          )}
        </section>
      </div>
    </AdminFrame>
  );
}

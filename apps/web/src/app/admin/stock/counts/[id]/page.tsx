// S09 · PR 203 — one stock count (scan, compare with the ERP, a reason for every difference, finish). Reading needs
// `inventory.read`; counting needs `inventory.audit` for every store. The reasons are the setting
// `inventory.audit.reasons`, in the admin's language.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as inv from '@extas/inventory';
import { AdminFrame, AdminNotice } from '@/components/admin/AdminFrame';
import { Icon } from '@/components/admin/Icon';
import { AuditScreen } from '@/components/admin/stock/AuditScreen';
import { COUNTS_HOME, countHref, dateTime } from '@/components/admin/stock/text';
import { adminDeps, isUuid } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { stockAccess } from '@/lib/admin-stock';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const KEY = 'stockCounts';

export async function generateMetadata(): Promise<Metadata> {
  const view = await adminView();
  return { title: t(view.dict, 'stock.count.metaTitle'), robots: { index: false, follow: false } };
}

export default async function StockCountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const deps = adminDeps();
  const view = await adminView(deps);
  const access = await pageAccess('inventory.read', deps, MOTHER_STORE_ID);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(countHref(id))}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noAccess')} />;

  const s = await stockAccess(access);
  const d = view.dict;
  let audit: inv.AuditView;
  try {
    audit = await inv.getStockAudit(s.deps, s.who, id);
  } catch (e) {
    if (inv.isInventoryError(e) && e.code === 'NOT_FOUND') notFound();
    throw e;
  }
  const [reasons, maxPerScan] = await Promise.all([s.deps.settings.value('inventory.audit.reasons'), s.deps.settings.value('inventory.audit.maxQuantityPerScan')]);
  const sep = t(d, 'stock.sep');

  return (
    <AdminFrame view={view} current={KEY}>
      <Link className="pa-back" href={COUNTS_HOME}>
        <Icon name="back" size={16} />
        <span>{t(d, 'stock.count.back')}</span>
      </Link>
      <div className="ad-hd">
        <div className="ad-eyebrow">{t(d, 'stock.count.eyebrow')}</div>
        <h1 className="ad-h1">{`${audit.location.warehouseCode}${sep}${audit.location.name}`}</h1>
        <p className="ad-intro">
          {t(d, 'stock.count.started', { date: dateTime(audit.createdAt, view.locale, view.timeZone) })}
          {audit.completedAt ? `${sep}${t(d, `stock.count.closed.${audit.status}`, { date: dateTime(audit.completedAt, view.locale, view.timeZone) })}` : ''}
        </p>
      </div>
      <AuditScreen
        dict={d}
        lang={view.lang}
        locale={view.locale}
        initial={audit}
        reasons={reasons.map((r) => ({ key: r.key, label: view.lang === 'bn' ? r.bn : r.en }))}
        canCount={s.can('inventory.audit')}
        maxPerScan={maxPerScan}
      />
    </AdminFrame>
  );
}

// PR 609 (CN-028) — import from the ERP by style code (docs/erp/site-changes-v6.md §2.1): every SKU of a style comes in
// as one draft product with its buying price ("bought from ERP at", never shown to customers), and the buying prices
// the ERP changed are listed with "Seen". Needs `catalogue.import` (making the draft also `catalogue.write`; buying
// prices `catalogue.prices`). On the practice ERP the preview works but nothing is saved. Guide:
// docs/admin-guide/pages/products/erp-import.md. The demo has no screen of its own for this: it follows the "Import
// from a link" page.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as inv from '@extas/inventory';
import { AdminFrame, AdminNotice, SystemTabs } from '@/components/admin/AdminFrame';
import { Icon } from '@/components/admin/Icon';
import { ErpImport } from '@/components/admin/products/ErpImport';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { catalogueAccess, storeMoney } from '@/lib/admin-products';
import { t } from '@/lib/i18n';
import { inventoryDeps } from '@/lib/inventory-api';

export const dynamic = 'force-dynamic';

const KEY = 'erpImport';
const HOME = '/admin/products/erp-import';

export async function generateMetadata(): Promise<Metadata> {
  const view = await adminView();
  return { title: t(view.dict, 'stock.erpImport.metaTitle'), robots: { index: false, follow: false } };
}

export default async function ErpImportPage() {
  const deps = adminDeps();
  const view = await adminView(deps);
  const access = await pageAccess('catalogue.import', deps, MOTHER_STORE_ID);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HOME)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noAccess')} />;

  const c = catalogueAccess(access);
  const d = view.dict;
  const invDeps = await inventoryDeps(access.deps);
  const canSeePrices = c.can('catalogue.prices') && c.can('inventory.read');
  const [link, model, money, changes] = await Promise.all([
    inv.resolveErp(invDeps, c.storeId),
    inv.erpModelOf(invDeps, c.storeId),
    storeMoney(c, view.locale),
    canSeePrices ? inv.shopPriceChanges(invDeps, c.who) : Promise.resolve(null),
  ]);
  const state = link.state === 'mock' ? 'practice' : link.state;

  return (
    <AdminFrame view={view} current={KEY}>
      <div className="ad-hd pa-hd">
        <div className="pa-hd-text">
          <div className="ad-eyebrow">{t(d, 'products.eyebrow')}</div>
          <h1 className="ad-h1">{t(d, 'stock.erpImport.title')}</h1>
          <p className="ad-intro">{t(d, 'stock.erpImport.intro')}</p>
        </div>
      </div>
      <div className="pa-gtabs">
        <SystemTabs view={view} current={KEY} group="catalogue" />
      </div>

      <div className={`ad-note ad-note-top${state === 'connected' && model === 'v6' ? '' : ' warn'}`} data-erp-state={state} data-erp-model={model}>
        <Icon name="info" size={16} />
        <div>
          {t(d, `stock.erpImport.state.${state}`)} {t(d, `stock.erpImport.model.${model}`)}{' '}
          {state !== 'connected' && c.can('vault.read') ? <Link href="/admin/integrations">{t(d, 'stock.erpImport.keysLink')}</Link> : null}
        </div>
      </div>

      {state === 'none' ? null : <ErpImport dict={d} money={money} canWrite={c.can('catalogue.write')} canSeePrices={canSeePrices} changes={changes} />}
    </AdminFrame>
  );
}

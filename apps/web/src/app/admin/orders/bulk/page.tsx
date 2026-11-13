// S28 · PR 704 — Orders → Bulk at /admin/orders/bulk: bulk and corporate orders over the website's enquiries (quote, agreed
// price, advance and balance marks, company invoice, delivery in batches). Seeing it needs `orders.read`; making a quote,
// moving a batch and the marks need `orders.notes`; the marks and the settings need the owner's PIN. Off until switched on.
// Guide: docs/admin-guide/pages/orders/bulk.md. Words: messages/admin-bulk-orders.*.json.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requirePermission } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { BulkOrdersScreen } from '@/components/admin/bulk/BulkOrdersScreen';
import { moneyOf } from '@/components/admin/products/model';
import { PageHead, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { bulkView } from '@/lib/bulk-orders';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-bulk-orders.bn.json';
import en from '../../../../../messages/admin-bulk-orders.en.json';
import '../../s28.css';

export const dynamic = 'force-dynamic';
const HERE = '/admin/orders/bulk';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, bulkOrders: ((view.lang === 'bn' ? bn : en).bulkOrders as unknown) as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'bulkOrders.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function BulkOrdersPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('orders.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="ordersBulk" text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="bulk-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="orders.read" />
      </div>
    );
  const d = access.deps;
  const can = async (k: 'orders.notes' | 'settings.write') => {
    try {
      await requirePermission(d.db, access.guard.actor, k, { storeId: MOTHER_STORE_ID });
      return true;
    } catch {
      return false;
    }
  };
  const [v, currency, canEdit, canSettings] = await Promise.all([bulkView(d, MOTHER_STORE_ID), d.resolver.value('store.currency', { storeId: MOTHER_STORE_ID }), can('orders.notes'), can('settings.write')]);
  return (
    <div className="a2-z" data-testid="bulk-page" data-lm-ready="">
      <PageHead view={view} place={null} title={t(view.dict, 'bulkOrders.title')} sub={t(view.dict, 'bulkOrders.sub')} />
      <BulkOrdersScreen dict={view.dict} money={moneyOf(currency, view.locale)} view={v} canEdit={canEdit} canSettings={canSettings} />
    </div>
  );
}

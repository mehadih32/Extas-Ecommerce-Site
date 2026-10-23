// PR 140 — ORD-01 All orders at /admin/orders (docs/BACKEND-ARCHITECTURE.md §5.3, demo V12.3 #/admin/orders): the saved
// views, search and filters in the address (`?view=&q=&status=&payment=&source=&cursor=`, so a link opens the same
// list), the table, and the bulk bar. Reading needs `orders.read` in the store; a person without it gets the shell's
// "no access" state, and the order service checks the key again on every read.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { OrderListPage } from '@/components/admin/orders/OrderListPage';
import { ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { listHref } from '@/lib/admin-orders/model';
import { parseListQuery } from '@/lib/admin-orders/list';
import { adminView, pageAccess } from '@/lib/admin-page';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const view = await adminView();
  return { title: `${t(view.dict, 'orders.page.all')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function OrdersPage({ searchParams }: { searchParams: Search }) {
  const deps = adminDeps();
  const [view, sp, access] = await Promise.all([adminView(deps), searchParams, pageAccess('orders.read', deps, MOTHER_STORE_ID)]);
  const query = parseListQuery('all', sp);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(listHref('all', query))}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="orders" text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="orders.read" />
      </div>
    );
  const a = { deps: access.deps, who: { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx }, perms: access.guard.permissions ?? new Set<string>() };
  const now = (access.deps.now ?? (() => new Date()))();
  return <OrderListPage view={view} a={a} query={query} now={now} />;
}

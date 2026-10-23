// PR 141 — ORD-07 one order at /admin/orders/:id (docs/BACKEND-ARCHITECTURE.md §5.3, demo V12.3): reading needs
// `orders.read` in the store; each command button shows only when the order service has it open now and the person
// holds its key. `?do=<command>` opens that command's dialog (links from the Dashboard and the search); a link to a
// command the person may not use shows the "no access" state above the order instead.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { CommandsProvider } from '@/components/admin/orders/OrderCommands';
import { OrderDetailPage } from '@/components/admin/orders/OrderDetailPage';
import { readDeps } from '@/components/admin/orders/OrderListPage';
import { ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { DO_PERM, commandTexts, loadOrderDetail } from '@/lib/admin-orders/detail';
import { orderHref } from '@/lib/admin-orders/model';
import { adminView, pageAccess } from '@/lib/admin-page';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata(): Promise<Metadata> {
  const view = await adminView();
  return { title: `${t(view.dict, 'orders.detail.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function OrderPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const deps = adminDeps();
  const [{ id }, sp, view, access] = await Promise.all([params, searchParams, adminView(deps), pageAccess('orders.read', deps, MOTHER_STORE_ID)]);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(orderHref(id))}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="order" text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="orders.read" />
      </div>
    );
  const perms = access.guard.permissions ?? new Set<string>();
  const who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const o = await loadOrderDetail(readDeps(access.deps), who, view, id, perms);
  if (!o)
    return (
      <div className="a2-z">
        <ShellState view={view} kind="notfound" />
      </div>
    );
  const want = one(sp.do) ?? null;
  const needs = want ? DO_PERM[want] : undefined;
  const denied = needs && !perms.has(needs) ? needs : null;
  return (
    <CommandsProvider texts={commandTexts(view)}>
      <OrderDetailPage
        view={view}
        o={o}
        open={denied ? null : want}
        notice={
          denied ? (
            <div data-testid="order-denied">
              <ShellState view={view} kind="denied" permission={denied} />
            </div>
          ) : null
        }
      />
    </CommandsProvider>
  );
}

// PR 141 — ORD-02 To confirm at /admin/orders/confirm (docs/BACKEND-ARCHITECTURE.md §5.3, demo V12.3): the call queue
// (`?view=toConfirm|cancelRequests|awaitingAdvance`, `?order=<id>` the chosen order, `?do=` a command's dialog). It
// needs `orders.confirm` in the store (the demo's key for this page); the order service checks every command again.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as od from '@extas/orders';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { CommandsProvider } from '@/components/admin/orders/OrderCommands';
import { OrderConfirmPage } from '@/components/admin/orders/OrderConfirmPage';
import { readDeps } from '@/components/admin/orders/OrderListPage';
import { ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { DO_PERM, commandTexts, loadOrderDetail } from '@/lib/admin-orders/detail';
import { ageText, loadOrderList, parseListQuery } from '@/lib/admin-orders/list';
import { listHref } from '@/lib/admin-orders/model';
import { adminView, pageAccess } from '@/lib/admin-page';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata(): Promise<Metadata> {
  const view = await adminView();
  return { title: `${t(view.dict, 'orders.page.confirm')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function ConfirmQueuePage({ searchParams }: { searchParams: Search }) {
  const deps = adminDeps();
  const [view, sp, access] = await Promise.all([adminView(deps), searchParams, pageAccess('orders.confirm', deps, MOTHER_STORE_ID)]);
  const query = parseListQuery('confirm', sp);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(listHref('confirm', query))}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="ordersConfirm" text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="orders.confirm" />
      </div>
    );
  const perms = access.guard.permissions ?? new Set<string>();
  const who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const rd = readDeps(access.deps);
  const now = (access.deps.now ?? (() => new Date()))();
  // The queue is the list's own page of the view (no search or filters here: it is worked from the top).
  const q = { view: query.view, ...(query.cursor ? { cursor: query.cursor } : {}) };
  const [list, oldest] = await Promise.all([loadOrderList(rd, who, view, 'confirm', q), od.viewOldest(rd, who, 'toConfirm')]);
  const want = one(sp.order);
  const pick = list.rows.find((r) => r.id === want) ?? list.rows[0];
  const chosen = pick ? await loadOrderDetail(rd, who, view, pick.id, perms) : null;
  const wantDo = one(sp.do) ?? null;
  const open = wantDo && DO_PERM[wantDo] && perms.has(DO_PERM[wantDo]) ? wantDo : null;
  return (
    <CommandsProvider texts={commandTexts(view)}>
      <OrderConfirmPage view={view} query={q} list={list} chosen={chosen} oldest={oldest ? ageText(view, oldest, now) : null} open={open} />
    </CommandsProvider>
  );
}

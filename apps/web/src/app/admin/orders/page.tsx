// PR 140 — ORD-01 All orders at /admin/orders (docs/BACKEND-ARCHITECTURE.md §5.3, demo V12.3 #/admin/orders): the saved
// views, search and filters in the address (`?view=&q=&status=&payment=&source=&cursor=`, so a link opens the same
// list), the table, and the bulk bar. Reading needs `orders.read` in the store; a person without it gets the shell's
// "no access" state, and the order service checks the key again on every read.
// PR 656 (CN-025, follow-up 381): drawn in one of its designs from the admin look registry (components/admin/look/
// registry.ts): A "Classic list" (this page as it was built), B "Focus view" and C "Command view". Which one is shown:
// `?design=X` (a preview, never saved) → the person's own choice (the "…" menu, while `admin.look.perPerson` is on) →
// the team's (Settings → Admin look) → the registry's standard (A, unchanged: nothing moves under anyone who has not
// asked for a different design). Every design reads the same `loadOrderList`; none writes anything (CN-044).
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { OrderListPage, type ListAccess } from '@/components/admin/orders/OrderListPage';
import { ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import type { Csv, LookMenuProps } from '@/components/admin/look/LookMenu';
import { lookPage } from '@/components/admin/look/registry';
import { wordsIn } from '@/components/admin/look/types';
import type { OrdersDesignProps } from '@/components/admin/look/orders/common';
import { pickDesign } from '@/lib/admin-look/pick';
import { lookState } from '@/lib/admin-look/prefs';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { listHref } from '@/lib/admin-orders/model';
import { parseListQuery } from '@/lib/admin-orders/list';
import { adminView, pageAccess } from '@/lib/admin-page';
import { shellSession } from '@/lib/admin-shell/session';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const view = await adminView();
  return { title: `${t(view.dict, 'orders.page.all')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

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
  const a: ListAccess = { deps: access.deps, who: { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx }, perms: access.guard.permissions ?? new Set<string>() };
  const now = (access.deps.now ?? (() => new Date()))();

  const [look, session] = await Promise.all([lookState(), shellSession()]);
  const page = lookPage('orders')!;
  const keys = page.designs.map((x) => x.key);
  const picked = pickDesign(keys, page.standard, { preview: one(sp.design), mine: look.prefs.look.orders, team: look.team, page: page.id });
  const design = page.designs.find((x) => x.key === picked.key)!;
  const csv: Csv | null = null; // follow-up 381: no new CSV added; the bulk bar's own Export (orders.export) covers it
  const owner = session.kind === 'ok' ? session.owner : false;
  const menu: LookMenuProps = {
    page: page.id,
    designs: page.designs.map((x) => ({ key: x.key, name: wordsIn(view.lang, x.name) })),
    current: picked.key,
    mine: look.team.perPerson && !!look.prefs.look[page.id],
    perPerson: look.team.perPerson,
    settingsHref: owner || a.perms.has('settings.read') ? '/admin/settings/look' : null,
    items: [],
    csv,
    labels: {
      more: t(view.dict, 'look.menu.more'),
      design: t(view.dict, 'look.menu.design'),
      team: t(view.dict, 'look.menu.team'),
      all: t(view.dict, 'look.menu.all'),
      csv: t(view.dict, 'look.menu.csv'),
      saved: t(view.dict, 'look.menu.saved'),
      failed: t(view.dict, 'look.menu.failed'),
    },
  };

  if (!design.Render) return <OrderListPage view={view} a={a} query={query} now={now} menu={menu} />;
  const Render = design.Render as unknown as (p: OrdersDesignProps) => ReactNode;
  return <Render view={view} a={a} query={query} now={now} menu={menu} csv={csv} />;
}

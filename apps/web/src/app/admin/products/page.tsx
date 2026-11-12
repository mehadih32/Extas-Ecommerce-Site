// PR 21 — the product list (demo #/admin/products, 90-admin-catalog.js): the counters, search, status and category
// chips, one row per product with its photo, colours, sizes, price, stock and what it still misses (PR 26, 29), and the
// bulk bar (publish, take off, check again, archive, restore). Needs `catalogue.read`; every action is checked again.
// PR 634 (CN-036): in the Lumen look (data-lm-ready, light and dark): the counters are Lumen summary tiles, a bulk
// publish, take-off, archive or restore offers Undo in the one toast (reversible only; prices are never touched here).
// PR 657 (CN-025, follow-up 382): drawn in one of its designs from the admin look registry (components/admin/look/
// registry.ts): A "Classic list" (this page as it was built), B "Focus view" and C "Command view". Which one is shown:
// `?design=X` (a preview, never saved) → the person's own choice (the "···" menu, while `admin.look.perPerson` is on) →
// the team's (Settings → Admin look) → the registry's standard (A, unchanged). Every design reads the one
// `loadProductList`; none writes anything (CN-044).
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { ADMIN_STATUS_FILTERS, type AdminStatusFilter } from '@extas/catalogue';
import { AdminFrame, AdminNotice } from '@/components/admin/AdminFrame';
import { ShellState } from '@/components/admin/shell/ShellParts';
import { ProductListPage } from '@/components/admin/products/ProductListPage';
import type { Csv, LookMenuProps } from '@/components/admin/look/LookMenu';
import { lookPage } from '@/components/admin/look/registry';
import { wordsIn } from '@/components/admin/look/types';
import type { ProductsDesignProps } from '@/components/admin/look/products/common';
import { pickDesign } from '@/lib/admin-look/pick';
import { lookState } from '@/lib/admin-look/prefs';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { catalogueAccess, loadProductList, one, pageParam, PRODUCTS_HOME, type ProductQuery } from '@/lib/admin-products';
import { shellSession } from '@/lib/admin-shell/session';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const KEY = 'products';

export async function generateMetadata(): Promise<Metadata> {
  const view = await adminView();
  return { title: t(view.dict, 'products.metaTitle'), robots: { index: false, follow: false } };
}

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function ProductsPage({ searchParams }: { searchParams: Search }) {
  const deps = adminDeps();
  const [view, sp, access, look, session] = await Promise.all([adminView(deps), searchParams, pageAccess('catalogue.read', deps, MOTHER_STORE_ID), lookState(), shellSession()]);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(PRODUCTS_HOME)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="catalogue.read" />
      </div>
    );

  const c = catalogueAccess(access);
  const q = one(sp.q)?.slice(0, 100);
  const statusRaw = one(sp.status);
  const status = (ADMIN_STATUS_FILTERS as readonly string[]).includes(statusRaw ?? '') ? (statusRaw as AdminStatusFilter) : undefined;
  const categoryRaw = one(sp.category);
  const categoryId = categoryRaw && /^[0-9a-f-]{36}$/i.test(categoryRaw) ? categoryRaw : undefined;
  const page = pageParam(sp.page);
  const query: ProductQuery = { q, status, categoryId, page };

  const pageDesign = lookPage('products')!;
  const keys = pageDesign.designs.map((x) => x.key);
  const picked = pickDesign(keys, pageDesign.standard, { preview: one(sp.design), mine: look.prefs.look.products, team: look.team, page: pageDesign.id });
  const design = pageDesign.designs.find((x) => x.key === picked.key)!;
  const csv: Csv | null = null; // follow-up 382: no new CSV added
  const owner = session.kind === 'ok' ? session.owner : false;
  const menu: LookMenuProps = {
    page: pageDesign.id,
    designs: pageDesign.designs.map((x) => ({ key: x.key, name: wordsIn(view.lang, x.name) })),
    current: picked.key,
    mine: look.team.perPerson && !!look.prefs.look[pageDesign.id],
    perPerson: look.team.perPerson,
    settingsHref: owner || c.can('settings.read') ? '/admin/settings/look' : null,
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

  if (!design.Render) {
    const data = await loadProductList(c, view.locale, query);
    return (
      <AdminFrame view={view} current={KEY} ready>
        <ProductListPage view={view} c={c} query={query} data={data} menu={menu} />
      </AdminFrame>
    );
  }
  const Render = design.Render as unknown as (p: ProductsDesignProps) => ReactNode;
  return (
    <AdminFrame view={view} current={KEY} ready>
      <Render view={view} c={c} query={query} menu={menu} csv={csv} />
    </AdminFrame>
  );
}

// S28 · PR 684 — Products › Demo products: sample products that fill the categories while real products arrive (see
// components/admin/products/DemoManager). Reading needs `catalogue.read`, changing `catalogue.write`.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cat from '@extas/catalogue';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { DemoManager, type DemoSetting } from '@/components/admin/products/DemoManager';
import { nameIn } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { catalogueAccess, storeMoney } from '@/lib/admin-products';
import { locateKey } from '@/lib/admin-shell/sections';
import { productV5Cards } from '@/lib/products-v5-settings-api';
import { t } from '@/lib/i18n';
import '../../settings-cards.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/products/demo';
// Until the menu has its own entry (docs/demo/admin-proto-v5/gap/NAV-PATCH-w4a.md) the page sits under Questions.
const KEY = 'productQuestions';

export async function generateMetadata(): Promise<Metadata> {
  const view = await adminView();
  return { title: t(view.dict, 'products.demo.metaTitle'), robots: { index: false, follow: false } };
}

export default async function DemoProductsPage() {
  const deps = adminDeps();
  const [view, access] = await Promise.all([adminView(deps), pageAccess('catalogue.read', deps, MOTHER_STORE_ID)]);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="products" text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="demo-products" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="catalogue.read" />
      </div>
    );
  const c = catalogueAccess(access);
  const [demo, cards, items, money] = await Promise.all([
    cat.demoView(c.deps, c.who),
    productV5Cards(access.deps, { actor: access.guard.actor, ctx: access.guard.ctx }),
    c.deps.db.product.findMany({
      where: { storeId: c.storeId, isDemo: true, archivedAt: null },
      select: { id: true, nameEn: true, nameBn: true, categoryId: true },
      orderBy: { nameEn: 'asc' },
      take: 200,
    }),
    storeMoney(c, view.locale),
  ]);
  const card = cards['catalogue.demo'];
  const catName = new Map(demo.categories.map((x) => [x.id, nameIn(view.lang, x)]));
  const showing = new Map(demo.categories.map((x) => [x.id, x.showing]));

  return (
    <div className="a2-z" data-testid="demo-products" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={t(d, 'products.demo.title')} sub={t(d, 'products.demo.sub')} />
      <SectionTabs view={view} current={KEY} />
      <DemoManager
        dict={d}
        setting={card.value as unknown as DemoSetting}
        version={card.version}
        cats={demo.categories.map((x) => ({ id: x.id, parentId: x.parentId, name: nameIn(view.lang, x), demo: x.demo, real: x.real, showing: x.showing }))}
        items={items.map((i) => ({ id: i.id, name: nameIn(view.lang, i), category: catName.get(i.categoryId ?? '') ?? '', showing: showing.get(i.categoryId ?? '') ?? false }))}
        canWrite={c.can('catalogue.write')}
        demoTotal={demo.demoTotal}
        showingTotal={demo.showingTotal}
        emptyCategories={demo.emptyCategories}
        minorPerMajor={10 ** money.digits}
      />
    </div>
  );
}

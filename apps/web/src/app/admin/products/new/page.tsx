// PR 21 — "New product" (demo #/admin/products/new). Needs `catalogue.write`; the product starts as a draft and the
// edit page opens next for colours, sizes, SKUs, prices and photos.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cat from '@extas/catalogue';
import { AdminFrame, AdminNotice } from '@/components/admin/AdminFrame';
import { Icon } from '@/components/admin/Icon';
import { NewProductForm } from '@/components/admin/products/NewProductForm';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { catalogueAccess, PRODUCTS_HOME } from '@/lib/admin-products';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const KEY = 'products';
const HERE = `${PRODUCTS_HOME}/new`;

export async function generateMetadata(): Promise<Metadata> {
  const view = await adminView();
  return { title: t(view.dict, 'products.new.metaTitle'), robots: { index: false, follow: false } };
}

export default async function NewProductPage() {
  const deps = adminDeps();
  const view = await adminView(deps);
  const access = await pageAccess('catalogue.write', deps, MOTHER_STORE_ID);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noAccess')} />;

  const c = catalogueAccess(access);
  const [tree, fabrics] = await Promise.all([cat.categoryTree(c.deps, c.who), cat.listFabrics(c.deps, c.who)]);
  const d = view.dict;
  return (
    <AdminFrame view={view} current={KEY}>
      <Link className="pa-back" href={PRODUCTS_HOME}>
        <Icon name="back" size={14} />
        {t(d, 'products.back')}
      </Link>
      <div className="ad-hd">
        <div className="ad-eyebrow">{t(d, 'products.eyebrow')}</div>
        <h1 className="ad-h1">{t(d, 'products.new.title')}</h1>
        <p className="ad-intro">{t(d, 'products.new.intro')}</p>
      </div>
      <div className="pa-ed">
        <div className="pa-edmain">
          <NewProductForm
            dict={d}
            lang={view.lang}
            categories={cat.flatten(tree).map((n) => ({ id: n.id, nameEn: n.nameEn, nameBn: n.nameBn, depth: n.depth }))}
            fabrics={fabrics.map((f) => ({ id: f.id, nameEn: f.nameEn, nameBn: f.nameBn }))}
            cancelHref={PRODUCTS_HOME}
          />
        </div>
        <aside className="pa-edside">
          <section className="ad-card">
            <h2>{t(d, 'products.sections.ready')}</h2>
            <p className="ad-mini">{t(d, 'products.new.readyNote')}</p>
          </section>
        </aside>
      </div>
    </AdminFrame>
  );
}

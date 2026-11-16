// PR 21 — "New product" (demo #/admin/products/new). Needs `catalogue.write`; the product starts as a draft and the
// edit page opens next for colours, sizes, SKUs, prices and photos.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminFrame, AdminNotice } from '@/components/admin/AdminFrame';
import { PageHead } from '@/components/admin/shell/ShellParts';
import { locateKey } from '@/lib/admin-shell/sections';
import { Icon } from '@/components/admin/Icon';
import { ProductWizard } from '@/components/admin/products/wizard/ProductWizard';
import { wizardProps } from '@/lib/admin-wizard-page';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { catalogueAccess, PRODUCTS_HOME } from '@/lib/admin-products';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const KEY = 'productNew';
const HERE = `${PRODUCTS_HOME}/new`;

export async function generateMetadata(): Promise<Metadata> {
  const view = await adminView();
  return {
    title: t(view.dict, 'products.new.metaTitle'),
    robots: { index: false, follow: false },
  };
}

export default async function NewProductPage() {
  const deps = adminDeps();
  const view = await adminView(deps);
  const access = await pageAccess('catalogue.write', deps, MOTHER_STORE_ID);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noAccess')} ready />;

  const c = catalogueAccess(access);
  const d = view.dict;
  const props = await wizardProps({ c, access, d, lang: view.lang, locale: view.locale, id: null, step: 1 });
  return (
    <AdminFrame view={view} current={KEY} ready crumb={false}>
      <Link className="pa-back" href={PRODUCTS_HOME}>
        <Icon name="back" size={14} />
        {t(d, 'products.back')}
      </Link>
      <PageHead view={view} place={locateKey(KEY)} title={t(d, 'products.new.title')} sub={t(d, 'products.new.intro')} />
      <ProductWizard {...props} />
    </AdminFrame>
  );
}

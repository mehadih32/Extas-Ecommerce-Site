// PR 21 — one product's edit page (demo #/admin/products/<id>, 90-admin-catalog.js): basics, name, link and Google
// (PR 590), colours, sizes, SKUs and prices, photos (PR 25, through the media API), and at the side the publish card and
// "Ready to go live?" (PR 26, 29). Needs `catalogue.read`; changing needs `catalogue.write`, prices `catalogue.prices`,
// photos `media.upload`, publishing `catalogue.publish` — each checked again by the API.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cat from '@extas/catalogue';
import { productGallery, type ProductPhoto } from '@extas/media';
import { AdminFrame, AdminNotice } from '@/components/admin/AdminFrame';
import { Icon } from '@/components/admin/Icon';
import { ProductForm } from '@/components/admin/products/ProductForm';
import { nameIn } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { catalogueAccess, photosOf, PRODUCTS_HOME, productHref, storeMoney } from '@/lib/admin-products';
import { t } from '@/lib/i18n';
import { mediaDeps } from '@/lib/media';

export const dynamic = 'force-dynamic';

const KEY = 'products';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  const view = await adminView();
  return { title: t(view.dict, 'products.edit.metaTitle'), robots: { index: false, follow: false } };
}

export default async function ProductEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const deps = adminDeps();
  const view = await adminView(deps);
  const access = await pageAccess('catalogue.read', deps, MOTHER_STORE_ID);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(productHref(id))}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noAccess')} />;

  const c = catalogueAccess(access);
  let product: cat.ProductView;
  try {
    product = await cat.getProduct(c.deps, c.who, id);
  } catch (e) {
    if (cat.isCatalogueError(e) && e.code === 'NOT_FOUND') notFound();
    throw e;
  }
  const [naming, readiness, stock, tree, fabrics, colours, sizes, money, skuTemplate, frontPerColour] = await Promise.all([
    cat.namingView(c.deps, c.who, id),
    cat.productReadiness(c.deps, c.who, id),
    cat.productStock(c.deps, c.who, id),
    cat.categoryTree(c.deps, c.who),
    cat.listFabrics(c.deps, c.who),
    cat.listColours(c.deps, c.who),
    cat.listSizes(c.deps, c.who),
    storeMoney(c, view.locale),
    c.deps.settings.value('catalogue.skuSuggestion', { storeId: c.storeId }),
    c.deps.settings.value('media.photos.frontPerColour', { storeId: c.storeId }),
  ]);

  // Photos: shown to someone who may see the media library; placed by someone who may upload.
  const media = mediaDeps();
  let gallery: ProductPhoto[] | null = null;
  if (media && c.can('media.read')) gallery = (await productGallery(media, c.who.actor, { storeId: c.storeId, productId: id })).photos;
  const images = await photosOf(c, (gallery ?? []).map((g) => g.assetId));

  const d = view.dict;
  return (
    <AdminFrame view={view} current={KEY}>
      <Link className="pa-back" href={PRODUCTS_HOME}>
        <Icon name="back" size={14} />
        {t(d, 'products.back')}
      </Link>
      <div className="ad-hd">
        <div className="ad-eyebrow">{t(d, 'products.eyebrow')}</div>
        <h1 className="ad-h1">{nameIn(view.lang, product)}</h1>
        <p className="ad-intro">{t(d, 'products.edit.intro')}</p>
      </div>
      <ProductForm
        dict={d}
        lang={view.lang}
        product={product}
        naming={naming}
        readiness={readiness}
        stock={stock}
        categories={cat.flatten(tree).map((n) => ({ id: n.id, nameEn: n.nameEn, nameBn: n.nameBn, depth: n.depth }))}
        fabrics={fabrics.map((f) => ({ id: f.id, nameEn: f.nameEn, nameBn: f.nameBn }))}
        colours={colours.map((x) => ({ id: x.id, key: x.key, nameEn: x.nameEn, nameBn: x.nameBn, hex: x.hex, erpColorCode: x.erpColorCode }))}
        sizes={sizes.map((x) => ({ id: x.id, key: x.key, label: x.label, sortOrder: x.sortOrder, erpSizeCode: x.erpSizeCode }))}
        money={money}
        skuTemplate={skuTemplate}
        frontPerColour={frontPerColour}
        gallery={gallery}
        images={images}
        can={{
          write: c.can('catalogue.write'),
          prices: c.can('catalogue.prices'),
          publish: c.can('catalogue.publish'),
          upload: !!media && c.can('media.upload'),
        }}
      />
    </AdminFrame>
  );
}

// PR 21, 634 — the product list's own body (counters, search, status and category chips, the table and pager), moved
// out of `app/admin/products/page.tsx` unchanged so design A keeps drawing exactly as it always has.
// PR 657 (CN-025, CN-027, follow-up 382): the one body every Products design can mount — design A (the page's own
// route, no change in behaviour), and the "···" menu's `menu` prop a design can also show. B and C (components/admin/
// look/products/{B,C}.tsx) read the loader and build their own chrome around the same list, tiles and bulk bar; CN-044:
// read-only, nothing here writes beyond what this page already wrote.
import Link from 'next/link';
import { ADMIN_STATUS_FILTERS, type AdminStatusFilter } from '@extas/catalogue';
import { Icon } from '@/components/admin/Icon';
import { SummaryTiles, type SummaryTile } from '@/components/admin/lumen/SummaryTiles';
import { ProductList } from '@/components/admin/products/ProductList';
import { AUDIT_HOME } from '@/components/admin/products/tools-model';
import { formatNumber } from '@/components/admin/products/model';
import type { CountFormat } from '@/lib/admin-lumen/model';
import type { ShellIconName } from '@/lib/admin-shell/icons';
import { productsHref, PRODUCTS_HOME, type CatalogueAccess, type ProductListData, type ProductQuery } from '@/lib/admin-products';
import type { AdminView } from '@/lib/admin-page';
import { t } from '@/lib/i18n';
import { LookMenu, type LookMenuProps } from '../look/LookMenu';

export interface ProductListPageProps {
  view: AdminView;
  c: CatalogueAccess;
  query: ProductQuery;
  data: ProductListData;
  menu?: LookMenuProps | null;
}

/** PR 657: the title row and "+ Add product" / "···" menu — shared so B and C can put their own hero or flow strip
 *  between this and the tiles below without touching it. */
export function ProductsHeader({ view, canWrite, menu }: { view: AdminView; canWrite: boolean; menu?: LookMenuProps | null }) {
  const d = view.dict;
  return (
    <div className="ad-hd pa-hd">
      <div className="pa-hd-text">
        <div className="ad-eyebrow">{t(d, 'products.eyebrow')}</div>
        <h1 className="ad-h1">{t(d, 'products.title')}</h1>
        <p className="ad-intro">{t(d, 'products.intro')}</p>
      </div>
      <div className="pa-hd-actions">
        {canWrite ? (
          <Link className="ad-btn ad-btn-primary pa-hd-btn" href={`${PRODUCTS_HOME}/new`}>
            <Icon name="plus" size={18} />
            {t(d, 'products.newProduct')}
          </Link>
        ) : null}
        {menu ? <LookMenu {...menu} /> : null}
      </div>
    </div>
  );
}

/** PR 657: the tiles, search, status/category chips, table, bulk bar and pager — every design's one body. */
export function ProductListBody({ view, query, data, canWrite, canPublish }: { view: AdminView; query: ProductQuery; data: ProductListData; canWrite: boolean; canPublish: boolean }) {
  const d = view.dict;
  const lang = view.lang;
  const { list, money, issuesShown, photoMin, lowPieces, bulkMax, photos, pages } = data;
  const href = (o: { q?: string; status?: string; category?: string; page?: number }) => productsHref(query, o);
  const num = (n: number) => formatNumber(n, view.locale);
  const counts = list.counts;
  const countFmt: CountFormat = { kind: 'number', locale: view.locale };
  const tile = (key: string, value: number, vs: string, icon: ShellIconName, linkHref?: string): SummaryTile => ({ key, label: t(d, `products.kpi.${key}`), value, shown: num(value), format: countFmt, vs, icon, href: linkHref });
  const tiles: SummaryTile[] = [
    tile('products', counts.products, t(d, 'products.kpi.productsSub', { n: num(counts.categories) }), 'shirt', href({ status: undefined, category: undefined, q: undefined, page: 1 })),
    tile('live', counts.live, t(d, 'products.kpi.liveSub', { n: num(counts.ready) }), 'eye', href({ status: 'live', page: 1 })),
    tile('lowStock', counts.lowStockSizes, t(d, 'products.kpi.lowStockSub', { n: num(lowPieces) }), 'alert'),
    tile('needPhotos', counts.needPhotos, t(d, 'products.kpi.needPhotosSub', { n: num(photoMin) }), 'file', `${AUDIT_HOME}?check=photos`),
  ];

  return (
    <>
      <SummaryTiles tiles={tiles} label={t(d, 'products.title')} testId="products-kpi" />

      <form className="pa-sbar" role="search" action={PRODUCTS_HOME} method="get">
        <label className="pa-search">
          <span className="pa-vh">{t(d, 'products.search.label')}</span>
          <Icon name="search" size={18} />
          <input className="ad-input" type="search" name="q" defaultValue={query.q ?? ''} placeholder={t(d, 'products.search.placeholder')} maxLength={100} />
        </label>
        {query.status ? <input type="hidden" name="status" value={query.status} /> : null}
        {query.categoryId ? <input type="hidden" name="category" value={query.categoryId} /> : null}
        <button type="submit" className="ad-btn ad-btn-ghost ad-btn-sm">
          {t(d, 'products.search.submit')}
        </button>
      </form>

      <nav className="ad-tabs" aria-label={t(d, 'products.filters.label')}>
        <Link className="ad-chip" href={href({ status: undefined, page: 1 })} aria-current={!query.status ? 'page' : undefined}>
          {t(d, 'products.filters.all')}
        </Link>
        {(ADMIN_STATUS_FILTERS as readonly AdminStatusFilter[]).map((s) => (
          <Link key={s} className="ad-chip" href={href({ status: s, page: 1 })} aria-current={query.status === s ? 'page' : undefined}>
            {t(d, `products.filters.${s}`)}
          </Link>
        ))}
      </nav>
      {list.categories.length ? (
        <nav className="ad-tabs" aria-label={t(d, 'products.cats.label')}>
          <Link className="ad-chip" href={href({ category: undefined, page: 1 })} aria-current={!query.categoryId ? 'page' : undefined}>
            {t(d, 'products.cats.all', { n: num(counts.products) })}
          </Link>
          {list.categories.map((cat) => (
            <Link key={cat.id} className="ad-chip" href={href({ category: cat.id, page: 1 })} aria-current={query.categoryId === cat.id ? 'page' : undefined}>
              {lang === 'bn' && cat.nameBn ? cat.nameBn : cat.nameEn}
              <span className="pa-chip-n">{num(cat.products)}</span>
            </Link>
          ))}
        </nav>
      ) : null}

      <ProductList
        dict={d}
        lang={lang}
        rows={list.items}
        photos={photos}
        money={money}
        issuesShown={issuesShown}
        bulkMax={bulkMax}
        canWrite={canWrite}
        canPublish={canPublish}
        emptyText={t(d, query.q || query.status || query.categoryId ? 'products.empty' : 'products.emptyAll')}
      />

      {pages > 1 ? (
        <nav className="pa-pager" aria-label={t(d, 'products.pager.label')}>
          {list.page > 1 ? (
            <Link className="ad-btn ad-btn-ghost ad-btn-sm" href={href({ page: list.page - 1 })}>
              {t(d, 'products.pager.prev')}
            </Link>
          ) : null}
          <span className="ad-mini">{t(d, 'products.pager.page', { page: num(list.page), pages: num(pages) })}</span>
          {list.page < pages ? (
            <Link className="ad-btn ad-btn-ghost ad-btn-sm" href={href({ page: list.page + 1 })}>
              {t(d, 'products.pager.next')}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}

export function ProductListPage({ view, c, query, data, menu }: ProductListPageProps) {
  const canWrite = c.can('catalogue.write');
  const canPublish = c.can('catalogue.publish');
  return (
    <div className="a2-z" data-testid="products-list" data-lm-ready="">
      <ProductsHeader view={view} canWrite={canWrite} menu={menu} />
      <ProductListBody view={view} query={query} data={data} canWrite={canWrite} canPublish={canPublish} />
    </div>
  );
}

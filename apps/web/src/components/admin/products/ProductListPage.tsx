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
export function ProductsHeader({ view, canWrite, menu, canExport, canImport }: { view: AdminView; canWrite: boolean; menu?: LookMenuProps | null; /** PR 722: Export (`catalogue.export`) and Quick import (`catalogue.import`), as in the prototype. */ canExport?: boolean; canImport?: boolean }) {
  const d = view.dict;
  return (
    <div className="ad-hd pa-hd">
      <div className="pa-hd-text">
        <div className="ad-eyebrow">{t(d, 'products.eyebrow')}</div>
        <h1 className="ad-h1">{t(d, 'products.title')}</h1>
        <p className="ad-intro">{t(d, 'products.intro')}</p>
      </div>
      <div className="pa-hd-actions">
        {canExport ? (
          <a className="ad-btn ad-btn-ghost pa-hd-btn" href="/api/admin/catalogue/csv/export" download data-testid="products-export">
            <Icon name="doc" size={18} />
            {t(d, 'products.actions.export')}
          </a>
        ) : null}
        {canImport ? (
          <Link className="ad-btn ad-btn-ghost pa-hd-btn" href="/admin/products/erp-import" data-testid="products-quick-import">
            <Icon name="sync" size={18} />
            {t(d, 'products.actions.quickImport')}
          </Link>
        ) : null}
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
  // PR 722 (prototype v5 parity): the average margin as a fifth figure (only for a person who may see buying prices) and the
  // one-line insight under the figures: the best seller, and how many products sold nothing in 30 days.
  const strip = data.strip;
  if (data.showsBuying && strip.avgMarginPct !== null) {
    tiles.push({
      key: 'margin',
      label: t(d, 'products.kpi.margin'),
      value: strip.avgMarginPct / 100,
      shown: `${new Intl.NumberFormat(view.locale, { numberingSystem: 'latn', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(strip.avgMarginPct)}%`,
      format: { kind: 'percent', locale: view.locale, digits: 1 },
      vs: strip.floorMarginPct !== null ? t(d, 'products.kpi.marginSub', { n: num(strip.belowFloor), min: num(Math.round(strip.floorMarginPct)) }) : t(d, 'products.kpi.marginNoFloor'),
      icon: 'chart',
    });
  }
  const insight = strip.best
    ? t(d, 'products.insight.best', { name: strip.best.name, n: num(strip.best.sold30), sold: num(strip.sold30Pieces) }) + (strip.notSelling ? ' ' + t(d, 'products.insight.notSelling', { n: num(strip.notSelling) }) : '')
    : null;

  return (
    <>
      <SummaryTiles tiles={tiles} label={t(d, 'products.title')} testId="products-kpi" />
      {insight ? (
        <div className="pa-insight" data-testid="products-insight">
          <Icon name="info" size={16} />
          <span>{insight}</span>
        </div>
      ) : null}

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
        extras={data.extras}
        showsBuying={data.showsBuying}
        floorMarginPct={data.strip.floorMarginPct}
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
      <ProductsHeader view={view} canWrite={canWrite} menu={menu} canExport={c.can('catalogue.export')} canImport={c.can('catalogue.import')} />
      <ProductListBody view={view} query={query} data={data} canWrite={canWrite} canPublish={canPublish} />
    </div>
  );
}

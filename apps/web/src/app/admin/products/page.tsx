// PR 21 — the product list (demo #/admin/products, 90-admin-catalog.js): the counters, search, status and category
// chips, one row per product with its photo, colours, sizes, price, stock and what it still misses (PR 26, 29), and the
// bulk bar (publish, take off, check again, archive, restore). Needs `catalogue.read`; every action is checked again.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { adminProductList, ADMIN_STATUS_FILTERS, type AdminStatusFilter } from '@extas/catalogue';
import { AdminFrame, AdminNotice, SystemTabs } from '@/components/admin/AdminFrame';
import { Icon } from '@/components/admin/Icon';
import { ProductList } from '@/components/admin/products/ProductList';
import { formatNumber } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { catalogueAccess, one, pageParam, photosOf, PRODUCTS_HOME, storeMoney } from '@/lib/admin-products';
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
  const [view, sp] = await Promise.all([adminView(deps), searchParams]);
  const access = await pageAccess('catalogue.read', deps, MOTHER_STORE_ID);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(PRODUCTS_HOME)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noAccess')} />;

  const c = catalogueAccess(access);
  const d = view.dict;
  const lang = view.lang;
  const q = one(sp.q)?.slice(0, 100);
  const statusRaw = one(sp.status);
  const status = (ADMIN_STATUS_FILTERS as readonly string[]).includes(statusRaw ?? '') ? (statusRaw as AdminStatusFilter) : undefined;
  const categoryRaw = one(sp.category);
  const categoryId = categoryRaw && /^[0-9a-f-]{36}$/i.test(categoryRaw) ? categoryRaw : undefined;
  const page = pageParam(sp.page);

  const [list, money, issuesShown, lowPieces, photoMin, bulkMax] = await Promise.all([
    adminProductList(c.deps, c.who, { q, status, categoryId, page }),
    storeMoney(c, view.locale),
    c.deps.settings.value('catalogue.admin.issuesShown', { storeId: c.storeId }),
    c.deps.settings.value('catalogue.admin.lowStockPieces', { storeId: c.storeId }),
    c.deps.settings.value('media.photos.minimum', { storeId: c.storeId }),
    c.deps.settings.value('catalogue.bulk.maxProducts', { storeId: c.storeId }),
  ]);
  const photos = await photosOf(c, list.items.map((i) => i.thumbAssetId));
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));

  const href = (o: { q?: string; status?: string; category?: string; page?: number }) => {
    const p = new URLSearchParams();
    const merged = { q, status, category: categoryId, ...o };
    if (merged.q) p.set('q', merged.q);
    if (merged.status) p.set('status', merged.status);
    if (merged.category) p.set('category', merged.category);
    if (o.page && o.page > 1) p.set('page', String(o.page));
    const s = p.toString();
    return s ? `${PRODUCTS_HOME}?${s}` : PRODUCTS_HOME;
  };
  const num = (n: number) => formatNumber(n, view.locale);
  const counts = list.counts;
  const kpis = [
    { value: counts.products, label: 'products.kpi.products', sub: t(d, 'products.kpi.productsSub', { n: num(counts.categories) }) },
    { value: counts.live, label: 'products.kpi.live', sub: t(d, 'products.kpi.liveSub', { n: num(counts.ready) }), tone: 'ok' },
    { value: counts.lowStockSizes, label: 'products.kpi.lowStock', sub: t(d, 'products.kpi.lowStockSub', { n: num(lowPieces) }), tone: 'warn' },
    { value: counts.needPhotos, label: 'products.kpi.needPhotos', sub: t(d, 'products.kpi.needPhotosSub', { n: num(photoMin) }), tone: 'warn' },
  ];
  const canWrite = c.can('catalogue.write');

  return (
    <AdminFrame view={view} current={KEY}>
      <div className="ad-hd pa-hd">
        <div className="pa-hd-text">
          <div className="ad-eyebrow">{t(d, 'products.eyebrow')}</div>
          <h1 className="ad-h1">{t(d, 'products.title')}</h1>
          <p className="ad-intro">{t(d, 'products.intro')}</p>
        </div>
        {canWrite ? (
          <Link className="ad-btn ad-btn-primary pa-hd-btn" href={`${PRODUCTS_HOME}/new`}>
            <Icon name="plus" size={18} />
            {t(d, 'products.newProduct')}
          </Link>
        ) : null}
      </div>
      <div className="pa-gtabs">
        <SystemTabs view={view} current={KEY} group="catalogue" />
      </div>

      <div className="pa-kpis">
        {kpis.map((k) => (
          <div key={k.label} className="pa-kpi">
            <div className={`pa-kpi-v${k.tone ? ` ${k.tone}` : ''}`}>{num(k.value)}</div>
            <div className="pa-kpi-l">{t(d, k.label)}</div>
            <div className="pa-kpi-s">{k.sub}</div>
          </div>
        ))}
      </div>

      <form className="pa-sbar" role="search" action={PRODUCTS_HOME} method="get">
        <label className="pa-search">
          <span className="pa-vh">{t(d, 'products.search.label')}</span>
          <Icon name="search" size={18} />
          <input className="ad-input" type="search" name="q" defaultValue={q ?? ''} placeholder={t(d, 'products.search.placeholder')} maxLength={100} />
        </label>
        {status ? <input type="hidden" name="status" value={status} /> : null}
        {categoryId ? <input type="hidden" name="category" value={categoryId} /> : null}
        <button type="submit" className="ad-btn ad-btn-ghost ad-btn-sm">
          {t(d, 'products.search.submit')}
        </button>
      </form>

      <nav className="ad-tabs" aria-label={t(d, 'products.filters.label')}>
        <Link className="ad-chip" href={href({ status: undefined, page: 1 })} aria-current={!status ? 'page' : undefined}>
          {t(d, 'products.filters.all')}
        </Link>
        {ADMIN_STATUS_FILTERS.map((s) => (
          <Link key={s} className="ad-chip" href={href({ status: s, page: 1 })} aria-current={status === s ? 'page' : undefined}>
            {t(d, `products.filters.${s}`)}
          </Link>
        ))}
      </nav>
      {list.categories.length ? (
        <nav className="ad-tabs" aria-label={t(d, 'products.cats.label')}>
          <Link className="ad-chip" href={href({ category: undefined, page: 1 })} aria-current={!categoryId ? 'page' : undefined}>
            {t(d, 'products.cats.all', { n: num(counts.products) })}
          </Link>
          {list.categories.map((cat) => (
            <Link key={cat.id} className="ad-chip" href={href({ category: cat.id, page: 1 })} aria-current={categoryId === cat.id ? 'page' : undefined}>
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
        canPublish={c.can('catalogue.publish')}
        emptyText={t(d, q || status || categoryId ? 'products.empty' : 'products.emptyAll')}
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
    </AdminFrame>
  );
}

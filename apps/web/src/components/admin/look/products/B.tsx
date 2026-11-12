// PR 657 (CN-025, CN-044 ERP lane, follow-up 382) — Products design B, "Focus view": "Ready to publish" as one big
// hero (the queue that most needs a person, with its own button), the same four summary tiles, search and category
// chips design A already has, and the same table and bulk bar. Every figure comes from the one loader
// (`loadProductList`, `@/lib/admin-products`); this design reads nothing design A does not already read and writes
// nothing (a read-only re-arrangement, CN-044).
import Link from 'next/link';
import { ProductsHeader, ProductListBody } from '@/components/admin/products/ProductListPage';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { formatNumber } from '@/components/admin/products/model';
import { loadProductList, productsHref } from '@/lib/admin-products';
import { t } from '@/lib/i18n';
import { LookThumb } from '../thumbs';
import type { LookDesign } from '../types';
import type { ProductsDesignProps } from './common';

function Hero({ p, ready, needPhotos }: { p: ProductsDesignProps; ready: number; needPhotos: number }) {
  const { view, query } = p;
  const d = view.dict;
  return (
    <section className="a3-card a3-phero" data-testid="products-hero">
      <div>
        <p className="a3-sub">{t(d, 'products.filters.ready')}</p>
        <b className="a3-num a3-phn">{formatNumber(ready, view.locale)}</b>
        <p className="a3-sub">{t(d, 'products.kpi.needPhotosSub', { n: formatNumber(needPhotos, view.locale) })}</p>
      </div>
      {ready ? (
        <Link className="a3-btn pri" href={productsHref(query, { status: 'ready', page: 1 })} data-testid="products-hero-go">
          <ShellIcon name="check" size={16} />
          <span>{t(d, 'products.filters.ready')}</span>
        </Link>
      ) : (
        <span className="a3-pill ok">
          <ShellIcon name="check" size={13} />
          {t(d, 'products.kpi.productsSub', { n: formatNumber(0, view.locale) })}
        </span>
      )}
    </section>
  );
}

async function ProductsB(p: ProductsDesignProps) {
  const { view, c, query, menu } = p;
  const data = await loadProductList(c, view.locale, query);
  const canWrite = c.can('catalogue.write');
  const canPublish = c.can('catalogue.publish');
  return (
    <div className="a2-z" data-testid="products-list" data-design="B" data-lm-ready="">
      <ProductsHeader view={view} canWrite={canWrite} menu={menu} />
      <Hero p={p} ready={data.list.counts.ready} needPhotos={data.list.counts.needPhotos} />
      <ProductListBody view={view} query={query} data={data} canWrite={canWrite} canPublish={canPublish} />
    </div>
  );
}

function ThumbB() {
  return <LookThumb page="products" id="B" />;
}

export const productsB: LookDesign<ProductsDesignProps, 'list'> = {
  key: 'B',
  name: { en: 'Focus view', bn: 'ফোকাস ভিউ' },
  desc: {
    en: '"Ready to publish" as one big number with its own button. The same tiles, search, categories and table as the classic list.',
    bn: '"প্রকাশের জন্য প্রস্তুত" এক বড় সংখ্যা, নিজের বোতামসহ। টাইলস, সার্চ, ক্যাটাগরি আর টেবিল ক্লাসিক তালিকার মতোই।',
  },
  parts: ['list'],
  Render: ProductsB,
  Thumb: ThumbB,
};

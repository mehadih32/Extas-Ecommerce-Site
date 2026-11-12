// PR 657 (CN-025, CN-044 ERP lane, follow-up 382) — Products design C, "Command view": a flow strip over the catalogue's
// own counts (live, ready to publish, needs photos, low stock) as clickable counts, the same summary tiles, search and
// category chips design A already has, and the table in a denser row height (CSS only). Every figure comes from the
// one loader (`loadProductList`, `@/lib/admin-products`); this design reads nothing design A does not already read and
// writes nothing (a read-only re-arrangement, CN-044).
import Link from 'next/link';
import { ProductsHeader, ProductListBody } from '@/components/admin/products/ProductListPage';
import { formatNumber } from '@/components/admin/products/model';
import { loadProductList, productsHref, type ProductListData } from '@/lib/admin-products';
import { t } from '@/lib/i18n';
import { LookThumb } from '../thumbs';
import type { LookDesign } from '../types';
import type { ProductsDesignProps } from './common';

const FLOW: readonly { key: string; status?: 'live' | 'ready'; label: string; count: (c: ProductListData['list']['counts']) => number }[] = [
  { key: 'live', status: 'live', label: 'products.filters.live', count: (c) => c.live },
  { key: 'ready', status: 'ready', label: 'products.filters.ready', count: (c) => c.ready },
  { key: 'needPhotos', label: 'products.kpi.needPhotos', count: (c) => c.needPhotos },
  { key: 'lowStock', label: 'products.kpi.lowStock', count: (c) => c.lowStockSizes },
];

function FlowStrip({ p, data }: { p: ProductsDesignProps; data: ProductListData }) {
  const { view, query } = p;
  const d = view.dict;
  return (
    <section className="a3-card a3-pflow" data-testid="products-flow">
      {FLOW.map((f) => (
        <Link key={f.key} className="a3-fstep" href={f.status ? productsHref(query, { status: f.status, page: 1 }) : `/admin/products/audit?check=${f.key === 'needPhotos' ? 'photos' : f.key}`}>
          <b>{formatNumber(f.count(data.list.counts), view.locale)}</b>
          <span>{t(d, f.label)}</span>
        </Link>
      ))}
    </section>
  );
}

async function ProductsC(p: ProductsDesignProps) {
  const { view, c, query, menu } = p;
  const data = await loadProductList(c, view.locale, query);
  const canWrite = c.can('catalogue.write');
  const canPublish = c.can('catalogue.publish');
  return (
    <div className="a2-z" data-testid="products-list" data-design="C" data-lm-ready="">
      <ProductsHeader view={view} canWrite={canWrite} menu={menu} />
      <FlowStrip p={p} data={data} />
      <div className="a3-pdense">
        <ProductListBody view={view} query={query} data={data} canWrite={canWrite} canPublish={canPublish} />
      </div>
    </div>
  );
}

function ThumbC() {
  return <LookThumb page="products" id="C" />;
}

export const productsC: LookDesign<ProductsDesignProps, 'list'> = {
  key: 'C',
  name: { en: 'Command view', bn: 'কমান্ড ভিউ' },
  desc: {
    en: 'A flow strip over live, ready to publish, needs photos and low stock, then the same list in a denser row height.',
    bn: 'লাইভ, প্রকাশের জন্য প্রস্তুত, ছবি লাগবে আর কম স্টক — এক সারিতে; তারপর একই তালিকা একটু ঘন করে।',
  },
  parts: ['list'],
  Render: ProductsC,
  Thumb: ThumbC,
};

// PR 831 (admin prototype v5, Products › one product): the line under the name (style code · category · status · where it
// came from), the three buttons (All products, Edit step by step, View on shop) and the "Sales · 30 days" card.
// Drawn on the server; read only. "View on shop" shows only for a product that is on the shop.
import Link from 'next/link';
import type { ProductSales30 } from '@extas/catalogue';
import { t, type Dict } from '@/lib/i18n';

export interface ProductHeadV5Props {
  dict: Dict;
  id: string;
  code: string | null;
  category: string | null;
  status: string;
  /** The shop path of the product, e.g. /products/navy-polo. */
  path: string;
  listHref: string;
  sales: ProductSales30 | null;
  money: (minor: number) => string;
  num: (n: number) => string;
}

export function ProductHeadV5(p: ProductHeadV5Props) {
  const d = p.dict;
  const meta = [p.code, p.category, t(d, `products.status.${p.status}`), p.code ? t(d, 'products.v5.fromErp') : t(d, 'products.v5.byHand')].filter(Boolean);
  const s = p.sales;
  const tiles: [string, string][] = s
    ? [
        ['sold', p.num(s.sold)],
        ['revenue', p.money(s.revenueMinor)],
        ['views', p.num(s.views)],
        ['rating', s.rating == null ? '—' : `${s.rating.toFixed(1)}★`],
      ]
    : [];
  return (
    <>
      <div className="pv5-meta" data-testid="product-meta">
        <span className="ad-mini">{meta.join(' · ')}</span>
        <div className="pv5-btns">
          <Link className="a2-btn" href={p.listHref} data-testid="product-all">
            {t(d, 'products.v5.all')}
          </Link>
          <Link className="a2-btn" href={`/admin/products/${p.id}?wizard=2`} data-testid="product-steps">
            {t(d, 'products.v5.steps')}
          </Link>
          {p.status === 'PUBLISHED' ? (
            <a className="a2-btn" href={p.path} target="_blank" rel="noreferrer" data-testid="product-view">
              {t(d, 'products.v5.view')}
            </a>
          ) : null}
        </div>
      </div>
      {s ? (
        <section className="ad-card pv5-sales" aria-label={t(d, 'products.v5.sales.h')} data-testid="product-sales">
          <h2>{t(d, 'products.v5.sales.h')}</h2>
          <div className="pv5-kpis">
            {tiles.map(([k, v]) => (
              <div key={k} className="pv5-kpi" data-testid={`product-sales-${k}`}>
                <span className="ad-mini">{t(d, `products.v5.sales.${k}`)}</span>
                <b>{v}</b>
                {k === 'rating' ? <span className="ad-mini">{t(d, 'products.v5.sales.reviews', { n: p.num(s.reviews) })}</span> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

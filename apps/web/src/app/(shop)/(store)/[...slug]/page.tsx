// Any shop address no page of its own answers. PR 49: an address under the owner's product prefix
// (`naming.productPathPrefix`, `/p/<product>` or `/p/<product>/<colour>`) is the product page; the prefix is a setting,
// so it cannot be a folder of its own. CN-010 (owner): a page a later PR builds (search, account, help …; the list is
// the routing table's COMING_SOON) shows "Coming soon" inside the store shell; every other address gets the shop's
// own "page not found". ~~Every unknown address: notFound().~~ The words are the dictionary's.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/shop/Icon';
import { ProductPage, productMetadata, type ProductSearch } from '@/components/shop/product/ProductPage';
import { shopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { shopMetadata } from '@/lib/shop/meta';
import { productRoute } from '@/lib/shop/product-model';
import { comingSoon, ROUTES } from '@/lib/shop/routes';

type Props = { searchParams: Promise<ProductSearch> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const c = await shopContext();
  if (productRoute(c.path, c.s['naming.productPathPrefix'])) return productMetadata(c, await props.searchParams);
  const key = comingSoon(c.path, c.s['naming.productPathPrefix']);
  if (!key) return {};
  return { ...(await shopMetadata(c, `soon-${key}`, c.t('soon.title'))), robots: { index: false, follow: true } };
}

export default async function Soon(props: Props) {
  const c = await shopContext();
  if (productRoute(c.path, c.s['naming.productPathPrefix'])) return <ProductPage search={await props.searchParams} />;
  const key = comingSoon(c.path, c.s['naming.productPathPrefix']);
  if (!key) notFound();
  const t = c.t;
  return (
    <div className="container co-wrap">
      <div className="card center co-empty" data-testid="soon" data-soon={key}>
        <div className="bg-emptyic">
          <Icon name="clock" size={32} />
        </div>
        <h1 className="h1 mt16">{t('soon.title')}</h1>
        <p className="text2">{t('soon.text')}</p>
        <div className="row wrap mt16" style={{ justifyContent: 'center', gap: 10 }}>
          <a className="btn btn-primary" href={hrefIn(c.lang, ROUTES.home)}>
            {t('soon.home')}
          </a>
        </div>
      </div>
    </div>
  );
}

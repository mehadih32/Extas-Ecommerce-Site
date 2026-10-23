// Any shop address no page of its own answers. PR 49: an address under the owner's product prefix
// (`naming.productPathPrefix`, `/p/<product>` or `/p/<product>/<colour>`) is the product page; the prefix is a setting,
// so it cannot be a folder of its own. CN-010 (owner): a page a later PR builds (search, account, help …; the list is
// the routing table's COMING_SOON) shows "Coming soon" inside the store shell; every other address gets the shop's
// own "page not found". ~~Every unknown address: notFound().~~ The words are the dictionary's.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ComingSoon } from '@/components/shop/ComingSoon';
import { ProductPage, productMetadata, type ProductSearch } from '@/components/shop/product/ProductPage';
import { shopContext } from '@/lib/shop/context';
import { shopMetadata } from '@/lib/shop/meta';
import { productRoute } from '@/lib/shop/product-model';
import { comingSoon } from '@/lib/shop/routes';

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
  return <ComingSoon c={c} soonKey={key} />;
}

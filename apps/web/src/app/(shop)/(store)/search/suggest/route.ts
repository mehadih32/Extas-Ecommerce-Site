// PR 72 — the live suggestions of the search panel (demo 07-help-search.js hs_suggestHTML, D-014 dsk_srchBody):
// `GET /search/suggest?q=…` (and `/bn/search/suggest`, the words in Bengali) answers with the help pages that answer the
// words, the matching categories, the first products with their picture and price, and how many products the results
// page will list. Only what a customer may buy now is offered (lib/shop/catalogue sellableIds, the results page's rule).
// Never cached and never indexed: it is an answer to one shopper's typing.
import { photoFor, categoriesByIds, liveCardsByIds, productName, sellableIds } from '@/lib/shop/catalogue';
import { readPageSettings, shopContext } from '@/lib/shop/context';
import { HELP_ICON } from '@/lib/shop/help-pages';
import { productPath } from '@/lib/shop/home-model';
import { hrefIn } from '@/lib/shop/lang';
import { ROUTES } from '@/lib/shop/routes';
import { runSearch } from '@/lib/shop/search';
import { queryFrom, searchHref, type SuggestAnswer } from '@/lib/shop/search-model';
import { categoryName } from '@/lib/shop/shell-model';

export const dynamic = 'force-dynamic';

const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };

export async function GET(req: Request): Promise<Response> {
  const c = await shopContext();
  const q = queryFrom(Object.fromEntries(new URL(req.url).searchParams));
  const empty: SuggestAnswer = { q, help: [], categories: [], products: [], total: 0, rest: null, all: searchHref(c.lang, q) };
  if (!q) return Response.json(empty, { headers: HEADERS });
  const [out, page] = await Promise.all([runSearch(c, q, { helpMax: (p) => p.help }), readPageSettings(['category.page'] as const, c.storeId)]);
  if (out.unavailable) return Response.json({ ...empty, failed: true }, { headers: HEADERS });
  const n = Math.max(out.panel.phoneProducts, out.panel.desktopProducts);
  const ids = await sellableIds(c.storeId, out.products, page['category.page'].soldOut === 'hide');
  const [cards, cats] = await Promise.all([liveCardsByIds(c.storeId, ids.slice(0, n)), categoriesByIds(c.storeId, out.categories.slice(0, out.panel.categories))]);
  const prefix = c.s['naming.productPathPrefix'];
  const body: SuggestAnswer = {
    ...empty,
    help: out.help.map((h) => ({ ...h, icon: HELP_ICON[h.slug] })),
    categories: cats.map((k) => ({ name: categoryName(k, c.lang), href: hrefIn(c.lang, ROUTES.category(k.slug)) })),
    products: cards
      .filter((k) => k.priceMinor != null)
      .map((k) => {
        const colour = k.colours[0];
        const price = c.money(k.priceMinor!);
        return {
          id: k.id,
          name: productName(k, c.lang),
          href: hrefIn(c.lang, productPath(prefix, k.slug)),
          price,
          was: k.wasMinor != null && k.wasMinor > k.priceMinor! ? c.money(k.wasMinor) : null,
          garment: k.garment,
          hex: colour?.hex ?? '',
          photo: photoFor(k, colour?.key),
        };
      }),
    total: ids.length,
    rest: out.rest,
  };
  return Response.json(body, { headers: HEADERS });
}

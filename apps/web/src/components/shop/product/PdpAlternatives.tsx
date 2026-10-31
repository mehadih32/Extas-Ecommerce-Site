// S11 · PR 527 — "Available now" on a product page that cannot be bought (sold out, taken off or archived): the products
// of its category that can be bought now (the owner's order, pinned first), else the shop's best-ranked ones that are
// in stock, at most `seo.urlPolicy.alternativesMax`. The same sliding row as the rows under every product page (PR 67),
// so the phone sees what it already knows. Nothing is drawn when nothing can be bought.
import { pickAlternatives } from '@/lib/seo/url-policy';
import { heroCategoryCards, newestCards, type ShopCard } from '@/lib/shop/catalogue';
import type { ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { ROUTES } from '@/lib/shop/routes';
import { ProductCard } from '../ProductCard';
import { SmoothRow } from '../SmoothRow';

export async function PdpAlternatives({
  c,
  productId,
  category,
  max,
  speed,
}: {
  c: ShopContext;
  productId: string;
  category: { slug: string; name: string } | null;
  max: number;
  speed: number;
}) {
  const [own, shop] = await Promise.all([
    category ? heroCategoryCards(c.storeId, [category.slug], max + 1, true).then((l) => l[0] ?? []) : Promise.resolve([] as ShopCard[]),
    newestCards(c.storeId, max * 3 + 1, 'rank'),
  ]);
  const cards = pickAlternatives(own, shop, productId, max);
  if (!cards.length) return null;
  const more = category && own.some((x) => x.id !== productId) ? category : null;
  return (
    <section className="section" id="pdp-alt" data-testid="pdp-alternatives">
      <div className="container">
        <div className="pdp-rowblk">
          <div className="sec-hd">
            <h2 className="h2">{more ? c.t('reach.alt.titleOf', { category: more.name }) : c.t('reach.alt.title')}</h2>
            <a className="link" href={hrefIn(c.lang, more ? ROUTES.category(more.slug) : ROUTES.newIn)}>
              {c.t('rows.seeAll')}
            </a>
          </div>
          <SmoothRow id="sl-alt" className="pdp-slide pdp-prow-s" engine={c.s['slider.engine']} speed={speed} fitCards>
            {cards.map((card) => (
              <ProductCard key={card.id} card={card} c={c} />
            ))}
          </SmoothRow>
        </div>
      </div>
    </section>
  );
}

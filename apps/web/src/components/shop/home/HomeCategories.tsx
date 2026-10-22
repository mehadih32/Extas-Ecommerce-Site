// PR 41 — "Shop by category" (demo 20-home.js hm_cats): one tile per visible category that has a product, in the
// catalogue's own order — the picture of its first product (the owner's order), its name and how many styles. A new
// category joins with no edit; an empty or hidden one stays out. Settings: `home.categories` (most tiles, "Shop all").
import type { ShopCard } from '@/lib/shop/catalogue';
import { photoFor } from '@/lib/shop/catalogue';
import type { ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { ROUTES } from '@/lib/shop/routes';
import { categoryName } from '@/lib/shop/shell-model';
import { ProductPicture } from '../ProductPicture';
import { SecHd } from './SecHd';

export function HomeCategories({ c, leads }: { c: ShopContext; leads: Record<string, ShopCard> }) {
  const set = c.s['home.categories'];
  const tiles = c.cats.filter((k) => k.count > 0 && leads[k.slug]).slice(0, set.max);
  if (!tiles.length) return null;
  return (
    <section className="section">
      <div className="container">
        <SecHd title={c.t('home.shopByCategory')} href={hrefIn(c.lang, set.href)} more={c.t('home.shopAll')} />
        <div className="grid g6">
          {tiles.map((k) => {
            const p = leads[k.slug]!;
            const colour = p.colours[0];
            const name = categoryName(k, c.lang);
            return (
              <a key={k.slug} className="hm-cat" href={hrefIn(c.lang, ROUTES.category(k.slug))}>
                <ProductPicture
                  garment={p.garment ?? k.garment}
                  hex={colour?.hex ?? ''}
                  photo={photoFor(p, colour?.key)}
                  ratio="ratio-34"
                  alt={name}
                  lang={c.lang}
                  sizes="(max-width: 767px) 33vw, 200px"
                />
                <div className="hm-cat-name">{name}</div>
                <div className="xs muted">{k.count === 1 ? c.t('nav.style') : c.t('nav.styles', { n: c.num(k.count) })}</div>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}

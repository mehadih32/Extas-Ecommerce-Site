// The home address. Until the home page (PR 41: hero, categories, new in, sets, flash sale, reviews, journal) is
// built, it shows the store shell with one sliding row: the live categories, on the one slider engine (PR 42). The
// progress page stays at /status.
import type { Metadata } from 'next';
import { GarmentIcon, Icon } from '@/components/shop/Icon';
import { SmoothRow } from '@/components/shop/SmoothRow';
import { shopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { shopMetadata } from '@/lib/shop/meta';
import { ROUTES } from '@/lib/shop/routes';
import { categoryName } from '@/lib/shop/shell-model';

export async function generateMetadata(): Promise<Metadata> {
  return shopMetadata(await shopContext(), 'home', null);
}

export default async function Home() {
  const c = await shopContext();
  const cats = c.cats.filter((k) => k.count > 0);
  if (!cats.length) return null;
  return (
    <section className="shop-sec">
      <div className="container">
        <div className="sec-hd">
          <div>
            <h2 className="h2">{c.t('home.shopByCategory')}</h2>
          </div>
          <a className="hm-more" href={hrefIn(c.lang, ROUTES.newIn)}>
            {c.t('home.shopAll')}
            <Icon name="right" size={14} />
          </a>
        </div>
        <SmoothRow id="hm-catrow" className="shop-row" engine={c.s['slider.engine']}>
          {cats.map((k) => (
            <a key={k.slug} className="chip" href={hrefIn(c.lang, ROUTES.category(k.slug))}>
              <GarmentIcon garment={k.garment} size={16} />
              <span>{categoryName(k, c.lang)}</span>
              <span className="chip-n">{c.num(k.count)}</span>
            </a>
          ))}
        </SmoothRow>
      </div>
    </section>
  );
}

// S11 · PR 527 — a collection that was on the shop and is now archived answers with this page (200), never
// "page not found": its name, an honest line, the way on (its parent collection while that is live, "New in"), the live
// collections as chips and what can be bought now (the shop's best-ranked in-stock styles, `seo.urlPolicy.alternativesMax`).
// Its links are always followed; whether it stays listed is `seo.urlPolicy.retiredIndexed` (lib/seo/url-policy).
import { newestCards } from '@/lib/shop/catalogue';
import type { ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { ROUTES } from '@/lib/shop/routes';
import { categoryName } from '@/lib/shop/shell-model';
import { pickAlternatives, type RestingCategory } from '@/lib/seo/url-policy';
import { ProductCard } from '../ProductCard';

export async function CatResting({ c, cat, max }: { c: ShopContext; cat: RestingCategory; max: number }) {
  const t = c.t;
  const cards = pickAlternatives([], await newestCards(c.storeId, max * 3, 'rank'), '', max);
  const live = c.cats.filter((x) => x.count > 0 && x.slug !== cat.slug);
  return (
    <div className="container" data-testid="cat-resting">
      <div className="cat-hd">
        <nav className="crumbs" aria-label={t('cat.breadcrumb')}>
          <a href={hrefIn(c.lang, ROUTES.home)}>{t('cat.home')}</a>
          <span aria-hidden="true">/</span>
          {cat.parent ? (
            <>
              <a href={hrefIn(c.lang, ROUTES.category(cat.parent.slug))}>{categoryName(cat.parent, c.lang)}</a>
              <span aria-hidden="true">/</span>
            </>
          ) : null}
          <span aria-current="page">{categoryName(cat, c.lang)}</span>
        </nav>
        <h1 className="h1">{t('reach.rest.title', { name: categoryName(cat, c.lang) })}</h1>
        <p className="text2">{t('reach.rest.text')}</p>
        <div className="row wrap mt16" style={{ gap: 8 }}>
          {cat.parent ? (
            <a className="btn btn-primary" href={hrefIn(c.lang, ROUTES.category(cat.parent.slug))} data-testid="cat-resting-parent">
              {t('reach.rest.parent', { name: categoryName(cat.parent, c.lang) })}
            </a>
          ) : null}
          <a className={`btn ${cat.parent ? 'btn-ghost' : 'btn-primary'}`} href={hrefIn(c.lang, ROUTES.newIn)}>
            {t('cat.seeNewIn')}
          </a>
        </div>
      </div>
      {live.length ? (
        <nav className="mt24" aria-label={t('reach.rest.collections')}>
          <h2 className="h2">{t('reach.rest.collections')}</h2>
          <div className="row wrap mt8" style={{ gap: 8 }}>
            {live.map((x) => (
              <a key={x.slug} className="chip" href={hrefIn(c.lang, ROUTES.category(x.slug))}>
                {categoryName(x, c.lang)}
              </a>
            ))}
          </div>
        </nav>
      ) : null}
      {cards.length ? (
        <section className="mt24" data-testid="cat-resting-alt">
          <h2 className="h2">{t('reach.alt.title')}</h2>
          <div className="grid g4 mt8">
            {cards.map((card) => (
              <ProductCard key={card.id} card={card} c={c} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

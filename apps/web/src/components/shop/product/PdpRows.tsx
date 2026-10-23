// PR 67 — the rows at the foot of the product page (demo 30-product.js pdp_pairsSection / pdp_recentSection, owner
// review P5): on a phone "Wear it with · <category>" and "You may also like · <category>", each a sliding row on the
// one slider engine (PR 42) with its "See all"; on a computer one slider of them together. Then "Recently viewed": the
// products this phone opened before, a sliding row on a phone, and on a computer a grid of 4 that is never empty and
// changes page by itself (RecentGrid). Categories, counts and titles come from the `pdp.rows` setting (lib/shop/pdp-rows).
import type { PdpRowsSettings } from '@extas/settings';
import { heroCategoryCards, liveCardsByIds, newestCards, type ShopCard } from '@/lib/shop/catalogue';
import type { ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { garmentGroup, mergeRows, pairCategories, recentPool } from '@/lib/shop/pdp-rows';
import { ROUTES } from '@/lib/shop/routes';
import { categoryName, type ShopCategory } from '@/lib/shop/shell-model';
import { ProductCard } from '../ProductCard';
import { SmoothRow } from '../SmoothRow';
import { RecentGrid } from './RecentGrid';

const DESK_COLS = 4;

interface Row {
  slug: string;
  title: string;
  cards: ShopCard[];
}

function findCat(cats: readonly ShopCategory[], slug: string): { slug: string; nameEn: string; nameBn: string | null; count: number } | null {
  for (const c of cats) {
    if (c.slug === slug) return c;
    const kid = c.children.find((k) => k.slug === slug);
    if (kid) return kid;
  }
  return null;
}

function RowBlock({ c, row, id, cls, speed }: { c: ShopContext; row: Row; id: string; cls: string; speed: number }) {
  return (
    <div className={`pdp-rowblk ${cls}`}>
      <div className="sec-hd">
        <h2 className="h2">{row.title}</h2>
        <a className="link" href={hrefIn(c.lang, ROUTES.category(row.slug))}>
          {c.t('rows.seeAll')}
        </a>
      </div>
      <SmoothRow id={`sl-${id}`} className="pdp-slide pdp-prow-s" engine={c.s['slider.engine']} speed={speed} fitCards>
        {row.cards.map((card) => (
          <ProductCard key={card.id} card={card} c={c} />
        ))}
      </SmoothRow>
    </div>
  );
}

export async function PdpRows({
  c,
  set,
  product,
  diagramFor,
  recentIds,
}: {
  c: ShopContext;
  set: PdpRowsSettings;
  product: { id: string; categorySlug: string | null; garment: string | null };
  diagramFor: Readonly<Record<string, string>>;
  recentIds: readonly string[];
}) {
  const t = c.t;
  const count = (slug: string) => findCat(c.cats, slug)?.count ?? 0;
  const own = { slug: product.categorySlug, group: garmentGroup(product.garment, diagramFor, set.groupOf) };
  const slugs = set.pairs ? pairCategories(set, own, count) : [];
  const wantRecent = set.recent ? recentIds.filter((id) => id !== product.id).slice(0, set.recentMax) : [];
  const [lists, recent] = await Promise.all([
    slugs.length ? heroCategoryCards(c.storeId, slugs, set.perRow + 1, set.inStockOnly) : Promise.resolve([] as ShopCard[][]),
    wantRecent.length ? liveCardsByIds(c.storeId, wantRecent) : Promise.resolve([] as ShopCard[]),
  ]);
  const lead = set.pairTitle?.[c.lang] || t('rows.pair');
  const rows: Row[] = slugs
    .map((slug, i) => {
      const cat = findCat(c.cats, slug);
      const name = cat ? categoryName(cat, c.lang) : slug;
      const cards = (lists[i] ?? []).filter((x) => x.id !== product.id).slice(0, set.perRow);
      return { slug, title: t('rows.titleOf', { lead: i === 0 ? lead : t('rows.also'), category: name }), cards };
    })
    .filter((r) => r.cards.length);
  const one = set.deskStyle === 'one' && rows.length > 0;
  const merged = one ? mergeRows(rows.map((r) => r.cards), set.deskMax, product.id) : [];

  // the desktop grid: never empty — the recently viewed first, then similar styles that are not in the rows above
  let grid: { list: ShopCard[]; kind: 'recent' | 'mix' | 'fill' } | null = null;
  if (set.recent && set.deskGrid) {
    const fill = [
      ...(product.categorySlug ? ((await heroCategoryCards(c.storeId, [product.categorySlug], DESK_COLS * 3 + 1, set.inStockOnly))[0] ?? []) : []),
      ...(await newestCards(c.storeId, DESK_COLS * 3 + 1, 'rank')),
    ];
    const skip = [product.id, ...rows.flatMap((r) => r.cards.map((x) => x.id))];
    grid = recentPool(recent, fill, skip, DESK_COLS);
    if (!grid.list.length) grid = null;
  }
  const recentTitle = { recent: t('rows.recent'), mix: t('rows.recentMix'), fill: t('rows.recentFill') };

  if (!rows.length && !recent.length && !grid) return null;
  return (
    <>
      {rows.length ? (
        <section className="section" id="pdp-pairs" data-testid="pdp-pairs">
          <div className="container">
            {rows.map((r, i) => (
              <RowBlock key={r.slug} c={c} row={r} id={`pairs-row-${i + 1}`} cls={one ? 'hide-d' : ''} speed={set.pairSpeed} />
            ))}
            {one && merged.length ? (
              <RowBlock c={c} row={{ slug: rows[0]!.slug, title: lead, cards: merged }} id="pairs-row-d1" cls="hide-m dkb-row" speed={set.pairSpeed} />
            ) : null}
          </div>
        </section>
      ) : null}
      {recent.length ? (
        <section className={`section${grid ? ' hide-d' : ''}`} id="pdp-recent" data-testid="pdp-recent">
          <div className="container">
            <div className="sec-hd">
              <h2 className="h2">{t('rows.recent')}</h2>
            </div>
            <SmoothRow id="sl-recent" className="pdp-rv pdp-slide" engine={c.s['slider.engine']} speed={set.recentSpeed} fitCards>
              {recent.map((card) => (
                <ProductCard key={card.id} card={card} c={c} />
              ))}
            </SmoothRow>
          </div>
        </section>
      ) : null}
      {grid ? (
        <section className="section hide-m ob-rv" data-testid="recent-grid">
          <div className="container">
            <RecentGrid
              title={recentTitle[grid.kind]}
              cols={DESK_COLS}
              everyMs={set.swapSec * 1000}
              engine={c.s['slider.engine']}
            >
              {grid.list.map((card) => (
                <ProductCard key={card.id} card={card} c={c} />
              ))}
            </RecentGrid>
          </div>
        </section>
      ) : null}
    </>
  );
}

// PR 73 — the search results page, /search?q=… (demo 21-category.js PAGES.search, with 07-help-search.js's help block
// and D-016's filters): the breadcrumb, "Results for “…”" with what was found, the box again (with live suggestions);
// on top the help pages that answer the words ("Help & policies", `search.results.help`) and the matching categories;
// then the products with the category page's own filters, sort, cards and "Show more" (components/shop/category/
// CatListing — the same address words, so a filtered search can be shared), in the search's order ("Best match").
// Only products a customer can buy now are listed (lib/shop/catalogue searchListing), whatever the index still holds.
// Nothing found is said honestly: "No results for …", the nearest word the shop knows, what part of the words finds,
// the owner's popular words or the categories, WhatsApp, and the newest styles — never labelled "popular" (the shop
// has no such figures yet). A search page is never a page for search engines (noindex, follow).
import type { Metadata } from 'next';
import { cache } from 'react';
import { CatListing, type ListingRow } from '@/components/shop/category/CatListing';
import { Icon, WaGlyph } from '@/components/shop/Icon';
import { ProductCard } from '@/components/shop/ProductCard';
import { SearchForm } from '@/components/shop/search/SearchForm';
import { categoriesByIds, liveCardsByIds, newestCards, searchListing, type ShopCard } from '@/lib/shop/catalogue';
import { parseState, placeSoldOut, type CatState, type SearchParams } from '@/lib/shop/category-model';
import { readPageSettings, shopContext, type ShopContext } from '@/lib/shop/context';
import { HELP_ICON } from '@/lib/shop/help-pages';
import { hrefIn } from '@/lib/shop/lang';
import { waHref } from '@/lib/shop/links';
import { shopMetadata } from '@/lib/shop/meta';
import { ROUTES } from '@/lib/shop/routes';
import { runSearch } from '@/lib/shop/search';
import { queryFrom, searchChips, searchHref, searchPanelProps, type SearchChip } from '@/lib/shop/search-model';
import { categoryName } from '@/lib/shop/shell-model';
import '../collections/[slug]/category.css';
import '@/components/shop/search/search.css';

const KEYS = ['category.page', 'category.filters', 'category.toolbar', 'category.sort', 'search.results', 'search.panel'] as const;

type Props = { searchParams: Promise<SearchParams> };

const settingsFor = cache((storeId: number) => readPageSettings(KEYS, storeId));
const searchOnce = cache((c: ShopContext, q: string) => runSearch(c, q, { helpMax: (_, r) => r.help }));

export async function generateMetadata(props: Props): Promise<Metadata> {
  const [c, sp] = await Promise.all([shopContext(), props.searchParams]);
  const q = queryFrom(sp);
  // a search is an answer to one shopper's words, not a page of its own for search engines (Blueprint C12; PR 220:
  // the `search` kind is off in `seo.indexing` by default)
  return shopMetadata(c, 'search', q ? c.t('search.metaQ', { q }) : c.t('search.crumb'));
}

function Chips({ list, icon, testId }: { list: readonly SearchChip[]; icon?: boolean; testId?: string }) {
  return (
    <div className="srch-chips" data-testid={testId}>
      {list.map((k) => (
        <a key={k.href} className="chip" href={k.href}>
          {icon ? <Icon name="search" size={14} /> : null}
          {k.text}
        </a>
      ))}
    </div>
  );
}

function Cards({ c, cards, testId }: { c: ShopContext; cards: readonly ShopCard[]; testId: string }) {
  return (
    <div className="grid g4" data-testid={testId}>
      {cards.map((card) => (
        <ProductCard key={card.id} card={card} c={c} />
      ))}
    </div>
  );
}

export default async function SearchPage(props: Props) {
  const [c, sp] = await Promise.all([shopContext(), props.searchParams]);
  const t = c.t;
  const q = queryFrom(sp);
  const set = await settingsFor(c.storeId);
  const pg = set['category.page'];
  const res = set['search.results'];
  const sorts = set['category.sort'].options;
  const defaultSort = sorts[0]!;
  const asked = parseState(sp, sorts);
  const out = await searchOnce(c, q);
  const [listing, cats] = await Promise.all([
    out.products.length ? searchListing(c.storeId, out.products, asked.sort === 'top') : null,
    res.categories > 0 ? categoriesByIds(c.storeId, out.categories.slice(0, res.categories)) : [],
  ]);
  const unavailable = out.unavailable || Boolean(listing?.unavailable);
  const rows: ListingRow[] = listing
    ? placeSoldOut(
        listing.items.map((item, i) => ({ card: listing.cards[i]!, item, inStock: item.inStock })),
        pg.soldOut === 'hide' ? 'hide' : 'show',
      )
    : [];
  const plural = (count: number, one: string, many: string) => (count === 1 ? t(one) : t(many, { n: c.num(count) }));
  const panel = searchPanelProps(c, set['search.panel']);
  const chips = searchChips(c.lang, set['search.panel'].popular, c.cats);

  // ---- the header: breadcrumb, title, what was found, the box ----
  const helpWhat = out.helpCount ? plural(out.helpCount, 'search.helpOne', 'search.helpMany') : null;
  let prodWhat = rows.length ? plural(rows.length, 'cat.product', 'cat.products') : null;
  if (prodWhat && out.rest) prodWhat = t('search.foundFor', { what: prodWhat, q: out.rest });
  const parts = [helpWhat, prodWhat].filter((x): x is string => Boolean(x));
  const found = !parts.length ? null : out.rest ? parts.join(' · ') : t('search.found', { what: parts.join(' · ') });
  const hd = (
    <div className="cat-hd">
      <nav className="crumbs" aria-label={t('cat.breadcrumb')}>
        <a href={hrefIn(c.lang, ROUTES.home)}>{t('cat.home')}</a>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{t('search.crumb')}</span>
      </nav>
      <h1 className="h1">{q ? t('search.titleQ', { q }) : t('search.titleEmpty', c.vars)}</h1>
      {q && found && !unavailable ? (
        <p className="text2" data-testid="search-count">
          {found}
        </p>
      ) : null}
      <SearchForm q={q} p={panel} />
    </div>
  );

  // ---- help pages and categories on top ----
  const help = out.help.length ? (
    <section className="hs-block mt24" data-testid="search-help" aria-labelledby="hs-h">
      <div className="sec-hd">
        <h2 className="h2" id="hs-h">
          {t('search.helpTitle')}
        </h2>
      </div>
      <div className="hs-cards">
        {out.help.map((h) => (
          <a key={h.slug} className="hs-item hs-card" href={h.href} data-testid={`help-${h.slug}`}>
            <span className="hs-ic">
              <Icon name={HELP_ICON[h.slug]} size={18} />
            </span>
            <span className="hs-tx">
              <b>{h.title}</b>
              {h.answer ? <span className="hs-ans">{h.answer}</span> : null}
            </span>
            <span className="hs-go" aria-hidden="true">
              <Icon name="right" size={16} />
            </span>
          </a>
        ))}
      </div>
    </section>
  ) : null;
  const catRow = cats.length ? (
    <div className="srch-cats mt16" data-testid="search-categories">
      <span className="small muted srch-cats-h">{t('search.categories')}</span>
      {cats.map((k) => (
        <a key={k.slug} className="chip" href={hrefIn(c.lang, ROUTES.category(k.slug))}>
          {categoryName(k, c.lang)}
        </a>
      ))}
    </div>
  ) : null;

  // ---- the products, with the category page's filters and sort ----
  if (q && rows.length && !unavailable) {
    const hrefFor = (s: CatState) => searchHref(c.lang, q, { s, defaultSort });
    return (
      <div className="container">
        {hd}
        {help}
        {catRow}
        {help ? (
          <div className="sec-hd mt24">
            <h2 className="h2">{out.rest ? t('search.productsFor', { q: out.rest }) : t('search.products')}</h2>
          </div>
        ) : null}
        {out.dropped.length ? <p className="small text2 srch-note">{t('search.dropped', { words: out.dropped.join(' ') })}</p> : null}
        <div className="srch-layout">
          <CatListing
            c={c}
            scope="search"
            rows={rows}
            asked={asked}
            set={{ page: pg, filters: set['category.filters'], toolbar: set['category.toolbar'], sort: set['category.sort'] }}
            sizes={listing!.sizes}
            withPhotos={listing!.withPhotos}
            hrefFor={hrefFor}
            version={(s) => `${q}|${hrefFor(s)}`}
            waName={q}
            sortWords={{ rec: t('search.bestMatch') }}
            gridId="search-grid"
          />
        </div>
      </div>
    );
  }

  // ---- nothing (yet) to list: say so, and offer every way on ----
  const wa = res.whatsapp && c.flags.whatsapp ? waHref(c.s['contact.whatsapp'], t('search.waMessage', { ...c.vars, q: q || t('search.waSomething') })) : null;
  const partial = !unavailable && res.partial && out.partial ? out.partial : null;
  const [partialCards, picks] = await Promise.all([
    partial ? liveCardsByIds(c.storeId, partial.products.slice(0, pg.pageSize)).then((l) => l.filter((k) => k.priceMinor != null)) : [],
    res.picks > 0 ? newestCards(c.storeId, res.picks, 'newest') : [],
  ]);
  const dym = !unavailable && res.didYouMean && out.suggestion && out.suggestion !== q ? out.suggestion : null;
  const [dymBefore, dymAfter] = t('search.didYouMean').split('{word}');
  const own = chips.popular;
  const browse = chips.categories;
  // a help page answered: the page is not "no results" (demo: "never 'No results'"), the answers above are the result
  const box =
    help && q ? null : (
      <div className="srch-empty mt24" data-testid="search-empty">
        <span className="srch-empty-ico">
          <Icon name="search" size={26} />
        </span>
        <div className="h2 mt16">{unavailable ? t('search.unavailable') : q ? t('search.noneTitle', { q }) : t('search.emptyTitle')}</div>
        {dym ? (
          <p className="srch-dym mt8" data-testid="search-dym">
            {dymBefore}
            <a href={searchHref(c.lang, dym)}>{dym}</a>
            {dymAfter}
          </p>
        ) : null}
        <p className="text2 small mt8" style={{ marginBottom: 18 }}>
          {unavailable ? t('search.unavailableText') : own.length ? t(q ? 'search.noneText' : 'search.emptyText') : t(q ? 'search.noneTextBrowse' : 'search.emptyTextBrowse')}
        </p>
        {own.length && !unavailable ? <Chips list={own} icon testId="search-popular" /> : null}
        {browse.length ? (
          <>
            {own.length && !unavailable ? (
              <div className="small muted mt24" style={{ marginBottom: 10 }}>
                {t('search.browse')}
              </div>
            ) : null}
            <Chips list={browse} testId="search-browse" />
          </>
        ) : null}
        {wa ? (
          <div className="mt24">
            <a className="wa-btn" href={wa} target="_blank" rel="noopener" data-testid="search-wa">
              <WaGlyph size={18} />
              {t('search.wa')}
            </a>
          </div>
        ) : null}
      </div>
    );
  return (
    <div className="container">
      {hd}
      {help}
      {catRow}
      {box}
      {partialCards.length ? (
        <section className="section" data-testid="search-partial">
          <div className="sec-hd">
            <h2 className="h2">{t('search.partial', { words: partial!.words.join(', ') })}</h2>
          </div>
          <Cards c={c} cards={partialCards} testId="search-partial-grid" />
        </section>
      ) : picks.length ? (
        <section className="section" data-testid="search-picks">
          <div className="sec-hd">
            <h2 className="h2">{t('search.picksTitle')}</h2>
            <a className="hm-more" href={hrefIn(c.lang, ROUTES.newIn)}>
              {t('search.viewAll')}
              <Icon name="right" size={14} />
            </a>
          </div>
          <Cards c={c} cards={picks} testId="search-picks-grid" />
        </section>
      ) : null}
    </div>
  );
}

// PR 45–48 — the category page, /collections/<slug> and the "New in" page (demo 21-category.js PAGES.category):
// - PR 45: the breadcrumb (`category.page.breadcrumb`), the title with the number of styles and the category's own
//   line, the grid of cards in the owner's order, "Showing 12 of 30" and "Show more" (`category.page.pageSize`), the
//   owner's text block for Google (`category.seo`) and the questions (`category.faqOwn` first, then `category.faq`,
//   each shop-wide one only while what it promises is on);
// - PR 46: the filters built from the category's own products with live counts (`category.filters`), the desktop rail,
//   the phone's Filter sheet and quick chips (`category.toolbar`);
// - PR 47: the sort control, a real listbox (`category.sort`);
// - PR 48: the phone's Filter · Sort · On sale row stays stuck under the header, its badge counting the filters on, and
//   the desktop keeps the active filters as removable chips over the grid.
// What the shopper chose lives in the address (lib/shop/category-model), so the server draws exactly that page and a
// filtered page can be shared; such a page stays out of search engines (its clean address is the canonical one).
// - S02 · PR 76: the heading, the listing, the text with the questions and More collections come in the owner's order
//   and on his screens (`layout.category`, Website › Page layouts; the heading and the listing always show).
// S11 · PR 527: a collection archived after it had products on the shop answers with its resting page
// (components/shop/category/CatResting, `seo.urlPolicy.retiredCategoryPage`), never "page not found".
// S11 · PR 227: a filter page the owner named (`seo.filterPages`) is the one exception to "a filtered page stays out":
// listed under its own name and address while it shows enough styles (lib/seo/filter-pages).
// S11 · PR 226: each category's own content block (its heading and text under the grid, `category.seo`, PR 45/227)
// and its questions; the questions the page shows also go as FAQ data while `seo.structuredData.faq` is on (PR 224,
// optional, off as shipped).
// S11 · PR 231: "More collections" under the page — its sub-collections or sisters, then the other main collections,
// as plain links (lib/seo/internal-links, `seo.internalLinks`, off as shipped).
// S12 · PR 246: a link no category answers at may be a seasonal page's (components/shop/seasonal/SeasonalPage,
// `marketing.seasonal`, off as shipped): the page while it is live, its resting page once it was live and is down.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache, type ReactNode } from 'react';
import { AddedSlot, closeHrefOf } from '@/components/shop/bag/AddedSlot';
import { CardDeskMount } from '@/components/shop/CardDeskMount';
import { CatFaq, CatSeoText } from '@/components/shop/category/CatInfo';
import { CatListing, type ListingRow } from '@/components/shop/category/CatListing';
import { CatResting } from '@/components/shop/category/CatResting';
import { SeasonalPage } from '@/components/shop/seasonal/SeasonalPage';
import { JsonLd } from '@/components/shop/JsonLd';
import { categoryData, productName, type ShopCard } from '@/lib/shop/catalogue';
import { isRefined, paragraphs, parseState, placeSoldOut, queryOf, type CatState, type SearchParams } from '@/lib/shop/category-model';
import { readPageSettings, shopContext, type ShopContext } from '@/lib/shop/context';
import { productPath } from '@/lib/shop/home-model';
import { hrefIn } from '@/lib/shop/lang';
import { categoryDraftTexts } from '@/lib/seo/page-texts';
import { restingCategory } from '@/lib/seo/url-policy';
import { filterPageListed, filterPagePath, filterPageStyles, namedFilterPage, singleFilter } from '@/lib/seo/filter-pages';
import { shopMetadata, shopOrigin } from '@/lib/shop/meta';
import { getPrisma } from '@extas/db/client';
import { servedSeasonal } from '@/lib/marketing/seasonal';
import { ROUTES } from '@/lib/shop/routes';
import { categoryName, requirementsMet } from '@/lib/shop/shell-model';
import { relatedCollections } from '@/lib/seo/internal-links';
import { breadcrumbLd, faqLd, itemListLd, type LdCrumb, type LdQuestion } from '@/lib/shop/structured-data';
import { LayoutPart } from '@/components/shop/LayoutPart';
import { blockContent, blocksOf, categoryRows, pageItems } from '@/lib/shop/blocks';
import { PageBlock } from '@/components/shop/blocks/PageBlock';
import type { CategorySectionId } from '@extas/settings';
import './category.css';

const KEYS = ['marketing.seasonal', 'layout.category', 'layout.categoryOwn', 'layout.blocks', 'category.page', 'category.filters', 'category.toolbar', 'category.sort', 'category.newIn', 'category.faq', 'category.faqOwn', 'category.seo', 'seo.structuredData', 'seo.urlPolicy', 'seo.filterPages', 'seo.internalLinks'] as const;

/** The "New in" page's own link name, from the routing table (`/collections/new-in`). */
const NEW_IN = ROUTES.newIn.split('/').pop()!;

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> };

const settingsFor = cache((storeId: number) => readPageSettings(KEYS, storeId));

const load = cache(async (storeId: number, slug: string, topRated: boolean) => {
  const set = await settingsFor(storeId);
  const n = set['category.newIn'];
  return categoryData(storeId, slug, { slug: NEW_IN, order: n.order, days: n.days, ratings: topRated });
});

async function page(props: Props) {
  const [c, { slug }, sp] = await Promise.all([shopContext(), props.params, props.searchParams]);
  const set = await settingsFor(c.storeId);
  const sorts = set['category.sort'].options;
  const state = parseState(sp, sorts);
  const data = await load(c.storeId, slug, state.sort === 'top');
  return { c, slug, set, state, data, defaultSort: sorts[0]! };
}

/** PR 246: the seasonal page at this link (switch on; live, or resting once it was live), else null. */
const seasonalFor = cache(async (storeId: number, slug: string, set: Awaited<ReturnType<typeof settingsFor>>['marketing.seasonal']) => {
  if (!set.enabled || !process.env.DATABASE_URL) return null;
  try {
    return await servedSeasonal(getPrisma(), storeId, slug, set);
  } catch {
    return null;
  }
});

/** PR 527: the collection's resting page when it has none of its own (switch on, a past on the shop), else null. */
const restingFor = cache(async (storeId: number, slug: string, on: boolean) => (on ? restingCategory(storeId, slug) : null));

function titleOf(c: ShopContext, data: NonNullable<Awaited<ReturnType<typeof page>>['data']>): string {
  return data.head ? categoryName(data.head, c.lang) : c.t('cat.newIn');
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { c, slug, set, state, data, defaultSort } = await page(props);
  if (!data) {
    const sea = await seasonalFor(c.storeId, slug, set['marketing.seasonal']);
    if (sea) return shopMetadata(c, `collections/${slug}`, (c.lang === 'bn' && sea.page.titleBn) || sea.page.titleEn, { index: sea.serve === 'live' || set['seo.urlPolicy'].retiredIndexed });
    const rest = await restingFor(c.storeId, slug, set['seo.urlPolicy'].retiredCategoryPage);
    return rest ? shopMetadata(c, `collections/${slug}`, categoryName(rest, c.lang), { index: set['seo.urlPolicy'].retiredIndexed }) : {};
  }
  const seo = set['category.seo']?.[slug];
  const name = titleOf(c, data);
  // PR 221: the owner's own words first, then an AI draft someone accepted, then the category template (`seo.titles`)
  const draft = data.head?.id ? await categoryDraftTexts(c.storeId, data.head.id, c.lang) : null;
  const shown = set['category.page'].soldOut === 'hide' ? data.items.filter((i) => i.inStock).length : data.items.length;
  const count = shown === 1 ? c.t('cat.style') : c.t('cat.styles', { n: c.num(shown) });
  const intro = (data.head ? (c.lang === 'bn' && data.head.introBn) || data.head.introEn : c.t('cat.newInBlurb')) || '';
  // PR 227: a filter page the owner named (`seo.filterPages`: one size, colour or fit) is a page of its own while it
  // shows enough styles, with its own name and address
  const named = data.unavailable ? null : namedFilterPage(set['seo.filterPages'], slug, singleFilter(state, defaultSort));
  if (named) {
    const styles = filterPageStyles(data.items, state, set['category.page'].soldOut === 'hide');
    const label = named.label[c.lang] || named.label.en;
    return shopMetadata(c, `collections/${slug}`, label, {
      path: filterPagePath(named),
      index: filterPageListed(set['seo.filterPages'], styles),
      seo: { kind: 'category', tokens: { name: label, count: styles ? (styles === 1 ? c.t('cat.style') : c.t('cat.styles', { n: c.num(styles) })) : '', intro: intro.replace(/\s+/g, ' ').trim() } },
    });
  }
  // a filtered, sorted or later page, or one the catalogue could not fill, is not a page of its own for search engines
  // (PR 220: its clean address is the canonical one)
  return shopMetadata(c, `collections/${slug}`, name, {
    index: !(data.unavailable || isRefined(state, defaultSort)),
    seo: {
      kind: 'category',
      tokens: { name, count: shown ? count : '', intro: intro.replace(/\s+/g, ' ').trim() },
      own: { title: seo?.title?.[c.lang] ?? draft?.title, description: seo?.meta?.[c.lang] ?? draft?.description },
    },
  });
}

export default async function CategoryPage(props: Props) {
  const [{ c, slug, set, state: asked, data, defaultSort }, sp] = await Promise.all([page(props), props.searchParams]);
  if (!data) {
    const sea = await seasonalFor(c.storeId, slug, set['marketing.seasonal']);
    if (sea) return <SeasonalPage c={c} served={sea} set={set['marketing.seasonal']} />;
    const rest = await restingFor(c.storeId, slug, set['seo.urlPolicy'].retiredCategoryPage);
    if (!rest) notFound();
    return <CatResting c={c} cat={rest} max={set['seo.urlPolicy'].alternativesMax} />;
  }
  const t = c.t;
  const pg = set['category.page'];
  const name = titleOf(c, data);
  // PR 227: a filter page the owner named carries its own name as the heading (the breadcrumb keeps the collection)
  const named = data.unavailable ? null : namedFilterPage(set['seo.filterPages'], slug, singleFilter(asked, defaultSort));
  const heading = named ? named.label[c.lang] || named.label.en : name;
  const basePath = hrefIn(c.lang, `/collections/${slug}`);

  // sold-out styles left out altogether are not counted anywhere on the page
  const rows: ListingRow[] = placeSoldOut(
    data.items.map((item, i) => ({ card: data.cards[i]!, item, inStock: item.inStock })),
    pg.soldOut === 'hide' ? 'hide' : 'show',
  );
  const plural = (count: number, one: string, many: string) => (count === 1 ? t(one) : t(many, { n: c.num(count) }));
  const empty = rows.length === 0;

  // ---- the header: breadcrumb, title, count and the category's own line ----
  const blurb = data.head ? (c.lang === 'bn' && data.head.introBn) || data.head.introEn : t('cat.newInBlurb');
  const parent = data.head?.parent;
  const hd = (
    <div className="cat-hd">
      {pg.breadcrumb ? (
        <nav className="crumbs" aria-label={t('cat.breadcrumb')}>
          <a href={hrefIn(c.lang, ROUTES.home)}>{t('cat.home')}</a>
          <span aria-hidden="true">/</span>
          {parent ? (
            <>
              <a href={hrefIn(c.lang, ROUTES.category(parent.slug))}>{categoryName(parent, c.lang)}</a>
              <span aria-hidden="true">/</span>
            </>
          ) : null}
          <span aria-current="page">{name}</span>
        </nav>
      ) : null}
      <h1 className="h1">{heading}</h1>
      <p className="text2">{[empty ? null : plural(rows.length, 'cat.style', 'cat.styles'), blurb?.trim() || null].filter(Boolean).join(' · ')}</p>
    </div>
  );

  // ---- follow-up 35 · the same trail and the grid's products for search engines (sent even with the trail hidden) ----
  const sd = set['seo.structuredData'];
  const here = await shopOrigin();
  const crumbs: LdCrumb[] = [
    { name: t('cat.home'), href: hrefIn(c.lang, ROUTES.home) },
    ...(parent ? [{ name: categoryName(parent, c.lang), href: hrefIn(c.lang, ROUTES.category(parent.slug)) }] : []),
    { name, href: basePath },
  ];
  const ldOf = (cards: readonly ShopCard[], questions: readonly LdQuestion[] = []) =>
    here ? (
      <JsonLd
        data={[
          sd.breadcrumbs ? breadcrumbLd(here, crumbs) : null,
          sd.itemList ? itemListLd(here, name, cards.map((k) => ({ name: productName(k, c.lang), href: hrefIn(c.lang, productPath(c.s['naming.productPathPrefix'], k.slug)) }))) : null,
          sd.faq ? faqLd(here, basePath, questions) : null,
        ]}
      />
    ) : null;

  if (data.unavailable || empty) {
    const seeNew = data.unavailable ? null : slug !== NEW_IN ? hrefIn(c.lang, ROUTES.newIn) : null;
    return (
      <div className="container">
        {hd}
        {ldOf([])}
        <div className="grid g4">
          <div className="cat-empty" data-testid="cat-empty">
            <div className="h2">{t(data.unavailable ? 'cat.unavailable' : 'cat.noneYet')}</div>
            <p className="muted small mt8">{t(data.unavailable ? 'cat.unavailableText' : seeNew ? 'cat.noneYetText' : 'cat.noneYetSoon')}</p>
            {seeNew ? (
              <div className="row wrap mt16" style={{ justifyContent: 'center' }}>
                <a className="btn btn-primary" href={seeNew}>
                  {t('cat.seeNewIn')}
                </a>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  // ---- PR 45 · the owner's text and the questions ----
  const seo = set['category.seo']?.[slug];
  const text = paragraphs(seo?.text?.[c.lang]);
  const own = (set['category.faqOwn']?.[slug] ?? []).filter((q) => q.on).map((q) => ({ id: `o-${q.id}`, q: q.q[c.lang], a: paragraphs(q.a[c.lang]) }));
  const general = set['category.faq'].general
    .filter((q) => q.on && requirementsMet(q.requires, c.flags))
    .map((q) => ({ id: `g-${q.id}`, q: t.label(q.q, c.vars), a: paragraphs(t.label(q.a, c.vars)) }));
  const faq = [...own, ...general];
  // PR 226: exactly the questions this block shows, each answer as its paragraphs
  const faqItems: LdQuestion[] = faq.map((x) => ({ question: x.q, answer: x.a.join('\n') }));
  const info =
    text.length || faq.length ? (
      <section className={`cat-info${text.length && faq.length ? '' : ' cat-info-one'}`}>
        {text.length ? (
          <div>
            <h2 className="h2">{seo?.heading?.[c.lang] ?? t('cat.seoHeading', { name })}</h2>
            <CatSeoText paras={text} more={t('cat.readMore')} less={t('cat.readLess')} />
          </div>
        ) : null}
        {faq.length ? (
          <div>
            <h2 className="h2">{t('cat.questions')}</h2>
            <CatFaq items={faq} openFirst={set['category.faq'].openFirst} />
          </div>
        ) : null}
      </section>
    ) : null;

  // ---- PR 231 · "More collections" (plain links a shopper and a search engine follow) ----
  const links = set['seo.internalLinks'];
  const related = links.relatedCollections ? relatedCollections(c.cats, slug, links.max) : [];
  const more = related.length ? (
    <nav className="cat-rel" aria-label={t('cat.related')} data-testid="cat-related">
      <h2 className="h3">{t('cat.related')}</h2>
      <div className="cat-rel-links">
        {related.map((x) => (
          <a key={x.slug} className="cat-rel-a" href={hrefIn(c.lang, ROUTES.category(x.slug))}>
            {categoryName(x, c.lang)}
          </a>
        ))}
      </div>
    </nav>
  ) : null;

  // S02 · PR 76: the sections in the owner's order and on his screens (Website › Page layouts, `layout.category`)
  const listing = (
    <CatListing
        c={c}
        scope={slug}
        rows={rows}
        asked={asked}
        set={{ page: pg, filters: set['category.filters'], toolbar: set['category.toolbar'], sort: set['category.sort'] }}
        sizes={data.sizes}
        withPhotos={data.withPhotos}
        hrefFor={(st: CatState) => `${basePath}${queryOf(st, defaultSort)}`}
        version={(st: CatState) => queryOf(st, defaultSort)}
        waName={name}
        after={(shown) => ldOf(shown, faqItems)}
      />
  );
  const parts: Record<CategorySectionId, ReactNode> = { head: hd, listing, info, related: more };
  // ~~shownSections('category', set['layout.category'])~~ PR 595: this category's own order while it has one, with the
  // owner's sections for every category page and for this one in between, on their days and screens
  const items = pageItems('category', categoryRows(set['layout.categoryOwn'], slug, set['layout.category']), blocksOf(set['layout.blocks'], 'category', slug), c.today);
  const got = await blockContent(c, items);
  return (
    <div className="container">
      {items.map((it) =>
        it.kind === 'sec' ? (
          <LayoutPart key={it.row.id} id={it.row.id} dev={it.row.dev ?? 'both'}>
            {parts[it.row.id as CategorySectionId]}
          </LayoutPart>
        ) : (
          <LayoutPart key={`lb-${it.block.id}`} id={`lb-${it.block.id}`} dev={it.block.dev}>
            <PageBlock c={c} block={it.block} got={got.get(it.block.id) ?? { kind: 'none' }} bare />
          </LayoutPart>
        ),
      )}
      {/* follow-up 21: the cards' back view and Quick add (computer with a mouse), and the panel it opens */}
      <CardDeskMount c={c} />
      <AddedSlot c={c} added={sp.added} closeHref={closeHrefOf(basePath, sp)} />
    </div>
  );
}

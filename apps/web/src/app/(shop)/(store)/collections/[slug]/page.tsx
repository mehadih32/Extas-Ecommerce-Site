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
// S11 · PR 527: a collection archived after it had products on the shop answers with its resting page
// (components/shop/category/CatResting, `seo.urlPolicy.retiredCategoryPage`), never "page not found".
// S11 · PR 227: a filter page the owner named (`seo.filterPages`) is the one exception to "a filtered page stays out":
// listed under its own name and address while it shows enough styles (lib/seo/filter-pages).
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { AddedSlot, closeHrefOf } from '@/components/shop/bag/AddedSlot';
import { CardDeskMount } from '@/components/shop/CardDeskMount';
import { CatFaq, CatSeoText } from '@/components/shop/category/CatInfo';
import { CatListing, type ListingRow } from '@/components/shop/category/CatListing';
import { CatResting } from '@/components/shop/category/CatResting';
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
import { ROUTES } from '@/lib/shop/routes';
import { categoryName, requirementsMet } from '@/lib/shop/shell-model';
import { breadcrumbLd, itemListLd, type LdCrumb } from '@/lib/shop/structured-data';
import './category.css';

const KEYS = ['category.page', 'category.filters', 'category.toolbar', 'category.sort', 'category.newIn', 'category.faq', 'category.faqOwn', 'category.seo', 'seo.structuredData', 'seo.urlPolicy', 'seo.filterPages'] as const;

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

/** PR 527: the collection's resting page when it has none of its own (switch on, a past on the shop), else null. */
const restingFor = cache(async (storeId: number, slug: string, on: boolean) => (on ? restingCategory(storeId, slug) : null));

function titleOf(c: ShopContext, data: NonNullable<Awaited<ReturnType<typeof page>>['data']>): string {
  return data.head ? categoryName(data.head, c.lang) : c.t('cat.newIn');
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { c, slug, set, state, data, defaultSort } = await page(props);
  if (!data) {
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
  const ldOf = (cards: readonly ShopCard[]) =>
    here ? (
      <JsonLd
        data={[
          sd.breadcrumbs ? breadcrumbLd(here, crumbs) : null,
          sd.itemList ? itemListLd(here, name, cards.map((k) => ({ name: productName(k, c.lang), href: hrefIn(c.lang, productPath(c.s['naming.productPathPrefix'], k.slug)) }))) : null,
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

  return (
    <div className="container">
      {hd}
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
        after={(shown) => ldOf(shown)}
      />
      {info}
      {/* follow-up 21: the cards' back view and Quick add (computer with a mouse), and the panel it opens */}
      <CardDeskMount c={c} />
      <AddedSlot c={c} added={sp.added} closeHref={closeHrefOf(basePath, sp)} />
    </div>
  );
}

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
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { CatEffects } from '@/components/shop/category/CatEffects';
import { CatFilters } from '@/components/shop/category/CatFilters';
import { CatFaq, CatSeoText } from '@/components/shop/category/CatInfo';
import { CatSheet } from '@/components/shop/category/CatSheet';
import { CatSort } from '@/components/shop/category/CatSort';
import { Icon, WaGlyph } from '@/components/shop/Icon';
import { ProductCard } from '@/components/shop/ProductCard';
import { categoryData, colourName, type ShopCard, type ShopColour } from '@/lib/shop/catalogue';
import { chipList, chipTests, cutsFor, facets, filterItems, toolbarFor, type ChipView } from '@/lib/shop/category-filter';
import {
  activeCount,
  cleared,
  isRefined,
  pageCut,
  paragraphs,
  parseState,
  placeSoldOut,
  queryOf,
  shownShare,
  toggled,
  type Band,
  type CatItem,
  type CatState,
  type FlagGroup,
  type ListGroup,
  type SearchParams,
} from '@/lib/shop/category-model';
import { sortItems, sortOptions } from '@/lib/shop/category-sort';
import { readPageSettings, shopContext, type ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { waHref } from '@/lib/shop/links';
import { shopMetadata } from '@/lib/shop/meta';
import { ROUTES } from '@/lib/shop/routes';
import { categoryName, requirementsMet } from '@/lib/shop/shell-model';
import './category.css';

const KEYS = ['category.page', 'category.filters', 'category.toolbar', 'category.sort', 'category.newIn', 'category.faq', 'category.faqOwn', 'category.seo'] as const;

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

function titleOf(c: ShopContext, data: NonNullable<Awaited<ReturnType<typeof page>>['data']>): string {
  return data.head ? categoryName(data.head, c.lang) : c.t('cat.newIn');
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { c, slug, set, state, data, defaultSort } = await page(props);
  if (!data) return {};
  const seo = set['category.seo']?.[slug];
  const name = titleOf(c, data);
  const m = await shopMetadata(c, `collections/${slug}`, seo?.title?.[c.lang] ?? name);
  if (seo?.meta) m.description = seo.meta[c.lang];
  // a filtered, sorted or later page, or one the catalogue could not fill, is not a page of its own for search engines
  if (data.unavailable || isRefined(state, defaultSort)) m.robots = { index: false, follow: true };
  return m;
}

interface Row {
  card: ShopCard;
  item: CatItem;
}

export default async function CategoryPage(props: Props) {
  const { c, slug, set, state: asked, data, defaultSort } = await page(props);
  if (!data) notFound();
  const t = c.t;
  const pg = set['category.page'];
  const fs = set['category.filters'];
  const tb = set['category.toolbar'];
  const name = titleOf(c, data);
  const basePath = hrefIn(c.lang, `/collections/${slug}`);

  // sold-out styles left out altogether are not counted anywhere on the page
  const rows: Row[] = placeSoldOut(
    data.items.map((item, i) => ({ card: data.cards[i]!, item, inStock: item.inStock })),
    pg.soldOut === 'hide' ? 'hide' : 'show',
  );
  const items = rows.map((r) => r.item);
  const ctx = { cuts: cutsFor(slug, items, fs), chipTests: chipTests(tb) };
  // a band that no longer exists (the prices moved, the owner set his own cuts) must not filter the grid unseen
  const state: CatState = { ...asked, prices: ctx.cuts.length === 2 ? asked.prices : [] };
  const hrefFor = (s: CatState) => `${basePath}${queryOf(s, defaultSort)}`;
  const href = (group: ListGroup | FlagGroup, value?: string) => hrefFor(toggled(state, group, value));
  const clearHref = hrefFor(cleared(state));
  const n = activeCount(state);

  const pass = new Set(filterItems(items, state, ctx).map((p) => p.id));
  const byId = new Map(rows.map((r) => [r.item.id, r]));
  const ordered = placeSoldOut(sortItems(items.filter((p) => pass.has(p.id)), state.sort), pg.soldOut === 'last' ? 'last' : 'show');
  const cut = pageCut(ordered, state.page, pg.pageSize);
  const shown = await data.withPhotos(cut.shown.map((p) => byId.get(p.id)!.card));

  // words
  const money = c.money;
  const bare = (m: number) => money(m).replace(/^[^\d০-৯]+/, '');
  const band = (b: string) =>
    b === 'lo' ? t('cat.under', { a: money(ctx.cuts[0]!) }) : b === 'mid' ? t('cat.between', { a: money(ctx.cuts[0]!), b: bare(ctx.cuts[1]!) }) : t('cat.over', { a: money(ctx.cuts[1]!) });
  const colours = new Map<string, ShopColour>();
  for (const r of rows) for (const k of r.card.colours) if (!colours.has(k.key)) colours.set(k.key, k);
  const colourWords = (key: string) => {
    const k = colours.get(key);
    return { name: k ? colourName(k, c.lang) : key, hex: k?.hex ?? 'transparent' };
  };
  const sizeLabel = (key: string) => data.sizes.get(key)?.label ?? key;
  const plural = (count: number, one: string, many: string) => (count === 1 ? t(one) : t(many, { n: c.num(count) }));

  const f = facets(items, state, ctx, fs, data.sizes);
  const filterPanel = (loc: 'd' | 'm') => <CatFilters c={c} f={f} loc={loc} set={fs} href={href} sizes={data.sizes} words={{ colour: colourWords, band }} />;
  const sortChoices = sortOptions(set['category.sort']).map((o) => ({
    id: o.id,
    text: t.label(o.label),
    href: hrefFor({ ...state, sort: o.id, page: 1 }),
    on: o.id === state.sort,
  }));
  const sortLabel = t('cat.sortBy');
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
      <h1 className="h1">{name}</h1>
      <p className="text2">{[empty ? null : plural(rows.length, 'cat.style', 'cat.styles'), blurb?.trim() || null].filter(Boolean).join(' · ')}</p>
    </div>
  );

  if (data.unavailable || empty) {
    const seeNew = data.unavailable ? null : slug !== NEW_IN ? hrefIn(c.lang, ROUTES.newIn) : null;
    return (
      <div className="container">
        {hd}
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

  // ---- PR 46 / 48 · the phone's top row, the quick chips, the desktop's active filters ----
  const bar = toolbarFor(tb, slug);
  const chipWords = {
    sale: t('cat.onSale'),
    stock: t('cat.inStockChip'),
    band: (b: Band) => band(b),
    under: (m: number) => t('cat.under', { a: money(m) }),
    over: (m: number) => t('cat.over', { a: money(m) }),
    colour: (k: string) => colourWords(k).name,
    size: (k: string) => t('cat.sizeChip', { size: sizeLabel(k) }),
  };
  const chips: ChipView[] = chipList(tb, slug, items, state, ctx, chipWords);
  const chipText = (l: ChipView['label']) => ('text' in l ? l.text : t.label(l));
  const inChips = new Set(chips.map((ch) => `${ch.group}:${ch.value ?? ''}`));
  // sizes and colours ticked in the sheet show in the row too, one tap to take off (unless a chip already shows them)
  const removable = [
    ...state.sizes.filter((v) => !inChips.has(`sizes:${v}`)).map((v) => ({ group: 'sizes' as const, v, label: t('cat.sizeChip', { size: sizeLabel(v) }) })),
    ...state.colours.filter((v) => !inChips.has(`colours:${v}`)).map((v) => ({ group: 'colours' as const, v, label: colourWords(v).name })),
  ];
  const saleCount = f.sale.count;
  const top = bar.topOn
    ? bar.items.filter((it) => it.id !== 'sort' || sortChoices.length > 1).map((it) => {
        if (it.id === 'filter')
          return (
            <CatSheet
              key="filter"
              label={t.label(it.label, {}, 'cat.filter')}
              title={t('cat.filter')}
              closeLabel={t('cat.close')}
              count={n ? c.num(n) : null}
              clear={{ label: t('cat.clearAll'), href: clearHref, disabled: n === 0 }}
              show={ordered.length === 1 ? t('cat.showOne') : ordered.length ? t('cat.show', { n: c.num(ordered.length) }) : t('cat.showNone')}
            >
              {filterPanel('m')}
            </CatSheet>
          );
        if (it.id === 'sort') return <CatSort key="sort" loc="p" label={t.label(it.label, {}, 'cat.sortBy')} choices={sortChoices} />;
        return (
          <button
            key="sale"
            type="button"
            className={`btn btn-ghost cat-salebtn${state.sale ? ' on' : ''}`}
            aria-pressed={state.sale}
            data-href={href('sale')}
            data-fk="p-sale"
            data-testid="cat-sale-btn"
            disabled={!saleCount && !state.sale}
          >
            <Icon name="tag" size={17} />
            <span className="cat-tl">{t.label(it.label, {}, 'cat.onSale')}</span>
            {saleCount ? <span className="cat-count">{c.num(saleCount)}</span> : null}
          </button>
        );
      })
    : [];
  const chipRow =
    chips.length || removable.length ? (
      <div className="cat-chiprow cat-ph" role="group" aria-label={t('cat.quick')}>
        {removable.map((r) => (
          <button key={`x-${r.group}-${r.v}`} type="button" className="chip on" data-href={href(r.group, r.v)} aria-label={t('cat.remove', { name: r.label })}>
            {r.label}
            <Icon name="close" size={13} />
          </button>
        ))}
        {chips.map((ch) => (
          <button
            key={ch.key}
            type="button"
            className={`chip${ch.on ? ' on' : ''}`}
            aria-pressed={ch.on}
            data-href={href(ch.group, ch.value)}
            data-fk={`c-${ch.key}`}
          >
            {ch.on ? <Icon name="check" size={14} /> : null}
            {chipText(ch.label)}
          </button>
        ))}
      </div>
    ) : null;

  const actives: Array<{ group: ListGroup | FlagGroup; v?: string; label: string }> = [
    ...state.sizes.map((v) => ({ group: 'sizes' as const, v, label: t('cat.sizeChip', { size: sizeLabel(v) }) })),
    ...state.colours.map((v) => ({ group: 'colours' as const, v, label: colourWords(v).name })),
    ...state.fits.map((v) => ({ group: 'fits' as const, v, label: v })),
    ...state.prices.map((v) => ({ group: 'prices' as const, v, label: band(v) })),
    ...state.chips.map((v) => ({ group: 'chips' as const, v, label: chipText(chips.find((ch) => ch.group === 'chips' && ch.value === v)?.label ?? { text: v }) })),
    ...(state.sale ? [{ group: 'sale' as const, label: t('cat.onSale') }] : []),
    ...(state.stock ? [{ group: 'stock' as const, label: t('cat.inStock') }] : []),
  ];
  const activeRow = actives.length ? (
    <div className="cat-actives cat-dt">
      {actives.map((a) => (
        <button key={`${a.group}-${a.v ?? ''}`} type="button" className="cat-x" data-href={href(a.group, a.v)} aria-label={t('cat.remove', { name: a.label })}>
          {a.label}
          <Icon name="close" size={13} />
        </button>
      ))}
      <button type="button" className="link" data-href={clearHref}>
        {t('cat.clearAll')}
      </button>
    </div>
  ) : null;

  // ---- PR 45 · the grid, "Showing … of …", "Show more" ----
  const pick = (card: ShopCard) => (state.colours.length ? card.colours.find((k) => state.colours.includes(k.key))?.key : undefined);
  const wa = c.flags.whatsapp ? waHref(c.s['contact.whatsapp'], t('cat.waMessage', { ...c.vars, name })) : null;
  const grid = shown.length ? (
    <div className="grid g4" data-testid="cat-grid">
      {shown.map((card, i) => (
        <ProductCard key={card.id} card={card} c={c} colour={pick(card)} priority={i < 2} />
      ))}
    </div>
  ) : (
    <div className="grid g4">
      <div className="cat-empty" data-testid="cat-empty">
        <div className="h2">{t('cat.emptyTitle')}</div>
        <p className="muted small mt8">{t('cat.emptyText')}</p>
        <div className="row wrap mt16" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn btn-primary" data-href={clearHref}>
            {t('cat.clearFilters')}
          </button>
          {wa ? (
            <a className="wa-btn" href={wa} target="_blank" rel="noopener">
              <WaGlyph size={18} />
              {t('cat.askWa')}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
  const more =
    pg.progress || cut.next || ordered.length < rows.length ? (
      <div className="cat-more" data-testid="cat-more">
        {pg.progress ? (
          <>
            <div className="small text2">{t('cat.showing', { shown: c.num(cut.shown.length), total: c.num(rows.length) })}</div>
            <div className="bar-progress">
              <div style={{ width: `${shownShare(cut.shown.length, rows.length)}%` }} />
            </div>
          </>
        ) : null}
        {cut.next ? (
          <a className="btn btn-block mt12" href={hrefFor({ ...state, page: cut.next })} data-nav="" data-fk="more" data-testid="cat-show-more" rel="next">
            {t('cat.showMore')}
          </a>
        ) : null}
        {ordered.length < rows.length ? (
          <button type="button" className="link mt8" data-href={clearHref}>
            {t('cat.showAll', { n: c.num(rows.length) })}
          </button>
        ) : null}
      </div>
    ) : null;

  // ---- the rail (desktop): dropped for a short category with nothing ticked (demo D-012) ----
  const few = pg.fewStyles > 0 && rows.length <= pg.fewStyles && n === 0;
  const side = few ? null : (
    <aside className="cat-side cat-dt" aria-label={t('cat.filters')}>
      <div className="cat-side-hd">
        <span className="h3">{t('cat.filters')}</span>
        {n ? (
          <button type="button" className="link" data-href={clearHref}>
            {t('cat.clearAllN', { n: c.num(n) })}
          </button>
        ) : null}
      </div>
      {filterPanel('d')}
    </aside>
  );
  const main = (
    <div className="cat-main">
      <div className="cat-bar cat-dt">
        <div className="row between" style={{ width: '100%' }}>
          <span className="small text2">
            <b style={{ color: 'var(--ink)' }}>{plural(ordered.length, 'cat.product', 'cat.products')}</b>
            {n ? ` · ${plural(n, 'cat.filterOn', 'cat.filtersOn')}` : ''}
          </span>
          {sortChoices.length > 1 ? (
            <span className="row" style={{ gap: 10 }}>
              <span className="small muted">{sortLabel}</span>
              <CatSort loc="d" label={sortLabel} choices={sortChoices} />
            </span>
          ) : null}
        </div>
      </div>
      {activeRow}
      {top.length ? (
        <div className="cat-ptools cat-ph" data-n={top.length}>
          {top}
        </div>
      ) : null}
      {chipRow}
      {grid}
      {more}
    </div>
  );

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
      <div className={`cat-layout${few ? ' cat-few' : ''}`}>
        {side}
        {main}
      </div>
      {info}
      <CatEffects version={queryOf(state, defaultSort)} />
    </div>
  );
}

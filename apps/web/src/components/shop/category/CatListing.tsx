// PR 45–48, shared with PR 73 — the product listing of the category page, also drawn by the search results page (demo
// 21-category.js PAGES.category, and D-016: "the results get the category's filter rail and sort"): the desktop filter
// rail, the phone's Filter · Sort · On sale row with its sheet and quick chips, the desktop's active filters, the grid
// of cards, "Showing 12 of 30" and "Show more". Everything the shopper chooses is an address (`queryFor`), so the server
// draws exactly that page. `scope` picks the owner's per-category choices (price cuts, the toolbar): a category's slug,
// or "search" for the results page.
import type { CategoryFilters, CategoryPageSettings, CategorySortSettings, CategoryToolbar } from '@extas/settings';
import { CatEffects } from '@/components/shop/category/CatEffects';
import { CatFilters } from '@/components/shop/category/CatFilters';
import { CatSheet } from '@/components/shop/category/CatSheet';
import { CatSort } from '@/components/shop/category/CatSort';
import { Icon, WaGlyph } from '@/components/shop/Icon';
import { ProductCard } from '@/components/shop/ProductCard';
import { colourName, type Listing, type ShopCard, type ShopColour } from '@/lib/shop/catalogue';
import { chipList, chipTests, cutsFor, facets, filterItems, toolbarFor, type ChipView, type SizeMeta } from '@/lib/shop/category-filter';
import {
  activeCount,
  cleared,
  pageCut,
  placeSoldOut,
  shownShare,
  toggled,
  type Band,
  type CatItem,
  type CatState,
  type FlagGroup,
  type ListGroup,
} from '@/lib/shop/category-model';
import { sortItems, sortOptions } from '@/lib/shop/category-sort';
import type { ShopContext } from '@/lib/shop/context';
import { waHref } from '@/lib/shop/links';

export interface ListingRow {
  card: ShopCard;
  item: CatItem;
}

export interface ListingSettings {
  page: CategoryPageSettings;
  filters: CategoryFilters;
  toolbar: CategoryToolbar;
  sort: CategorySortSettings;
}

interface Props {
  c: ShopContext;
  scope: string;
  /** The page's products (sold-out ones already left out when the owner hides them), with their cards. */
  rows: ListingRow[];
  /** What the address asked for. */
  asked: CatState;
  set: ListingSettings;
  sizes: Map<string, SizeMeta>;
  withPhotos: Listing['withPhotos'];
  /** The full address of a state (path and query). */
  hrefFor: (s: CatState) => string;
  /** The address part that tells one drawn state from another (the effects re-measure when it changes). */
  version: (s: CatState) => string;
  /** The name in the "ask on WhatsApp" message of an empty filter result. */
  waName: string;
  /** Words for a sort instead of the owner's or the dictionary's (search: "Best match" for his own order). */
  sortWords?: Partial<Record<string, string>>;
  /** The grid's test id (the category page's `cat-grid`; search `search-grid`). */
  gridId?: string;
}

export async function CatListing({ c, scope, rows, asked, set, sizes, withPhotos, hrefFor, version, waName, sortWords, gridId = 'cat-grid' }: Props) {
  const t = c.t;
  const pg = set.page;
  const fs = set.filters;
  const tb = set.toolbar;
  const items = rows.map((r) => r.item);
  const ctx = { cuts: cutsFor(scope, items, fs), chipTests: chipTests(tb) };
  // a band that no longer exists (the prices moved, the owner set his own cuts) must not filter the grid unseen
  const state: CatState = { ...asked, prices: ctx.cuts.length === 2 ? asked.prices : [] };
  const href = (group: ListGroup | FlagGroup, value?: string) => hrefFor(toggled(state, group, value));
  const clearHref = hrefFor(cleared(state));
  const n = activeCount(state);

  const pass = new Set(filterItems(items, state, ctx).map((p) => p.id));
  const byId = new Map(rows.map((r) => [r.item.id, r]));
  const ordered = placeSoldOut(sortItems(items.filter((p) => pass.has(p.id)), state.sort), pg.soldOut === 'last' ? 'last' : 'show');
  const cut = pageCut(ordered, state.page, pg.pageSize);
  const shown = await withPhotos(cut.shown.map((p) => byId.get(p.id)!.card));

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
  const sizeLabel = (key: string) => sizes.get(key)?.label ?? key;
  const plural = (count: number, one: string, many: string) => (count === 1 ? t(one) : t(many, { n: c.num(count) }));

  const f = facets(items, state, ctx, fs, sizes);
  const filterPanel = (loc: 'd' | 'm') => <CatFilters c={c} f={f} loc={loc} set={fs} href={href} sizes={sizes} words={{ colour: colourWords, band }} />;
  const sortChoices = sortOptions(set.sort).map((o) => ({
    id: o.id,
    text: (!set.sort.labels[o.id] && sortWords?.[o.id]) || t.label(o.label),
    href: hrefFor({ ...state, sort: o.id, page: 1 }),
    on: o.id === state.sort,
  }));
  const sortLabel = t('cat.sortBy');

  // ---- PR 46 / 48 · the phone's top row, the quick chips, the desktop's active filters ----
  const bar = toolbarFor(tb, scope);
  const chipWords = {
    sale: t('cat.onSale'),
    stock: t('cat.inStockChip'),
    band: (b: Band) => band(b),
    under: (m: number) => t('cat.under', { a: money(m) }),
    over: (m: number) => t('cat.over', { a: money(m) }),
    colour: (k: string) => colourWords(k).name,
    size: (k: string) => t('cat.sizeChip', { size: sizeLabel(k) }),
  };
  const chips: ChipView[] = chipList(tb, scope, items, state, ctx, chipWords);
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
  const wa = c.flags.whatsapp ? waHref(c.s['contact.whatsapp'], t('cat.waMessage', { ...c.vars, name: waName })) : null;
  const grid = shown.length ? (
    <div className="grid g4" data-testid={gridId}>
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

  // ---- the rail (desktop): dropped for a short list with nothing ticked (demo D-012) ----
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

  return (
    <>
      <div className={`cat-layout${few ? ' cat-few' : ''}`}>
        {side}
        {main}
      </div>
      <CatEffects version={version(state)} />
    </>
  );
}

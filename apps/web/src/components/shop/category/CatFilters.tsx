// PR 46 — the filter panel (demo 21-category.js cat_filtersHTML): the desktop rail and the phone's Filter sheet draw the
// same groups in the owner's order (`category.filters.groups`): "in stock only", size (tops and waists apart when a
// category has both), colour (the most-carried first, "+ N more colours"), fit, price bands. Every option is a control
// whose next address is written on it (`data-href`); CatEffects goes there without reloading the page. A size no style
// would have left is crossed out, never hidden (CN-017 SIM-F-035's rule); the colour list hides only what is past the
// owner's limit.
import type { CategoryFilters } from '@extas/settings';
import type { Facets, FacetOpt, SizeMeta } from '@/lib/shop/category-filter';
import type { FlagGroup, ListGroup } from '@/lib/shop/category-model';
import type { ShopContext } from '@/lib/shop/context';

export interface FilterWords {
  colour: (key: string) => { name: string; hex: string };
  band: (b: string) => string;
}

interface Props {
  c: ShopContext;
  f: Facets;
  loc: 'd' | 'm';
  set: CategoryFilters;
  href: (group: ListGroup | FlagGroup, value?: string) => string;
  sizes: ReadonlyMap<string, SizeMeta>;
  words: FilterWords;
}

/** A focus key that survives the page being drawn again (CatEffects puts the keyboard back on it). */
const fk = (loc: string, group: string, v = '') => `${loc}-${group}-${v}`;

function Check({ o, group, loc, label, pre, href, n }: { o: FacetOpt; group: ListGroup; loc: string; label: string; pre?: React.ReactNode; href: string; n: string }) {
  // keyed by its state: a page drawn with a different answer starts the box afresh (Clear all unticks it)
  return (
    <label className="cat-opt" data-off={o.off ? '' : undefined}>
      <input key={o.on ? 'on' : 'off'} type="checkbox" defaultChecked={o.on} disabled={o.off} data-href={href} data-fk={fk(loc, group, o.value)} />
      {pre}
      <span>{label}</span>
      <span className="n">{n}</span>
    </label>
  );
}

export function CatFilters({ c, f, loc, set, href, sizes, words }: Props) {
  const t = c.t;
  const order = set.groups.filter((g) => g.on).map((g) => g.id);
  const out: React.ReactNode[] = [];
  for (const g of order) {
    if (g === 'stock' && f.stock?.shown) {
      const o = f.stock;
      out.push(
        <div className="cat-fg" key="stock">
          <button
            type="button"
            className="cat-tgl"
            role="switch"
            aria-checked={o.on}
            data-href={href('stock')}
            data-fk={fk(loc, 'stock')}
            disabled={o.off}
          >
            <span>
              {t('cat.inStock')}
              <small>{t('cat.inStockSub')}</small>
            </span>
            <span className={`switch${o.on ? ' on' : ''}`} />
          </button>
        </div>,
      );
    }
    if (g === 'size' && (f.sizes.letters.length || f.sizes.waists.length)) {
      const pills = (list: FacetOpt[]) => (
        <div className="cat-sizes">
          {list.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`cat-sz${o.on ? ' on' : ''}`}
              aria-pressed={o.on}
              data-href={href('sizes', o.value)}
              data-fk={fk(loc, 'sizes', o.value)}
              disabled={o.off}
              title={t('cat.sizeLeft', { n: c.num(o.count) })}
            >
              {sizes.get(o.value)?.label ?? o.value}
            </button>
          ))}
        </div>
      );
      const both = f.sizes.letters.length > 0 && f.sizes.waists.length > 0;
      out.push(
        <div className="cat-fg" key="size">
          <div className="cat-fg-h">{t('cat.size')}</div>
          {both ? (
            <>
              <div className="cat-fg-sub" style={{ marginTop: 0 }}>
                {t('cat.tops')}
              </div>
              {pills(f.sizes.letters)}
              <div className="cat-fg-sub">{t('cat.waist')}</div>
              {pills(f.sizes.waists)}
            </>
          ) : (
            pills(f.sizes.letters.length ? f.sizes.letters : f.sizes.waists)
          )}
          {set.sizeNote ? <div className="xs muted mt8">{t('cat.sizeNote')}</div> : null}
        </div>,
      );
    }
    if (g === 'colour' && f.colours.length) {
      const lim = set.colourLimit;
      // a ticked colour past the limit keeps the whole list open (demo hiddenOn); one extra colour is no "more"
      const openAll = f.colours.length <= lim + 1 || f.colours.slice(lim).some((o) => o.on);
      const extra = openAll ? 0 : f.colours.length - lim;
      out.push(
        <div className="cat-fg" key="colour">
          <div className="cat-fg-h">{t('cat.colour')}</div>
          <div className="cat-cols" data-more-list={extra ? '' : undefined}>
            {f.colours.map((o, i) => {
              const w = words.colour(o.value);
              const opt = <Check o={o} group="colours" loc={loc} label={w.name} pre={<span className="cat-sw" style={{ background: w.hex }} />} href={href('colours', o.value)} n={c.num(o.count)} />;
              return extra && i >= lim ? (
                <div key={o.value} className="cat-more-c" hidden>
                  {opt}
                </div>
              ) : (
                <Check key={o.value} o={o} group="colours" loc={loc} label={w.name} pre={<span className="cat-sw" style={{ background: w.hex }} />} href={href('colours', o.value)} n={c.num(o.count)} />
              );
            })}
          </div>
          {extra ? (
            <button type="button" className="link" data-more-colours="" data-fk={fk(loc, 'morecol')} aria-expanded={false} data-less={t('cat.fewerColours')}>
              {t('cat.moreColours', { n: c.num(extra) })}
            </button>
          ) : null}
        </div>,
      );
    }
    if (g === 'fit' && f.fits.length) {
      out.push(
        <div className="cat-fg" key="fit">
          <div className="cat-fg-h">{t('cat.fit')}</div>
          {f.fits.map((o) => (
            <Check key={o.value} o={o} group="fits" loc={loc} label={o.value} href={href('fits', o.value)} n={c.num(o.count)} />
          ))}
        </div>,
      );
    }
    if (g === 'price' && f.prices.length) {
      out.push(
        <div className="cat-fg" key="price">
          <div className="cat-fg-h">{t('cat.price')}</div>
          {f.prices.map((o) => (
            <Check key={o.value} o={o} group="prices" loc={loc} label={words.band(o.value)} href={href('prices', o.value)} n={c.num(o.count)} />
          ))}
        </div>,
      );
    }
  }
  return <>{out}</>;
}

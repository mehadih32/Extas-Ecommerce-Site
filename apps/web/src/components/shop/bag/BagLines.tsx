// PR 107 / 108 — the bag's lines (demo 50-bag.js bag_itemLine, bag_setLine): each item with its picture, name, price,
// colour and size right in the bag, quantity, "Save for later" and "Remove"; each set as one line whose pieces link to
// their own products. Buttons carry `data-bag-act`; BagActions (client) sends them to the bag's API and redraws the
// page. The "same product in two sizes" card is SizesCard (PR 110).
import type { BagItem, BagSetView, BagView } from '@extas/cart';
import { colourName, productName, type ShopCard } from '@/lib/shop/catalogue';
import type { ShopContext } from '@/lib/shop/context';
import { productPath } from '@/lib/shop/home-model';
import { hrefIn } from '@/lib/shop/lang';
import { COLOUR_QUERY, ROUTES } from '@/lib/shop/routes';
import { plural } from '@/lib/shop/bag-model';
import { Icon } from '../Icon';
import { ProductPicture } from '../ProductPicture';

const THUMB = '96px';

export const nameOf = (x: { nameEn: string; nameBn: string | null }, c: Pick<ShopContext, 'lang'>) => productName(x, c.lang);

/** The product page of a bag line, opened on its colour. */
export function lineHref(c: ShopContext, slug: string | null, colourKey: string | null | undefined): string | null {
  if (!slug) return null;
  const path = productPath(c.s['naming.productPathPrefix'], slug);
  return hrefIn(c.lang, colourKey ? `${path}?${COLOUR_QUERY}=${encodeURIComponent(colourKey)}` : path);
}

export function Thumb({ c, card, colourKey, hex, garment, alt }: { c: ShopContext; card: ShopCard | undefined; colourKey: string | undefined; hex: string; garment?: string | null; alt: string }) {
  const photo = card ? ((colourKey ? card.photos[colourKey] : undefined) ?? card.photos['*'] ?? null) : null;
  return <ProductPicture garment={card?.garment ?? garment ?? null} hex={hex} photo={photo} ratio="ratio-11" alt={alt} lang={c.lang} sizes={THUMB} />;
}

function Note({ text, bad = false, testId }: { text: string; bad?: boolean; testId: string }) {
  return (
    <div className={`zc-note${bad ? ' bad' : ''}`} role={bad ? 'alert' : undefined} data-testid={testId}>
      <Icon name="info" size={13} />
      <span>{text}</span>
    </div>
  );
}

export function ItemLine({ c, item, card, blocked, lowStockAt }: { c: ShopContext; item: BagItem; card: ShopCard | undefined; blocked: BagView['blocked'][number] | undefined; lowStockAt: number }) {
  const t = c.t;
  const name = nameOf(item, c);
  const href = lineHref(c, item.slug, item.colour?.key);
  const low = lowStockAt > 0 && item.sellable > 0 && item.sellable <= lowStockAt ? t('bag.line.low', { n: c.num(item.sellable) }) : null;
  const block = blocked ? (blocked.reason === 'NOT_FOR_SALE' ? t('bag.line.notForSale') : blocked.free > 0 ? t('bag.line.stock', { n: c.num(blocked.free) }) : t('bag.line.soldOutNow')) : null;
  const colours = item.colours.filter((x) => x.variantId);
  const sizes = item.sizes.filter((x) => x.variantId);
  return (
    <div className="bg-line" data-line={item.lineId} data-testid="bag-line">
      {href ? (
        <a className="bg-thumb" href={href} aria-label={name}>
          <Thumb c={c} card={card} colourKey={item.colour?.key} hex={item.colour?.hex ?? ''} alt={name} />
        </a>
      ) : (
        <span className="bg-thumb">
          <Thumb c={c} card={card} colourKey={item.colour?.key} hex={item.colour?.hex ?? ''} alt={name} />
        </span>
      )}
      <div className="stack s8" style={{ minWidth: 0 }}>
        <div className="row between top" style={{ gap: 12 }}>
          <div className="grow">
            {href ? (
              <a className="bg-name" href={href}>
                {name}
              </a>
            ) : (
              <span className="bg-name">{name}</span>
            )}
            {low ? (
              <div className="xs bold bg-low" data-testid="bag-low">
                {low}
              </div>
            ) : null}
          </div>
          <div className="shrink0" style={{ textAlign: 'right' }}>
            <div className="price" data-testid="bag-line-price">
              {c.money(item.lineMinor)}
            </div>
            {item.quantity > 1 ? <div className="xs muted">{t('bag.line.each', { price: c.money(item.unitPriceMinor) })}</div> : null}
          </div>
        </div>
        <div className="bg-pick" data-testid="bag-item-pick">
          {colours.length > 1 ? (
            <span className="bg-pickc">
              <span className="swatch sm" style={{ background: item.colour?.hex }} aria-hidden="true" />
              <label className="sr" htmlFor={`bgc-${item.lineId}`}>
                {t('bag.line.colourFor', { name })}
              </label>
              <select key={item.variantId} id={`bgc-${item.lineId}`} className="cbt-sel bg-sel" data-bag-change="variant" data-id={item.lineId} data-was={item.variantId} data-testid="bag-color-sel" defaultValue={item.variantId}>
                {colours.map((x) => (
                  <option key={x.id} value={x.variantId!} disabled={!x.ok}>
                    {x.ok ? colourName(x, c.lang) : t('bag.line.soldOut', { option: colourName(x, c.lang) })}
                  </option>
                ))}
              </select>
            </span>
          ) : item.colour ? (
            <span className="small muted">{colourName(item.colour, c.lang)}</span>
          ) : null}
          {sizes.length > 0 ? (
            <span className="bg-picks">
              <label className="sr" htmlFor={`bgs-${item.lineId}`}>
                {t('bag.line.sizeFor', { name })}
              </label>
              <select key={item.variantId} id={`bgs-${item.lineId}`} className="cbt-sel bg-sel" data-bag-change="variant" data-id={item.lineId} data-was={item.variantId} data-testid="bag-size-sel" defaultValue={item.variantId}>
                {sizes.map((x) => (
                  <option key={x.id} value={x.variantId!} disabled={!x.ok}>
                    {x.ok ? x.label : t('bag.line.soldOut', { option: x.label })}
                  </option>
                ))}
              </select>
            </span>
          ) : null}
        </div>
        {item.addedPriceMinor !== item.unitPriceMinor ? <Note testId="bag-item-repriced" text={t('bag.line.repriced', { was: c.money(item.addedPriceMinor), now: c.money(item.unitPriceMinor) })} /> : null}
        {block ? <Note bad testId="bag-stock-issue" text={block} /> : null}
        <div className="row between wrap" style={{ gap: '8px 12px' }}>
          <div className="qty bg-qty" role="group" aria-label={t('bag.line.qty')}>
            <button type="button" data-bag-act="qty" data-id={item.lineId} data-q={item.quantity - 1} aria-label={t('bag.line.less')} disabled={item.quantity <= 1}>
              <Icon name="minus" size={16} />
            </button>
            <span aria-live="polite">{c.num(item.quantity)}</span>
            <button type="button" data-bag-act="qty" data-id={item.lineId} data-q={item.quantity + 1} aria-label={t('bag.line.more')} disabled={item.quantity >= item.maxQuantity}>
              <Icon name="plus" size={16} />
            </button>
          </div>
          <div className="bg-acts">
            <button type="button" className="link zc-wishbtn" data-bag-act="save" data-id={item.lineId} data-name={name} aria-label={t('bag.line.saveName', { name })}>
              <Icon name="heart" size={15} />
              {t('bag.line.save')}
            </button>
            <button type="button" className="link" data-bag-act="remove" data-id={item.lineId} data-name={name} aria-label={t('bag.line.removeName', { name })}>
              {t('bag.line.remove')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** PR 108 — a set: one line, its price (and the pieces' own total struck), each piece linking to its own product. */
export function SetLine({ c, set, cards }: { c: ShopContext; set: BagSetView; cards: Map<string, ShopCard> }) {
  const t = c.t;
  const name = nameOf(set, c);
  const setHref = hrefIn(c.lang, `${ROUTES.combos}/${encodeURIComponent(set.slug)}`);
  const first = set.pieces[0];
  const struck = set.regularMinor > set.payMinor;
  return (
    <div className="bg-line" data-line={set.lineId} data-testid="bag-set">
      <a className="bg-thumb" href={setHref} aria-label={name}>
        <Thumb c={c} card={first?.productId ? cards.get(first.productId) : undefined} colourKey={first?.colour?.key} hex={first?.colour?.hex ?? ''} alt={name} />
      </a>
      <div className="stack s8" style={{ minWidth: 0 }}>
        <div className="row between top" style={{ gap: 12 }}>
          <div className="grow">
            <a className="bg-name" href={setHref}>
              {name}
            </a>
            <div className="xs muted" style={{ marginTop: 2 }}>
              {plural(t, 'bag.set.pieces', set.pieces.length, c.num)}
            </div>
          </div>
          <div className="shrink0" style={{ textAlign: 'right' }}>
            <div className="price" data-testid="bag-set-price">
              {c.money(set.payMinor)}
            </div>
            {struck ? <div className="strike xs">{c.money(set.regularMinor)}</div> : null}
          </div>
        </div>
        <ul className="bg-setitems">
          {set.pieces.map((p) => {
            const href = lineHref(c, p.slug, p.colour?.key);
            const pn = nameOf(p, c);
            const bits = [p.colour ? colourName(p.colour, c.lang) : null, p.size].filter(Boolean).join(' · ');
            return (
              <li key={p.lineId}>
                {href ? (
                  <a className="bg-setlink" href={href} data-testid="bag-set-piece">
                    {pn}
                  </a>
                ) : (
                  <span className="bg-setlink">{pn}</span>
                )}
                {/* The " · " is text beside the link, so the name reads (and taps) as an inline text link. */}
                {bits ? ' · ' : null}
                {bits ? <span className="muted">{bits}</span> : null}
              </li>
            );
          })}
        </ul>
        {set.note === 'ENDED_KEEPS_PRICE' ? <Note testId="bag-set-ended" text={t('bag.set.ended')} /> : null}
        {set.note === 'PRICE_CHANGED' ? <Note testId="bag-set-repriced" text={t('bag.set.repriced')} /> : null}
        {/* One row, never wrapped (demo .cbt-fit): when it does not fit, BagActions switches to the short words. */}
        <div className="bg-acts cbt-fit" data-bag-fit="">
          <a className="link" href={setHref} data-testid="bag-set-change" aria-label={t('bag.set.change')}>
            <span className="cbt-f">{t('bag.set.change')}</span>
            <span className="cbt-s">{t('bag.set.changeShort')}</span>
          </a>
          <button type="button" className="link zc-wishbtn" data-bag-act="save" data-id={set.lineId} data-name={name} aria-label={t('bag.set.save')}>
            <Icon name="heart" size={15} />
            <span className="cbt-f">{t('bag.line.save')}</span>
            <span className="cbt-s">{t('bag.line.saveShort')}</span>
          </button>
          <button type="button" className="link" data-bag-act="remove" data-id={set.lineId} data-name={name} data-set="1" aria-label={t('bag.set.remove')}>
            {t('bag.line.remove')}
          </button>
        </div>
      </div>
    </div>
  );
}

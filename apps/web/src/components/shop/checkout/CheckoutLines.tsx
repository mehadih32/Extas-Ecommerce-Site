// PR 115 — the order summary's lines (demo 51-checkout.js co_summary): each item with its picture (the quantity on a
// small badge), name, colour · size and its price; each set as one line with its pieces. Server-drawn from the bag;
// the same lines show in the phone's summary panel and in the computer's side summary.
// PR 121 — each item's quantity can be changed and the item taken out right here (demo #41), through the bag's own API
// and its Undo (BagActions); three or more of one size says plainly that sizes can be mixed, with the way to the bag.
import type { BagView } from '@extas/cart';
import { colourName, type ShopCard } from '@/lib/shop/catalogue';
import { hrefIn } from '@/lib/shop/lang';
import { ROUTES } from '@/lib/shop/routes';
import { Icon } from '../Icon';
import type { ShopContext } from '@/lib/shop/context';
import { nameOf, Thumb } from '../bag/BagLines';

/** `manyMin`: from how many of one size the "mix the sizes" note shows (null: off, `checkout.manyOfOne.*`). */
export function CheckoutLines({ c, view, cards, manyMin }: { c: ShopContext; view: BagView; cards: Map<string, ShopCard>; manyMin: number | null }) {
  const t = c.t;
  const bagHref = hrefIn(c.lang, ROUTES.bag);
  return (
    <div data-testid="co-lines">
      {view.items.map((i) => {
        const name = nameOf(i, c);
        const colour = i.colour ? colourName(i.colour, c.lang) : null;
        return (
          <div key={i.lineId} className="co-it" data-testid="co-line" data-line={i.lineId}>
            <div className="co-th">
              <Thumb c={c} card={cards.get(i.productId)} colourKey={i.colour?.key} hex={i.colour?.hex ?? ''} alt={name} />
              {i.quantity > 1 ? <span className="co-qb">{c.num(i.quantity)}</span> : null}
            </div>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="small bold">{name}</div>
              <div className="xs muted">
                {[colour, i.size?.label, i.quantity > 1 ? t('checkout.sum.each', { price: c.money(i.unitPriceMinor) }) : null].filter(Boolean).join(' · ')}
              </div>
              <div className="co-qrow">
                <span className="qty qty-xs" role="group" aria-label={t('bag.line.qty')}>
                  <button type="button" data-bag-act="qty" data-id={i.lineId} data-q={i.quantity - 1} aria-label={t('bag.line.less')} disabled={i.quantity <= 1} data-testid="co-qty-less">
                    <Icon name="minus" size={14} />
                  </button>
                  <span aria-live="polite" data-testid="co-qty">
                    {c.num(i.quantity)}
                  </span>
                  <button type="button" data-bag-act="qty" data-id={i.lineId} data-q={i.quantity + 1} aria-label={t('bag.line.more')} disabled={i.quantity >= i.maxQuantity} data-testid="co-qty-more">
                    <Icon name="plus" size={14} />
                  </button>
                </span>
                <button type="button" className="link xs" data-bag-act="remove" data-id={i.lineId} data-name={name} aria-label={t('bag.line.removeName', { name })} data-testid="co-remove">
                  {t('bag.line.remove')}
                </button>
              </div>
              {manyMin !== null && i.quantity >= manyMin ? (
                <div className="co-many" data-testid="co-many">
                  <Icon name="info" size={13} />
                  <span>
                    {t('checkout.many', { n: c.num(i.quantity) })}{' '}
                    <a className="link" href={bagHref}>
                      {t('checkout.manyLink')}
                    </a>
                  </span>
                </div>
              ) : null}
            </div>
            <div className="small price">{c.money(i.lineMinor)}</div>
          </div>
        );
      })}
      {view.sets.map((s) => {
        const name = nameOf(s, c);
        const first = s.pieces.find((p) => p.productId);
        return (
          <div key={s.groupKey} className="co-it" data-testid="co-set">
            <div className="co-th">
              <Thumb c={c} card={first?.productId ? cards.get(first.productId) : undefined} colourKey={first?.colour?.key} hex={first?.colour?.hex ?? ''} alt={name} />
            </div>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="small bold">{name}</div>
              <div className="xs muted">{s.pieces.map((p) => [p.colour ? colourName(p.colour, c.lang) : null, p.size].filter(Boolean).join(' · ')).join(', ')}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="small price">{c.money(s.payMinor)}</div>
              {s.payMinor < s.regularMinor ? <div className="strike xs">{c.money(s.regularMinor)}</div> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

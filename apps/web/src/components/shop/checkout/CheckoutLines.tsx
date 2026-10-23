// PR 115 — the order summary's lines (demo 51-checkout.js co_summary): each item with its picture (the quantity on a
// small badge), name, colour · size and its price; each set as one line with its pieces. Server-drawn from the bag;
// the same lines show in the phone's summary panel and in the computer's side summary.
import type { BagView } from '@extas/cart';
import { colourName, type ShopCard } from '@/lib/shop/catalogue';
import type { ShopContext } from '@/lib/shop/context';
import { nameOf, Thumb } from '../bag/BagLines';

export function CheckoutLines({ c, view, cards }: { c: ShopContext; view: BagView; cards: Map<string, ShopCard> }) {
  const t = c.t;
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

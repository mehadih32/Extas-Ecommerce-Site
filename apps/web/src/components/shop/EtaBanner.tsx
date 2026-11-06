// PR 193 (CN-014 g; demo 98e-cn014.js ftEidBanner, B1.14) — the shop-wide strip about when orders come, on the home
// page and the bag: the Eid order-by date per band ("Order by 6 Mar for delivery before Eid — Dhaka city"), the
// pre-order line once every date passed (only with the owner's pre-order on), and the holiday notice. The words are the
// owner's settings (@extas/rules storefrontBanner); with both switches off, as shipped, nothing is drawn.
// Follow-up 655 (PR 281): `festive` (the bag) adds the live festive Smart Rule's cut-off words — "Order by … for
// delivery before the festival" while a band's time is ahead, its "after" words once every band passed — while
// Marketing › Festive cut-off is on with checkout ticked (the bag is checkout's first step; off as shipped: nothing).
// Words only: no charge, price or Cash on Delivery changes.
// Follow-up (PR 281 / 214): with the customer's band known (his saved address or his started checkout), the festive
// line names his own last order time; otherwise every band's (never only Dhaka city's later time).
import type { ShopContext } from '@/lib/shop/context';
import { etaBanner, festiveLines } from '@/lib/rules-public';
import { knownBand } from '@/lib/shop/known-band';
import { Icon } from './Icon';

/** `wrap`: a class for a box around the strip (the home page's container), drawn only when there is a strip. */
export async function EtaBanner({ c, testId, wrap, festive = false }: { c: ShopContext; testId: string; wrap?: string; festive?: boolean }) {
  const locale = c.lang === 'bn' ? 'bn-BD' : 'en-BD';
  const [eta, cut] = await Promise.all([etaBanner({ storeId: c.storeId, locale }), festive ? knownBand(c.storeId).then((band) => festiveLines({ storeId: c.storeId, place: 'checkout', locale, band })) : Promise.resolve([])]);
  const lines = [...eta, ...cut.map((f) => f.text).filter((t) => t && !eta.includes(t))];
  if (!lines.length) return null;
  const strip = (
    <div className="sh-eta" role="note" data-testid={testId}>
      <Icon name="clock" size={16} />
      <div className="sh-eta-l">
        {lines.map((l, i) => (
          <p key={i}>{l}</p>
        ))}
      </div>
    </div>
  );
  return wrap ? <div className={wrap}>{strip}</div> : strip;
}

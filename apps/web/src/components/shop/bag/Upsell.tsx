// PR 114 — "You may also like" under the bag (demo 72-upsell.js): products from the same categories as the bag (else the
// newest), never what is already in it; the tier ladder beside them (PR 109) and the reasons to buy here, each reason
// only when its setting or flag backs it (CN-018). Follow-up 679: the set line has its own switch (`bag.upsell.setLine`),
// and the thank-you page draws the same block (`thanks.upsell`, off) with no tiers and no sub-line.
import type { BagView } from '@extas/cart';
import type { ShopCard } from '@/lib/shop/catalogue';
import type { ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { ROUTES } from '@/lib/shop/routes';
import type { Reassurance } from '@/lib/shop/bag-model';
import { CardFits } from '../CardFits';
import { Icon } from '../Icon';
import { ProductCard } from '../ProductCard';
import { Ladder, PhoneTier } from './OfferSlot';

/** PR 114 — "You may also like" (demo 72-upsell.js), with the ladder beside it and the reasons under it. */
export function Upsell({
  c,
  cards,
  from,
  tiers,
  builderHref = null,
  style,
  phoneLadder,
  reasons,
  setLine = true,
  trust,
  testId = 'bag-upsell',
  rowId = 'bg-upsrow',
}: {
  c: ShopContext;
  cards: ShopCard[];
  from: 'same' | 'new' | 'none';
  tiers: BagView['tiers'];
  /** Follow-up 244: the tier rule's own builder page while the builder is open (else the box links to the category). */
  builderHref?: string | null;
  style: 'side' | 'current';
  phoneLadder: boolean;
  reasons: boolean;
  /** Follow-up 679: the phone's set line ("Buy 2 and save …", `bag.upsell.setLine`, on as shipped). */
  setLine?: boolean;
  trust: Reassurance;
  /** Follow-up 679: the same block on the thank-you page (`thanks.upsell`) under its own names. */
  testId?: string;
  rowId?: string;
}) {
  const t = c.t;
  if (!cards.length && !tiers) return null;
  const why = reasons && (trust.cod || trust.exchange || trust.original);
  return (
    <section className={`ups ups-st-${style}${tiers ? '' : ' ups-notier'}`} id={testId === 'bag-upsell' ? 'bg-ups' : undefined} data-testid={testId}>
      <div className="container">
        <div className="ups-hd">
          <h2>{t('bag.ups.title')}</h2>
          <a className="link" href={hrefIn(c.lang, ROUTES.newIn)}>
            {t('bag.ups.all')}
          </a>
        </div>
        {from !== 'none' ? <p className="ups-sub">{from === 'same' ? t('bag.ups.sub') : t('bag.ups.subNew')}</p> : null}
        {tiers ? <Ladder c={c} tiers={tiers} phone={phoneLadder} builderHref={builderHref} /> : null}
        {tiers && !phoneLadder && setLine ? <PhoneTier c={c} tiers={tiers} builderHref={builderHref} /> : null}
        {cards.length ? (
          // The cards' badges fit like the category page's (CARD_FIT), so a long badge on a narrow phone steps down, never cut.
          <CardFits className="ups-row mt12" style={{ ['--n' as string]: Math.min(4, cards.length) }} id={rowId}>
            {cards.map((card) => (
              <ProductCard key={card.id} card={card} c={c} />
            ))}
          </CardFits>
        ) : null}
        {why ? (
          <div className="ups-why">
            {trust.cod ? (
              <div className="ups-w">
                <Icon name="cash" size={18} />
                <span>
                  <b>{t('bag.ups.codTitle')}</b>
                  <span>{t('bag.ups.codText')}</span>
                </span>
              </div>
            ) : null}
            {trust.exchange ? (
              <div className="ups-w">
                <Icon name="swap" size={18} />
                <span>
                  <b>{t('bag.ups.exTitle', c.vars)}</b>
                  <span>{t('bag.ups.exText')}</span>
                </span>
              </div>
            ) : null}
            {trust.original ? (
              <div className="ups-w">
                <Icon name="shield" size={18} />
                <span>
                  <b>{t('bag.ups.origTitle')}</b>
                  <span>{t('bag.ups.origText')}</span>
                </span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

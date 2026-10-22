// PR 41 — the product card every product row and grid uses (demo 02-core.js productCard). The card is a plain box whose
// link is an empty layer over the whole card, drawn first and named for screen readers (demo D-024), so the heart is
// its own button and never sits inside a link. Picture (photo or drawing) with the badge and the heart, then the name,
// the price (and the struck price only when the honesty rule of PR 38 allows one), up to four swatches and the fit.
import { cardBadge, cardSwatches, productPath } from '@/lib/shop/home-model';
import { colourName, photoFor, productName, type ShopCard } from '@/lib/shop/catalogue';
import type { ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { HeartButton } from './HeartButton';
import { ProductPicture } from './ProductPicture';

/** How wide a card is drawn: two across on a phone, four on a desktop (the `sizes` of its photo). */
export const CARD_SIZES = '(max-width: 767px) 50vw, (max-width: 1239px) 25vw, 300px';

export function ProductCard({ card, c, priority = false }: { card: ShopCard; c: ShopContext; priority?: boolean }) {
  const name = productName(card, c.lang);
  const colour = card.colours[0];
  const href = hrefIn(c.lang, productPath(c.s['naming.productPathPrefix'], card.slug));
  const price = card.priceMinor != null ? c.money(card.priceMinor) : null;
  const was = price && card.wasMinor != null && card.wasMinor > (card.priceMinor ?? 0) ? c.money(card.wasMinor) : null;
  const badge = cardBadge(card, c.t, c.num);
  const sw = cardSwatches(card.colours);
  return (
    <div className="pcard-w" data-pid={card.id}>
      <div className="pcard">
        <a className="pcard-lnk" href={href} aria-label={price ? c.t('card.label', { name, price }) : name} />
        <ProductPicture
          garment={card.garment}
          hex={colour?.hex ?? ''}
          photo={photoFor(card, colour?.key)}
          alt={name}
          lang={c.lang}
          sizes={CARD_SIZES}
          priority={priority}
        >
          {badge ? <span className={`badge-img${badge.sale ? ' sale' : ''}`}>{badge.text}</span> : null}
          <HeartButton
            id={card.id}
            words={{ save: c.t('card.save'), unsave: c.t('card.unsave'), saved: c.t('card.saved'), removed: c.t('card.removed') }}
          />
        </ProductPicture>
        <div className="pinfo">
          <div className="pname">{name}</div>
          {price ? (
            <div className="row" style={{ gap: 7, alignItems: 'baseline' }}>
              <span className="price">{price}</span>
              {was ? (
                <>
                  {' '}
                  <span className="strike small">{was}</span>
                </>
              ) : null}
            </div>
          ) : null}
          <div className="row between mt8">
            <span className="row" style={{ gap: 4 }}>
              {sw.shown.map((s) => (
                <span key={s.key} className="swatch sm" style={{ background: s.hex }} title={colourName(s, c.lang)} />
              ))}
              {sw.more ? <span className="xs muted">{c.t('card.moreColours', { n: c.num(sw.more) })}</span> : null}
            </span>
            {card.fit ? <span className="tiny muted">{card.fit}</span> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

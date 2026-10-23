// PR 71 — the wishlist page (demo 60-account.js acc_guestWishlist / acc_wishGrid / acc_wishRecover, V12.2): the crumbs,
// "Wishlist" with the count, the note that the list is kept on this device (no login wall: demo R16), then the saved
// products as cards, each with "Add to bag" (straight in when the size it was saved with can be sold now, else
// "Choose a size" on the product page) and "Remove". A product sold out says so, and offers "tell me when it is back"
// when that is switched on (`pdp.size.notifyBack`). An empty list says how to fill it; on a computer it also shows the
// newest products to start from (`wish.list.emptyPicks`; the demo's "best sellers" wait for the sales numbers — a
// title that says "best" must be true, CN-017). Server-drawn; WishActions does the clicks.
import './wish.css';
import type { NotifyWords } from '../NotifyForm';
import { NotifyForm } from '../NotifyForm';
import { ProductCard } from '../ProductCard';
import { Icon } from '../Icon';
import { colourName, productName, type ShopCard } from '@/lib/shop/catalogue';
import type { ShopContext } from '@/lib/shop/context';
import { productColourPath, productPath } from '@/lib/shop/home-model';
import { hrefIn } from '@/lib/shop/lang';
import { ROUTES } from '@/lib/shop/routes';
import { plural } from '@/lib/shop/bag-model';
import type { WishDetail } from '@/lib/shop/wishlist';
import { WishActions, type WishWords } from './WishActions';

const NOTIFY_KEYS = ['title', 'placeholder', 'button', 'close', 'done', 'error', 'empty', 'short', 'prefix'] as const;

export function WishlistPage({
  c,
  cards,
  details,
  picks,
  notifyBack,
}: {
  c: ShopContext;
  cards: ShopCard[];
  details: Map<string, WishDetail>;
  picks: ShopCard[];
  notifyBack: boolean;
}) {
  const t = c.t;
  const words: WishWords = { toBag: t('wish.toBag'), removed: t('wish.removed'), error: t('wish.error'), stock: t('wish.stock') };
  const notifyWords = Object.fromEntries(NOTIFY_KEYS.map((k) => [k, t(`pdp.notify.${k}`)])) as NotifyWords;
  const prefix = c.s['naming.productPathPrefix'];
  return (
    <div className="container wl-page" data-wish-root="" data-testid="wish-page">
      <nav className="crumbs wl-crumbs" aria-label={t('wish.crumbs')}>
        <a href={hrefIn(c.lang, ROUTES.home)}>{t('wish.home')}</a>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{t('wish.title')}</span>
      </nav>
      <div className="row between wrap wl-head">
        <h1 className="h1">{t('wish.title')}</h1>
        <span className="small muted" data-testid="wish-count">
          {plural(t, 'wish.count', cards.length, c.num)}
        </span>
      </div>
      <div className="wl-note small">
        <Icon name="heart" size={18} />
        <span className="hide-d">{t('wish.notePhone')}</span>
        <span className="hide-m">{t('wish.noteDesk')}</span>
      </div>
      {cards.length ? (
        <div className="grid g4 wl-grid">
          {cards.map((card) => {
            const d = details.get(card.id);
            const name = productName(card, c.lang);
            const colour = d?.colourKey && card.colours.some((x) => x.key === d.colourKey) ? d.colourKey : null;
            const href = hrefIn(c.lang, colour ? productColourPath(prefix, card.slug, colour) : productPath(prefix, card.slug));
            const ready = d?.size && d.size.sellable > 0 ? d.size : null;
            const sizeColour = ready ? card.colours.find((x) => x.key === ready.colourKey) : undefined;
            return (
              <div className="wl-item" key={card.id} data-testid="wish-item">
                <ProductCard card={card} c={c} colour={colour} />
                {ready ? (
                  <div className="xs text2 wl-size" data-testid="wish-size">
                    {sizeColour ? t('wish.sizeOf', { colour: colourName(sizeColour, c.lang), size: ready.label }) : ready.label}
                  </div>
                ) : null}
                <div className="wl-acts">
                  {!card.inStock ? (
                    <span className="wl-out small" data-testid="wish-soldout">
                      {t('wish.soldOut')}
                    </span>
                  ) : ready ? (
                    <button type="button" className="btn btn-sm btn-secondary" data-wish-act="bag" data-pid={card.id} data-variant={ready.variantId} data-name={name} data-testid="wl-add" aria-label={t('wish.addName', { name })}>
                      <Icon name="bag" size={15} />
                      {t('wish.add')}
                    </button>
                  ) : (
                    <a className="btn btn-sm btn-secondary" href={href} data-testid="wl-choose" aria-label={t('wish.chooseName', { name })}>
                      <Icon name="bag" size={15} />
                      {t('wish.choose')}
                    </a>
                  )}
                  <button type="button" className="link" data-wish-act="remove" data-pid={card.id} data-name={name} data-testid="wl-remove" aria-label={t('wish.removeName', { name })}>
                    {t('wish.remove')}
                  </button>
                </div>
                {!card.inStock && notifyBack ? <NotifyForm productId={card.id} variantId={null} what={name} words={notifyWords} /> : null}
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <div className="card empty wl-empty" data-testid="wish-empty">
            <Icon name="heart" size={30} />
            <h2 className="h3">{t('wish.emptyTitle')}</h2>
            <p className="small">
              <span className="hide-d">{t('wish.emptyPhone')}</span>
              <span className="hide-m">{t('wish.emptyDesk')}</span>
            </p>
            <a className="btn btn-primary" href={hrefIn(c.lang, ROUTES.newIn)}>
              {t('wish.browse')}
            </a>
          </div>
          {picks.length ? (
            <section className="hide-m wl-picks" aria-labelledby="wl-picks-h">
              <div className="sec-hd">
                <h2 className="h3" id="wl-picks-h">
                  {t('wish.picks')}
                </h2>
                <a className="link wl-all" href={hrefIn(c.lang, ROUTES.newIn)}>
                  {t('wish.seeAll')}
                </a>
              </div>
              <div className="grid g4">
                {picks.map((p) => (
                  <ProductCard key={p.id} card={p} c={c} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
      <WishActions words={words} />
    </div>
  );
}

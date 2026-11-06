// S12 · PR 592 (Blueprint C11.5) — one house ad as a journal page draws it: the label "<shop> offer", the ad's picture
// (its own, or its product's photo), its headline, line and button words, in the page's language. The whole card is
// one link through the shop's click counter (/api/shop/house-ad), marked sponsored and not followed by search engines.
// No state, so the list pages, the article and the popup share it.
// PR 592 follow-up: the card carries its place's id (`data-ha-place`), which HouseAdViews watches to count views.
import { ResponsiveImage } from '@/components/media/ResponsiveImage';
import type { ShopContext } from '@/lib/shop/context';
import type { ShopAd } from '@/lib/journal/house-ads';

export function HouseAd({ c, ad, className = '' }: { c: ShopContext; ad: ShopAd; className?: string }) {
  const t = c.t;
  return (
    <aside className={`ha ha-${ad.slot}${ad.image ? '' : ' ha-noimg'} ${className}`.trim()} aria-label={t('journal.ad.label', { shop: c.storeName })} data-testid="house-ad" data-slot={ad.slot} data-ha-place={ad.placeId}>
      <span className="ha-lbl small">{t('journal.ad.label', { shop: c.storeName })}</span>
      <a className="ha-a" href={ad.href} rel="nofollow sponsored">
        {ad.image ? (
          <span className="ha-img">
            <ResponsiveImage image={ad.image} slot="card" sizes="(max-width: 767px) 40vw, 240px" alt={ad.alt} />
          </span>
        ) : null}
        <span className="ha-words">
          <span className="ha-t">{ad.headline}</span>
          {ad.text ? <span className="ha-x small text2">{ad.text}</span> : null}
          <span className="ha-cta">{ad.cta ?? t('journal.ad.go')}</span>
        </span>
      </a>
    </aside>
  );
}

/** The ads of one place (an empty place draws nothing at all). */
export function HouseAdsAt({ c, ads, slot, after }: { c: ShopContext; ads: readonly ShopAd[]; slot: ShopAd['slot']; after?: number }) {
  const here = ads.filter((a) => a.slot === slot && (after === undefined || a.after === after));
  return here.length ? (
    <>
      {here.map((a) => (
        <HouseAd key={a.placeId} c={c} ad={a} />
      ))}
    </>
  ) : null;
}

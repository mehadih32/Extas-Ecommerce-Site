// PR 65 — "Reviews" under the product page (demo 30-product.js `pdp_reviewsSection`, r11-pdp.css §44): the summary box
// on the left (the big average, the stars, how many, and the line that says who may review and that every review is
// checked), and on the right the review cards in a row that slides slowly on its own, the ones with a buyer photo
// first. The row is the shop's one slider engine (SmoothRow / `lib/shop/slider.ts`), so a mouse resting on it, a
// finger on it and the keyboard inside it each pause it and each start it again on their own (checklist L32/L33).
//
// Only approved reviews are here, and a card shows only what its review carries: the stars, the name he chose, the
// "Verified buyer" tag when it came from an order, his height · weight · "bought L" line when he gave those, his
// words, and his photo. With no approved review the section is not drawn at all — never an empty box, never a
// made-up rating. Settings: `pdp.reviews`, `slider.engine`.
import type { PdpReviewsSettings } from '@extas/settings';
import type { ShopContext } from '@/lib/shop/context';
import { starFills } from '@/lib/shop/home-model';
import { formatNumber, toBnDigits } from '@/lib/shop/lang';
import { heightParts, pdpReviewsView, REVIEW_STAR_PATH, type PdpReviewRow, type PdpReviewsView } from '@/lib/shop/pdp-reviews';
import type { ProductReviewsData } from '@/lib/shop/pdp-reviews-load';
import { ResponsiveImage, altFor } from '@/components/media/ResponsiveImage';
import { Icon } from '../Icon';
import { SmoothRow } from '../SmoothRow';

export function ReviewStars({ rating, size, label }: { rating: number; size: number; label: string }) {
  return (
    <span className="row" style={{ gap: 1 }} role="img" aria-label={label}>
      {starFills(rating).map((on, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill={on ? 'var(--brand)' : 'var(--line)'}>
          <path d={REVIEW_STAR_PATH} />
        </svg>
      ))}
    </span>
  );
}

/** The average as the shop writes numbers (Bengali digits when the owner asked for them). */
export const reviewAvgText = (c: ShopContext, average: number) => {
  const fixed = average.toFixed(1);
  return c.lang === 'bn' && c.bnDigits ? toBnDigits(fixed) : fixed;
};

export const reviewCountText = (c: ShopContext, total: number) => (total === 1 ? c.t('reviews.one') : c.t('reviews.count', { n: formatNumber(total, c.lang, c.bnDigits) }));

/** His height · weight · "bought L" line, from what his review really carries and nothing else. */
function bodyLine(c: ShopContext, r: PdpReviewRow): string {
  const h = heightParts(r.heightCm);
  const parts = [
    ...(h ? [c.t('reviews.height', { feet: c.num(h.feet), inches: c.num(h.inches) })] : []),
    ...(r.weightKg ? [c.t('reviews.weight', { n: c.num(r.weightKg) })] : []),
    ...(r.sizeLabel ? [c.t('reviews.bought', { size: r.sizeLabel })] : []),
  ];
  return parts.join(' · ');
}

function Card({ c, r, name }: { c: ShopContext; r: PdpReviewRow; name: string }) {
  const line = bodyLine(c, r);
  const fit = r.fit ? c.t(`reviews.fit.${r.fit.toLowerCase()}`) : null;
  return (
    <article className="pdp-box p16 pdp-rev" data-testid="pdp-review">
      <div className="row between wrap" style={{ gap: 8 }}>
        <div className="row" style={{ gap: 8 }}>
          <ReviewStars rating={r.rating} size={13} label={c.t('reviews.stars', { n: c.num(r.rating) })} />
          {r.name ? <span className="small bold">{r.name}</span> : null}
        </div>
        {r.verified ? (
          <span className="tag" data-testid="pdp-review-verified">
            <Icon name="check" size={12} />
            {c.t('reviews.verified')}
          </span>
        ) : null}
      </div>
      {line || fit ? (
        <div className="row wrap xs text2 mt8" style={{ gap: 6 }}>
          {line ? <span>{line}</span> : null}
          {fit ? <span className={`tag${r.fit === 'RIGHT' ? '' : ' warn'}`}>{fit}</span> : null}
        </div>
      ) : null}
      {r.title ? <div className="small bold mt8">{r.title}</div> : null}
      {r.body ? <p className="small pdp-rev-text">{r.body}</p> : null}
      {r.photo ? (
        <div className="pdp-rev-photo">
          <ResponsiveImage image={r.photo} slot="thumb" sizes="84px" alt={altFor(r.photo, c.lang, c.t('reviews.photoAlt', { name }))} />
        </div>
      ) : null}
    </article>
  );
}

/** The summary box: the average, the stars, how many, and who may review at all. */
function Summary({ c, view }: { c: ShopContext; view: PdpReviewsView }) {
  return (
    <div className="pdp-box p20" data-testid="pdp-reviews-summary">
      <div className="row" style={{ gap: 14, alignItems: 'flex-end' }}>
        <div className="pdp-avg">{reviewAvgText(c, view.average)}</div>
        <div>
          <ReviewStars rating={view.average} size={16} label={c.t('reviews.stars', { n: reviewAvgText(c, view.average) })} />
          <div className="xs muted mt8">{reviewCountText(c, view.total)}</div>
        </div>
      </div>
      <p className="xs muted pdp-rev-rule">{c.t('reviews.onlyBuyers')}</p>
    </div>
  );
}

/** The block, drawn on the server from the reviews the page already read (no script beyond the one slider engine). */
export function PdpReviews({ c, set, data, name, qa }: { c: ShopContext; set: PdpReviewsSettings; data: ProductReviewsData; name: string; qa: boolean }) {
  if (!set.on) return null;
  const view = pdpReviewsView(data.rows, { average: data.average, total: data.total }, set);
  if (!view) return null;
  return (
    <section className="section" id="pdp-reviews" data-testid="pdp-reviews">
      <div className="container">
        <div className="sec-hd">
          <h2 className="h2">{c.t('reviews.title')}</h2>
          {set.questionsLink && qa ? (
            <a className="link" href="#pdp-qa" data-testid="pdp-reviews-qa">
              {c.t('reviews.questions')}
            </a>
          ) : null}
        </div>
        <div className="pdp-revgrid">
          {set.summary ? <Summary c={c} view={view} /> : null}
          <SmoothRow id="sl-reviews" className="pdp-revlist pdp-slide" engine={c.s['slider.engine']} speed={set.speed}>
            {view.cards.map((r) => (
              <Card key={r.id} c={c} r={r} name={name} />
            ))}
          </SmoothRow>
        </div>
      </div>
    </section>
  );
}

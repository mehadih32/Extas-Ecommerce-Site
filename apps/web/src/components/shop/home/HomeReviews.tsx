// PR 41 — "What customers say" (demo 20-home.js hm_reviews): up to ten approved reviews sliding slowly on their own on
// the one slider engine (D3.3, §56.1), the shop-wide average and count beside the heading on a desktop and under the row
// on a phone. Each card: the stars, the words, the name the customer chose to show and "Verified buyer" when the review
// is from an order. With no approved review the section is not drawn. Settings: `home.reviews`, `slider.engine`.
// The demo's height · weight · size line waits for those review columns (schema owner); nothing is made up meanwhile.
import type { ShopContext } from '@/lib/shop/context';
import { starFills } from '@/lib/shop/home-model';
import { formatNumber, hrefIn, toBnDigits } from '@/lib/shop/lang';
import type { ReviewRow } from '@/lib/shop/reviews';
import { Icon } from '../Icon';
import { SmoothRow } from '../SmoothRow';
import { SecHd } from './SecHd';

const STAR = 'M12 2l3 6.5 7 .9-5 4.8 1.2 7L12 17.8 5.8 21.2 7 14.2 2 9.4l7-.9z';

function Stars({ rating, size, label }: { rating: number; size: number; label: string }) {
  return (
    <span className="row" style={{ gap: 1 }} role="img" aria-label={label}>
      {starFills(rating).map((on, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill={on ? 'var(--brand)' : 'var(--line)'}>
          <path d={STAR} />
        </svg>
      ))}
    </span>
  );
}

export function HomeReviews({ c, row }: { c: ShopContext; row: ReviewRow }) {
  if (!row.reviews.length) return null;
  const set = c.s['home.reviews'];
  const fixed = row.average.toFixed(1);
  const avgText = c.lang === 'bn' && c.bnDigits ? toBnDigits(fixed) : fixed;
  const count = row.total === 1 ? c.t('home.reviews.one') : c.t('home.reviews.count', { n: formatNumber(row.total, c.lang, c.bnDigits) });
  const summary = (size: number) => (
    <>
      <Stars rating={row.average} size={size} label={c.t('home.reviews.stars', { n: avgText })} />
      <span className="small">
        <b>{avgText}</b> <span className="muted">· {count}</span>
      </span>
    </>
  );
  return (
    <section className="section">
      <div className="container">
        <SecHd
          title={c.t('home.reviews.title')}
          sub={c.t('home.reviews.sub')}
          aside={
            set.summary ? (
              <div className="row hide-m" style={{ gap: 8 }}>
                {summary(16)}
              </div>
            ) : undefined
          }
        />
        <SmoothRow id="hm-revtrack" className="hm-hscroll c3 hm-revs" engine={c.s['slider.engine']}>
          {row.reviews.map((r) => (
            <figure key={r.id} className="card hm-rev">
              <div className="row between">
                <Stars rating={r.rating} size={15} label={c.t('home.reviews.stars', { n: c.num(r.rating) })} />
              </div>
              <blockquote>“{r.body}”</blockquote>
              <figcaption>
                {r.name ? (
                  <div className="small">
                    <b>{r.name}</b>
                  </div>
                ) : null}
                {r.verified ? (
                  <div className="row xs brandc bold mt8" style={{ gap: 4 }}>
                    <Icon name="check" size={13} />
                    {c.t('home.reviews.verified')}
                  </div>
                ) : null}
              </figcaption>
            </figure>
          ))}
        </SmoothRow>
        <div className="hm-revs-more hide-m">
          <a className="hm-more" href={hrefIn(c.lang, set.href)}>
            {c.t('home.reviews.topRated')}
            <Icon name="right" size={14} />
          </a>
        </div>
        {set.summary ? (
          <div className="row hide-d mt12" style={{ gap: 8 }}>
            {summary(14)}
          </div>
        ) : null}
      </div>
    </section>
  );
}

// Products › Reviews: the four chips of the prototype (Questions · Reviews · Hidden · FAQs), shown on the reviews,
// questions and FAQ pages so the three feel like one place. Counts are shown only where the page knows them.
import Link from 'next/link';

export type ReviewChipId = 'questions' | 'reviews' | 'hidden' | 'faqs';

const HREF: Record<ReviewChipId, string> = {
  questions: '/admin/products/questions',
  reviews: '/admin/products/reviews',
  hidden: '/admin/products/reviews?view=HIDDEN',
  faqs: '/admin/products/faqs',
};
const ORDER: ReviewChipId[] = ['questions', 'reviews', 'hidden', 'faqs'];

export function ReviewChips({
  current,
  labels,
  aria,
  counts = {},
}: {
  current: ReviewChipId;
  labels: Record<ReviewChipId, string>;
  aria: string;
  counts?: Partial<Record<ReviewChipId, string>>;
}) {
  return (
    <nav className="a2-views a2-mt12" aria-label={aria} data-testid="review-chips">
      {ORDER.map((id) => (
        <Link key={id} className={`a2-view${id === current ? ' on' : ''}`} href={HREF[id]} aria-current={id === current ? 'page' : undefined} data-chip={id}>
          {labels[id]}
          {counts[id] !== undefined ? <span className="a2-cnt">{counts[id]}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

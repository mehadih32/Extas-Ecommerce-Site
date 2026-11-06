// PR 49 follow-up (66) — the rating in the computer's slim bar (demo 89x-owner-b.js ownb_barMid, owner review P6): the
// stars, the average and how many, drawn on the server from the same approved reviews as the rating line under the
// title (PR 65) and handed to the bar (PdpBuy DeskBar); a product with no approved review gets none.
import { ReviewStars } from './PdpReviews';

export function PdpBarRating({ average, avgText, countText, label }: { average: number; avgText: string; countText: string; label: string }) {
  return (
    <span className="ob-bm-i ob-bm-r" data-testid="dkb-rating">
      <ReviewStars rating={average} size={13} label={label} />
      <b>{avgText}</b>
      <span className="text2">{countText}</span>
    </span>
  );
}

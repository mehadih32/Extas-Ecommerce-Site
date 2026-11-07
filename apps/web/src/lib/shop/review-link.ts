// Follow-up 238 (PR 65) — when "Rate & review" shows beyond the order's page (components/shop/account/RateReviewLink):
// pure, so the server pages (the order cards, the thank-you page) and the client link share it.
// Follow-up 237: the photo reward's figure beside it, by the review form's own rule.
import type { ReviewPhotoRewardSettings } from '@extas/settings';

/** Whether the review state says he may still review a line (`can` is false once every line is reviewed). */
export function reviewLeft(state: { ok?: boolean; can?: boolean } | null): boolean {
  return Boolean(state?.ok && state.can);
}

/** Only a delivered order is asked about (the shop reviews only what arrived). */
export const askReview = (status: string) => status === 'DELIVERED';

/**
 * Follow-up 237 — what an approved photo review is worth, to say beside "Rate & review" and on the form: only while the
 * owner has the perk on with his own amount and lets it be said (`reviews.photoReward.showOnForm`); else null.
 */
export function shownPhotoReward(r: Pick<ReviewPhotoRewardSettings, 'enabled' | 'amountMinor' | 'showOnForm'>): number | null {
  return r.enabled && r.showOnForm && r.amountMinor !== null && r.amountMinor > 0 ? r.amountMinor : null;
}

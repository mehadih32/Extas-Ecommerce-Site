// Follow-up 238 (PR 65) — when "Rate & review" shows beyond the order's page (components/shop/account/RateReviewLink):
// pure, so the server pages (the order cards, the thank-you page) and the client link share it.

/** Whether the review state says he may still review a line (`can` is false once every line is reviewed). */
export function reviewLeft(state: { ok?: boolean; can?: boolean } | null): boolean {
  return Boolean(state?.ok && state.can);
}

/** Only a delivered order is asked about (the shop reviews only what arrived). */
export const askReview = (status: string) => status === 'DELIVERED';

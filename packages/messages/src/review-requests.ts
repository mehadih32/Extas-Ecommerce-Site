// S14 · PR 295 — the Day-3 review request (journey step `day3Review`, CN-019: on by default) as a record the review
// manager can count, and never a request that cannot be answered (SIM-F-008; CN-016: no promise the shop cannot keep).
//
// - Before it goes: while the shop's reviews are switched off (`reviews.submit`) the request is skipped
//   (REVIEWS_OFF) — it would ask for something he cannot write; and with `reviews.requests.skipReviewed` (on) an order
//   whose every line he has already reviewed is not asked again (REVIEWED).
// - When it went: one ReviewRequest row per order (the first channel that delivered it), with the channel and the
//   time; the shop's review form fills in `reviewId` when he answers (@extas/catalogue `submitCustomerReview`).
import type { Prisma } from '@extas/db/client';
import { setting, type MessagesDeps } from './context';

/** The journey step that asks for a review. */
export const REVIEW_STEP = 'day3Review';

/** Why the review request does not go (null: it may go). */
export async function reviewAskBlock(deps: MessagesDeps, storeId: number, orderId: string): Promise<'REVIEWS_OFF' | 'REVIEWED' | null> {
  const [submit, requests] = await Promise.all([setting(deps, storeId, 'reviews.submit'), setting(deps, storeId, 'reviews.requests')]);
  if (!submit.enabled) return 'REVIEWS_OFF';
  if (!requests.skipReviewed) return null;
  const lines = await deps.db.orderItem.findMany({ where: { storeId, orderId, status: 'ACTIVE' }, select: { id: true } });
  if (!lines.length) return null;
  const reviewed = await deps.db.review.count({ where: { storeId, orderItemId: { in: lines.map((l) => l.id) }, archivedAt: null } });
  return reviewed >= lines.length ? 'REVIEWED' : null;
}

/** Records the request once it went (inside the send's transaction); a second channel never overwrites the first. */
export async function recordReviewRequest(
  tx: Prisma.TransactionClient,
  r: { storeId: number; orderId: string; customerId: string | null; channel: string; at: Date },
): Promise<void> {
  await tx.reviewRequest.upsert({
    where: { orderId: r.orderId },
    create: { storeId: r.storeId, orderId: r.orderId, customerId: r.customerId, channel: r.channel as Prisma.ReviewRequestCreateInput['channel'], sentAt: r.at },
    update: {},
  });
}

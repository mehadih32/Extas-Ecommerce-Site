// S02 · PR 65 — product reviews, from the buyer's words to the product page (Blueprint D3.16, demo 30-product.js
// `pdp_reviewsSection` and 60-account.js `ord_revHTML`, SIM-F-008).
//
// THE WHOLE JOURNEY, AND WHERE IT IS REFUSED
//   1. Only a buyer writes a review, from My account, about a line of his own order (`submitCustomerReview`). With
//      `reviews.submit.onlyDelivered` on (it ships on) the order must have reached DELIVERED, and `withinDays` is how
//      long after delivery he may still write it. One review per order line (`reviews.moderation.oneReviewPerLine`).
//   2. The review is saved PENDING. **Nothing of it is shown anywhere** — not on the page, not in an average, not in
//      the search-engine rating — until a member of staff approves it (`moderateReview`, `reviews.moderate`).
//   3. On approval it is published with the time, and the verified-buyer mark is set from the order it came from.
//   4. Only then, and only while the owner has switched the photo perk on with his own amount
//      (`reviews.photoReward`), a review that carries the buyer's own photo earns that amount in his wallet: one
//      CREDIT in the existing ledger (PR 171/172), keyed by the review, so one review can never be paid twice.
//      Nobody and nothing pays it by itself (CLAUDE.md rule 6: money moves only on the owner's written OK, and his OK
//      here is the switch and the figure he typed).
//
// The shop's own reviews (the ones the owner is given on WhatsApp or in the shop) go in through `addStaffReview`
// (`reviews.write`): they count exactly like the others and carry `source: 'STAFF'`.
//
// There is no admin screen in this PR (the moderation queue is a follow-up on the new 14-section admin shell): the
// admin API (`/api/admin/reviews`) is the whole staff side, and it checks its permissions on the server, per store.
import { audit } from '@extas/auth';
import { z } from 'zod';
import { CatalogueError } from './errors';
import { allow, assertImage, found, logChange, parse, setting, type CatalogueDeps, type SettingsReader, type Tx, type Who } from './context';

/** What the buyer said about the size, in his own words. */
export const REVIEW_FITS = ['SMALL', 'RIGHT', 'BIG'] as const;
export type ReviewFit = (typeof REVIEW_FITS)[number];

/** Where a review came from: his account, the shop's own hands, or a file. */
export const REVIEW_SOURCES = ['CUSTOMER', 'STAFF', 'IMPORT'] as const;
export type ReviewSource = (typeof REVIEW_SOURCES)[number];

export const REVIEW_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'HIDDEN'] as const;
export type ReviewState = (typeof REVIEW_STATUSES)[number];

/** What the wallet ledger calls the photo-review reward (PR 171/172 `WalletEntry.reason`). */
export const REVIEW_REWARD_REASON = 'REVIEW_REWARD';
const WALLET_ACTIVE = 'ACTIVE';

const text = (max: number) => z.string().trim().max(max);

export const customerReviewSchema = z
  .object({
    /** The order he is reviewing, by its number as he sees it, and the line of it. */
    orderNumber: text(40).min(1),
    orderItemId: z.uuid(),
    rating: z.int().min(1).max(5),
    title: text(120).nullish(),
    body: text(5_000).nullish(),
    /** The name he chooses to show (null: the name on his account). */
    displayName: text(80).nullish(),
    fit: z.enum(REVIEW_FITS).nullish(),
    heightCm: z.int().min(80).max(260).nullish(),
    weightKg: z.int().min(25).max(250).nullish(),
    /** Photos he uploaded with it (already in the library, PR 22 / `uploadCustomerImage`). */
    photoAssetIds: z.array(z.uuid()).max(5).default([]),
  })
  .strict();

export const staffReviewSchema = z
  .object({
    productId: z.uuid().nullish(),
    comboId: z.uuid().nullish(),
    rating: z.int().min(1).max(5),
    title: text(120).nullish(),
    body: text(5_000).nullish(),
    displayName: text(80).nullish(),
    fit: z.enum(REVIEW_FITS).nullish(),
    heightCm: z.int().min(80).max(260).nullish(),
    weightKg: z.int().min(25).max(250).nullish(),
    sizeLabel: text(40).nullish(),
    colourName: text(60).nullish(),
    /** The shop knows this really is a buyer (he showed the order), so it may be marked verified. */
    isVerifiedPurchase: z.boolean().default(false),
    photoAssetIds: z.array(z.uuid()).max(5).default([]),
    /** A review the shop was given is usually ready to show; it still goes through the same check unless said so. */
    publish: z.boolean().default(false),
  })
  .strict();

export const reviewListSchema = z
  .object({
    status: z.enum(REVIEW_STATUSES).nullish(),
    productId: z.uuid().nullish(),
    /** Only reviews that carry a photo. */
    withPhoto: z.boolean().nullish(),
    /** Only reviews that earned nothing yet (the reward the owner switched on). */
    rewarded: z.boolean().nullish(),
    archived: z.enum(['no', 'only', 'all']).default('no'),
    limit: z.int().min(1).max(200).nullish(),
    cursor: z.uuid().nullish(),
  })
  .strict();

export const moderateSchema = z
  .object({
    action: z.enum(['approve', 'hide', 'reject', 'restore']),
    /** Why it is hidden or refused — the shop's own note, never shown to the customer. */
    reason: text(300).nullish(),
  })
  .strict();

export interface ReviewPhoto {
  assetId: string;
  sortOrder: number;
}

export interface ReviewRecord {
  id: string;
  productId: string | null;
  comboId: string | null;
  orderId: string | null;
  orderItemId: string | null;
  customerId: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  displayName: string | null;
  status: ReviewState;
  source: ReviewSource;
  isVerifiedPurchase: boolean;
  fit: ReviewFit | null;
  heightCm: number | null;
  weightKg: number | null;
  sizeLabel: string | null;
  colourName: string | null;
  publishedAt: string | null;
  moderatedAt: string | null;
  hiddenReason: string | null;
  reward: { amountMinor: number; walletEntryId: string | null; at: string } | null;
  photos: ReviewPhoto[];
  archivedAt: string | null;
  createdAt: string;
}

export interface ReviewList {
  reviews: ReviewRecord[];
  nextCursor: string | null;
  /** How many reviews are in each state right now (the queue's own counters). */
  counts: Record<ReviewState, number>;
}

const SELECT = {
  id: true,
  productId: true,
  comboId: true,
  orderId: true,
  orderItemId: true,
  customerId: true,
  rating: true,
  title: true,
  body: true,
  displayName: true,
  status: true,
  source: true,
  isVerifiedPurchase: true,
  fitVerdict: true,
  heightCm: true,
  weightKg: true,
  sizeLabel: true,
  colourName: true,
  publishedAt: true,
  moderatedAt: true,
  hiddenReason: true,
  rewardAmountMinor: true,
  rewardWalletEntryId: true,
  rewardedAt: true,
  archivedAt: true,
  createdAt: true,
  media: { select: { assetId: true, sortOrder: true }, orderBy: { sortOrder: 'asc' } },
} as const;

type Row = {
  id: string;
  productId: string | null;
  comboId: string | null;
  orderId: string | null;
  orderItemId: string | null;
  customerId: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  displayName: string | null;
  status: string;
  source: string;
  isVerifiedPurchase: boolean;
  fitVerdict: string | null;
  heightCm: number | null;
  weightKg: number | null;
  sizeLabel: string | null;
  colourName: string | null;
  publishedAt: Date | null;
  moderatedAt: Date | null;
  hiddenReason: string | null;
  rewardAmountMinor: number | null;
  rewardWalletEntryId: string | null;
  rewardedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  media: { assetId: string; sortOrder: number }[];
};

const fitOf = (v: string | null): ReviewFit | null => (v && (REVIEW_FITS as readonly string[]).includes(v) ? (v as ReviewFit) : null);
const stateOf = (v: string): ReviewState => ((REVIEW_STATUSES as readonly string[]).includes(v) ? (v as ReviewState) : 'PENDING');
const sourceOf = (v: string): ReviewSource => ((REVIEW_SOURCES as readonly string[]).includes(v) ? (v as ReviewSource) : 'CUSTOMER');
const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

function view(r: Row): ReviewRecord {
  return {
    id: r.id,
    productId: r.productId,
    comboId: r.comboId,
    orderId: r.orderId,
    orderItemId: r.orderItemId,
    customerId: r.customerId,
    rating: r.rating,
    title: r.title,
    body: r.body,
    displayName: r.displayName,
    status: stateOf(r.status),
    source: sourceOf(r.source),
    isVerifiedPurchase: r.isVerifiedPurchase,
    fit: fitOf(r.fitVerdict),
    heightCm: r.heightCm,
    weightKg: r.weightKg,
    sizeLabel: r.sizeLabel,
    colourName: r.colourName,
    publishedAt: iso(r.publishedAt),
    moderatedAt: iso(r.moderatedAt),
    hiddenReason: r.hiddenReason,
    reward: r.rewardedAt ? { amountMinor: r.rewardAmountMinor ?? 0, walletEntryId: r.rewardWalletEntryId, at: r.rewardedAt.toISOString() } : null,
    photos: r.media.map((m) => ({ assetId: m.assetId, sortOrder: m.sortOrder })),
    archivedAt: iso(r.archivedAt),
    createdAt: r.createdAt.toISOString(),
  };
}

// ------------------------------------------------------------------------------------------------ the customer's side

/** What the customer's side needs: the database, the settings and the clock. No actor: nobody signs in as staff here. */
export type ReviewPublicDeps = Pick<CatalogueDeps, 'db' | 'settings'> & { now?: () => Date };

const nowOf = (deps: { now?: () => Date }): Date => deps.now?.() ?? new Date();
const DAY_MS = 86_400_000;

async function submitRules(deps: ReviewPublicDeps, storeId: number) {
  const [submit, moderation] = await Promise.all([
    deps.settings.value('reviews.submit', { storeId }),
    deps.settings.value('reviews.moderation', { storeId }),
  ]);
  return { submit, moderation };
}

/** Why the review form is not offered on an order (`ok`: it is). */
export type ReviewChanceWhy = 'ok' | 'off' | 'not-delivered' | 'too-late' | 'not-found' | 'done';

/** PR 65 — whether this customer may still review this order, and which of its lines he has reviewed already. */
export async function reviewChance(
  deps: ReviewPublicDeps,
  input: { storeId: number; customerId: string; orderNumber: string },
): Promise<{ can: boolean; why: ReviewChanceWhy; lines: { orderItemId: string; reviewed: ReviewState | null }[] }> {
  const { submit, moderation } = await submitRules(deps, input.storeId);
  const order = await deps.db.order.findFirst({
    where: { storeId: input.storeId, number: input.orderNumber, customerId: input.customerId, archivedAt: null },
    select: { id: true, status: true, deliveredAt: true, items: { where: { status: 'ACTIVE' }, select: { id: true }, orderBy: { createdAt: 'asc' } } },
  });
  if (!order) return { can: false, why: 'not-found', lines: [] };
  const mine = await deps.db.review.findMany({
    where: { storeId: input.storeId, orderId: order.id, archivedAt: null },
    select: { orderItemId: true, status: true },
  });
  const by = new Map(mine.map((r) => [r.orderItemId, stateOf(r.status)]));
  const lines = order.items.map((i) => ({ orderItemId: i.id, reviewed: by.get(i.id) ?? null }));
  if (!submit.enabled) return { can: false, why: 'off', lines };
  const delivered = order.status === 'DELIVERED' && order.deliveredAt !== null;
  if (submit.onlyDelivered && !delivered) return { can: false, why: 'not-delivered', lines };
  if (submit.withinDays > 0 && order.deliveredAt && nowOf(deps).getTime() - order.deliveredAt.getTime() > submit.withinDays * DAY_MS) {
    return { can: false, why: 'too-late', lines };
  }
  // one line reviewed already does not close the order: the other lines can still be reviewed
  const open = moderation.oneReviewPerLine ? lines.some((l) => l.reviewed === null) : true;
  return { can: open, why: open ? 'ok' : 'done', lines };
}

export interface SubmitResult {
  id: string;
  status: ReviewState;
  /** What an approved photo review would be worth here, in poisha (null: the owner has not switched the perk on). */
  rewardMinor: number | null;
}

/**
 * PR 65 — the customer's own review of one line of his own order. It is saved PENDING: nothing of it is shown until a
 * member of staff approves it. The photo (if any) is already in the library; the review only points at it.
 */
export async function submitCustomerReview(deps: ReviewPublicDeps, buyer: { storeId: number; customerId: string }, input: unknown): Promise<SubmitResult> {
  const storeId = buyer.storeId;
  if (!Number.isInteger(storeId) || storeId < 1) throw new CatalogueError('INVALID_INPUT', 'store id must be a positive integer', ['storeId']);
  const d = parse(customerReviewSchema, input, 'review');
  const { submit, moderation } = await submitRules(deps, storeId);
  if (!submit.enabled) throw new CatalogueError('REVIEWS_OFF', 'reviews are switched off in this store');
  if (d.body && d.body.length > submit.bodyMax) throw new CatalogueError('INVALID_INPUT', 'the review is longer than allowed', ['body', `max:${submit.bodyMax}`]);
  const photos = submit.photos.enabled ? d.photoAssetIds.slice(0, submit.photos.max) : [];
  if (d.photoAssetIds.length && !submit.photos.enabled) throw new CatalogueError('INVALID_INPUT', 'photos on reviews are switched off', ['photoAssetIds']);

  const order = found(
    await deps.db.order.findFirst({
      where: { storeId, number: d.orderNumber, customerId: buyer.customerId, archivedAt: null },
      select: { id: true, status: true, deliveredAt: true },
    }),
    'order',
  );
  const delivered = order.status === 'DELIVERED' && order.deliveredAt !== null;
  if (submit.onlyDelivered && !delivered) throw new CatalogueError('NOT_DELIVERED', 'this order has not been delivered yet');
  if (submit.withinDays > 0 && order.deliveredAt && nowOf(deps).getTime() - order.deliveredAt.getTime() > submit.withinDays * DAY_MS) {
    throw new CatalogueError('TOO_LATE', 'the time for reviewing this order has passed', [`days:${submit.withinDays}`]);
  }
  const item = found(
    await deps.db.orderItem.findFirst({
      where: { id: d.orderItemId, storeId, orderId: order.id, status: 'ACTIVE' },
      select: { id: true, productId: true, comboId: true, sizeLabel: true, colourName: true },
    }),
    'order line',
  );
  if (moderation.oneReviewPerLine) {
    const already = await deps.db.review.findFirst({ where: { storeId, orderItemId: item.id, archivedAt: null }, select: { id: true } });
    if (already) throw new CatalogueError('CONFLICT', 'this line has been reviewed already', ['orderItemId']);
  }
  for (const [i, assetId] of photos.entries()) await assertImage(deps.db, storeId, assetId, `photoAssetIds.${i}`);

  const reward = await rewardRules(deps.settings, storeId);
  const created = await deps.db.$transaction(async (tx) => {
    const row = await tx.review.create({
      data: {
        storeId,
        productId: item.productId,
        comboId: item.comboId,
        orderId: order.id,
        orderItemId: item.id,
        customerId: buyer.customerId,
        rating: d.rating,
        title: d.title ?? null,
        body: d.body ?? null,
        displayName: d.displayName ?? null,
        status: 'PENDING',
        source: 'CUSTOMER',
        isVerifiedPurchase: moderation.verifyFromOrder,
        fitVerdict: d.fit ?? null,
        heightCm: d.heightCm ?? null,
        weightKg: d.weightKg ?? null,
        sizeLabel: item.sizeLabel,
        colourName: item.colourName,
        createdAt: nowOf(deps),
      },
      select: { id: true, status: true },
    });
    for (const [i, assetId] of photos.entries()) {
      await tx.reviewMedia.create({ data: { storeId, reviewId: row.id, assetId, sortOrder: i } });
    }
    await logCustomer(tx, storeId, row.id, { orderItemId: item.id, rating: d.rating, photos: photos.length, status: 'PENDING' });
    return row;
  });
  return { id: created.id, status: 'PENDING', rewardMinor: reward.live && photos.length ? reward.amountMinor : null };
}

/** A customer's own review is logged too (the queue shows where a review came from); no staff member acted. */
const logCustomer = (tx: Tx, storeId: number, id: string, after: unknown): Promise<void> =>
  audit(tx, { staffUserId: null }, { storeId, action: 'reviews.submit', entityType: 'Review', entityId: id, after }, { source: 'shop-account' });

// -------------------------------------------------------------------------------------------------- the staff's side

/** PR 65 — the reviews of this store, newest first, with the queue's counters (`reviews.read`). */
export async function listReviews(deps: CatalogueDeps, who: Who, query: unknown = {}): Promise<ReviewList> {
  await allow(deps, who, 'reviews.read');
  const q = parse(reviewListSchema, query, 'review list query');
  const moderation = await setting(deps, who, 'reviews.moderation');
  const take = q.limit ?? moderation.pageSize;
  const where = {
    storeId: who.storeId,
    ...(q.status ? { status: q.status } : {}),
    ...(q.productId ? { productId: q.productId } : {}),
    ...(q.withPhoto === true ? { media: { some: {} } } : {}),
    ...(q.withPhoto === false ? { media: { none: {} } } : {}),
    ...(q.rewarded === true ? { rewardedAt: { not: null } } : {}),
    ...(q.rewarded === false ? { rewardedAt: null } : {}),
    ...(q.archived === 'no' ? { archivedAt: null } : q.archived === 'only' ? { archivedAt: { not: null } } : {}),
  };
  const [rows, counts] = await Promise.all([
    deps.db.review.findMany({
      where,
      select: SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    }),
    deps.db.review.groupBy({ by: ['status'], where: { storeId: who.storeId, archivedAt: null }, _count: { _all: true } }),
  ]);
  const page = rows.slice(0, take) as unknown as Row[];
  const byState = { PENDING: 0, APPROVED: 0, REJECTED: 0, HIDDEN: 0 } as Record<ReviewState, number>;
  for (const c of counts) byState[stateOf(c.status)] = c._count._all;
  return { reviews: page.map(view), nextCursor: rows.length > take ? (page[page.length - 1]?.id ?? null) : null, counts: byState };
}

/** PR 65 — one review (`reviews.read`). */
export async function getReview(deps: CatalogueDeps, who: Who, id: string): Promise<ReviewRecord> {
  await allow(deps, who, 'reviews.read');
  const row = found(await deps.db.review.findFirst({ where: { id, storeId: who.storeId }, select: SELECT }), 'review');
  return view(row as unknown as Row);
}

/** What the owner set for the photo perk, and whether it can pay anything at all right now. */
async function rewardRules(settings: SettingsReader, storeId: number) {
  const r = await settings.value('reviews.photoReward', { storeId });
  const amountMinor = r.amountMinor ?? 0;
  return { ...r, amountMinor, live: r.enabled && amountMinor > 0 };
}

export interface ModerateResult {
  review: ReviewRecord;
  /** What was credited to his wallet, if anything (null: nothing moved — the usual answer). */
  reward: { amountMinor: number; walletEntryId: string } | null;
}

/**
 * PR 65 — the shop's check (`reviews.moderate`): approve (publish), hide, refuse or put a hidden review back in the
 * queue. Approving a photo review pays the owner's photo reward, and only then: never on submit, never by a job.
 */
export async function moderateReview(deps: CatalogueDeps, who: Who, id: string, input: unknown): Promise<ModerateResult> {
  await allow(deps, who, 'reviews.moderate');
  const d = parse(moderateSchema, input, 'moderation');
  const before = found(await deps.db.review.findFirst({ where: { id, storeId: who.storeId }, select: SELECT }), 'review');
  const row = before as unknown as Row;
  if (row.archivedAt) throw new CatalogueError('CONFLICT', 'this review is archived');
  const now = deps.now?.() ?? new Date();
  const status: ReviewState = d.action === 'approve' ? 'APPROVED' : d.action === 'hide' ? 'HIDDEN' : d.action === 'reject' ? 'REJECTED' : 'PENDING';
  const reward = d.action === 'approve' ? await rewardRules(deps.settings, who.storeId) : null;
  const earns =
    reward !== null &&
    reward.live &&
    row.media.length > 0 &&
    row.rewardedAt === null &&
    row.customerId !== null &&
    row.rating >= reward.minRating;

  const out = await deps.db.$transaction(async (tx) => {
    let paid: { amountMinor: number; walletEntryId: string } | null = null;
    if (earns && reward && row.customerId) paid = await payPhotoReward(tx, who, { reviewId: row.id, customerId: row.customerId, orderId: row.orderId, amountMinor: reward.amountMinor, onePerOrder: reward.onePerOrder, now });
    const after = await tx.review.update({
      where: { id: row.id },
      data: {
        status,
        publishedAt: status === 'APPROVED' ? (row.publishedAt ?? now) : null,
        moderatedById: who.actor.staffUserId,
        moderatedAt: now,
        hiddenReason: status === 'HIDDEN' || status === 'REJECTED' ? (d.reason ?? null) : null,
        ...(paid ? { rewardAmountMinor: paid.amountMinor, rewardWalletEntryId: paid.walletEntryId, rewardedAt: now } : {}),
      },
      select: SELECT,
    });
    await logChange(tx, who, `reviews.${d.action}`, 'Review', row.id, { status: row.status, publishedAt: iso(row.publishedAt) }, { status, reason: d.reason ?? null, reward: paid });
    return { after: after as unknown as Row, paid };
  });
  return { review: view(out.after), reward: out.paid };
}

/**
 * The photo-review reward as one entry in the wallet ledger (PR 171/172): the account is locked, its cached balance
 * moves with the entry, and the entry's key is the review, so a second approval of the same review pays nothing.
 */
async function payPhotoReward(
  tx: Tx,
  who: Who,
  input: { reviewId: string; customerId: string; orderId: string | null; amountMinor: number; onePerOrder: boolean; now: Date },
): Promise<{ amountMinor: number; walletEntryId: string } | null> {
  if (input.onePerOrder && input.orderId) {
    const paidBefore = await tx.review.findFirst({ where: { storeId: who.storeId, orderId: input.orderId, rewardedAt: { not: null }, NOT: { id: input.reviewId } }, select: { id: true } });
    if (paidBefore) return null;
  }
  const locked = await tx.$queryRaw<{ id: string; balanceMinor: number }[]>`
    SELECT "id"::text AS id, "balanceMinor" FROM "WalletAccount"
    WHERE "storeId" = ${who.storeId} AND "customerId" = ${input.customerId}::uuid AND "status" = ${WALLET_ACTIVE} FOR UPDATE`;
  const wallet =
    locked[0] ??
    (await tx.walletAccount.create({ data: { storeId: who.storeId, customerId: input.customerId, balanceMinor: 0, status: WALLET_ACTIVE }, select: { id: true, balanceMinor: true } }));
  const after = wallet.balanceMinor + input.amountMinor;
  await tx.walletAccount.update({ where: { id: wallet.id }, data: { balanceMinor: after } });
  const entry = await tx.walletEntry.create({
    data: {
      storeId: who.storeId,
      walletId: wallet.id,
      direction: 'CREDIT',
      amountMinor: input.amountMinor,
      balanceAfterMinor: after,
      reason: REVIEW_REWARD_REASON,
      idempotencyKey: `review:${input.reviewId}`,
      actorId: who.actor.staffUserId,
      createdAt: input.now,
    },
    select: { id: true },
  });
  return { amountMinor: input.amountMinor, walletEntryId: entry.id };
}

/** PR 65 — the verified-buyer mark by hand, when the shop has seen the order itself (`reviews.moderate`). */
export async function setReviewVerified(deps: CatalogueDeps, who: Who, id: string, verified: boolean): Promise<ReviewRecord> {
  await allow(deps, who, 'reviews.moderate');
  if (typeof verified !== 'boolean') throw new CatalogueError('INVALID_INPUT', 'verified must be true or false', ['verified']);
  const before = found(await deps.db.review.findFirst({ where: { id, storeId: who.storeId }, select: SELECT }), 'review');
  const row = before as unknown as Row;
  const after = await deps.db.$transaction(async (tx) => {
    const r = await tx.review.update({ where: { id: row.id }, data: { isVerifiedPurchase: verified }, select: SELECT });
    await logChange(tx, who, 'reviews.verify', 'Review', row.id, { isVerifiedPurchase: row.isVerifiedPurchase }, { isVerifiedPurchase: verified });
    return r as unknown as Row;
  });
  return view(after);
}

/**
 * PR 65 (D3.16) — a review the shop itself collected (`reviews.write`): it counts exactly like a customer's own, and
 * it goes through the same check unless the writer publishes it straight away (then he needs `reviews.moderate` too).
 */
export async function addStaffReview(deps: CatalogueDeps, who: Who, input: unknown): Promise<ReviewRecord> {
  await allow(deps, who, 'reviews.write');
  const d = parse(staffReviewSchema, input, 'review');
  if (d.publish) await allow(deps, who, 'reviews.moderate');
  if (!d.productId && !d.comboId) throw new CatalogueError('INVALID_INPUT', 'a review is about a product or a set', ['productId']);
  if (d.productId) found(await deps.db.product.findFirst({ where: { id: d.productId, storeId: who.storeId }, select: { id: true } }), 'product');
  if (d.comboId) found(await deps.db.combo.findFirst({ where: { id: d.comboId, storeId: who.storeId }, select: { id: true } }), 'set');
  for (const [i, assetId] of d.photoAssetIds.entries()) await assertImage(deps.db, who.storeId, assetId, `photoAssetIds.${i}`);
  const now = deps.now?.() ?? new Date();
  const created = await deps.db.$transaction(async (tx) => {
    const row = await tx.review.create({
      data: {
        storeId: who.storeId,
        productId: d.productId ?? null,
        comboId: d.comboId ?? null,
        rating: d.rating,
        title: d.title ?? null,
        body: d.body ?? null,
        displayName: d.displayName ?? null,
        status: d.publish ? 'APPROVED' : 'PENDING',
        source: 'STAFF',
        isVerifiedPurchase: d.isVerifiedPurchase,
        fitVerdict: d.fit ?? null,
        heightCm: d.heightCm ?? null,
        weightKg: d.weightKg ?? null,
        sizeLabel: d.sizeLabel ?? null,
        colourName: d.colourName ?? null,
        publishedAt: d.publish ? now : null,
        moderatedById: d.publish ? who.actor.staffUserId : null,
        moderatedAt: d.publish ? now : null,
        createdAt: now,
      },
      select: SELECT,
    });
    for (const [i, assetId] of d.photoAssetIds.entries()) {
      await tx.reviewMedia.create({ data: { storeId: who.storeId, reviewId: row.id, assetId, sortOrder: i } });
    }
    await logChange(tx, who, 'reviews.add', 'Review', row.id, null, { rating: d.rating, status: d.publish ? 'APPROVED' : 'PENDING', source: 'STAFF' });
    return row as unknown as Row;
  });
  return view(created);
}

// ------------------------------------------------------------------------------- what PR 59's learning reads from here

export interface ReviewFitSignal {
  productId: string;
  orderItemId: string | null;
  fit: ReviewFit;
  heightCm: number | null;
  weightKg: number | null;
  sizeLabel: string | null;
}

/**
 * PR 59 — the approved reviews of a window that say how the size felt, for the size report and the ease model
 * (`catalogue.sizeAdvice.train.useReviews`). Only APPROVED reviews: a waiting or hidden review teaches nothing.
 */
export async function approvedFitSignals(deps: Pick<CatalogueDeps, 'db'>, storeId: number, from: Date, to: Date): Promise<ReviewFitSignal[]> {
  const rows = await deps.db.review.findMany({
    where: { storeId, status: 'APPROVED', archivedAt: null, fitVerdict: { not: null }, productId: { not: null }, createdAt: { gte: from, lte: to } },
    select: { productId: true, orderItemId: true, fitVerdict: true, heightCm: true, weightKg: true, sizeLabel: true },
  });
  return rows.flatMap((r) => {
    const fit = fitOf(r.fitVerdict);
    return fit && r.productId ? [{ productId: r.productId, orderItemId: r.orderItemId, fit, heightCm: r.heightCm, weightKg: r.weightKg, sizeLabel: r.sizeLabel }] : [];
  });
}

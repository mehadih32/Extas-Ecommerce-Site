// PR 65 — a product's approved reviews for its page, with their photos, and the product's own average and count.
// Approved only (`status: 'APPROVED'` with a published time): a waiting, hidden or refused review is not read here, is
// in no average and reaches no page. Read-only and public — the customer behind a review is never read, only the name
// he chose to show. Without a database (CI's build) or when it is slow, no reviews: the block is simply not drawn.
import { getPrisma } from '@extas/db/client';
import { imageSources, type ImageSource } from '@extas/media';
import { settingsResolver, settingsTimeoutMs, withTimeout } from '../settings';
import type { PdpFit, PdpReviewRow } from './pdp-reviews';

const FITS: readonly string[] = ['SMALL', 'RIGHT', 'BIG'];

export interface ProductReviewsData {
  rows: PdpReviewRow[];
  average: number;
  total: number;
}

const EMPTY: ProductReviewsData = { rows: [], average: 0, total: 0 };

/** The reviews one product page shows, the ones with a photo first, and the product's own average over all of them. */
export async function productReviews(storeId: number, productId: string, take: number): Promise<ProductReviewsData> {
  if (!process.env.DATABASE_URL) return EMPTY;
  const prisma = getPrisma();
  const where = { storeId, productId, status: 'APPROVED' as const, archivedAt: null, publishedAt: { not: null } };
  try {
    return await withTimeout(
      (async () => {
        const [rows, agg] = await Promise.all([
          prisma.review.findMany({
            where,
            // the photo reviews first, then the newest (the model orders them again for the row it draws)
            orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
            take: Math.max(take * 4, take),
            select: {
              id: true,
              rating: true,
              title: true,
              body: true,
              displayName: true,
              isVerifiedPurchase: true,
              heightCm: true,
              weightKg: true,
              sizeLabel: true,
              colourName: true,
              fitVerdict: true,
              media: { select: { assetId: true, sortOrder: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
            },
          }),
          prisma.review.aggregate({ where, _avg: { rating: true }, _count: { _all: true } }),
        ]);
        const resolver = settingsResolver();
        const assetIds = [...new Set(rows.flatMap((r) => (r.media[0] ? [r.media[0].assetId] : [])))];
        const photos = assetIds.length && resolver ? await imageSources({ db: prisma, settings: resolver }, storeId, assetIds) : new Map<string, ImageSource>();
        return {
          rows: rows.map((r) => ({
            id: r.id,
            rating: r.rating,
            title: r.title,
            body: r.body ?? '',
            name: r.displayName,
            verified: r.isVerifiedPurchase,
            heightCm: r.heightCm,
            weightKg: r.weightKg,
            sizeLabel: r.sizeLabel,
            colourName: r.colourName,
            fit: r.fitVerdict && FITS.includes(r.fitVerdict) ? (r.fitVerdict as PdpFit) : null,
            photo: (r.media[0] && photos.get(r.media[0].assetId)) ?? null,
          })),
          average: agg._avg.rating ?? 0,
          total: agg._count._all,
        };
      })(),
      settingsTimeoutMs() * 2,
    );
  } catch (e) {
    console.warn(`shop: product reviews unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return EMPTY;
  }
}

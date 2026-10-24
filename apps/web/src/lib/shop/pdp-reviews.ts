// PR 65 — the reviews block of the product page, as a plain model (demo 30-product.js `pdp_reviewsSection`): the
// summary box (the average, the stars, how many) and the cards of the sliding row, the ones with a photo first.
//
// Only approved reviews ever reach here (pdp-reviews-load.ts), and a card carries only what its review really has:
// no height, no weight and no size line unless the buyer gave them, no photo unless he sent one, no "Verified buyer"
// unless the review came from an order. The average counts every approved review of the product, whatever this row
// shows, so it is never flattered by the three cards on the page.
import type { PdpReviewsSettings } from '@extas/settings';
import type { ImageSource } from '@extas/media';

/** How a size felt, as the review says it. */
export type PdpFit = 'SMALL' | 'RIGHT' | 'BIG';

export interface PdpReviewRow {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  /** The name he chose to show (null: no name, never his phone or e-mail). */
  name: string | null;
  verified: boolean;
  heightCm: number | null;
  weightKg: number | null;
  /** The size and colour he bought, as his order stored them. */
  sizeLabel: string | null;
  colourName: string | null;
  fit: PdpFit | null;
  photo: ImageSource | null;
}

export interface PdpReviewsView {
  /** Every approved review of this product: the average and how many (the summary box). */
  average: number;
  total: number;
  cards: PdpReviewRow[];
  /** How many of the cards carry a photo (the row is worth sliding when more than one card is in it). */
  withPhoto: number;
}

/** The one star shape the shop draws, filled for a star the review gave and in the line colour for the rest. */
export const REVIEW_STAR_PATH = 'M12 2l3 6.5 7 .9-5 4.8 1.2 7L12 17.8 5.8 21.2 7 14.2 2 9.4l7-.9z';

/** 5'9" from 175 cm — the height as a Bangladeshi customer says it (the finder asks in feet and inches too). */
const CM_PER_INCH = 2.54;

export interface HeightParts {
  feet: number;
  inches: number;
}

export function heightParts(cm: number | null): HeightParts | null {
  if (cm === null || !Number.isFinite(cm) || cm < 80 || cm > 260) return null;
  const total = Math.round(cm / CM_PER_INCH);
  return { feet: Math.floor(total / 12), inches: total % 12 };
}

/**
 * The block for a product's approved reviews, or null: nothing to show (the section is then not drawn at all — a
 * product with no review never shows an empty box or a made-up rating).
 */
export function pdpReviewsView(rows: readonly PdpReviewRow[], agg: { average: number; total: number }, set: PdpReviewsSettings): PdpReviewsView | null {
  if (!set.on) return null;
  const clean = rows.filter((r) => r.rating >= 1 && r.rating <= 5 && (r.body.trim().length > 0 || r.photo !== null));
  if (!clean.length || agg.total < 1) return null;
  const shaped = clean.map((r) => ({
    ...r,
    body: r.body.trim(),
    name: r.name?.trim() || null,
    verified: set.verifiedTag && r.verified,
    photo: set.photos ? r.photo : null,
    heightCm: set.bodyLine ? r.heightCm : null,
    weightKg: set.bodyLine ? r.weightKg : null,
    sizeLabel: set.bodyLine ? r.sizeLabel : null,
    colourName: set.bodyLine ? r.colourName : null,
  }));
  // a buyer's photo is the most persuasive thing on the page, so it must not sit last (demo note 18+44)
  const ordered = set.photosFirst ? [...shaped].sort((a, b) => (a.photo ? 0 : 1) - (b.photo ? 0 : 1)) : shaped;
  const cards = ordered.slice(0, set.max);
  return { average: agg.average, total: agg.total, cards, withPhoto: cards.filter((c) => c.photo !== null).length };
}

/** The rating line under the product title ("4.8 · 12 reviews"), or null while there is nothing true to say. */
export function ratingLineOf(view: PdpReviewsView | null, set: PdpReviewsSettings): { average: number; total: number } | null {
  if (!view || !set.ratingLine || view.total < 1) return null;
  return { average: view.average, total: view.total };
}

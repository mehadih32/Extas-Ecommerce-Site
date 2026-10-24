// PR 65 — the reviews block of the product page as a plain model: what the owner's switches do to it, and the two
// rules it must never break (a card shows only what its review really carries, and the average is over every approved
// review of the product, not over the three cards drawn).
import { describe, expect, it } from 'vitest';
import type { ImageSource } from '@extas/media';
import { registry } from '@extas/settings';
import { heightParts, pdpReviewsView, ratingLineOf, type PdpReviewRow } from './pdp-reviews';

const SET = registry['pdp.reviews'].default; // the shipped defaults, never numbers written here
const PHOTO: ImageSource = {
  id: '0199a2b1-0000-7000-8000-000000000065',
  dominantColor: '#1F2A44',
  altEn: 'Sample review photo',
  altBn: 'নমুনা রিভিউ ছবি',
  ratio: { width: 3, height: 4 },
  variants: [],
  slots: {} as ImageSource['slots'],
  phoneMaxWidth: 390,
};

function row(id: string, over: Partial<PdpReviewRow> = {}): PdpReviewRow {
  return {
    id,
    rating: 5,
    title: null,
    body: 'Sample review: the fit was right.',
    name: 'Sample buyer',
    verified: true,
    heightCm: 175,
    weightKg: 72,
    sizeLabel: 'M',
    colourName: 'Navy',
    fit: 'RIGHT',
    photo: null,
    ...over,
  };
}

describe('the product page reviews block (PR 65)', () => {
  it('shows nothing at all when the block is off, when there is no review, or when nothing can be shown', () => {
    expect(pdpReviewsView([row('a')], { average: 5, total: 1 }, { ...SET, on: false })).toBeNull();
    expect(pdpReviewsView([], { average: 0, total: 0 }, SET)).toBeNull();
    // a review with neither words nor a photo (a bare star) is no card
    expect(pdpReviewsView([row('a', { body: '   ' })], { average: 5, total: 1 }, SET)).toBeNull();
    // a photo with no words is a card
    expect(pdpReviewsView([row('a', { body: '', photo: PHOTO })], { average: 5, total: 1 }, SET)?.cards).toHaveLength(1);
  });

  it('puts the buyers\' photos first and never draws more cards than the owner allows', () => {
    const rows = [row('a'), row('b'), row('c', { photo: PHOTO }), row('d', { photo: PHOTO }), row('e')];
    const view = pdpReviewsView(rows, { average: 4.6, total: 12 }, SET)!;
    expect(view.cards).toHaveLength(SET.max);
    expect(view.cards.slice(0, 2).map((c) => c.id)).toEqual(['c', 'd']);
    expect(view.withPhoto).toBe(2);
    // the order the rows came in is kept inside each group (newest first, as the read gives them)
    const keptOrder = pdpReviewsView(rows, { average: 4.6, total: 12 }, { ...SET, photosFirst: false, max: 5 })!;
    expect(keptOrder.cards.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('the average and the count are over every approved review, not over the cards drawn', () => {
    const view = pdpReviewsView([row('a'), row('b')], { average: 4.25, total: 40 }, SET)!;
    expect(view).toMatchObject({ average: 4.25, total: 40 });
    expect(view.cards).toHaveLength(2);
  });

  it('each switch takes its own part off the card, and nothing else', () => {
    const rows = [row('a', { photo: PHOTO })];
    const noBody = pdpReviewsView(rows, { average: 5, total: 1 }, { ...SET, bodyLine: false })!.cards[0]!;
    expect(noBody).toMatchObject({ heightCm: null, weightKg: null, sizeLabel: null, colourName: null });
    expect(noBody.photo).not.toBeNull();
    expect(noBody.fit).toBe('RIGHT'); // the fit tag is the review's own word, not the body line
    const noPhotos = pdpReviewsView(rows, { average: 5, total: 1 }, { ...SET, photos: false })!.cards[0]!;
    expect(noPhotos.photo).toBeNull();
    expect(pdpReviewsView(rows, { average: 5, total: 1 }, { ...SET, photos: false })!.withPhoto).toBe(0);
    const noTag = pdpReviewsView(rows, { average: 5, total: 1 }, { ...SET, verifiedTag: false })!.cards[0]!;
    expect(noTag.verified).toBe(false);
  });

  it('a card never claims a buyer it does not have: a review with no name and no mark stays that way', () => {
    const card = pdpReviewsView([row('a', { name: '  ', verified: false })], { average: 3, total: 1 }, SET)!.cards[0]!;
    expect(card.name).toBeNull();
    expect(card.verified).toBe(false);
  });

  it('the rating line says what the summary says, and nothing while the owner has it off', () => {
    const view = pdpReviewsView([row('a')], { average: 4.8, total: 12 }, SET)!;
    expect(ratingLineOf(view, SET)).toEqual({ average: 4.8, total: 12 });
    expect(ratingLineOf(view, { ...SET, ratingLine: false })).toBeNull();
    expect(ratingLineOf(null, SET)).toBeNull();
  });

  it('his height is said the way he says it, in feet and inches, and only when it is a real height', () => {
    expect(heightParts(175)).toEqual({ feet: 5, inches: 9 });
    expect(heightParts(183)).toEqual({ feet: 6, inches: 0 });
    expect(heightParts(null)).toBeNull();
    expect(heightParts(40)).toBeNull();
    expect(heightParts(300)).toBeNull();
    expect(heightParts(Number.NaN)).toBeNull();
  });
});

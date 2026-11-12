// S24 · PR 475 — pure tests for the combo/gift-set composition studio's vocabulary, its "never invent" plan (each
// piece's own fact, never derived here), the "ask for the missing piece" message/requests, the piece-tag
// round-trip, and the piece-count rule (no database).
import { describe, expect, it } from 'vitest';
import { PHOTOSHOOT_COMBO_GIFT_SET_LAYOUTS } from '@extas/settings';
import {
  comboGiftSetMissingPieceMessage,
  comboGiftSetMissingPieceRequests,
  comboGiftSetPiecesFromTags,
  comboGiftSetPieceTag,
  COMBO_GIFT_SET_KINDS,
  COMBO_GIFT_SET_LAYOUTS,
  COMBO_GIFT_SET_STUDIO_TAG,
  isComboGiftSetKind,
  isComboGiftSetLayout,
  isValidComboGiftSetPieceCount,
  MAX_COMBO_GIFT_SET_PIECES,
  MIN_COMBO_GIFT_SET_PIECES,
  missingComboGiftSetPieces,
  planComboGiftSetComposition,
} from './comboGiftSetStudio';

describe('COMBO_GIFT_SET_KINDS / COMBO_GIFT_SET_LAYOUTS', () => {
  it('names exactly combo and gift_set, with no duplicates', () => {
    expect(COMBO_GIFT_SET_KINDS).toEqual(['combo', 'gift_set']);
    expect(new Set(COMBO_GIFT_SET_KINDS).size).toBe(COMBO_GIFT_SET_KINDS.length);
  });

  it('names three layouts, with no duplicates, and never reuses packages/combos own layout names', () => {
    expect(COMBO_GIFT_SET_LAYOUTS).toEqual(['flat_lay_grouped', 'standing_grouped', 'boxed_gift']);
    expect(new Set(COMBO_GIFT_SET_LAYOUTS).size).toBe(COMBO_GIFT_SET_LAYOUTS.length);
    for (const l of COMBO_GIFT_SET_LAYOUTS) expect(['side_by_side', 'top_and_bottom', 'three_up']).not.toContain(l);
  });
});

describe('@extas/settings keeps the same 3 layout keys — the two lists can never drift apart silently', () => {
  it('matches COMBO_GIFT_SET_LAYOUTS exactly, in the same order', () => {
    expect(PHOTOSHOOT_COMBO_GIFT_SET_LAYOUTS).toEqual(COMBO_GIFT_SET_LAYOUTS);
  });
});

describe('isComboGiftSetKind / isComboGiftSetLayout', () => {
  it('accept every listed value and refuse anything else', () => {
    for (const k of COMBO_GIFT_SET_KINDS) expect(isComboGiftSetKind(k)).toBe(true);
    expect(isComboGiftSetKind('bundle')).toBe(false);
    expect(isComboGiftSetKind(1)).toBe(false);
    for (const l of COMBO_GIFT_SET_LAYOUTS) expect(isComboGiftSetLayout(l)).toBe(true);
    expect(isComboGiftSetLayout('side_by_side')).toBe(false);
  });
});

describe('isValidComboGiftSetPieceCount', () => {
  it('accepts 2 through 6, refuses fewer, more, or a non-integer', () => {
    expect(isValidComboGiftSetPieceCount(MIN_COMBO_GIFT_SET_PIECES)).toBe(true);
    expect(isValidComboGiftSetPieceCount(MAX_COMBO_GIFT_SET_PIECES)).toBe(true);
    expect(isValidComboGiftSetPieceCount(1)).toBe(false);
    expect(isValidComboGiftSetPieceCount(7)).toBe(false);
    expect(isValidComboGiftSetPieceCount(2.5)).toBe(false);
  });
});

describe('planComboGiftSetComposition / missingComboGiftSetPieces', () => {
  it('is ready for a piece with a real, linked photo on file', () => {
    expect(planComboGiftSetComposition([{ productId: 'p1', hasLinkedPhoto: true }])).toEqual([{ productId: 'p1', ready: true }]);
  });

  it("is not ready for a piece with no linked photo — C7.6's never-invent rule", () => {
    expect(planComboGiftSetComposition([{ productId: 'p1', hasLinkedPhoto: false }])).toEqual([{ productId: 'p1', ready: false, reason: 'NO_PIECE_PHOTO' }]);
  });

  it('names only the pieces still missing a photo, in order, leaving ready ones out', () => {
    const pieces = [
      { productId: 'p1', hasLinkedPhoto: true },
      { productId: 'p2', hasLinkedPhoto: false },
      { productId: 'p3', hasLinkedPhoto: false },
    ];
    expect(missingComboGiftSetPieces(pieces)).toEqual(['p2', 'p3']);
  });

  it('is empty once every piece has a real, linked photo', () => {
    expect(missingComboGiftSetPieces([{ productId: 'p1', hasLinkedPhoto: true }, { productId: 'p2', hasLinkedPhoto: true }])).toEqual([]);
  });
});

describe('comboGiftSetMissingPieceMessage / comboGiftSetMissingPieceRequests', () => {
  it('names the product in plain words and says it is never invented', () => {
    const msg = comboGiftSetMissingPieceMessage('11111111-1111-4111-8111-111111111111');
    expect(msg).toContain('11111111-1111-4111-8111-111111111111');
    expect(msg.toLowerCase()).toContain('never invented');
  });

  it('asks once per missing piece, never for a ready one', () => {
    const reqs = comboGiftSetMissingPieceRequests([
      { productId: 'p1', hasLinkedPhoto: true },
      { productId: 'p2', hasLinkedPhoto: false },
    ]);
    expect(reqs).toHaveLength(1);
    expect(reqs[0]).toMatchObject({ productId: 'p2' });
    expect(reqs[0]?.message.length).toBeGreaterThan(0);
  });

  it('is empty once every piece already has a real, linked photo', () => {
    expect(comboGiftSetMissingPieceRequests([{ productId: 'p1', hasLinkedPhoto: true }])).toEqual([]);
  });
});

describe('comboGiftSetPieceTag / comboGiftSetPiecesFromTags — round trip', () => {
  it('tags a piece as piece:<productId>:<sourceAssetId>', () => {
    expect(comboGiftSetPieceTag({ productId: 'prod-1', sourceAssetId: 'asset-1' })).toBe('piece:prod-1:asset-1');
  });

  it('reads every piece tag back, in order, ignoring unrelated tags', () => {
    const tags = [COMBO_GIFT_SET_STUDIO_TAG, 'combo', 'flat_lay_grouped', 'piece_count:2', 'piece:prod-1:asset-1', 'piece:prod-2:asset-2'];
    expect(comboGiftSetPiecesFromTags(tags)).toEqual([
      { productId: 'prod-1', sourceAssetId: 'asset-1' },
      { productId: 'prod-2', sourceAssetId: 'asset-2' },
    ]);
  });

  it('is empty when no piece tag is present', () => {
    expect(comboGiftSetPiecesFromTags([COMBO_GIFT_SET_STUDIO_TAG, 'combo'])).toEqual([]);
  });

  it('round-trips a full set of real UUID pieces unchanged', () => {
    const pieces = [
      { productId: '11111111-1111-4111-8111-111111111111', sourceAssetId: 'aaaaaaaa-1111-4111-8111-111111111111' },
      { productId: '22222222-2222-4222-8222-222222222222', sourceAssetId: 'bbbbbbbb-2222-4222-8222-222222222222' },
    ];
    const tags = pieces.map(comboGiftSetPieceTag);
    expect(comboGiftSetPiecesFromTags(tags)).toEqual(pieces);
  });
});

// S24 · PR 474 (registry v294): ladies/kids/part-model library assignments, the per-model styling guideline, and
// the dedicated kids-model gate — all empty/off by default (CN-018).
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import {
  ASSIGNABLE_MODEL_LIBRARIES,
  PHOTOSHOOT_KIDS_MODEL_ENABLED_DEFAULT,
  photoshootModelLibraryAssignmentsSchema,
  photoshootModelLibrarySettings,
  photoshootModelStylingGuidelineSchema,
} from '../src/registry-photoshoot-model-library';

describe('photoshoot model library settings (v294)', () => {
  it('are in the registry at version 304, store-scoped, labelled in English and Bengali, their default valid', () => {
    for (const [key, s] of Object.entries(photoshootModelLibrarySettings)) {
      expect(registry[key as keyof typeof registry]).toBe(s);
      expect(s.version, key).toBe(304);
      expect(s.scope, key).toBe('store');
      expect(s.schema.safeParse(s.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], s.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], s.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it("the owner's own data (assignments and styling guideline) ships with no value, never an empty object (PR 509)", () => {
    expect(photoshootModelLibrarySettings['studio.photoshoot.modelLibraryAssignments'].isOwnerData).toBe(true);
    expect(photoshootModelLibrarySettings['studio.photoshoot.modelLibraryAssignments'].default).toBeNull();
    expect(photoshootModelLibrarySettings['studio.photoshoot.modelStylingGuideline'].isOwnerData).toBe(true);
    expect(photoshootModelLibrarySettings['studio.photoshoot.modelStylingGuideline'].default).toBeNull();
  });

  it('the kids-model gate is a plain feature switch, off as it ships, never owner data', () => {
    expect(photoshootModelLibrarySettings['studio.photoshoot.kidsModelEnabled'].isOwnerData).toBe(false);
    expect(photoshootModelLibrarySettings['studio.photoshoot.kidsModelEnabled'].default).toBe(false);
    expect(PHOTOSHOOT_KIDS_MODEL_ENABLED_DEFAULT).toBe(false);
  });

  it('names exactly men/ladies/kids as the assignable libraries — hand_wrist_face is never one of them', () => {
    expect(ASSIGNABLE_MODEL_LIBRARIES).toEqual(['men', 'ladies', 'kids']);
  });

  it('the assignment map accepts a real model id mapped to men/ladies/kids, refuses an unknown library or a non-uuid key', () => {
    expect(photoshootModelLibraryAssignmentsSchema.safeParse(null).success).toBe(true);
    expect(photoshootModelLibraryAssignmentsSchema.safeParse({}).success).toBe(true);
    expect(photoshootModelLibraryAssignmentsSchema.safeParse({ '11111111-1111-4111-8111-111111111111': 'ladies' }).success).toBe(true);
    expect(photoshootModelLibraryAssignmentsSchema.safeParse({ '11111111-1111-4111-8111-111111111111': 'hand_wrist_face' }).success).toBe(false);
    expect(photoshootModelLibraryAssignmentsSchema.safeParse({ '11111111-1111-4111-8111-111111111111': 'unisex' }).success).toBe(false);
    expect(photoshootModelLibraryAssignmentsSchema.safeParse({ 'not-a-uuid': 'men' }).success).toBe(false);
  });

  it('the styling guideline map accepts a real model id mapped to non-empty text, refuses an empty note or a non-uuid key', () => {
    expect(photoshootModelStylingGuidelineSchema.safeParse(null).success).toBe(true);
    expect(photoshootModelStylingGuidelineSchema.safeParse({ '11111111-1111-4111-8111-111111111111': 'ladies profile 2 — modest, full sleeve, soft smile' }).success).toBe(true);
    expect(photoshootModelStylingGuidelineSchema.safeParse({ '11111111-1111-4111-8111-111111111111': '' }).success).toBe(false);
    expect(photoshootModelStylingGuidelineSchema.safeParse({ 'not-a-uuid': 'a note' }).success).toBe(false);
  });
});

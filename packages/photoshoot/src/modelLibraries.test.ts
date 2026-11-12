// S24 · PR 474 — pure tests for the ladies/kids/part-model library wiring: no database needed (the
// setting-reading functions are exercised here with a tiny fake `SettingsReader`, never a real one, the same
// shape `recipes.test.ts` already uses for `effectiveCategoryRecipe`).
import { describe, expect, it } from 'vitest';
import type { SettingsReader } from './context';
import {
  ASSIGNABLE_MODEL_LIBRARIES,
  effectiveModelLibrary,
  isAssignableModelLibrary,
  kidsModelAllowed,
  modelLibraryAssignments,
  modelLibraryOf,
  modelStylingGuidelines,
  stylingGuidelineFor,
} from './modelLibraries';

const LADY_ID = '11111111-1111-4111-8111-111111111111';
const PART_ID = '22222222-2222-4222-8222-222222222222';
const UNASSIGNED_ID = '33333333-3333-4333-8333-333333333333';

function fakeSettings(values: Record<string, unknown>): SettingsReader {
  return { value: async (key: string) => (key in values ? values[key] : null) as never };
}

describe('ASSIGNABLE_MODEL_LIBRARIES / isAssignableModelLibrary', () => {
  it('names exactly men, ladies and kids — never hand_wrist_face', () => {
    expect(ASSIGNABLE_MODEL_LIBRARIES).toEqual(['men', 'ladies', 'kids']);
    expect(isAssignableModelLibrary('ladies')).toBe(true);
    expect(isAssignableModelLibrary('hand_wrist_face')).toBe(false);
    expect(isAssignableModelLibrary('unisex')).toBe(false);
  });
});

describe('modelLibraryOf (pure)', () => {
  it('a part model is always hand_wrist_face, regardless of any assignment on file', () => {
    expect(modelLibraryOf({ id: PART_ID, kind: 'part' }, {})).toBe('hand_wrist_face');
    expect(modelLibraryOf({ id: PART_ID, kind: 'part' }, { [PART_ID]: 'ladies' })).toBe('hand_wrist_face');
  });

  it('a full-body model is whatever the owner explicitly assigned', () => {
    expect(modelLibraryOf({ id: LADY_ID, kind: 'full_body' }, { [LADY_ID]: 'ladies' })).toBe('ladies');
    expect(modelLibraryOf({ id: LADY_ID, kind: 'full_body' }, { [LADY_ID]: 'men' })).toBe('men');
    expect(modelLibraryOf({ id: LADY_ID, kind: 'full_body' }, { [LADY_ID]: 'kids' })).toBe('kids');
  });

  it('an unassigned full-body model is null, never guessed', () => {
    expect(modelLibraryOf({ id: UNASSIGNED_ID, kind: 'full_body' }, {})).toBeNull();
    expect(modelLibraryOf({ id: UNASSIGNED_ID, kind: 'full_body' }, { [LADY_ID]: 'ladies' })).toBeNull();
  });

  it('a corrupt or foreign value in the map is treated as unassigned, never thrown', () => {
    expect(modelLibraryOf({ id: UNASSIGNED_ID, kind: 'full_body' }, { [UNASSIGNED_ID]: 'not_a_real_library' })).toBeNull();
  });
});

describe('modelLibraryAssignments / effectiveModelLibrary', () => {
  it('is {} when the owner has assigned nothing (the setting itself ships null)', async () => {
    const result = await modelLibraryAssignments({ settings: fakeSettings({ 'studio.photoshoot.modelLibraryAssignments': null }) }, 1);
    expect(result).toEqual({});
  });

  it('reads the real assignment map when the owner has set one', async () => {
    const settings = fakeSettings({ 'studio.photoshoot.modelLibraryAssignments': { [LADY_ID]: 'ladies' } });
    expect(await modelLibraryAssignments({ settings }, 1)).toEqual({ [LADY_ID]: 'ladies' });
    expect(await effectiveModelLibrary({ settings }, 1, { id: LADY_ID, kind: 'full_body' })).toBe('ladies');
  });

  it('a part model never even reads the setting — always hand_wrist_face', async () => {
    const settings = fakeSettings({ 'studio.photoshoot.modelLibraryAssignments': null });
    expect(await effectiveModelLibrary({ settings }, 1, { id: PART_ID, kind: 'part' })).toBe('hand_wrist_face');
  });

  it('an unassigned full-body model reads null', async () => {
    const settings = fakeSettings({ 'studio.photoshoot.modelLibraryAssignments': { [LADY_ID]: 'ladies' } });
    expect(await effectiveModelLibrary({ settings }, 1, { id: UNASSIGNED_ID, kind: 'full_body' })).toBeNull();
  });
});

describe('modelStylingGuidelines / stylingGuidelineFor', () => {
  it('is {} when the owner has written no guideline yet (the setting itself ships null)', async () => {
    const result = await modelStylingGuidelines({ settings: fakeSettings({ 'studio.photoshoot.modelStylingGuideline': null }) }, 1);
    expect(result).toEqual({});
    expect(stylingGuidelineFor(LADY_ID, result)).toBeNull();
  });

  it("reads the real per-model note when the owner has written one, leaving every other model's own note untouched", async () => {
    const guidelines = await modelStylingGuidelines(
      { settings: fakeSettings({ 'studio.photoshoot.modelStylingGuideline': { [LADY_ID]: 'modest, full sleeve, soft smile' } }) },
      1,
    );
    expect(stylingGuidelineFor(LADY_ID, guidelines)).toBe('modest, full sleeve, soft smile');
    expect(stylingGuidelineFor(UNASSIGNED_ID, guidelines)).toBeNull();
  });
});

describe('kidsModelAllowed (pure, dual gate)', () => {
  it('refuses when the dedicated switch is off, even if the recipe already points at kids', () => {
    expect(kidsModelAllowed(false, 'kids')).toBe(false);
  });

  it('refuses when the switch is on but the recipe does not (yet) point kidswear at the kids library', () => {
    expect(kidsModelAllowed(true, null)).toBe(false);
    expect(kidsModelAllowed(true, 'men')).toBe(false);
  });

  it('allows only when both the switch is on and the recipe names the kids library', () => {
    expect(kidsModelAllowed(true, 'kids')).toBe(true);
  });
});

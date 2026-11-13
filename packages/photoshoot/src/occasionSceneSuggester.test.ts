// S24 · PR 480 — pure tests for the occasion-scene suggester's catalogue, the calendar/category scoring, "ask
// for more options" paging, and the "no scene" sentinel's drift guard against sceneLibrary.ts (no database — this
// module never touches one; recording and reusing a scene is already sceneLibrary.ts's own job, PR 476).
import { describe, expect, it } from 'vitest';
import { isSceneLibraryKey } from './sceneLibrary';
import { isOccasionSceneKey, OCCASION_SCENE_CATALOGUE, OCCASION_SCENE_NONE_KEY, OCCASION_SCENE_SUGGESTION_COUNT, suggestOccasionScenes } from './occasionSceneSuggester';

describe('OCCASION_SCENE_CATALOGUE', () => {
  it("is C7.13's own four named occasions, verbatim and in order, with no duplicate keys", () => {
    expect(OCCASION_SCENE_CATALOGUE.map((s) => s.key)).toEqual(['winter_morning', 'eid_evening', 'match_day', 'summer']);
    expect(new Set(OCCASION_SCENE_CATALOGUE.map((s) => s.key)).size).toBe(OCCASION_SCENE_CATALOGUE.length);
  });

  it('every key is already a well-formed sceneLibrary.ts custom slug — the two never drift apart', () => {
    for (const s of OCCASION_SCENE_CATALOGUE) expect(isSceneLibraryKey(s.key), s.key).toBe(true);
  });

  it('every entry is bilingual and carries its own one-line description', () => {
    for (const s of OCCASION_SCENE_CATALOGUE) {
      expect(s.nameEn.length).toBeGreaterThan(0);
      expect(s.nameBn.length).toBeGreaterThan(0);
      expect(s.descriptionEn.length).toBeGreaterThan(0);
      expect(s.descriptionBn.length).toBeGreaterThan(0);
    }
  });
});

describe('isOccasionSceneKey', () => {
  it('accepts every catalogue key and refuses anything else', () => {
    for (const s of OCCASION_SCENE_CATALOGUE) expect(isOccasionSceneKey(s.key)).toBe(true);
    expect(isOccasionSceneKey('studio_grey')).toBe(false); // a sceneLibrary preset, never an occasion of this suggester's own
    expect(isOccasionSceneKey('')).toBe(false);
    expect(isOccasionSceneKey(3)).toBe(false);
  });
});

describe('OCCASION_SCENE_NONE_KEY', () => {
  it('is sceneLibrary.ts’s own pre-existing studio_grey preset, never a new vocabulary', () => {
    expect(OCCASION_SCENE_NONE_KEY).toBe('studio_grey');
    expect(isSceneLibraryKey(OCCASION_SCENE_NONE_KEY)).toBe(true);
    expect(isOccasionSceneKey(OCCASION_SCENE_NONE_KEY)).toBe(false); // "no scene" is deliberately not one of the suggested occasions
  });
});

describe('suggestOccasionScenes', () => {
  it("winter items get winter scenes in winter — C7.13's own calendar+category rule", () => {
    const top = suggestOccasionScenes({ month: 12, categoryHints: ['hoodie'] })[0]!;
    expect(top.key).toBe('winter_morning');
    expect(top.score).toBe(2);
  });

  it('summer items get the summer scene in summer', () => {
    const top = suggestOccasionScenes({ month: 4, categoryHints: ['polo'] })[0]!;
    expect(top.key).toBe('summer');
    expect(top.score).toBe(2);
  });

  it('a calendar-free occasion (Eid, match day) is never excluded by the month — it always counts as calendar-eligible, so a real category match alone puts it top', () => {
    const top = suggestOccasionScenes({ month: 7, categoryHints: ['panjabi'] })[0]!;
    expect(top.key).toBe('eid_evening');
    expect(top.score).toBe(2);
  });

  it('defaults to three suggestions — C7.13’s own "offers three scene options"', () => {
    expect(suggestOccasionScenes({ month: 1 }).length).toBe(OCCASION_SCENE_SUGGESTION_COUNT);
    expect(OCCASION_SCENE_SUGGESTION_COUNT).toBe(3);
  });

  it('a wrong-season, wrong-category occasion still appears (never hidden), just ranked last', () => {
    const all = suggestOccasionScenes({ month: 7 }, { count: OCCASION_SCENE_CATALOGUE.length });
    expect(all.map((s) => s.key)).toEqual(expect.arrayContaining(OCCASION_SCENE_CATALOGUE.map((s) => s.key)));
    expect(all.find((s) => s.key === 'winter_morning')!.score).toBe(0);
  });

  it('ties keep the catalogue’s own fixed order, never a random pick', () => {
    const neutral = suggestOccasionScenes({ month: 7 }); // no category hint; the two calendar-free occasions both score 1, the two fixed-month ones both score 0
    expect(neutral.map((s) => s.key)).toEqual(['eid_evening', 'match_day', 'winter_morning']);
  });

  it('excludeKeys pages into the same catalogue — C7.13’s own "asks for more options", never inventing a new one', () => {
    const first = suggestOccasionScenes({ month: 12 });
    const shown = first.map((s) => s.key);
    const more = suggestOccasionScenes({ month: 12 }, { excludeKeys: shown });
    expect(more.some((s) => shown.includes(s.key))).toBe(false);
    expect(more.length).toBe(OCCASION_SCENE_CATALOGUE.length - shown.length);
  });

  it('refuses a month outside 1–12', () => {
    expect(() => suggestOccasionScenes({ month: 0 })).toThrow(RangeError);
    expect(() => suggestOccasionScenes({ month: 13 })).toThrow(RangeError);
  });
});

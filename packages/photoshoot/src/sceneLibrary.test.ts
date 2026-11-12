// S24 · PR 476 — pure tests for the scene library's vocabulary, its "never invent" plan (each scene's own fact,
// never derived here), the "ask for the missing demo" message/requests, and the scene-tag round trip (no
// database).
import { describe, expect, it } from 'vitest';
import { PHOTOSHOOT_SCENE_LIBRARY_PRESETS } from '@extas/settings';
import {
  isSceneLibraryKey,
  isSceneLibraryPreset,
  missingSceneLibraryEntries,
  planSceneLibraryEntry,
  SCENE_LIBRARY_PRESETS,
  SCENE_LIBRARY_TAG,
  sceneLibraryKeyFromTags,
  sceneLibraryMissingDemoMessage,
  sceneLibraryMissingDemoRequests,
  sceneLibrarySceneTag,
} from './sceneLibrary';

describe('SCENE_LIBRARY_PRESETS', () => {
  it('names exactly the four C7.13 backgrounds, verbatim, with no duplicates', () => {
    expect(SCENE_LIBRARY_PRESETS).toEqual(['studio_grey', 'street', 'festive', 'winter']);
    expect(new Set(SCENE_LIBRARY_PRESETS).size).toBe(SCENE_LIBRARY_PRESETS.length);
  });
});

describe('@extas/settings keeps the same 4 preset keys — the two lists can never drift apart silently', () => {
  it('matches SCENE_LIBRARY_PRESETS exactly, in the same order', () => {
    expect(PHOTOSHOOT_SCENE_LIBRARY_PRESETS).toEqual(SCENE_LIBRARY_PRESETS);
  });
});

describe('isSceneLibraryPreset', () => {
  it('accepts every named preset and refuses anything else', () => {
    for (const p of SCENE_LIBRARY_PRESETS) expect(isSceneLibraryPreset(p)).toBe(true);
    expect(isSceneLibraryPreset('eid_evening')).toBe(false);
    expect(isSceneLibraryPreset(1)).toBe(false);
    expect(isSceneLibraryPreset('')).toBe(false);
  });
});

describe('isSceneLibraryKey', () => {
  it('accepts every named preset plus a well-formed custom slug', () => {
    for (const p of SCENE_LIBRARY_PRESETS) expect(isSceneLibraryKey(p)).toBe(true);
    expect(isSceneLibraryKey('eid_evening')).toBe(true);
    expect(isSceneLibraryKey('match_day_2')).toBe(true);
  });

  it('refuses anything not lower-case, not starting with a letter, too long, containing a colon, or not a string', () => {
    expect(isSceneLibraryKey('Eid_Evening')).toBe(false);
    expect(isSceneLibraryKey('2_cold')).toBe(false);
    expect(isSceneLibraryKey('scene:festive')).toBe(false);
    expect(isSceneLibraryKey('a'.repeat(61))).toBe(false);
    expect(isSceneLibraryKey('')).toBe(false);
    expect(isSceneLibraryKey(42)).toBe(false);
  });
});

describe('planSceneLibraryEntry / missingSceneLibraryEntries', () => {
  it('is ready for a scene with a real, approved demo on file', () => {
    expect(planSceneLibraryEntry({ sceneKey: 'festive', hasApprovedDemo: true })).toEqual({ sceneKey: 'festive', ready: true });
  });

  it("is not ready for a scene with no approved demo — C7.13's never-invent rule", () => {
    expect(planSceneLibraryEntry({ sceneKey: 'festive', hasApprovedDemo: false })).toEqual({ sceneKey: 'festive', ready: false, reason: 'NO_SCENE_DEMO' });
  });

  it('names only the scenes still missing a demo, in order, leaving ready ones out', () => {
    const candidates = [
      { sceneKey: 'studio_grey', hasApprovedDemo: true },
      { sceneKey: 'street', hasApprovedDemo: false },
      { sceneKey: 'winter', hasApprovedDemo: false },
    ];
    expect(missingSceneLibraryEntries(candidates)).toEqual(['street', 'winter']);
  });

  it('is empty once every scene has an approved demo', () => {
    expect(missingSceneLibraryEntries([{ sceneKey: 'studio_grey', hasApprovedDemo: true }])).toEqual([]);
  });
});

describe('sceneLibraryMissingDemoMessage / sceneLibraryMissingDemoRequests', () => {
  it('names the scene in plain words and says it is never invented', () => {
    const msg = sceneLibraryMissingDemoMessage('eid_evening');
    expect(msg).toContain('eid_evening');
    expect(msg.toLowerCase()).toContain('never invented');
  });

  it('asks once per missing scene, never for a ready one', () => {
    const reqs = sceneLibraryMissingDemoRequests([
      { sceneKey: 'studio_grey', hasApprovedDemo: true },
      { sceneKey: 'winter', hasApprovedDemo: false },
    ]);
    expect(reqs).toHaveLength(1);
    expect(reqs[0]).toMatchObject({ sceneKey: 'winter' });
    expect(reqs[0]?.message.length).toBeGreaterThan(0);
  });

  it('is empty once every scene already has an approved demo', () => {
    expect(sceneLibraryMissingDemoRequests([{ sceneKey: 'studio_grey', hasApprovedDemo: true }])).toEqual([]);
  });
});

describe('sceneLibrarySceneTag / sceneLibraryKeyFromTags — round trip', () => {
  it('tags a scene as scene:<sceneKey>', () => {
    expect(sceneLibrarySceneTag('festive')).toBe('scene:festive');
  });

  it('reads the scene key back off its tags, ignoring unrelated tags', () => {
    expect(sceneLibraryKeyFromTags([SCENE_LIBRARY_TAG, 'scene:winter'])).toBe('winter');
  });

  it('is null when no scene tag is present', () => {
    expect(sceneLibraryKeyFromTags([SCENE_LIBRARY_TAG])).toBeNull();
    expect(sceneLibraryKeyFromTags([])).toBeNull();
  });

  it('round-trips every named preset and a custom slug unchanged', () => {
    for (const key of [...SCENE_LIBRARY_PRESETS, 'eid_evening']) {
      expect(sceneLibraryKeyFromTags([sceneLibrarySceneTag(key)])).toBe(key);
    }
  });
});

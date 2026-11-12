// S24 · PR 476 (registry v296): the scene library's own feature switch (off by default, CN-018) and its default
// background preset, and that its own preset list stays identical to @extas/photoshoot's own.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { PHOTOSHOOT_SCENE_LIBRARY_ENABLED_DEFAULT, PHOTOSHOOT_SCENE_LIBRARY_PRESETS, photoshootSceneLibrarySettings } from '../src/registry-photoshoot-scene-library';

describe('photoshoot scene library settings (v296)', () => {
  it('are in the registry at version 296, store-scoped, labelled in English and Bengali, their default valid', () => {
    for (const [key, s] of Object.entries(photoshootSceneLibrarySettings)) {
      expect(registry[key as keyof typeof registry]).toBe(s);
      expect(s.version, key).toBe(296);
      expect(s.scope, key).toBe('store');
      expect(s.schema.safeParse(s.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], s.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], s.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('the scene library is off as it ships (CN-018), never owner data', () => {
    expect(photoshootSceneLibrarySettings['studio.photoshoot.sceneLibraryEnabled'].isOwnerData).toBe(false);
    expect(photoshootSceneLibrarySettings['studio.photoshoot.sceneLibraryEnabled'].default).toBe(false);
    expect(PHOTOSHOOT_SCENE_LIBRARY_ENABLED_DEFAULT).toBe(false);
  });

  it('the default preset ships studio_grey and accepts only the four named presets', () => {
    const spec = photoshootSceneLibrarySettings['studio.photoshoot.sceneLibraryDefaultPreset'];
    expect(spec.default).toBe('studio_grey');
    expect(spec.isOwnerData).toBe(false);
    expect(spec.schema.safeParse('winter').success).toBe(true);
    expect(spec.schema.safeParse('beach').success).toBe(false);
    expect(spec.schema.safeParse('').success).toBe(false);
  });

  it("names the same four preset keys @extas/photoshoot's own sceneLibrary.ts names, verbatim and in order", () => {
    expect(PHOTOSHOOT_SCENE_LIBRARY_PRESETS).toEqual(['studio_grey', 'street', 'festive', 'winter']);
  });
});

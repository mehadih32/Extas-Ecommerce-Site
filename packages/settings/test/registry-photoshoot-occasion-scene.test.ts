// S24 · PR 480 (registry v298): the occasion-scene suggester's own feature switch, off by default (CN-018).
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { PHOTOSHOOT_OCCASION_SCENE_ENABLED_DEFAULT, photoshootOccasionSceneSettings } from '../src/registry-photoshoot-occasion-scene';

describe('photoshoot occasion-scene suggester settings (v298)', () => {
  it('are in the registry at version 308, store-scoped, labelled in English and Bengali, their default valid', () => {
    for (const [key, s] of Object.entries(photoshootOccasionSceneSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(s);
      expect(s.version, key).toBe(308);
      expect(s.scope, key).toBe('store');
      expect(s.schema.safeParse(s.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], s.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], s.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('the occasion-scene suggester is off as it ships (CN-018), never owner data', () => {
    expect(photoshootOccasionSceneSettings['studio.photoshoot.occasionSceneSuggesterEnabled'].isOwnerData).toBe(false);
    expect(photoshootOccasionSceneSettings['studio.photoshoot.occasionSceneSuggesterEnabled'].default).toBe(false);
    expect(PHOTOSHOOT_OCCASION_SCENE_ENABLED_DEFAULT).toBe(false);
  });
});

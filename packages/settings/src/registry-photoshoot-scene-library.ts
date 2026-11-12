// S24 · PR 476 (Blueprint C7.13 "Scene library", C7.22 item 33; registry version 296) — the scene library's own
// feature switch (CN-018, off by default, the same shape `kidsModelEnabled`/`comboGiftSetEnabled` already set) and
// which of `@extas/photoshoot`'s own `SCENE_LIBRARY_PRESETS` a new scene starts from. Neither is owner data (no
// price, no person, no real photo) — both are plain system choices.
import { z } from 'zod';
import { setting } from './define';

const V = 296;

/** The same four preset keys `@extas/photoshoot`'s own `sceneLibrary.ts` names, verbatim and in the same order —
 * `@extas/settings` cannot import `@extas/photoshoot` (the dependency runs the other way, the same "named as its
 * own literal list" choice `registry-photoshoot-recipes.ts`/`registry-photoshoot-combo-gift-set.ts` already
 * made); `@extas/photoshoot`'s own `sceneLibrary.test.ts` cross-checks the two lists stay identical. */
export const PHOTOSHOOT_SCENE_LIBRARY_PRESETS = ['studio_grey', 'street', 'festive', 'winter'] as const;

/** Off by default (CN-018): the scene library stays unavailable until the owner turns it on — a deliberate,
 * affirmative decision, the same shape `comboGiftSetEnabled`/`kidsModelEnabled` already set for their own C7.22/
 * C7.12 features. */
export const PHOTOSHOOT_SCENE_LIBRARY_ENABLED_DEFAULT = false;

export const photoshootSceneLibrarySettings = {
  'studio.photoshoot.sceneLibraryEnabled': setting({
    schema: z.boolean(),
    default: PHOTOSHOOT_SCENE_LIBRARY_ENABLED_DEFAULT,
    scope: 'store',
    valueType: 'BOOLEAN',
    group: 'marketing',
    isOwnerData: false,
    labelKey: 'studio.photoshoot.sceneLibraryEnabled.label',
    helpKey: 'studio.photoshoot.sceneLibraryEnabled.help',
    sortOrder: 21,
    version: V,
  }),
  'studio.photoshoot.sceneLibraryDefaultPreset': setting({
    schema: z.enum(PHOTOSHOOT_SCENE_LIBRARY_PRESETS),
    default: 'studio_grey',
    scope: 'store',
    valueType: 'ENUM',
    group: 'marketing',
    isOwnerData: false,
    labelKey: 'studio.photoshoot.sceneLibraryDefaultPreset.label',
    helpKey: 'studio.photoshoot.sceneLibraryDefaultPreset.help',
    sortOrder: 22,
    version: V,
  }),
};

// S24 · PR 480 (Blueprint C7.13 "Occasion scenes", C7.22 item 37; registry version 308) — the occasion-scene
// suggester's own feature switch (CN-018, off by default, the same shape `comboGiftSetEnabled`/
// `sceneLibraryEnabled`/`coupleCompositionEnabled` already set). No second setting: the four named occasions and
// how many are offered are `@extas/photoshoot`'s own fixed catalogue (C7.13's own verbatim list and "offers
// three"), never an owner-editable number this PR invents a setting for. Not owner data (no price, no person, no
// real photo) — a plain system choice.
import { z } from 'zod';
import { setting } from './define';

const V = 308;

/** Off by default (CN-018): the occasion-scene suggester stays unavailable until the owner turns it on — a
 * deliberate, affirmative decision, the same shape every other S24 feature switch already set. */
export const PHOTOSHOOT_OCCASION_SCENE_ENABLED_DEFAULT = false;

export const photoshootOccasionSceneSettings = {
  'studio.photoshoot.occasionSceneSuggesterEnabled': setting({
    schema: z.boolean(),
    default: PHOTOSHOOT_OCCASION_SCENE_ENABLED_DEFAULT,
    scope: 'store',
    valueType: 'BOOLEAN',
    group: 'marketing',
    isOwnerData: false,
    labelKey: 'studio.photoshoot.occasionSceneSuggesterEnabled.label',
    helpKey: 'studio.photoshoot.occasionSceneSuggesterEnabled.help',
    sortOrder: 24,
    version: V,
  }),
};

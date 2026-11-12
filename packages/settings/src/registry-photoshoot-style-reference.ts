// S24 · PR 539 (Blueprint C7, V2 18–19 Oct addition, §59 answer 59; registry version 309) — the style/pose
// reference's own feature switch (CN-018, off by default, the same shape every other S24 feature switch already
// set). No second setting: the AI pose/video asset-library reuse rule (template + product + colours) is a fixed
// mechanism, never an owner-editable number. Not owner data (no price, no person, no real photo) — a plain
// system choice.
import { z } from 'zod';
import { setting } from './define';

const V = 309;

/** Off by default (CN-018): following a supplied style/pose reference stays unavailable until the owner turns it
 * on — a deliberate, affirmative decision, the same shape every other S24 feature switch already set. */
export const PHOTOSHOOT_STYLE_REFERENCE_ENABLED_DEFAULT = false;

export const photoshootStyleReferenceSettings = {
  'studio.photoshoot.styleReferenceEnabled': setting({
    schema: z.boolean(),
    default: PHOTOSHOOT_STYLE_REFERENCE_ENABLED_DEFAULT,
    scope: 'store',
    valueType: 'BOOLEAN',
    group: 'marketing',
    isOwnerData: false,
    labelKey: 'studio.photoshoot.styleReferenceEnabled.label',
    helpKey: 'studio.photoshoot.styleReferenceEnabled.help',
    sortOrder: 25,
    version: V,
  }),
};

// S24 · PR 479 (Blueprint C7.13 "Unisex / couple shots", C7.22 item 36; registry version 307) — the unisex/couple
// composition engine's own feature switch (CN-018, off by default, the same shape `comboGiftSetEnabled`/
// `sceneLibraryEnabled` already set). No second setting here: unlike the combo/gift-set studio's own layout
// choice or the scene library's own preset choice, C7.13 names no owner-facing option for a couple shot — it is
// composed automatically from whichever male and female renders already exist, with no arrangement to pick.
// Not owner data (no price, no person, no real photo) — a plain system choice.
import { z } from 'zod';
import { setting } from './define';

const V = 307;

/** Off by default (CN-018): the couple-composition studio stays unavailable until the owner turns it on — a
 * deliberate, affirmative decision, the same shape `comboGiftSetEnabled`/`sceneLibraryEnabled` already set for
 * their own C7.22/C7.13 features. */
export const PHOTOSHOOT_COUPLE_COMPOSITION_ENABLED_DEFAULT = false;

export const photoshootCoupleCompositionSettings = {
  'studio.photoshoot.coupleCompositionEnabled': setting({
    schema: z.boolean(),
    default: PHOTOSHOOT_COUPLE_COMPOSITION_ENABLED_DEFAULT,
    scope: 'store',
    valueType: 'BOOLEAN',
    group: 'marketing',
    isOwnerData: false,
    labelKey: 'studio.photoshoot.coupleCompositionEnabled.label',
    helpKey: 'studio.photoshoot.coupleCompositionEnabled.help',
    sortOrder: 23,
    version: V,
  }),
};

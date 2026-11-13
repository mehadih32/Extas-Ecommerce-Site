// S24 · PR 475 (Blueprint C7.22 item 32 "Combo and gift-set composition studio"; registry version 305) — the one
// line of blueprint prose this item carries has no further paragraph (unlike the named C7.12 rules PR 473/474
// were built from), so its own settings stay deliberately small: a plain feature switch (CN-018, off by default,
// "new optional features: off by default, an on/off switch" — the same shape `kidsModelEnabled` already set) and
// which of `@extas/photoshoot`'s own `COMBO_GIFT_SET_LAYOUTS` the admin starts a new composition with. Neither is
// owner data (no price, no person, no real photo) — both are plain system choices.
import { z } from 'zod';
import { setting } from './define';

const V = 305;

/** The same three layout keys `@extas/photoshoot`'s own `comboGiftSetStudio.ts` names, verbatim and in the same
 * order — `@extas/settings` cannot import `@extas/photoshoot` (the dependency runs the other way, the same
 * "named as its own literal list" choice `registry-photoshoot-recipes.ts` already made for its 13 recipe keys);
 * `@extas/photoshoot`'s own `comboGiftSetStudio.test.ts` cross-checks the two lists stay identical. */
export const PHOTOSHOOT_COMBO_GIFT_SET_LAYOUTS = ['flat_lay_grouped', 'standing_grouped', 'boxed_gift'] as const;

/** Off by default (CN-018): the composition studio stays unavailable until the owner turns it on — a deliberate,
 * affirmative decision, the same shape `kidsModelEnabled` already set for a different C7.12 feature. */
export const PHOTOSHOOT_COMBO_GIFT_SET_ENABLED_DEFAULT = false;

export const photoshootComboGiftSetSettings = {
  'studio.photoshoot.comboGiftSetEnabled': setting({
    schema: z.boolean(),
    default: PHOTOSHOOT_COMBO_GIFT_SET_ENABLED_DEFAULT,
    scope: 'store',
    valueType: 'BOOLEAN',
    group: 'marketing',
    isOwnerData: false,
    labelKey: 'studio.photoshoot.comboGiftSetEnabled.label',
    helpKey: 'studio.photoshoot.comboGiftSetEnabled.help',
    sortOrder: 19,
    version: V,
  }),
  'studio.photoshoot.comboGiftSetDefaultLayout': setting({
    schema: z.enum(PHOTOSHOOT_COMBO_GIFT_SET_LAYOUTS),
    default: 'flat_lay_grouped',
    scope: 'store',
    valueType: 'ENUM',
    group: 'marketing',
    isOwnerData: false,
    labelKey: 'studio.photoshoot.comboGiftSetDefaultLayout.label',
    helpKey: 'studio.photoshoot.comboGiftSetDefaultLayout.help',
    sortOrder: 20,
    version: V,
  }),
};

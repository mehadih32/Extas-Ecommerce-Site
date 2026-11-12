// S24 · PR 447 (Blueprint C7.5 step 6 · Virtual Photoshoot Studio) — the garment-prep/standardisation step's own
// switch (registry version 288). Labels: messages/photoshoot.<lang>.json (group `marketing`).
//
// - `photoshoot.colourTolerance`: how far a garment photo's measured colour may drift from the ERP colour's own
//   reference hex (via the grey card / colour checker in the frame, C7.4) before the prep step flags it for the
//   owner instead of standing the photo in silently. 0 (off, as it ships) never flags anything — CN-018: every
//   number is a backend setting, off by default, and the owner is never asked to pick one up front.
import { z } from 'zod';
import { setting } from './define';

const V = 288;

/** 0 = never flag a drift (as it ships); otherwise the greatest allowed distance, 1–442 (ceil(sqrt(3×255²)), the full sRGB range). */
export const photoshootColourToleranceSchema = z.number().int().min(0).max(442);
export const PHOTOSHOOT_COLOUR_TOLERANCE_DEFAULT = 0;

export const photoshootSettings = {
  'photoshoot.colourTolerance': setting({
    schema: photoshootColourToleranceSchema,
    default: PHOTOSHOOT_COLOUR_TOLERANCE_DEFAULT,
    scope: 'store',
    valueType: 'INT',
    group: 'marketing',
    isOwnerData: false,
    labelKey: 'photoshoot.colourTolerance.label',
    helpKey: 'photoshoot.colourTolerance.help',
    sortOrder: 13,
    version: V,
  }),
};

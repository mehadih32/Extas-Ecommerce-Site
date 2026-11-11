// S24 · PR 453 (Blueprint C7.5 step 9, C7.6; registry version 291) — "anything below threshold never reaches a
// human": the owner's own quality cut-off a generated candidate's combined score must clear before it may enter
// the review queue at all. 0, as it ships, means nothing is ever auto-rejected — CN-018: every number is a backend
// setting, off by default, and this one ships at its safest default (every candidate reaches the owner) rather than
// silently hiding a generated image before anyone has seen real output to judge a sensible cut-off from.
import { z } from 'zod';
import { setting } from './define';

const V = 291;

/** 0–100, whole percent. 0 (as it ships) means every candidate, however it scores, reaches the review queue. */
export const photoshootQualityThresholdSchema = z.number().int().min(0).max(100);
export const PHOTOSHOOT_QUALITY_THRESHOLD_DEFAULT = 0; // hardcode-ok: the setting's own default (ships off, CN-018), not an invented business number

export const photoshootQualitySettings = {
  'studio.photoshoot.qualityThresholdPercent': setting({
    schema: photoshootQualityThresholdSchema,
    default: PHOTOSHOOT_QUALITY_THRESHOLD_DEFAULT,
    scope: 'store',
    valueType: 'INT',
    group: 'marketing',
    isOwnerData: false,
    labelKey: 'studio.photoshoot.qualityThresholdPercent.label',
    helpKey: 'studio.photoshoot.qualityThresholdPercent.help',
    sortOrder: 13,
    version: V,
  }),
};

// S24 · PR 452 (Blueprint C7.5 step 7, C7.20; registry version 300) — the photoshoot queue's own concurrency limit:
// how many jobs this store may have `PROCESSING` (a provider actually running, actually spending) at once. 0, as
// it ships, means unlimited — CN-018: every number is a backend setting, off by default, never a question the
// owner is asked up front.
//
// The monthly spend cap is deliberately NOT a new setting here. C7.20 is explicit that "provider and model choice
// for images lives in the same AI 360 screen as the text models" and "the Photoshoot agent has its own monthly cap
// in AI 360" — so the cap reuses the exact `AiAgent.monthlyCapMinor` field and arithmetic PR 309 already built for
// every agent (C1.6), not a photoshoot-only number (see `@extas/photoshoot`'s `spendCap.ts`).
import { z } from 'zod';
import { setting } from './define';

const V = 300;

/** 0 (unlimited, as it ships) or a whole number of jobs, 1–100 — enough headroom for any real provider's own rate
 * limit while still being a number the owner can read and change. */
export const photoshootMaxConcurrentJobsSchema = z.number().int().min(0).max(100);
export const PHOTOSHOOT_MAX_CONCURRENT_JOBS_DEFAULT = 0;

export const photoshootQueueSettings = {
  'studio.photoshoot.maxConcurrentJobs': setting({
    schema: photoshootMaxConcurrentJobsSchema,
    default: PHOTOSHOOT_MAX_CONCURRENT_JOBS_DEFAULT,
    scope: 'store',
    valueType: 'INT',
    group: 'marketing',
    isOwnerData: false,
    labelKey: 'studio.photoshoot.maxConcurrentJobs.label',
    helpKey: 'studio.photoshoot.maxConcurrentJobs.help',
    sortOrder: 13,
    version: V,
  }),
};

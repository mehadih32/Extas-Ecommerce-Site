// S24 · PR 468 (Blueprint C7.20 "the photoshoot work registers in AI 360 as a named agent — Photoshoot agent —
// with its sub-jobs listed separately … every sub-job has its own row in the AI Cost Book, with the recommended
// model, estimated cost per run, alternatives and their cost, and the recommendation note when the owner changes
// one", C7.22 item 25) — the other half of item 25, alongside `spendCap.ts`'s own `ensurePhotoshootAgentRow`.
//
// No AI Cost Book screen exists yet anywhere in this codebase (S15 · PR 312, not built — S15 is itself only 7/48
// built as of this PR). This is the DATA half of C7.20's own request: the fixed list of named sub-jobs C7.20
// itself enumerates, each pointed at the module that actually runs it today — ready for whichever later PR builds
// the real Cost Book screen to read, the same "no screen reads it yet; the first one that does gets it for free"
// shape PR 460's own recommendation-note system already left for its own first reader. Nothing here estimates a
// cost or names a model: that is `costLedger.ts`'s own `estimateGenerationCostMinor`/`photoshootRecommendationNote`
// (PR 459/460), already built and keyed by provider + tier, not by sub-job — a genuine per-sub-job cost estimate
// (C7.20's own "estimated cost per run") is a later PR's work, once a real provider call can be timed and billed
// at that granularity rather than once per whole job.
export interface PhotoshootSubJobDef {
  /** Stable, never reused once shipped — the same discipline as `ASSET_ROLES`/`JOB_STATUSES`. */
  key: string;
  nameEn: string;
  nameBn: string;
  /** Where this sub-job's own logic actually lives today, for a reader going from the Cost Book to the code. */
  builtIn: string;
}

/** C7.20's own seven sub-jobs, verbatim and in its own order: "ghost mannequin, try-on, detail re-projection,
 * upscale, finishing, detail finder, quality scoring." */
export const PHOTOSHOOT_SUB_JOBS: readonly PhotoshootSubJobDef[] = [
  { key: 'ghost_mannequin', nameEn: 'Ghost mannequin', nameBn: 'ঘোস্ট ম্যানিকুইন', builtIn: 'ghostMannequin.ts' },
  { key: 'try_on', nameEn: 'Try-on (on-model)', nameBn: 'মডেলে বসানো ছবি', builtIn: 'jobs.ts, outputs.ts (provider call itself: @extas/adapters photoshoot-provider)' },
  { key: 'detail_reprojection', nameEn: 'Detail re-projection', nameBn: 'লোগো/প্রিন্ট পুনঃস্থাপন', builtIn: 'detailRegions.ts (reprojectedCandidateId)' },
  { key: 'upscale', nameEn: 'Upscale', nameBn: 'রেজোলিউশন বাড়ানো', builtIn: 'finishing.ts (upscale step)' },
  { key: 'finishing', nameEn: 'Finishing (artifact repair, contact shadow, grade, sharpen)', nameBn: 'ফিনিশিং', builtIn: 'finishing.ts' },
  { key: 'detail_finder', nameEn: 'Detail Finder', nameBn: 'খুঁটিনাটি জায়গা খোঁজা', builtIn: 'detailRegions.ts (finder: namespace)' },
  { key: 'quality_scoring', nameEn: 'Quality scoring', nameBn: 'মান যাচাই', builtIn: 'outputs.ts (recordScoredOutputs)' },
] as const;

export type PhotoshootSubJobKey = (typeof PHOTOSHOOT_SUB_JOBS)[number]['key'];

export const isPhotoshootSubJobKey = (v: unknown): v is PhotoshootSubJobKey => typeof v === 'string' && PHOTOSHOOT_SUB_JOBS.some((j) => j.key === v);

export function photoshootSubJob(key: PhotoshootSubJobKey): PhotoshootSubJobDef {
  const found = PHOTOSHOOT_SUB_JOBS.find((j) => j.key === key);
  if (!found) throw new Error(`unknown photoshoot sub-job key: ${key}`);
  return found;
}

// S24 · PR 455 (Blueprint C7.8, part 1 of 2 — "AI upscale to 2500–3000px · artifact repair (hands, edges,
// garment boundary)") — "A finishing pass inside the system, applied to every approved image" (replaces any
// outsourced retouch). C7.7's own owner decision: "Nothing outsourced. No external retouch service, no human
// retoucher. Every finishing step is built into the system; the extra API cost for that is accepted." — C7.7's
// own "two-stage render": try-on at base resolution -> AI upscale -> detail re-projection (PR 454) -> gentle
// retouch -> web sharpening (PR 456).
//
// `FINISHING_STEPS` fixes the pipeline's own order. This PR wires the first two steps (upscale, artifact
// repair); PR 456 grows this same array in place with the remaining three (contact shadow, colour grade,
// sharpen) rather than duplicating it — the same "same file, grown in place" pattern PR 452 used on PR 451's
// `jobs.ts`.
//
// No upscale/repair model is wired yet — exactly PR 450's, PR 453's and PR 454's own honest scope for their own
// unbuilt pieces: this module only ever (a) plans which steps a generated image still needs (pure, no
// database), and (b) records a job runner's finished step as its own new asset through PR 444's
// `recordGeneratedAsset` chokepoint, tracing back to the SAME real original the image being finished already
// traces to (never to the image being finished itself — a generated image must always trace to a real one,
// C7.5) — the same pattern PR 454's detail re-projection established for exactly this one-way rule.
import { z } from 'zod';
import { allow, checkStoreId, parse, PhotoshootError, type PhotoshootDeps, type Who } from './context';
import { isAssetRole, type AssetRole } from './roles';
import { recordGeneratedAsset, type AssetRow } from './assets';

/** C7.8's own finishing pipeline, in the order it runs. PR 455 wires the first two; PR 456 grows this same array
 * with the remaining three (contact shadow, colour grade, sharpen) rather than duplicating it. */
export const FINISHING_STEPS = ['upscale', 'artifactRepair'] as const;
export type FinishingStep = (typeof FINISHING_STEPS)[number];

/** The free tag every finishing output carries, plus its own step name (e.g. `finishing:upscale`), so later
 * steps and the admin can tell which passes an image has already had. */
export const FINISHING_TAG = 'finishing';
export const finishingStepTag = (step: FinishingStep): string => `finishing:${step}`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface FinishingCandidate {
  assetId: string;
  /** This candidate's own completed steps, in any order — read from its `MediaAsset.tags` via
   * `completedFinishingSteps`. */
  completedSteps: readonly FinishingStep[];
}

export interface FinishingPlan {
  /** Every step this candidate has not had yet, in pipeline order. Empty once every step is done. */
  remaining: FinishingStep[];
  /** The next step to run, or null once `remaining` is empty. */
  next: FinishingStep | null;
}

/** Which finishing steps a generated candidate still needs — pure, no database. "Applied to every approved
 * image" (C7.8): nothing here ever skips a step or reports one done twice on the same candidate. */
export function planFinishing(candidate: FinishingCandidate): FinishingPlan {
  const done = new Set(candidate.completedSteps);
  const remaining = FINISHING_STEPS.filter((s) => !done.has(s));
  return { remaining, next: remaining[0] ?? null };
}

const recordOutputInput = z
  .object({
    candidateAssetId: z.string().uuid(),
    step: z.enum(FINISHING_STEPS),
    storageKey: z.string().min(1),
    storage: z.enum(['LOCAL_DISK', 'AZURE_BLOB', 'S3_COMPATIBLE', 'GOOGLE_DRIVE']),
    mimeType: z.string().min(1),
    bytes: z.number().int().min(0),
    checksumSha256: z.string().min(32),
    width: z.number().int().min(1).optional(),
    height: z.number().int().min(1).optional(),
  })
  .strict();
export type RecordFinishingOutputInput = z.input<typeof recordOutputInput>;

export interface FinishingOutput extends AssetRow {
  step: FinishingStep;
  candidateAssetId: string;
}

type FinishingAssetRecord = { id: string; storeId: number; isOriginal: boolean; role: string | null; isAiGenerated: boolean; sourceAssetId: string | null; archivedAt: Date | null; tags: string[] };

const toFinishingOutput = (r: FinishingAssetRecord, step: FinishingStep, candidateAssetId: string): FinishingOutput => ({
  id: r.id,
  storeId: r.storeId,
  isOriginal: r.isOriginal,
  role: r.role,
  isAiGenerated: r.isAiGenerated,
  sourceAssetId: r.sourceAssetId,
  archivedAt: r.archivedAt,
  tags: r.tags,
  step,
  candidateAssetId,
});

async function latestFinishingOutput(db: PhotoshootDeps['db'], storeId: number, candidateAssetId: string, step: FinishingStep) {
  return db.mediaAsset.findFirst({ where: { storeId, isAiGenerated: true, tags: { hasEvery: [FINISHING_TAG, finishingStepTag(step), candidateAssetId] } }, orderBy: { createdAt: 'desc' } });
}

/**
 * Records one finished finishing step (`photoshoot.generate`) over a generated candidate. Refuses an asset that
 * is not this store's own or not itself AI-generated (finishing only ever runs on a generated image, never a
 * real original), and refuses running the same step on the same candidate twice (C7.6 "reuse approved outputs
 * … no double charging" — use `findExistingFinishingOutput` first). Filed through PR 444's
 * `recordGeneratedAsset`, tracing back to the SAME real original the candidate itself traces to (never to the
 * candidate — a generated image must always trace to a real one), and tagged both `finishing` and
 * `finishing:<step>` plus the candidate's own id (the same "built from" note PR 454 carries in `tags`, read back
 * by `finishingCandidateId`), so a later step or the admin can always tell which passes an image already had
 * and which render it refines.
 */
export async function recordFinishingStepOutput(deps: PhotoshootDeps, who: Who, input: unknown): Promise<FinishingOutput> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.generate');
  const d = parse(recordOutputInput, input, 'finishing output');

  const candidate = await deps.db.mediaAsset.findFirst({ where: { id: d.candidateAssetId, storeId: who.storeId } });
  if (!candidate) throw new PhotoshootError('SOURCE_INVALID', 'the candidate image was not found in this store', ['candidateAssetId']);
  if (!candidate.isAiGenerated || !candidate.sourceAssetId) throw new PhotoshootError('SOURCE_INVALID', 'finishing only ever runs on a generated image, never a real original', ['candidateAssetId']);

  const already = await latestFinishingOutput(deps.db, who.storeId, d.candidateAssetId, d.step);
  if (already) throw new PhotoshootError('STALE', `this candidate already has a finished "${d.step}" output — reuse it instead of running it twice`, ['step']);

  const role: AssetRole = isAssetRole(candidate.role) ? candidate.role : 'primary_garment';
  const row = await recordGeneratedAsset(deps, who, {
    sourceAssetId: candidate.sourceAssetId,
    role,
    storageKey: d.storageKey,
    storage: d.storage,
    mimeType: d.mimeType,
    bytes: d.bytes,
    checksumSha256: d.checksumSha256,
    width: d.width,
    height: d.height,
    tags: [FINISHING_TAG, finishingStepTag(d.step), d.candidateAssetId],
  });
  return toFinishingOutput(row, d.step, d.candidateAssetId);
}

/** The most recent finishing output already on file for this candidate and step (`photoshoot.read`) — what a
 * job runner checks before spending on a step twice (C7.6 "reuse approved outputs … no double charging"). Null
 * when none exists yet. */
export async function findExistingFinishingOutput(deps: PhotoshootDeps, who: Who, candidateAssetId: string, step: FinishingStep): Promise<FinishingOutput | null> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.read');
  const row = await latestFinishingOutput(deps.db, who.storeId, candidateAssetId, step);
  return row ? toFinishingOutput(row, step, candidateAssetId) : null;
}

/** The candidate id a finishing output's own tags name it as built from, or null when the tags carry none —
 * the same round-trip shape PR 454's `reprojectedCandidateId` reads. */
export function finishingCandidateId(tags: readonly string[]): string | null {
  return tags.find((t) => UUID_RE.test(t)) ?? null;
}

/** Which finishing steps a finished output's own tags record as done — reads the `finishing:<step>` tags back. */
export function completedFinishingSteps(tags: readonly string[]): FinishingStep[] {
  return FINISHING_STEPS.filter((s) => tags.includes(finishingStepTag(s)));
}

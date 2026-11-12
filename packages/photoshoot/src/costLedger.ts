// S24 · PR 459 (Blueprint C7.6 "Cost shown before a batch: product count, views, tier, estimate, retry buffer,
// hard spend cap" and "Reuse approved outputs unless the source image, the model, the settings or the provider
// version changed"; B3.9 "every paid call writes a cost row"; C7.19 "cost per approved image") — closes out S24
// item 16 (cost ledger, estimates, caps, reuse rules). The concurrency limit and the Photoshoot agent's monthly
// spend cap are already PR 452's own `startProcessing`/`spendCap.ts`; this file is the three pieces C7.6 still
// named and nothing yet answered:
//
//  - a real per-batch cost ESTIMATE, from the owner's own rate setting, at the moment a job opens
//    (`estimateGenerationCostMinor` — pure, duplicated here rather than importing `@extas/adapters`'s own
//    identical arithmetic, the same "duplicate rather than cross-import" choice PR 452's `spendCap.ts` made)
//  - the REUSE rule itself, as a fingerprint (`computeReuseHash` — the exact fingerprint
//    `PhotoshootJob.reuseHash`'s own schema doc comment names: "source-image + model + settings +
//    provider-version hash")
//  - the ACTUAL spend written to the shop's own `CostEntry` ledger (B3.9) once it is incurred
//    (`recordGenerationCostEntry`, called from `outputs.ts`'s `recordScoredOutputs` — the moment the spend is
//    real, win or lose, regardless of what the owner later decides on review)
//
// Both new job-input fields (`provider`, `providerVersion`) are OPTIONAL and additive: every job opened the old
// way (PR 451–458's own tests, and any caller that does not yet know which provider will run it — there is still
// no "press Generate" admin trigger anywhere in S24) keeps working exactly as before, with no estimate, no reuse
// check and no cost row — never an invented number (CN-018), never a behaviour change for existing callers.
import { createHash } from 'node:crypto';
import type { Db, Who } from './context';
import type { JobTier } from './jobs';

/** The provider keys `@extas/adapters`' photoshoot adapters register under (`MOCK_PHOTOSHOOT_PROVIDER`,
 * `FASHN_PROVIDER`, `FITROOM_PROVIDER`), duplicated here as plain strings — `@extas/photoshoot` does not depend
 * on `@extas/adapters` (and should not start now), the same boundary PR 452's `spendCap.ts` already drew. The
 * practice provider is free and never rate-limited; it exists in this list only so a caller may name it
 * explicitly without the input being refused. */
export const PHOTOSHOOT_PROVIDERS = ['mockPhotoshoot', 'fashn', 'fitroom'] as const;
export type PhotoshootProviderKey = (typeof PHOTOSHOOT_PROVIDERS)[number];
export const isPhotoshootProvider = (v: unknown): v is PhotoshootProviderKey => typeof v === 'string' && (PHOTOSHOOT_PROVIDERS as readonly string[]).includes(v);
/** Providers `studio.photoshoot.rates` actually prices (the practice provider never appears there — it is free). */
export type RatedPhotoshootProvider = Exclude<PhotoshootProviderKey, 'mockPhotoshoot'>;

/** `studio.photoshoot.rates`'s own value shape (`@extas/settings`'s `registry-photoshoot-cost.ts`), read here as
 * a plain object rather than importing the settings package's schema type — the same arm's-length read
 * `spendCap.ts` already does for its own setting. Paisa per image; 0 means the owner has not set it (CN-018). */
export type PhotoshootRates = Record<RatedPhotoshootProvider, { baseline: number; premium: number }>;

export interface EstimateInput {
  provider: PhotoshootProviderKey;
  tier: JobTier;
  /** C7.7: a premium job is "best-of-2, not best-of-4" — two provider calls, never one assumed from the tier
   * name alone when the caller already knows better (e.g. a true-up after the real candidate count is in). */
  imageCount: number;
  rates: PhotoshootRates;
}

/** "Cost shown before a batch" (C7.6) — pure arithmetic, no network call, never an invented number (CN-018): the
 * practice provider and an unset or zero rate both come back `null`, never a fabricated figure. */
export function estimateGenerationCostMinor(input: EstimateInput): number | null {
  if (input.provider === 'mockPhotoshoot') return null; // free — never shown as if it cost something
  if (!(input.imageCount > 0)) return null;
  const rate = input.rates[input.provider]?.[input.tier] ?? 0;
  if (!(rate > 0)) return null;
  return Math.round(rate * input.imageCount);
}

/** C7.7's own default image count for a tier, when a caller has not yet actually generated anything and only
 * wants a batch estimate: baseline is a single pass, premium is best-of-2. */
export const imageCountForTier = (tier: JobTier): number => (tier === 'premium' ? 2 : 1);

export interface ReuseHashInput {
  productId: string;
  colourId?: string | null;
  recipeId?: string | null;
  modelId?: string | null;
  sceneId?: string | null;
  angle: string;
  tier: string;
  inputAssetIds: readonly string[];
  provider: PhotoshootProviderKey;
  /** The provider's own reported API/model version, when known (e.g. "fashn-tryon-v1.6"); `null` while nothing
   * tracks this yet — a later PR that reads it back from the adapter ties it in. */
  providerVersion?: string | null;
}

/**
 * C7.6: "Reuse approved outputs unless the source image, the model, the settings or the provider version
 * changed" — the exact fingerprint `PhotoshootJob.reuseHash`'s own schema doc comment names. Deliberately
 * broader than PR 451's `computeIdempotencyKey` (which also folds in the seed, to catch only an exact resend of
 * one in-flight request): this hash excludes the seed on purpose, so a later, unrelated request for the same
 * product/model/settings/provider finds an already-`APPROVED`/`PUBLISHED` job regardless of which seed won it.
 */
export function computeReuseHash(input: ReuseHashInput): string {
  const normalised = {
    productId: input.productId,
    colourId: input.colourId ?? null,
    recipeId: input.recipeId ?? null,
    modelId: input.modelId ?? null,
    sceneId: input.sceneId ?? null,
    angle: input.angle,
    tier: input.tier,
    inputAssetIds: [...input.inputAssetIds].sort(),
    provider: input.provider,
    providerVersion: input.providerVersion ?? null,
  };
  return createHash('sha256').update(JSON.stringify(normalised)).digest('hex');
}

/** `CostEntry.service`/`.module` (B3.9) for every photoshoot spend row. */
export const PHOTOSHOOT_COST_SERVICE = 'photoshoot';
export const PHOTOSHOOT_COST_MODULE = 'photoshoot';
/** `CostEntry.refType`: `refId` is always the `PhotoshootJob` id. */
export const PHOTOSHOOT_COST_REF = 'photoshoot_job';

/** The cost row's short note: the provider, tier and how many images this spend covered. */
export function photoshootCostDetail(provider: PhotoshootProviderKey, tier: string, imageCount: number): string {
  return `${provider} · ${tier} · ${imageCount} image${imageCount === 1 ? '' : 's'}`;
}

/**
 * Writes the shop's own `CostEntry` row (B3.9: "every paid call writes a cost row") for one job's real spend, and
 * trues up `PhotoshootJob.actualMinor` to match — called once, from `recordScoredOutputs`, the moment the spend
 * is incurred (win or lose: the provider was called regardless of what the owner later decides on review).
 * Writes nothing when the provider is the free practice one, the amount is not positive, or the job never named
 * a provider at all (an old-style job opened before this PR, or a caller that still does not know one) — never
 * an invented cost, and never a double-write (the caller's own `PROCESSING`-only precondition already lets this
 * run at most once per job).
 */
export async function recordGenerationCostEntry(
  db: Db,
  who: Who,
  job: { id: string; tier: string },
  provider: PhotoshootProviderKey | null,
  amountMinor: number | null,
  imageCount: number,
  occurredAt: Date,
): Promise<number | null> {
  if (!provider || provider === 'mockPhotoshoot' || amountMinor == null || !(amountMinor > 0)) return null;
  await db.costEntry.create({
    data: {
      storeId: who.storeId,
      service: PHOTOSHOOT_COST_SERVICE,
      module: PHOTOSHOOT_COST_MODULE,
      amountMinor,
      currency: 'BDT',
      refType: PHOTOSHOOT_COST_REF,
      refId: job.id,
      detail: photoshootCostDetail(provider, job.tier, imageCount),
      source: 'system',
      occurredAt,
    },
  });
  await db.photoshootJob.update({ where: { id: job.id }, data: { actualMinor: amountMinor } });
  return amountMinor;
}

// S24 · PR 460 (Blueprint C7.22 item 17 "recommendation-note system") — closes out the one piece of C1.5's
// "recommendation notes" pattern C7.20 names for the Photoshoot agent specifically: "Every sub-job has its own
// row in the AI Cost Book, with the recommended model, estimated cost per run, alternatives and their cost, and
// the recommendation note when the owner changes one." The AI Cost Book itself (PR 312/580) is a later, separate
// S15 PR that has not been built yet, and this file does not depend on it; what PR 460 can honestly build inside
// `@extas/photoshoot` today is the same pure, inline-note primitive PR 307 already proved out for per-agent
// model selection (C1.5): the owner's own choice is never second-guessed, but a plain-words note beside it either
// confirms it matches the system's own suggestion or explains the cost effect of picking something else — and,
// true to C7.19's "A/B the providers on 20 real products before committing," it never claims a quality
// difference between providers, since nothing has measured one yet.
//
// Deliberately NOT here: persisting the note anywhere (it is computed fresh from the owner's own
// `studio.photoshoot.rates` every time, same as `estimateGenerationCostMinor` already is — nothing to go stale);
// an admin screen to show it (no S24 screen yet reads `createOrReuseJob`'s own result at all; the first one that
// does gets this for free); the AI Cost Book row itself (S15, unbuilt).
import type { JobTier } from './jobs';
import { isPhotoshootProvider, type PhotoshootProviderKey, type PhotoshootRates, type RatedPhotoshootProvider } from './costLedger';

/**
 * The order the system suggests a rated provider in, once the owner has set up more than one — FASHN first, the
 * same order Blueprint C7.17 lists the providers to benchmark in. This is only a tie-break for which one gets
 * suggested first; nothing here claims FASHN generates a better image than Fitroom (or the reverse) — that
 * question is left entirely to the real A/B pilot (C7.19), never invented here.
 */
export const PHOTOSHOOT_PROVIDER_RECOMMENDATION_ORDER = ['fashn', 'fitroom'] as const satisfies readonly RatedPhotoshootProvider[];

/**
 * The first rated provider (in the order above) the owner has actually set a real rate for, at either tier —
 * proof the owner means to spend through it for real, not merely that a key is on file. `null` when the owner
 * has not set up any rated provider yet: there is nothing to recommend, and naming one anyway would be the exact
 * invented preference CN-018 forbids.
 */
export function recommendedPhotoshootProvider(rates: PhotoshootRates): RatedPhotoshootProvider | null {
  for (const provider of PHOTOSHOOT_PROVIDER_RECOMMENDATION_ORDER) {
    const rate = rates[provider];
    if (rate && (rate.baseline > 0 || rate.premium > 0)) return provider;
  }
  return null;
}

export interface PhotoshootRecommendationNoteInput {
  provider: PhotoshootProviderKey;
  tier: JobTier;
  rates: PhotoshootRates;
}

/** The fixed, honest words every note ends on — never a quality claim, since only the real pilot answers that. */
const QUALITY_DISCLAIMER = 'quality is not compared here — only the real side-by-side pilot on real products answers that, before scaling';

/**
 * The owner's own choice is always the default and is never overridden — this only ever explains it, the exact
 * "recommendation notes" pattern C1.5 describes and PR 307 already built for per-agent model selection, now
 * applied to the photoshoot provider choice (C7.20). Returns `null` when there is nothing worth saying: the free
 * practice provider (there is no real spend to compare), no rated provider configured yet (nothing to recommend
 * against), or the chosen provider already matches the system's own suggestion. Otherwise an honest, one-line
 * cost comparison — a real rate difference when both sides have one set, or a plain statement that no comparison
 * is possible yet when either side's rate is still unset (CN-018: never an invented number) — always closing on
 * the quality disclaimer above.
 */
export function photoshootRecommendationNote(input: PhotoshootRecommendationNoteInput): string | null {
  if (!isPhotoshootProvider(input.provider) || input.provider === 'mockPhotoshoot') return null;
  const recommended = recommendedPhotoshootProvider(input.rates);
  if (!recommended || recommended === input.provider) return null;

  const chosen = input.provider as RatedPhotoshootProvider;
  const chosenRate = input.rates[chosen]?.[input.tier] ?? 0;
  const recommendedRate = input.rates[recommended]?.[input.tier] ?? 0;

  if (chosenRate <= 0) return `no rate is set yet for ${chosen} at this tier, so its cost cannot be compared to the system's own suggestion, ${recommended}; ${QUALITY_DISCLAIMER}.`;
  if (recommendedRate <= 0) return `${recommended} is the system's own suggestion but has no rate set at this tier yet, so no cost comparison is possible; ${QUALITY_DISCLAIMER}.`;
  if (chosenRate === recommendedRate) return `${chosen} costs the same as the system's own suggestion, ${recommended}, at this tier; ${QUALITY_DISCLAIMER}.`;

  const cheaper = chosenRate < recommendedRate;
  const deltaMinor = Math.abs(chosenRate - recommendedRate);
  return `${chosen} costs ${deltaMinor} paisa ${cheaper ? 'less' : 'more'} per image than the system's own suggestion, ${recommended}, at this tier; ${QUALITY_DISCLAIMER}.`;
}

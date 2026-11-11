// S15 · PR 314 (Blueprint C2.3's "what if" slider — "if I post 3 times a day instead of 1, the monthly total
// updates live; same for articles per week, support volume, order volume") — pure, zero-dependency arithmetic on
// numbers the Cost Book page already has: one multiplier per section (support/orders/marketing/social/seo/audit/
// reports/admin/studio), scaling each job's own monthly estimate before summing. No settings, no persistence —
// this is an exploration tool, not a saved preference, so nothing here writes anything; the owner tries a number
// and sees the total change, nothing more.
//
// Kept in its own tiny file, never importing `@extas/db`, `@extas/auth` or Prisma, so the "AI › Cost Book" client
// component that drags the slider can import it directly without pulling server-only code into the browser
// bundle (the type-only import of `CostBookSection` below is erased at compile time).
import type { CostBookSection } from './cost-book';

export interface WhatIfJob {
  section: CostBookSection;
  perMonthUsdMinor: number;
  perMonthStoreMinor: number | null;
}

/** 0.25×–4× covers "a quarter as often" to "four times as often" — wide enough for the Blueprint's own examples
 * (3× posting, more support, more orders) without a slider nobody can read. */
export const WHAT_IF_MIN = 0.25; // hardcode-ok: a slider's own range, not a charge, limit or threshold
export const WHAT_IF_MAX = 4; // hardcode-ok: a slider's own range, not a charge, limit or threshold
export const WHAT_IF_DEFAULT = 1; // hardcode-ok: "no change yet" — the slider's own starting point

/** A multiplier for every section the book has (defaulting a missing one to 1×, never to 0). */
export function fullMultiplier(bySection: Partial<Record<CostBookSection, number>>): Record<CostBookSection, number> {
  const sections: CostBookSection[] = ['support', 'orders', 'marketing', 'social', 'seo', 'audit', 'reports', 'admin', 'studio'];
  const out = {} as Record<CostBookSection, number>;
  for (const s of sections) out[s] = bySection[s] ?? WHAT_IF_DEFAULT;
  return out;
}

/** Every job's own monthly estimate times its section's own multiplier, summed — in USD and (honestly, only once
 * every job has one) in the store's own currency. */
export function whatIfTotal(jobs: readonly WhatIfJob[], bySection: Partial<Record<CostBookSection, number>>): { usdMinor: number; storeMinor: number | null } {
  let usdMinor = 0;
  let storeMinor = 0;
  let everyJobHasStore = true; // vacuously true for an empty list — nothing to be honestly uncertain about
  for (const j of jobs) {
    const m = bySection[j.section] ?? WHAT_IF_DEFAULT;
    usdMinor += j.perMonthUsdMinor * m;
    if (j.perMonthStoreMinor === null) everyJobHasStore = false;
    else storeMinor += j.perMonthStoreMinor * m;
  }
  return { usdMinor: Math.round(usdMinor), storeMinor: everyJobHasStore ? Math.round(storeMinor) : null };
}

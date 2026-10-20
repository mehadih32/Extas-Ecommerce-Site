// S10 · PR 215, 216 — what the storefront asks Smart Rules, on the server: one rule's text, the texts of a place, and
// the notices of a place, already filled in from the live rules. A storefront page never writes a rule's number or
// wording itself (CLAUDE.md rule 1); it renders what these return. Without a database (or when it is slow) each one
// answers "nothing", so the page still draws — the storefront owner (S02) decides where each piece sits.
import { getPrisma } from '@extas/db/client';
import * as rl from '@extas/rules';
import type { TextSlot } from '@extas/rules/pure';
import { settingsResolver, settingsTimeoutMs, withTimeout } from './settings';

export function publicRulesDeps(): rl.RulesDeps | null {
  const resolver = settingsResolver();
  return resolver ? { db: getPrisma(), settings: resolver } : null;
}

async function safe<T>(fallback: T, run: (deps: rl.RulesDeps) => Promise<T>): Promise<T> {
  const deps = publicRulesDeps();
  if (!deps) return fallback;
  try {
    return await withTimeout(run(deps), settingsTimeoutMs());
  } catch {
    return fallback;
  }
}

/** One live rule's text ("Exchange within 72 hours for size or fault"), or null when the rule is not live. */
export const ruleText = (input: { storeId: number; key: string; slot?: TextSlot; locale?: string }) => safe<string | null>(null, (d) => rl.ruleTextFor(d, { slot: 'short', ...input }));

/** The live rule texts shown at a place (`product`, `bag`, `checkout`, `footer` …). */
export const placeTexts = (input: { storeId: number; placement: string; locale?: string; productId?: string | null }) => safe<rl.PublicRuleText[]>([], (d) => rl.ruleTextsFor(d, input));

/** The switched-on notices of a place, with the pop-up limits the RulePopup component applies. */
export const placeNotices = (input: { storeId: number; placement: string; locale?: string }) => safe<rl.PublicNotices | null>(null, (d) => rl.liveNotices(d, input));

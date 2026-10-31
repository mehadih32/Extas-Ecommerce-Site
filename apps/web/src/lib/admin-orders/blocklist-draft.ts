// S06 · PR 162 — the Blocklist card's draft rules, client-safe (the browser card loads this file, never the order
// service): what a match can get, whether two values are the same, and why a draft cannot be saved yet. The API checks
// the value again.
import type { RiskBlocklist, RiskBlocklistEffect } from '@extas/settings';

/** What a match can get, in the order the card offers it (here so the client card does not load the settings registry). */
export const BLOCKLIST_EFFECTS: readonly RiskBlocklistEffect[] = ['mark', 'hold'];

export const sameBlocklist = (a: RiskBlocklist, b: RiskBlocklist): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Why the draft cannot be saved yet: "hold" needs a hold reason from the owner's list. */
export const blocklistDraftProblem = (v: RiskBlocklist, reasons: readonly { key: string }[]): 'noReason' | null => (v.onOrder === 'hold' && !reasons.some((r) => r.key === v.holdReasonKey) ? 'noReason' : null);

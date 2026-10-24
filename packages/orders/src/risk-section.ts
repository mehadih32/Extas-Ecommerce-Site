// S05 · PR 541 — which section an order is in, as one pure function (no database, no clock): what is known the moment it
// lands (an open duplicate review from PR 145, the risk score's fired signals and band from PR 156, how it is paid) and
// the owner's `risk.sections` in, one section and whether it waits for a person out. The same facts and settings always
// give the same section, so the note on the timeline says exactly why it is there.
//
// The sections only sort the orders. "Waits for a person" is an open review: the order is neither confirmed nor booked
// until someone decides (SIM-F-014) — never cancelled, blocked or held by itself, and COD, prices and charges are never
// touched (CLAUDE.md rule 6). A prepaid order that nothing flagged never enters the call queue (SIM-F-020); a flagged
// prepaid order is still in its risk section.
// Types only: this file is in the client-safe pure entry (the browser never loads the settings registry).
import type { RiskSection, RiskSections, RiskSignalKey } from '@extas/settings';

export type { RiskSection };

/** What the section of one order is worked out from. */
export interface SectionFacts {
  /** PR 145: an open duplicate review on the order. */
  duplicateOpen: boolean;
  /** The signals of the order's latest risk assessment that counted (empty: not scored). */
  fired: readonly RiskSignalKey[];
  /** The band key of the latest assessment (null: not scored). */
  band: string | null;
  /** How the order is paid: anything but cash on delivery is prepaid. */
  paymentMethod: string | null;
}

export interface SectionResult {
  section: RiskSection;
  /** The signals that put it there (a re-order or a new identity), in the model's order. */
  because: RiskSignalKey[];
  /** The order waits for a person's decision in this section (the owner's `review`). */
  review: boolean;
}

/** Paid before the parcel leaves: every method but cash on delivery (an order with no method left to pay is too). */
export const isPrepaidMethod = (method: string | null): boolean => method !== null && method !== 'COD';

/** PR 541 — the one section of an order: the first that applies, in RISK_SECTIONS' order. */
export function sectionOf(f: SectionFacts, cfg: RiskSections): SectionResult {
  const pick = (section: RiskSection, because: RiskSignalKey[] = []): SectionResult => ({ section, because, review: (cfg.review as readonly string[]).includes(section) });
  if (f.duplicateOpen) return { section: 'duplicate', because: [], review: false };
  const reorder = f.fired.filter((k) => cfg.reorderSignals.includes(k));
  if (reorder.length) return pick('reorder', reorder);
  const identity = f.fired.filter((k) => cfg.identitySignals.includes(k));
  if (identity.length) return pick('identity', identity);
  if (f.band && cfg.highBands.includes(f.band)) return pick('high');
  if (f.band && cfg.watchBands.includes(f.band)) return pick('watch');
  if (isPrepaidMethod(f.paymentMethod)) return { section: 'prepaid', because: [], review: false };
  return { section: 'clear', because: [], review: false };
}

/** Sections that come from the risk score (the others: a duplicate review, the payment, nothing at all). */
export const SCORED_SECTIONS: ReadonlySet<RiskSection> = new Set(['reorder', 'identity', 'high', 'watch']);

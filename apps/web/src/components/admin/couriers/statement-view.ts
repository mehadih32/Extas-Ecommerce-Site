// Parity round 3, lane F5 · PR 858 — the prototype's "Mismatches" chips on the courier statement: "To check" (lines that still
// do not match and have no claim), "Claimed or resolved" (a claim raised, or a note written) and "All". Pure, so the
// split is tested without a page: the page only draws what this says.
export const STATEMENT_SHOW = ['check', 'done', 'all'] as const;
export type StatementShow = (typeof STATEMENT_SHOW)[number];

/** The chip the address names; anything else is the first one (the prototype opens on "To check"). */
export function statementShow(v: string | undefined): StatementShow {
  return (STATEMENT_SHOW as readonly string[]).includes(v ?? '') ? (v as StatementShow) : 'check';
}

export interface Split<O, R> {
  /** Open lines with no claim yet. */
  check: O[];
  /** Open lines that already carry a claim. */
  claimed: O[];
  /** Lines settled with a note. */
  resolved: R[];
}

/** Sorts the open lines by whether a claim is raised for their parcel, and keeps the resolved ones apart. */
export function splitLines<O extends { shipmentId?: string | null }, R>(open: readonly O[], claimedShipmentIds: readonly string[], resolved: readonly R[]): Split<O, R> {
  const claimed = new Set(claimedShipmentIds);
  const isClaimed = (l: O) => !!l.shipmentId && claimed.has(l.shipmentId);
  return { check: open.filter((l) => !isClaimed(l)), claimed: open.filter(isClaimed), resolved: [...resolved] };
}

/** What each chip shows and counts. */
export function chipCounts(s: Split<unknown, unknown>): Record<StatementShow, number> {
  return { check: s.check.length, done: s.claimed.length + s.resolved.length, all: s.check.length + s.claimed.length + s.resolved.length };
}

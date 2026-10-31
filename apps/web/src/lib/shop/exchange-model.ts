// S08 · PR 186 — the pure rules of the account's exchange flow (demo 61-exchange.js exc_model, exc_sizeOrder,
// exc_diffText, exc_hint), used by the page and its client steps alike. No database, no words: the page turns the
// keys into the shop dictionary's words (`account.exchange.*`).

/** What the customer picks on step 2: a size too small or too big, or a faulty, damaged or wrong piece. */
export type UiReason = 'small' | 'big' | 'problem';
export const UI_REASONS: readonly UiReason[] = ['small', 'big', 'problem'];

/** The engine's reason for his pick (a problem goes by the one the owner's rules take; null: none). */
export function engineReason(r: UiReason, problemReason: string | null): string | null {
  return r === 'problem' ? problemReason : 'size';
}

/** The sizes in the order he looks for them: too small → bigger first; too big → smaller first, nearest first. */
export function sizeOrder<S extends { key: string }>(sizes: readonly S[], currentKey: string | null, r: 'small' | 'big'): (S & { current: boolean })[] {
  const i = sizes.findIndex((s) => s.key === currentKey);
  const mark = (s: S) => ({ ...s, current: s.key === currentKey });
  if (i < 0) return sizes.map(mark);
  const bigger = sizes.slice(i + 1);
  const smaller = sizes.slice(0, i).reverse();
  const ordered = r === 'big' ? [...smaller, sizes[i]!, ...bigger] : [...bigger, sizes[i]!, ...smaller];
  return ordered.map(mark);
}

/** How the new piece's price compares with what he paid for the old one. */
export function priceDiff(newMinor: number, oldMinor: number): { kind: 'same' | 'more' | 'less'; amountMinor: number } {
  const d = newMinor - oldMinor;
  return d === 0 ? { kind: 'same', amountMinor: 0 } : d > 0 ? { kind: 'more', amountMinor: d } : { kind: 'less', amountMinor: -d };
}

export interface FlowLine {
  lineId: string;
  size: string | null;
  problem: string | null;
  sizes: readonly { key: string }[];
}

export interface FlowState {
  line: FlowLine | null;
  reason: UiReason | null;
  /** Photos he added for a problem. */
  photos: number;
  sizeKey: string | null;
  optionId: string | null;
  /** "You sent the wrong size": on, with what he wrote and how many label photos. */
  claim: { on: boolean; note: string; photos: number };
}

export interface FlowRules {
  problemReason: string | null;
  problemPhoto: boolean;
  claim: boolean;
  claimPhoto: boolean;
}

/** May this line be exchanged for a size, or replaced for a problem? (one size: only a problem) */
export const canSize = (l: FlowLine): boolean => l.size === null && l.sizes.length > 1;
export const canProblem = (l: FlowLine, problemReason: string | null): boolean => !!problemReason && l.problem === null;
export const lineOpen = (l: FlowLine, problemReason: string | null): boolean => canSize(l) || canProblem(l, problemReason);

export type Hint = 'item' | 'reason' | 'photo' | 'claim' | 'size' | 'option';

/** Whether each step is done, and what is missing on the step he is on (null: nothing). */
export function stepsOk(s: FlowState, r: FlowRules): { ok1: boolean; ok2: boolean; ok3: boolean; missing: [Hint | null, Hint | null, Hint | null] } {
  const ok1 = !!s.line && lineOpen(s.line, r.problemReason);
  const reasonOk = !!s.reason && !!s.line && (s.reason === 'problem' ? canProblem(s.line, r.problemReason) : canSize(s.line));
  const photoOk = s.reason !== 'problem' || !r.problemPhoto || s.photos > 0;
  const claimOk = !s.claim.on || s.reason === 'problem' || (s.claim.note.trim().length > 0 && (!r.claimPhoto || s.claim.photos > 0));
  const ok2 = ok1 && reasonOk && photoOk && claimOk;
  const sizeOk = s.reason === 'problem' || (!!s.sizeKey && s.sizeKey !== null);
  const ok3 = ok2 && sizeOk && !!s.optionId;
  const m2: Hint | null = !s.reason || !reasonOk ? 'reason' : !photoOk ? 'photo' : !claimOk ? 'claim' : null;
  const m3: Hint | null = !sizeOk ? 'size' : !s.optionId ? 'option' : null;
  return { ok1, ok2, ok3, missing: [ok1 ? null : 'item', m2, m3] };
}

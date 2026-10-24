// PR 59 — the Find My Size training engine, pure (Blueprint D3.7 "ease per fit feeds Find my size (rule-based, works
// with AI off)", §41.5 "AI proposes the bands from the measurement chart and from past orders and returns, and the
// owner approves or edits; it learns from exchanges and flags a band that keeps producing 'too tight'"; register PR 59
// "the chart data, the ease model, and the admin report").
//
// What it learns from, in order of how much it proves (`SizeAnswer`):
//   1. a size exchange — the customer paid to change the size the finder gave him; the strongest signal there is;
//   2. an approved review that says how that size felt (PR 65: "Too small / Just right / Too big");
//   3. the size he actually took after the answer (one step up = our answer ran tight, one step down = it ran loose).
// An answer nobody acted on teaches nothing and is counted but not used, so a quiet month never moves a chart.
//
// The lever is the chart's **ease** — the room the chart leaves over the body for that garment type and fit — because
// that is the number the owner's own charts carry (S01 PR 27) and the number the finder already reads. Nothing here
// touches a chart: it proposes a new ease for a version the owner switches on (`SizeAdviceModel`), and the finder uses
// it only while `catalogue.sizeAdvice.useTrainedEase` is on. No database, no settings reader: the caller passes the
// answers, the shop's size order and the owner's numbers, so the report, the proposal and the tests agree.

/** How a size felt, as a review says it (PR 65). */
export type FitVerdict = 'small' | 'right' | 'big';

/** What one Find My Size answer turned out to mean. */
export type FitSignal = 'tight' | 'loose' | 'right' | 'none';

/** One recorded answer and what the customer did with it (`SizeRecommendation` plus its review and exchange). */
export interface SizeAnswer {
  /** The size the finder gave (null: the chart could not answer and nothing was recorded). */
  recommended: string | null;
  /** The size he chose on the page afterwards, when he chose one. */
  chosen: string | null;
  /** The order line the answer led to (follow-up 153), when it is known. */
  ordered: boolean;
  /** The size he swapped to in a size exchange, when there was one. */
  exchangedTo: string | null;
  /** How the size felt, from his approved review (PR 65), when he left one. */
  verdict: FitVerdict | null;
  /** The ease, in inches, the answer was given with (the chart's at the time). */
  easeInch: number | null;
}

/** What the answers of one garment type and fit say. */
export interface GroupStats {
  /** Answers in the window. */
  answers: number;
  /** Answers where he went on to choose a size. */
  withChoice: number;
  /** He took exactly the size we said. */
  followed: number;
  /** He took one step up / down from it. */
  wentUp: number;
  wentDown: number;
  /** Answers tied to an order line, and of those the ones that ended in a size exchange. */
  ordered: number;
  exchanged: number;
  /** Signals by what they say (`none` is not counted here). */
  tight: number;
  loose: number;
  right: number;
  /** Signals that say something at all (tight + loose + right). */
  signals: number;
  /** Share of the signals, as whole percentages. */
  tightSharePct: number;
  looseSharePct: number;
  /** The chart keeps running tight (or loose) above the owner's share: the owner is asked to look. */
  flag: 'tight' | 'loose' | null;
}

export interface EaseProposal {
  /** The ease the chart gives today. */
  currentEaseInch: number;
  /** What the signals propose, never below zero. */
  proposedEaseInch: number;
  /** The move, in whole steps of the owner's step. */
  deltaInch: number;
  /** Signals behind it, and whether there are enough of them for a proposal at all. */
  signals: number;
  enough: boolean;
  /** 0–100: how far the signals are towards the owner's "smallest number of signals". */
  confidencePct: number;
  /** Why, in words the report can show: 'tight', 'loose', 'balanced' or 'not-enough'. */
  verdict: 'tight' | 'loose' | 'balanced' | 'not-enough';
}

export interface TrainingNumbers {
  /** The owner's `catalogue.sizeAdvice.report.minAnswers`. */
  minAnswers: number;
  /** `report.flagSharePct`. */
  flagSharePct: number;
  /** `train.maxEaseAdjustInch` and `train.stepInch`. */
  maxEaseAdjustInch: number;
  stepInch: number;
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Where a size sits in the shop's own order (-1: the shop does not know it). */
export const sizeIndex = (order: readonly string[], size: string | null): number => (size ? order.indexOf(size) : -1);

/**
 * What one answer says. An exchange decides it when there is one (he paid to change size), then his review, then the
 * size he took instead of ours. "tight" means our answer was too tight — he needed more room.
 */
export function answerSignal(a: SizeAnswer, order: readonly string[]): FitSignal {
  const rec = sizeIndex(order, a.recommended);
  if (rec < 0) return 'none';
  const swapped = sizeIndex(order, a.exchangedTo);
  const from = sizeIndex(order, a.chosen) >= 0 ? sizeIndex(order, a.chosen) : rec;
  if (swapped >= 0 && swapped !== from) return swapped > from ? 'tight' : 'loose';
  if (a.verdict) return a.verdict === 'small' ? 'tight' : a.verdict === 'big' ? 'loose' : 'right';
  const chosen = sizeIndex(order, a.chosen);
  if (chosen < 0) return 'none';
  if (chosen === rec) return 'right';
  return chosen > rec ? 'tight' : 'loose';
}

/** The numbers of one group (a garment type and fit), from its answers. */
export function groupStats(answers: readonly SizeAnswer[], order: readonly string[], n: Pick<TrainingNumbers, 'flagSharePct'>): GroupStats {
  const s: GroupStats = {
    answers: answers.length,
    withChoice: 0,
    followed: 0,
    wentUp: 0,
    wentDown: 0,
    ordered: 0,
    exchanged: 0,
    tight: 0,
    loose: 0,
    right: 0,
    signals: 0,
    tightSharePct: 0,
    looseSharePct: 0,
    flag: null,
  };
  for (const a of answers) {
    const rec = sizeIndex(order, a.recommended);
    const chosen = sizeIndex(order, a.chosen);
    if (chosen >= 0) {
      s.withChoice++;
      if (rec >= 0 && chosen === rec) s.followed++;
      else if (rec >= 0 && chosen > rec) s.wentUp++;
      else if (rec >= 0) s.wentDown++;
    }
    if (a.ordered) s.ordered++;
    if (a.exchangedTo) s.exchanged++;
    const signal = answerSignal(a, order);
    if (signal !== 'none') {
      s[signal]++;
      s.signals++;
    }
  }
  s.tightSharePct = pct(s.tight, s.signals);
  s.looseSharePct = pct(s.loose, s.signals);
  if (s.tightSharePct >= n.flagSharePct && s.tight > s.loose) s.flag = 'tight';
  else if (s.looseSharePct >= n.flagSharePct && s.loose > s.tight) s.flag = 'loose';
  return s;
}

/**
 * The ease this group's signals propose. Two gates before anything is proposed: at least the owner's `minAnswers`
 * signals, and one side above his `flagSharePct` — the same share that flags a chart, so the report's flag and the
 * proposal always agree and a thin majority never moves a chart. Then the net one-sidedness (tight minus loose, over
 * all signals) is worth at most his `maxEaseAdjustInch`, rounded to his step: all tight and nothing else moves the
 * ease by the whole allowance, an even split moves nothing.
 */
export function proposeEase(stats: GroupStats, currentEaseInch: number, n: TrainingNumbers): EaseProposal {
  const confidencePct = Math.min(100, pct(stats.signals, Math.max(1, n.minAnswers)));
  const base = { currentEaseInch, signals: stats.signals, confidencePct };
  if (stats.signals < n.minAnswers) return { ...base, proposedEaseInch: currentEaseInch, deltaInch: 0, enough: false, verdict: 'not-enough' };
  if (!stats.flag) return { ...base, proposedEaseInch: currentEaseInch, deltaInch: 0, enough: true, verdict: 'balanced' };
  const net = (stats.tight - stats.loose) / stats.signals;
  const steps = n.stepInch > 0 ? Math.round((net * n.maxEaseAdjustInch) / n.stepInch) : 0;
  const raw = steps * n.stepInch;
  const capped = Math.max(-n.maxEaseAdjustInch, Math.min(n.maxEaseAdjustInch, raw));
  const proposed = Math.max(0, round2(currentEaseInch + capped));
  const deltaInch = round2(proposed - currentEaseInch);
  return {
    ...base,
    proposedEaseInch: proposed,
    deltaInch,
    enough: true,
    verdict: deltaInch > 0 ? 'tight' : deltaInch < 0 ? 'loose' : 'balanced',
  };
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** The model a trained version stores (`SizeAdviceModel.model`), kept small and readable. */
export interface SizeAdviceModelData {
  engine: 'ease-v1';
  /** The ease the version gives this garment type and fit, inches. */
  easeInch: number;
  /** The chart ease it was trained from, and the move. */
  baseEaseInch: number;
  deltaInch: number;
  stats: GroupStats;
  proposal: Omit<EaseProposal, 'currentEaseInch'>;
  /** The window the answers came from, and the owner's numbers at the time. */
  window: { fromIso: string; toIso: string; days: number };
  numbers: TrainingNumbers;
  /** The charts of this garment type and fit the version speaks for. */
  chartIds: string[];
  trainedAtIso: string;
}

/** The stored model read back (an older or hand-edited row that is not this engine's gives nothing). */
export function readModelData(json: unknown): SizeAdviceModelData | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const m = json as Record<string, unknown>;
  if (m.engine !== 'ease-v1' || typeof m.easeInch !== 'number' || !Number.isFinite(m.easeInch) || m.easeInch < 0) return null;
  return m as unknown as SizeAdviceModelData;
}

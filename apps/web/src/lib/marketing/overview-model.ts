// S28 · PR 699 (CN-048; prototype v5 Marketing › Overview, Ad campaigns and Plan & ideas; gap M1-M4) — the pure figures of the
// three pages. Sales are delivered orders only (the only sale); a chip is advice from the owner's `marketing.verdicts`
// numbers and never pauses or changes anything. The channel plan moves a share (`shiftPct`) of a budget from the weakest
// channel to the strongest, by delivered sales per Tk 1; it is advice, not an instruction to any ad account.
import type { MarketingVerdictsSettings } from '@extas/settings';

export type Verdict = 'SCALE' | 'KEEP' | 'FIX' | 'STOP' | 'NONE';

/** Delivered sales per Tk 1 of spend, two decimals; null when no spend is known. */
export const salesPerTk = (salesMinor: number, spendMinor: number | null): number | null =>
  spendMinor === null || spendMinor <= 0 ? null : Math.round((salesMinor * 100) / spendMinor) / 100; // hardcode-ok: two decimals

/** A chip from delivered sales per Tk 1; NONE while there is no spend to judge. */
export function verdictOf(perTk: number | null, v: Pick<MarketingVerdictsSettings, 'scale' | 'keep' | 'fix'>): Verdict {
  if (perTk === null) return 'NONE';
  if (perTk >= v.scale) return 'SCALE';
  if (perTk >= v.keep) return 'KEEP';
  if (perTk >= v.fix) return 'FIX';
  return 'STOP';
}

/** Clicks per 100 shows, one decimal; null with no shows. */
export const ctrOf = (clicks: number, impressions: number): number | null => (impressions <= 0 ? null : Math.round((clicks * 1000) / impressions) / 10); // hardcode-ok: one decimal of a percent

export interface DayFigure {
  day: string;
  impressions: number;
  clicks: number;
}

/**
 * Ad tiredness: clicks per 100 shows in the last 7 days against the 7 days before. `dropPct` is how far it fell (null when
 * either week has no shows). `tired` when it fell by `atPct` or more.
 */
export function fatigueOf(days: readonly DayFigure[], today: string, atPct: number): { now: number | null; before: number | null; dropPct: number | null; tired: boolean } {
  const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
  const age = (d: string) => Math.round((ms(today) - ms(d)) / 86_400_000); // hardcode-ok: ms in a day
  const sum = (lo: number, hi: number) => days.filter((x) => age(x.day) >= lo && age(x.day) <= hi).reduce((a, x) => ({ i: a.i + x.impressions, c: a.c + x.clicks }), { i: 0, c: 0 });
  const w1 = sum(0, 6); // hardcode-ok: a week
  const w0 = sum(7, 13); // hardcode-ok: the week before
  const now = ctrOf(w1.c, w1.i);
  const before = ctrOf(w0.c, w0.i);
  const dropPct = now === null || before === null || before <= 0 ? null : Math.round(((before - now) * 1000) / before) / 10; // hardcode-ok: one decimal
  return { now, before, dropPct, tired: dropPct !== null && dropPct >= atPct };
}

export interface PlanChannel {
  key: string;
  spendMinor: number;
  salesMinor: number;
}
export interface PlanRow extends PlanChannel {
  perTk: number | null;
  verdict: Verdict;
  /** Suggested change of the budget, minor units (negative = take away). */
  moveMinor: number;
}

/**
 * The channel budget plan from delivered sales per Tk 1: `shiftPct` of the weakest judged channel's spend is suggested to
 * move to the strongest. Only when two channels with spend exist and the strongest is a Scale or Keep and the weakest is Fix
 * or Stop; otherwise no move (never invents one).
 */
export function planBudget(channels: readonly PlanChannel[], v: MarketingVerdictsSettings): PlanRow[] {
  const rows: PlanRow[] = channels.map((c) => {
    const perTk = salesPerTk(c.salesMinor, c.spendMinor);
    return { ...c, perTk, verdict: verdictOf(perTk, v), moveMinor: 0 };
  });
  const judged = rows.filter((r) => r.perTk !== null);
  if (judged.length < 2) return rows;
  const best = judged.reduce((a, b) => ((b.perTk ?? 0) > (a.perTk ?? 0) ? b : a));
  const worst = judged.reduce((a, b) => ((b.perTk ?? 0) < (a.perTk ?? 0) ? b : a));
  if (best.key === worst.key || !(best.verdict === 'SCALE' || best.verdict === 'KEEP') || !(worst.verdict === 'FIX' || worst.verdict === 'STOP')) return rows;
  const move = Math.floor((worst.spendMinor * v.shiftPct) / 100); // hardcode-ok: percent
  best.moveMinor = move;
  worst.moveMinor = -move;
  return rows;
}

export interface WarnItem {
  id: string;
  title: string;
  starts: string;
  ends: string | null;
  open: boolean;
}

/** Pairs of items that share at least one day (an open item runs on). Order is stable: earlier start first. */
export function overlaps(items: readonly WarnItem[]): [WarnItem, WarnItem][] {
  const sorted = [...items].sort((a, b) => a.starts.localeCompare(b.starts) || a.id.localeCompare(b.id));
  const end = (i: WarnItem) => (i.open && !i.ends ? '9999-12-31' : (i.ends ?? i.starts));
  const out: [WarnItem, WarnItem][] = [];
  for (let a = 0; a < sorted.length; a++) for (let b = a + 1; b < sorted.length; b++) if (sorted[b]!.starts <= end(sorted[a]!)) out.push([sorted[a]!, sorted[b]!]);
  return out;
}

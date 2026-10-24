// PR 173 — partial payment and the pre-order advance without a database (Blueprint §59 answer 29; BACKEND-ARCHITECTURE
// §6.5.3; CN-018 answer 6). The advance is a part of a Cash on Delivery order paid online now; the rest stays at the
// door. The owner's cap (`payments.partial` capPercent, of the order's total) is the most the shop may ask; the
// customer may pay it all now only when the owner allows it. The rider then collects total − wallet − paid
// (`codToCollect`): a full advance leaves nothing at the door, a part leaves the rest. These rules are asked by the
// service (advance.ts) before it writes, and by the checkout's pre-order path and the screens (the same figure).
import type { Value } from '@extas/settings';

export type PartialRules = Value<'payments.partial'>;

/** The order states an advance may still be asked in: placed, waiting for an advance, confirmed or packed. */
export const ADVANCE_OPEN_STATES: ReadonlySet<string> = new Set(['PLACED', 'AWAITING_ADVANCE', 'CONFIRMED', 'PACKED']);

/** The most the shop may ask as an advance: the owner's percentage of the order's total, rounded down, never above the due. */
export function advanceCap(rules: PartialRules, m: { totalMinor: number; dueMinor: number }): number {
  return Math.max(0, Math.min(m.dueMinor, Math.floor((m.totalMinor * rules.capPercent) / 100)));
}

/** An advance asked by its kind: an amount (up to the cap), the whole due (only when allowed), or the cap itself. */
export type AdvanceAsk = { amountMinor?: number; full?: boolean };

export type AdvancePlan =
  | { ok: true; advanceMinor: number; capMinor: number; codAfterMinor: number; full: boolean }
  | { ok: false; code: 'OVER_CAP' | 'BELOW_MIN' | 'NOTHING_DUE' | 'NOT_CONFIGURED'; capMinor: number; minMinor: number | null };

/**
 * What one advance asks and what the door collects after it is paid. No amount: the cap (or less when less is due).
 * `full`: the whole due, only while the owner allows it. An amount above the cap, or below his smallest advance, is
 * refused with the figure the screen shows.
 */
export function advancePlan(rules: PartialRules, m: { totalMinor: number; dueMinor: number }, ask: AdvanceAsk = {}): AdvancePlan {
  const capMinor = advanceCap(rules, m);
  const minMinor = rules.minMinor;
  const no = (code: 'OVER_CAP' | 'BELOW_MIN' | 'NOTHING_DUE' | 'NOT_CONFIGURED'): AdvancePlan => ({ ok: false, code, capMinor, minMinor });
  if (m.dueMinor <= 0) return no('NOTHING_DUE');
  let advanceMinor: number;
  if (ask.full) {
    if (!rules.allowFull) return no('OVER_CAP');
    advanceMinor = m.dueMinor;
  } else {
    if (capMinor <= 0) return no('NOT_CONFIGURED');
    advanceMinor = ask.amountMinor ?? capMinor;
    if (advanceMinor > capMinor) return no('OVER_CAP');
  }
  if (minMinor !== null && advanceMinor < minMinor) return no('BELOW_MIN');
  return { ok: true, advanceMinor, capMinor, codAfterMinor: m.dueMinor - advanceMinor, full: advanceMinor === m.dueMinor };
}

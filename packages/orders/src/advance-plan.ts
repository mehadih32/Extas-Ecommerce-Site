// S06 · PR 542 — how much an advance request asks, as pure functions (no database, no clock): the kind a person picks
// (or the risk level proposed) and the order's money in, the amount out. CN-018 (2): Soft = the delivery charge first,
// Hard = the whole amount first, and a partial option (the owner's percent of the amount still due).
//
// Every amount is taken from what is still due (total − wallet − paid, SIM-F-001) and never more than it: the shop
// never asks for money the customer has already paid. A part is rounded UP to a whole taka (no paisa in a bKash ask).
// "No cash on delivery for this order" asks the whole amount due, paid online first — the order's COD rule itself is
// never changed (CLAUDE.md rule 6). This file is in the client-safe pure entry (the dialog shows the same amounts).

/** What an advance request can ask (a risk level's `ask` without "none"). */
export const ADVANCE_KINDS = ['delivery', 'partial', 'full', 'codOff'] as const;
export type AdvanceRequestKind = (typeof ADVANCE_KINDS)[number];

/** Why an amount cannot be asked. */
export type AdvanceRefusal = 'NO_CHARGE' | 'PARTIAL_UNSET' | 'NOTHING_DUE';

export type AdvanceAmount = { ok: true; amountMinor: number } | { ok: false; code: AdvanceRefusal };

/** The order's money as the amount is worked out from. */
export interface AdvanceMoney {
  totalMinor: number;
  walletAppliedMinor: number;
  paidMinor: number;
  deliveryChargeMinor: number;
}

/** One whole unit of money in minor units (100 paisa = 1 taka). */
export const WHOLE_UNIT_MINOR = 100;

/** What is still to be paid on the order. */
export const stillDueOf = (o: Pick<AdvanceMoney, 'totalMinor' | 'walletAppliedMinor' | 'paidMinor'>): number => Math.max(0, o.totalMinor - o.walletAppliedMinor - o.paidMinor);

/** The amount one kind asks of this order now. */
export function advanceAmountOf(kind: AdvanceRequestKind, o: AdvanceMoney, partialPercent: number | null): AdvanceAmount {
  const due = stillDueOf(o);
  if (due <= 0) return { ok: false, code: 'NOTHING_DUE' };
  switch (kind) {
    case 'delivery':
      return o.deliveryChargeMinor > 0 ? { ok: true, amountMinor: Math.min(due, o.deliveryChargeMinor) } : { ok: false, code: 'NO_CHARGE' };
    case 'partial': {
      if (partialPercent === null || !(partialPercent > 0 && partialPercent < 100)) return { ok: false, code: 'PARTIAL_UNSET' };
      const part = Math.ceil((due * partialPercent) / 100 / WHOLE_UNIT_MINOR) * WHOLE_UNIT_MINOR;
      return { ok: true, amountMinor: Math.max(1, Math.min(due, part)) };
    }
    case 'full':
    case 'codOff':
      return { ok: true, amountMinor: due };
  }
}

/** Every kind's amount for one order (the dialog's choices). */
export const advanceAmounts = (o: AdvanceMoney, partialPercent: number | null): Record<AdvanceRequestKind, AdvanceAmount> =>
  Object.fromEntries(ADVANCE_KINDS.map((k) => [k, advanceAmountOf(k, o, partialPercent)])) as Record<AdvanceRequestKind, AdvanceAmount>;

/** The payment row's purpose for a kind. */
export const advancePurposeOf = (kind: AdvanceRequestKind): 'ADVANCE_DELIVERY_CHARGE' | 'PART_ADVANCE' | 'FULL_ADVANCE' =>
  kind === 'delivery' ? 'ADVANCE_DELIVERY_CHARGE' : kind === 'partial' ? 'PART_ADVANCE' : 'FULL_ADVANCE';

/** The kind the dialog opens with: the risk level's proposal when it is one, else the delivery charge when there is one. */
export function defaultAdvanceKind(proposed: string | null | undefined, amounts: Record<AdvanceRequestKind, AdvanceAmount>): AdvanceRequestKind {
  if (proposed && (ADVANCE_KINDS as readonly string[]).includes(proposed) && amounts[proposed as AdvanceRequestKind].ok) return proposed as AdvanceRequestKind;
  return ADVANCE_KINDS.find((k) => amounts[k].ok) ?? 'full';
}

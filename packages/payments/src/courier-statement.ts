// S28 · PR 675 (CN-048, admin prototype v5, GAP-MAP C-05/C-06) — the courier statement match screen, over what the import
// (`importSettlement`, cod.ts) and the match already store:
// - `acceptFigure`: a line whose only difference is a courier charge HIGHER than ours (CHARGE_DIFFERS) can be settled by
//   accepting the courier's figure: the part above ours becomes one cost entry on the books' delivery line (the books hook
//   `courierDifference`, once per line, behind the books' own switch for courier charges) and the line is marked resolved with
//   that said. A cost the books did not take (switch off, no books link, over the limit, day closed) resolves nothing. It is a
//   record of the shop's own cost: nothing is paid, received or moved, and the courier's statement is never changed.
//   Behind `payments.settle`, checked here (the route checks it too).
// - `courierMonthStatement`: one courier's month: its statements, the totals, the lines that still do not match, the figures
//   accepted that month, and the claims still to receive from it. Read-only (`payments.view`).
// Nothing is deleted; a correction is a new entry.
import { z } from 'zod';
import { allow, nowOf, parse, TX, UUID, type PaymentsDeps, type Who } from './context';
import type { LineMismatch } from './pure';
import { PaymentsError } from './errors';
import { courierMoney, monthOf, type CourierMoney, type CourierStatementRow, type OpenStatementLine } from './courier-money';
import { auditMoney } from './wallet';

/** The reason a charge the courier made higher than ours is accepted for (the others are settled in other ways). */
export const ACCEPTABLE_REASON = 'CHARGE_DIFFERS' as const satisfies LineMismatch;
export const FIGURE_ACTION = 'courier.figure.accept';
/** The words a resolved line starts its note with when its figure was accepted (the month statement finds them by it). */
export const ACCEPTED_NOTE = 'Accepted the courier figure';
const COST_KEPT = ['WRITTEN', 'ALREADY'] as const;

/** What a line's courier charge comes to above ours; null when the line is not one this is for. */
export function extraChargeOf(l: { matchState: string | null; reasonCode: string | null; resolvedAt?: Date | null; chargeMinor: number; expectedChargeMinor: number | null }): number | null {
  if (l.matchState !== 'MISMATCH' || l.reasonCode !== ACCEPTABLE_REASON || l.resolvedAt || l.expectedChargeMinor === null) return null;
  const extra = l.chargeMinor - l.expectedChargeMinor;
  return extra > 0 ? extra : null;
}

export const acceptInput = z.object({ note: z.string().trim().max(500).optional() }).strict();

export interface AcceptedFigure {
  lineId: string;
  extraMinor: number;
  costStatus: string;
}

export async function acceptFigure(deps: PaymentsDeps, who: Who, lineId: string, input: unknown = {}): Promise<AcceptedFigure> {
  await allow(deps, who, 'payments.settle');
  if (!UUID.test(lineId)) throw new PaymentsError('NOT_FOUND', 'no such statement line', ['lineId']);
  const d = parse(acceptInput, input, 'acceptance');
  const storeId = who.storeId;
  const select = {
    id: true,
    settlementId: true,
    matchState: true,
    reasonCode: true,
    resolvedAt: true,
    chargeMinor: true,
    expectedChargeMinor: true,
    consignmentId: true,
    orderId: true,
    settlement: { select: { reference: true, courierAccountId: true } },
  } as const;
  const l = await deps.db.courierSettlementLine.findFirst({ where: { id: lineId, storeId }, select });
  if (!l) throw new PaymentsError('NOT_FOUND', 'no such statement line', ['lineId']);
  if (l.resolvedAt) throw new PaymentsError('ALREADY_RECORDED', 'this line is already resolved');
  const extra = extraChargeOf(l);
  if (extra === null) throw new PaymentsError('NOT_ACCEPTABLE', 'only a charge the courier made higher than ours can be accepted', ['lineId'], { reason: l.reasonCode });
  // the cost first (once per line, so a second press after a failure finds it there), then the line is resolved
  const cost = deps.books?.courierDifference
    ? await deps.books.courierDifference(who, { lineId: l.id, settlementId: l.settlementId, reference: l.settlement.reference, amountMinor: extra })
    : { status: 'NO_HOOK' };
  if (!(COST_KEPT as readonly string[]).includes(cost.status)) throw new PaymentsError('COST_NOT_BOOKED', 'the books did not take the cost, so nothing was resolved', [], { status: cost.status });
  const note = `${ACCEPTED_NOTE}: ${l.chargeMinor} against ${l.expectedChargeMinor}, ${extra} booked as a courier cost${d.note ? `. ${d.note}` : ''}`;
  const now = nowOf(deps);
  await deps.db.$transaction(async (tx) => {
    const again = await tx.courierSettlementLine.updateMany({
      where: { id: l.id, storeId, resolvedAt: null },
      data: { resolvedAt: now, resolvedById: who.actor.staffUserId, resolutionNote: note, moneyStatus: 'RECONCILED' },
    });
    if (again.count !== 1) throw new PaymentsError('ALREADY_RECORDED', 'this line is already resolved');
    await auditMoney(
      tx,
      who,
      FIGURE_ACTION,
      'CourierSettlementLine',
      l.id,
      { matchState: l.matchState, reasonCode: l.reasonCode },
      {
        courierAccountId: l.settlement.courierAccountId,
        reference: l.settlement.reference,
        consignmentId: l.consignmentId,
        chargeMinor: l.chargeMinor,
        expectedChargeMinor: l.expectedChargeMinor,
        extraMinor: extra,
        costStatus: cost.status,
        costEntryId: cost.id ?? null,
      },
    );
  }, TX);
  return { lineId: l.id, extraMinor: extra, costStatus: cost.status };
}

// ---------------------------------------------------------------------------------------------------------------------
// The month

export const MONTH_STATEMENT_ROWS = 100;

export interface AcceptedRow {
  lineId: string;
  reference: string | null;
  consignmentId: string | null;
  extraMinor: number;
  at: Date;
}

export interface MonthStatement {
  courier: { id: string; name: string };
  ym: string;
  /** The months either side (`YYYY-MM`); the next one is null for the current month. */
  prevYm: string;
  nextYm: string | null;
  statements: CourierStatementRow[];
  totals: CourierMoney['month'];
  open: (OpenStatementLine & { extraChargeMinor: number | null })[];
  openCount: number;
  accepted: AcceptedRow[];
  acceptedMinor: number;
  /** Claims still to receive from this courier (open and sent). */
  claims: { count: number; minor: number; late: number };
}

const shiftMonth = (ym: string, by: number): string => {
  const d = new Date(`${ym}-01T00:00:00.000Z`);
  return monthOf(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + by, 1)));
};

export async function courierMonthStatement(deps: PaymentsDeps, who: Who, courierAccountId: string, opts: { month?: string } = {}): Promise<MonthStatement> {
  const base = await courierMoney(deps, who, courierAccountId, opts);
  const storeId = who.storeId;
  const ym = base.month.ym;
  const from = new Date(`${ym}-01T00:00:00.000Z`);
  const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
  const now = nowOf(deps);
  const [account, rows, audits, claims, late, lineFigures] = await Promise.all([
    deps.db.courierAccount.findFirstOrThrow({ where: { id: courierAccountId, storeId }, select: { id: true, name: true } }),
    deps.db.courierSettlement.findMany({
      where: { storeId, courierAccountId, receivedAt: { gte: from, lt: to } },
      orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }],
      take: MONTH_STATEMENT_ROWS,
      select: { id: true, reference: true, receivedAt: true, receivedAs: true, totalCodMinor: true, chargesMinor: true, netMinor: true, lines: { select: { matchState: true } } },
    }),
    deps.db.courierSettlementLine.findMany({
      where: { storeId, reasonCode: ACCEPTABLE_REASON, resolvedAt: { gte: from, lt: to }, resolutionNote: { startsWith: ACCEPTED_NOTE }, settlement: { courierAccountId } },
      orderBy: [{ resolvedAt: 'asc' }, { id: 'asc' }],
      take: 500,
      select: { id: true, consignmentId: true, chargeMinor: true, expectedChargeMinor: true, resolvedAt: true, settlement: { select: { reference: true } } },
    }),
    deps.db.courierClaim.aggregate({ where: { storeId, courierAccountId, status: { in: ['OPEN', 'SENT'] } }, _count: true, _sum: { claimedMinor: true } }),
    deps.db.courierClaim.count({ where: { storeId, courierAccountId, status: { in: ['OPEN', 'SENT'] }, deadlineAt: { lt: now } } }),
    base.open.length
      ? deps.db.courierSettlementLine.findMany({
          where: { id: { in: base.open.map((o) => o.lineId) } },
          select: { id: true, matchState: true, reasonCode: true, resolvedAt: true, chargeMinor: true, expectedChargeMinor: true },
        })
      : Promise.resolve([]),
  ]);
  const extraOf = new Map(lineFigures.map((x) => [x.id, extraChargeOf(x)]));
  const accepted: AcceptedRow[] = audits.map((a) => ({
    lineId: a.id,
    reference: a.settlement.reference,
    consignmentId: a.consignmentId,
    extraMinor: a.chargeMinor - (a.expectedChargeMinor ?? 0),
    at: a.resolvedAt!,
  }));
  const thisMonth = monthOf(now);
  return {
    courier: account,
    ym,
    prevYm: shiftMonth(ym, -1),
    nextYm: ym >= thisMonth ? null : shiftMonth(ym, 1),
    statements: rows.map((s) => ({
      id: s.id,
      reference: s.reference,
      receivedAt: s.receivedAt,
      receivedAs: s.receivedAs,
      totalCodMinor: s.totalCodMinor,
      chargesMinor: s.chargesMinor,
      netMinor: s.netMinor,
      lines: s.lines.length,
      mismatched: s.lines.filter((l) => l.matchState === 'MISMATCH').length,
    })),
    totals: base.month,
    open: base.open.map((o) => ({ ...o, extraChargeMinor: extraOf.get(o.lineId) ?? null })),
    openCount: base.openCount,
    accepted,
    acceptedMinor: accepted.reduce((s, a) => s + a.extraMinor, 0),
    claims: { count: claims._count, minor: claims._sum.claimedMinor ?? 0, late },
  };
}

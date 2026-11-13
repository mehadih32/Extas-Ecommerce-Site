// S28 · PR 670 (CN-048, admin prototype v5, GAP-MAP C-05) — Courier 360 › Money, one courier's money from what is already
// recorded (read only, `payments.view`): the cash it holds for us and the cash still on the road (`codPosition`), how fast
// it paid (days to settle), its latest statements (what it paid, deducted and the net) with a month's total, and the
// statement lines that do not match our records and are not resolved yet, each with the reason. Nothing is imported,
// resolved or booked here (`resolveLine` and `importSettlement` do that). PR 675 builds the statement screen on the same read.
import { allow, nowOf, UUID, type PaymentsDeps, type Who } from './context';
import { codPosition, type CourierPosition } from './cod';
import { PaymentsError } from './errors';
import type { LineMismatch } from './pure';

export const COURIER_MONEY_SETTLEMENTS = 12;
export const COURIER_MONEY_OPEN_LINES = 50;

export interface CourierStatementRow {
  id: string;
  reference: string;
  receivedAt: Date | null;
  receivedAs: string | null;
  totalCodMinor: number;
  chargesMinor: number;
  netMinor: number;
  lines: number;
  mismatched: number;
}

export interface OpenStatementLine {
  lineId: string;
  settlementId: string;
  reference: string;
  consignmentId: string | null;
  orderId: string | null;
  orderNumber: string | null;
  matchState: 'MISMATCH' | 'LATE';
  reasonCode: LineMismatch | null;
  courierStatus: string | null;
  codMinor: number;
  expectedMinor: number | null;
  chargeMinor: number;
  expectedChargeMinor: number | null;
}

export interface CourierMoney {
  position: CourierPosition | null;
  statements: CourierStatementRow[];
  /** Statements received in the month asked (`YYYY-MM`, the store's calendar month by UTC date), summed. */
  month: { ym: string; statements: number; totalCodMinor: number; chargesMinor: number; netMinor: number };
  open: OpenStatementLine[];
  openCount: number;
}

const YM = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The month a clock reads, `YYYY-MM`. */
export const monthOf = (d: Date): string => d.toISOString().slice(0, 7);

export async function courierMoney(deps: PaymentsDeps, who: Who, courierAccountId: string, opts: { month?: string } = {}): Promise<CourierMoney> {
  await allow(deps, who, 'payments.view');
  const storeId = who.storeId;
  if (!UUID.test(courierAccountId) || !(await deps.db.courierAccount.findFirst({ where: { id: courierAccountId, storeId }, select: { id: true } })))
    throw new PaymentsError('NOT_FOUND', 'no such courier account', ['courierAccountId']);
  const ym = opts.month && YM.test(opts.month) ? opts.month : monthOf(nowOf(deps));
  const from = new Date(`${ym}-01T00:00:00.000Z`);
  const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
  const [pos, settlements, inMonth, open, openCount] = await Promise.all([
    codPosition(deps, who),
    deps.db.courierSettlement.findMany({
      where: { storeId, courierAccountId },
      orderBy: [{ receivedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: COURIER_MONEY_SETTLEMENTS,
      select: { id: true, reference: true, receivedAt: true, receivedAs: true, totalCodMinor: true, chargesMinor: true, netMinor: true, lines: { select: { matchState: true } } },
    }),
    deps.db.courierSettlement.aggregate({
      where: { storeId, courierAccountId, receivedAt: { gte: from, lt: to } },
      _count: { _all: true },
      _sum: { totalCodMinor: true, chargesMinor: true, netMinor: true },
    }),
    deps.db.courierSettlementLine.findMany({
      where: { storeId, matchState: { in: ['MISMATCH', 'LATE'] }, resolvedAt: null, settlement: { courierAccountId } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: COURIER_MONEY_OPEN_LINES,
      select: {
        id: true,
        settlementId: true,
        consignmentId: true,
        orderId: true,
        matchState: true,
        reasonCode: true,
        courierStatus: true,
        codMinor: true,
        expectedMinor: true,
        chargeMinor: true,
        expectedChargeMinor: true,
        settlement: { select: { reference: true } },
      },
    }),
    deps.db.courierSettlementLine.count({ where: { storeId, matchState: { in: ['MISMATCH', 'LATE'] }, resolvedAt: null, settlement: { courierAccountId } } }),
  ]);
  const numbers = open.length
    ? new Map((await deps.db.order.findMany({ where: { id: { in: open.map((l) => l.orderId).filter((x): x is string => !!x) } }, select: { id: true, number: true } })).map((o) => [o.id, o.number]))
    : new Map<string, string>();
  return {
    position: pos.couriers.find((c) => c.courierAccountId === courierAccountId) ?? null,
    statements: settlements.map((s) => ({
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
    month: { ym, statements: inMonth._count._all, totalCodMinor: inMonth._sum.totalCodMinor ?? 0, chargesMinor: inMonth._sum.chargesMinor ?? 0, netMinor: inMonth._sum.netMinor ?? 0 },
    open: open.map((l) => ({
      lineId: l.id,
      settlementId: l.settlementId,
      reference: l.settlement.reference,
      consignmentId: l.consignmentId,
      orderId: l.orderId,
      orderNumber: l.orderId ? (numbers.get(l.orderId) ?? null) : null,
      matchState: l.matchState as 'MISMATCH' | 'LATE',
      reasonCode: l.reasonCode as LineMismatch | null,
      courierStatus: l.courierStatus,
      codMinor: l.codMinor,
      expectedMinor: l.expectedMinor,
      chargeMinor: l.chargeMinor,
      expectedChargeMinor: l.expectedChargeMinor,
    })),
    openCount,
  };
}

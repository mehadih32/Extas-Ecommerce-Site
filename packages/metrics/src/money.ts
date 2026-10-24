// S07 · PR 172, 174 — the money figures of the payments screens, counted once here like Sales and Ordered value (PR 155):
// what the shop owes its customers (refunds asked, approved, or whose payout failed, F-041: "money owed to customers"
// is always visible), and — PR 174 — the money that came in through each gateway in a period, the figure a gateway
// statement is reconciled against. Store-scoped (A4.1), whole minor units (poisha); no order money is added up here.
import type { Db } from './metrics';

/** What the shop owes its customers right now, by the refund's state. */
export interface OwedFigure {
  count: number;
  requestedMinor: number;
  approvedMinor: number;
  failedMinor: number;
  totalMinor: number;
}

/** PR 172 (F-041) — the money owed to customers: every refund asked, approved, or whose payout failed. */
export async function owedToCustomers(db: Db, storeId: number): Promise<OwedFigure> {
  const rows = await db.$queryRaw<{ status: string; n: bigint | number; minor: bigint | number }[]>`
    SELECT r."status"::text AS status, count(*) AS n, COALESCE(sum(r."amountMinor"), 0)::bigint AS minor
    FROM "Refund" r
    WHERE r."storeId" = ${storeId} AND r."status"::text = ANY(${['REQUESTED', 'APPROVED', 'FAILED']})
    GROUP BY 1`;
  const of = (s: string) => Number(rows.find((r) => r.status === s)?.minor ?? 0);
  const out = { count: rows.reduce((n, r) => n + Number(r.n), 0), requestedMinor: of('REQUESTED'), approvedMinor: of('APPROVED'), failedMinor: of('FAILED'), totalMinor: 0 };
  out.totalMinor = out.requestedMinor + out.approvedMinor + out.failedMinor;
  return out;
}

/** PR 174 — the money one gateway brought in during a period, by our own payment records. */
export interface ReceivedFigure {
  provider: string;
  count: number;
  receivedMinor: number;
}

/**
 * PR 174 — the money that came in through each gateway in [from, to): every online payment paid in the period (a
 * refund later does not undo that it came in), by provider. Cash on Delivery and the wallet are not gateway money.
 */
export async function paymentsReceived(db: Db, storeId: number, period: { from: Date; to: Date }): Promise<ReceivedFigure[]> {
  const rows = await db.$queryRaw<{ provider: string; n: bigint | number; minor: bigint | number }[]>`
    SELECT p."provider" AS provider, count(*) AS n, COALESCE(sum(COALESCE(p."receivedMinor", p."amountMinor")), 0)::bigint AS minor
    FROM "Payment" p
    WHERE p."storeId" = ${storeId} AND p."provider" IS NOT NULL
      AND p."status"::text = ANY(${['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED']})
      AND p."method"::text <> ALL(${['COD', 'WALLET', 'CASH', 'BANK_TRANSFER']})
      AND p."paidAt" >= ${period.from} AND p."paidAt" < ${period.to}
    GROUP BY 1 ORDER BY 1`;
  return rows.map((r) => ({ provider: r.provider, count: Number(r.n), receivedMinor: Number(r.minor) }));
}

/** PR 174 (SIM-F-041) — a cancelled or returned order that holds the customer's money with no refund asked for it. */
export interface OwedNotAsked {
  orderId: string;
  number: string;
  status: string;
  /** Paid plus wallet used on the order. */
  inMinor: number;
  /** Refunds asked, approved, failed or paid for it (a rejected one gives its room back). */
  heldMinor: number;
}

/** PR 174 (SIM-F-041) — every cancelled or returned order whose money in is more than the refunds that hold part of it. */
export async function owedNotAsked(db: Db, storeId: number, limit: number): Promise<OwedNotAsked[]> {
  const rows = await db.$queryRaw<{ id: string; number: string; status: string; inminor: bigint | number; held: bigint | number }[]>`
    SELECT o."id"::text AS id, o."number" AS number, o."status"::text AS status,
      (o."paidMinor" + o."walletAppliedMinor")::bigint AS inminor,
      COALESCE((SELECT sum(r."amountMinor") FROM "Refund" r WHERE r."orderId" = o."id" AND r."status"::text <> 'REJECTED'), 0)::bigint AS held
    FROM "Order" o
    WHERE o."storeId" = ${storeId} AND o."status"::text = ANY(${['CANCELLED', 'RETURNED']}) AND (o."paidMinor" + o."walletAppliedMinor") > 0
      AND (o."paidMinor" + o."walletAppliedMinor") > COALESCE((SELECT sum(r."amountMinor") FROM "Refund" r WHERE r."orderId" = o."id" AND r."status"::text <> 'REJECTED'), 0)
    ORDER BY o."placedAt" DESC NULLS LAST, o."id" DESC
    LIMIT ${Math.min(Math.max(1, Math.trunc(limit)), 5_000)}`;
  return rows.map((r) => ({ orderId: r.id, number: r.number, status: r.status, inMinor: Number(r.inminor), heldMinor: Number(r.held) }));
}

/** PR 174 — a wallet whose kept balance is not the sum of its ledger (it should never happen: the ledger is the truth). */
export interface WalletDrift {
  customerId: string;
  balanceMinor: number;
  ledgerMinor: number;
}

/** PR 174 — the wallet ledger check: how many wallets were checked, and every one whose balance drifted from its ledger. */
export async function walletDrift(db: Db, storeId: number): Promise<{ checked: number; drift: WalletDrift[] }> {
  const rows = await db.$queryRaw<{ customer: string; balance: bigint | number; ledger: bigint | number }[]>`
    SELECT w."customerId"::text AS customer, w."balanceMinor"::bigint AS balance,
      COALESCE(sum(CASE WHEN e."direction"::text = 'CREDIT' THEN e."amountMinor" ELSE -e."amountMinor" END), 0)::bigint AS ledger
    FROM "WalletAccount" w LEFT JOIN "WalletEntry" e ON e."walletId" = w."id"
    WHERE w."storeId" = ${storeId}
    GROUP BY w."id", w."customerId", w."balanceMinor"`;
  const drift = rows.filter((r) => Number(r.balance) !== Number(r.ledger)).map((r) => ({ customerId: r.customer, balanceMinor: Number(r.balance), ledgerMinor: Number(r.ledger) }));
  return { checked: rows.length, drift };
}

/** PR 174 — what the gateways' statements say for a period, by provider. */
export interface StatementFigure {
  provider: string;
  lines: number;
  /** Money in (payment lines). */
  inMinor: number;
  /** Money back (refund lines). */
  backMinor: number;
  feesMinor: number;
}

/** PR 174 — the statement lines of each gateway dated in [from, to) (a line with no date counts by its statement's period end). */
export async function statementTotals(db: Db, storeId: number, period: { from: Date; to: Date }): Promise<StatementFigure[]> {
  const rows = await db.$queryRaw<{ provider: string; n: bigint | number; inminor: bigint | number; backminor: bigint | number; fees: bigint | number }[]>`
    SELECT s."provider" AS provider, count(*) AS n,
      COALESCE(sum(CASE WHEN l."kind" = 'PAYMENT' THEN l."amountMinor" ELSE 0 END), 0)::bigint AS inminor,
      COALESCE(sum(CASE WHEN l."kind" = 'REFUND' THEN l."amountMinor" ELSE 0 END), 0)::bigint AS backminor,
      COALESCE(sum(COALESCE(l."feeMinor", 0)), 0)::bigint AS fees
    FROM "GatewayStatementLine" l JOIN "GatewayStatement" s ON s."id" = l."statementId"
    WHERE l."storeId" = ${storeId}
      AND COALESCE(l."occurredAt", s."periodTo") >= ${period.from} AND COALESCE(l."occurredAt", s."periodTo") < ${period.to}
    GROUP BY 1 ORDER BY 1`;
  return rows.map((r) => ({ provider: r.provider, lines: Number(r.n), inMinor: Number(r.inminor), backMinor: Number(r.backminor), feesMinor: Number(r.fees) }));
}

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

// PR 981 (admin prototype v5, Finance › Money in & out) — the figures behind the "Match courier account" card: how many courier
// statement lines of this month matched, what is short or overcharged, and the open lines to check. Read-only; everything comes
// from the courier statement lines that already exist. Nothing is changed here: claiming or accepting a line is done on the
// courier's own page.
import type { PrismaClient } from '@extas/db/client';

export interface MatchLine {
  id: string;
  order: string;
  courier: string;
  courierId: string;
  kind: 'charge' | 'cash' | 'other';
  /** What the courier charged / paid / what we expected, in minor units (for the sentence). */
  a: number;
  b: number;
  /** How much we are short on this line, minor units. */
  shortMinor: number;
}

export interface MatchSummary {
  parcels: number;
  matched: number;
  shortMinor: number;
  overMinor: number;
  payoutMissingMinor: number;
  open: number;
  lines: MatchLine[];
  lastAt: string | null;
}

export async function matchSummary(db: PrismaClient, storeId: number, now: Date): Promise<MatchSummary> {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const rows = await db.courierSettlementLine.findMany({
    where: { storeId, createdAt: { gte: from }, matchState: { not: null } },
    select: {
      id: true,
      orderId: true,
      consignmentId: true,
      codMinor: true,
      chargeMinor: true,
      expectedMinor: true,
      expectedChargeMinor: true,
      matchState: true,
      resolvedAt: true,
      createdAt: true,
      settlement: { select: { courierAccountId: true, courierAccount: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 5000, // hardcode-ok: a safety cap on one read of a month of statement lines
  });
  const ids = [...new Set(rows.map((r) => r.orderId).filter((x): x is string => !!x))];
  const orders = ids.length ? await db.order.findMany({ where: { storeId, id: { in: ids } }, select: { id: true, number: true } }) : [];
  const num = new Map(orders.map((o) => [o.id, o.number]));
  let matched = 0;
  let shortMinor = 0;
  let overMinor = 0;
  let payoutMissingMinor = 0;
  const lines: MatchLine[] = [];
  let open = 0;
  for (const r of rows) {
    if (r.matchState === 'MATCHED') {
      matched += 1;
      continue;
    }
    if (r.resolvedAt) continue;
    open += 1;
    const exp = r.expectedMinor ?? 0;
    const expCh = r.expectedChargeMinor ?? r.chargeMinor;
    const over = Math.max(r.chargeMinor - expCh, 0); // hardcode-ok: a difference never below zero
    const short = Math.max(exp - r.codMinor, 0); // hardcode-ok: a difference never below zero
    if (over) overMinor += over;
    if (short) {
      if (!r.codMinor) payoutMissingMinor += short;
      else shortMinor += short;
    }
    if (lines.length < 5) {
      // hardcode-ok: the card lists the first five lines to check
      lines.push({
        id: r.id,
        order: (r.orderId && num.get(r.orderId)) || r.consignmentId || r.id.slice(0, 8),
        courier: r.settlement.courierAccount.name,
        courierId: r.settlement.courierAccountId,
        kind: over ? 'charge' : short ? 'cash' : 'other',
        a: over ? r.chargeMinor : !r.codMinor ? exp : r.codMinor,
        b: over ? expCh : exp,
        shortMinor: over || short,
      });
    }
  }
  return { parcels: rows.length, matched, shortMinor, overMinor, payoutMissingMinor, open, lines, lastAt: rows[0]?.createdAt.toISOString() ?? null };
}

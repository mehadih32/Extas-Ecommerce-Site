// PR 1121 (prototype v5, Orders › Returns & exchanges): the head of the page. Returned parcels (orders that came back in
// the date range, by the day they were placed), their order value and buying price, the most common reason, the reasons as
// bars, and the same figures as a CSV file ("Excel"; the PDF is the browser's own print of the page). Read only.
import type { PrismaClient } from '@extas/db/client';
import { dayRange } from '@extas/orders';
import { toCsv } from '../reports-v5/model';

export interface ReturnsSummary {
  parcels: number;
  valueMinor: number;
  /** The pieces' buying price (lines with no cost on record add nothing). */
  costMinor: number;
  currency: string;
  reasons: { code: string; n: number }[];
  rows: { number: string; placedAt: Date; totalMinor: number; reason: string | null }[];
}

const RETURNED = ['RETURNED'] as const;

export async function returnsSummary(db: PrismaClient, storeId: number, from: string | undefined, to: string | undefined, timeZone: string, currency: string): Promise<ReturnsSummary> {
  const span = dayRange(from, to, timeZone);
  const orders = await db.order.findMany({
    where: { storeId, status: { in: [...RETURNED] }, ...(span ? { placedAt: { ...(span.from ? { gte: span.from } : {}), ...(span.before ? { lt: span.before } : {}) } } : {}) },
    select: { id: true, number: true, placedAt: true, totalMinor: true, items: { where: { status: 'ACTIVE' }, select: { unitCostMinor: true, quantity: true } } },
    orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
    take: 5_000, // hardcode-ok: a guard on the list length
  });
  const ids = orders.map((o) => o.id);
  const recs = ids.length ? await db.returnRecord.findMany({ where: { storeId, orderId: { in: ids }, kind: { not: 'EXCHANGE_PICKUP' } }, select: { orderId: true, reasonCode: true } }) : [];
  const reasonOf = new Map<string, string>();
  for (const r of recs) if (r.reasonCode && !reasonOf.has(r.orderId)) reasonOf.set(r.orderId, r.reasonCode);
  const counts = new Map<string, number>();
  for (const id of ids) {
    const c = reasonOf.get(id);
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return {
    parcels: orders.length,
    valueMinor: orders.reduce((s, o) => s + o.totalMinor, 0),
    costMinor: orders.reduce((s, o) => s + o.items.reduce((a, i) => a + (i.unitCostMinor ?? 0) * i.quantity, 0), 0),
    currency,
    reasons: [...counts.entries()].map(([code, n]) => ({ code, n })).sort((a, b) => b.n - a.n || a.code.localeCompare(b.code)),
    rows: orders.map((o) => ({ number: o.number, placedAt: o.placedAt, totalMinor: o.totalMinor, reason: reasonOf.get(o.id) ?? null })),
  };
}

/** The CSV file: English headings whatever the admin's language (the Excel and PDF rule), amounts in minor units. */
export function returnsCsv(s: ReturnsSummary, labelOf: (code: string) => string): string {
  return toCsv([
    ['returnedParcels', s.parcels],
    ['orderValueMinor', s.valueMinor],
    ['buyingPriceMinor', s.costMinor],
    ['currency', s.currency],
    [],
    ['reason', 'parcels'],
    ...s.reasons.map((r) => [labelOf(r.code), r.n]),
    [],
    ['order', 'placedAt', 'totalMinor', 'reason'],
    ...s.rows.map((r) => [r.number, r.placedAt.toISOString(), r.totalMinor, r.reason ? labelOf(r.reason) : '']),
  ]);
}

/** A reason code in words when no list names it: "WRONG_SIZE" → "Wrong size". */
export function plainReason(code: string): string {
  const s = code.replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

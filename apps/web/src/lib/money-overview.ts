// S16 · PR 342 — Money → Overview (`/admin/money`, BACKEND-ARCHITECTURE §5 MNY-01's first card row; B3.10): where the
// shop's money stands right now, from its own records only, read-only:
//   - cash received: payments that came in (PAID, also those since partly or fully refunded: the money did arrive) in
//     the last 24 hours, 7 days and 30 days, and the last 30 days by method (COD, bKash …); the amount received when
//     known, else the amount asked (as PR 174's gateway figure counts it);
//   - COD due from couriers: cash a rider collected (a delivered or partly delivered parcel, or a return whose delivery
//     charge was paid) that no courier payout has settled yet — by courier, with the oldest one's age;
//   - refunds waiting: money owed to customers (requested or approved, not yet paid out) and failed payouts, always in
//     view (F-041). Approving or paying a refund stays on its own screen and is the owner's (CLAUDE.md rule 6).
// Nothing here moves, approves or changes anything. Amounts are minor units of the store's currency.
// PR 642 (CN-036): the same 30 days of received cash also come day by day in the shop's time zone (`received.daily`,
// oldest first, a day with nothing is 0), for the Lumen hero chart of Money › Overview. The same rows, nothing new.
import type { PrismaClient } from '@extas/db/client';

type Db = Pick<PrismaClient, 'payment' | 'codCollection' | 'refund' | 'shipment'>;

const HOUR_MS = 3_600_000;
export const RECEIVED_WINDOWS = [
  { key: 'day', hours: 24 },
  { key: 'week', hours: 24 * 7 },
  { key: 'month', hours: 24 * 30 },
] as const;
/** The payment states whose money came in. */
export const RECEIVED_STATES = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;
/** A rider's collection that is cash the courier owes the shop. */
export const COD_OWED_OUTCOMES = ['DELIVERED', 'PARTIAL', 'RETURNED_CHARGE_PAID'] as const;
export const COD_OWED_STATES = ['RECORDED', 'APPROVED'] as const;
export const REFUND_WAITING = ['REQUESTED', 'APPROVED'] as const;

export interface PaymentRow {
  method: string;
  amountMinor: number;
  paidAt: Date | null;
}
export interface CodRow {
  collectedMinor: number;
  chargeCollectedMinor: number;
  occurredAt: Date;
  courier: string | null;
}
export interface RefundRow {
  status: string;
  amountMinor: number;
  createdAt: Date;
}

export interface MoneyOverview {
  at: string;
  received: { windows: { key: string; minor: number; count: number }[]; byMethod: { method: string; minor: number; count: number }[]; daily?: ReceivedDay[] };
  cod: { minor: number; parcels: number; oldestDays: number | null; byCourier: { courier: string | null; minor: number; parcels: number }[] };
  refunds: { waitingMinor: number; waiting: number; oldestDays: number | null; failedMinor: number; failed: number };
}

/** One calendar day (YYYY-MM-DD in the shop's time zone) of received cash. */
export interface ReceivedDay {
  day: string;
  minor: number;
  count: number;
}

/** A moment's calendar day in a time zone (YYYY-MM-DD); a bad zone falls back to UTC. */
export function dayIn(d: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** The last `days` calendar days up to today (shop time zone), oldest first, each with what arrived on it (pure). */
export function receivedByDay(now: Date, payments: readonly PaymentRow[], days: number, timeZone: string): ReceivedDay[] {
  const n = Math.max(1, Math.floor(days));
  const today = dayIn(now, timeZone);
  const out: ReceivedDay[] = [];
  const at = new Map<string, ReceivedDay>();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    const row = { day: d.toISOString().slice(0, 10), minor: 0, count: 0 };
    out.push(row);
    at.set(row.day, row);
  }
  for (const p of payments) {
    if (!p.paidAt || p.paidAt.getTime() > now.getTime()) continue;
    const row = at.get(dayIn(p.paidAt, timeZone));
    if (row) {
      row.minor += p.amountMinor;
      row.count += 1;
    }
  }
  return out;
}

const sortDesc = <T extends { minor: number }>(a: T[]) => a.sort((x, y) => y.minor - x.minor);
const daysSince = (now: Date, d: Date | undefined) => (d ? Math.floor((now.getTime() - d.getTime()) / (24 * HOUR_MS)) : null);

/** The overview from the rows (pure; the rows are already only this store's and only the states that count). */
export function overviewOf(now: Date, payments: readonly PaymentRow[], cod: readonly CodRow[], refunds: readonly RefundRow[]): MoneyOverview {
  const t = now.getTime();
  const windows = RECEIVED_WINDOWS.map((w) => {
    const inside = payments.filter((p) => p.paidAt && t - p.paidAt.getTime() <= w.hours * HOUR_MS && p.paidAt.getTime() <= t);
    return { key: w.key, minor: inside.reduce((s, p) => s + p.amountMinor, 0), count: inside.length };
  });
  const month = payments.filter((p) => p.paidAt && t - p.paidAt.getTime() <= RECEIVED_WINDOWS[2].hours * HOUR_MS && p.paidAt.getTime() <= t);
  const methods = new Map<string, { minor: number; count: number }>();
  for (const p of month) {
    const m = methods.get(p.method) ?? { minor: 0, count: 0 };
    methods.set(p.method, { minor: m.minor + p.amountMinor, count: m.count + 1 });
  }
  const couriers = new Map<string | null, { minor: number; parcels: number }>();
  for (const c of cod) {
    const k = couriers.get(c.courier) ?? { minor: 0, parcels: 0 };
    couriers.set(c.courier, { minor: k.minor + c.collectedMinor + c.chargeCollectedMinor, parcels: k.parcels + 1 });
  }
  const oldestCod = [...cod].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())[0];
  const waiting = refunds.filter((r) => (REFUND_WAITING as readonly string[]).includes(r.status));
  const failed = refunds.filter((r) => r.status === 'FAILED');
  const oldestRefund = [...waiting].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
  return {
    at: now.toISOString(),
    received: { windows, byMethod: sortDesc([...methods].map(([method, v]) => ({ method, ...v }))) },
    cod: {
      minor: cod.reduce((s, c) => s + c.collectedMinor + c.chargeCollectedMinor, 0),
      parcels: cod.length,
      oldestDays: daysSince(now, oldestCod?.occurredAt),
      byCourier: sortDesc([...couriers].map(([courier, v]) => ({ courier, ...v }))),
    },
    refunds: {
      waitingMinor: waiting.reduce((s, r) => s + r.amountMinor, 0),
      waiting: waiting.length,
      oldestDays: daysSince(now, oldestRefund?.createdAt),
      failedMinor: failed.reduce((s, r) => s + r.amountMinor, 0),
      failed: failed.length,
    },
  };
}

/** The overview of one store now, from the database. */
export async function moneyOverview(db: Db, storeId: number, now = new Date(), timeZone?: string): Promise<MoneyOverview> {
  const since = new Date(now.getTime() - RECEIVED_WINDOWS[2].hours * HOUR_MS);
  const [payments, cod, refunds] = await Promise.all([
    db.payment.findMany({
      where: { storeId, status: { in: [...RECEIVED_STATES] }, paidAt: { gte: since, lte: now } },
      select: { method: true, amountMinor: true, receivedMinor: true, paidAt: true },
    }),
    db.codCollection.findMany({
      where: { storeId, outcome: { in: [...COD_OWED_OUTCOMES] }, state: { in: [...COD_OWED_STATES] }, settlementLineId: null },
      select: { collectedMinor: true, chargeCollectedMinor: true, occurredAt: true, shipmentId: true },
    }),
    db.refund.findMany({
      where: { storeId, status: { in: [...REFUND_WAITING, 'FAILED'] } },
      select: { status: true, amountMinor: true, createdAt: true },
    }),
  ]);
  const owed = cod.filter((c) => c.collectedMinor + c.chargeCollectedMinor > 0);
  const shipmentIds = [...new Set(owed.map((c) => c.shipmentId).filter((v): v is string => Boolean(v)))];
  const shipments = shipmentIds.length
    ? await db.shipment.findMany({ where: { id: { in: shipmentIds } }, select: { id: true, courierAccount: { select: { name: true } } } })
    : [];
  const courierOf = new Map(shipments.map((s) => [s.id, s.courierAccount.name]));
  const paid = payments.map((p) => ({ method: p.method, amountMinor: p.receivedMinor ?? p.amountMinor, paidAt: p.paidAt }));
  const o = overviewOf(
    now,
    paid,
    owed.map((c) => ({ collectedMinor: c.collectedMinor, chargeCollectedMinor: c.chargeCollectedMinor, occurredAt: c.occurredAt, courier: c.shipmentId ? (courierOf.get(c.shipmentId) ?? null) : null })),
    refunds.map((r) => ({ status: r.status, amountMinor: r.amountMinor, createdAt: r.createdAt })),
  );
  // 30 calendar days ending today (shop time zone), each fully inside the fetched 30 × 24 hours.
  if (timeZone) o.received.daily = receivedByDay(now, paid, RECEIVED_WINDOWS[2].hours / 24, timeZone);
  return o;
}

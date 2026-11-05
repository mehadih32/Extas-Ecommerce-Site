// S13 · PR 266 (register "USD rate as a setting the owner types, applied consistently to every cost figure", owner's
// answer 17) — the one way a cost in another currency becomes the store's currency.
//
// - The rate is the owner's own: an ExchangeRate row (1 USD = N taka) he types on Money › Costs & fees (PR 345). It is
//   never fetched from anywhere. A new rate is a new row from that moment; the old ones stay.
// - A cost of a given day takes the rate in force on that day (the newest rate typed on or before it, store time). A day
//   before the first rate he ever typed takes that first rate, so no figure is left empty once one rate exists.
// - Today the ad spend (AdSpendDaily.spendStoreMinor, PR 265) is priced with it, at import and again when a new rate is
//   typed (that day onwards, plus every day still without a figure). The AI usage cost (AiUsage.costMinor, PR 309) is
//   to take the same `pricerFor` when its writer is built.
import { minorDigitsOf } from '@extas/adapters';
import { localClock } from '@extas/inventory';
import type { PrismaClient } from '@extas/db/client';

type Db = Pick<PrismaClient, 'exchangeRate' | 'adSpendDaily'>;
interface Resolver {
  value(key: 'store.currency' | 'store.timeZone', at: { storeId: number }): Promise<string>;
}

/** One day's cost in the store's currency, with the rate row used (null: the same currency, no rate needed). */
export type Pricer = (minor: number, currency: string, day: string) => { storeMinor: number; exchangeRateId: string | null } | null;

/** A minor amount in one currency as the other's minor amount at `rate` (1 from = rate to). */
export function convertMinor(minor: number, from: string, to: string, rate: number): number {
  return Math.round(minor * rate * 10 ** (minorDigitsOf(to) - minorDigitsOf(from)));
}

interface RateRow {
  id: string;
  base: string;
  rate: number;
  /** The store day it was typed on. */
  day: string;
}

/** The rate of `day` from a list oldest first: the newest typed on or before it, else the first one. */
export function rateOnDay<T extends { day: string }>(rows: readonly T[], day: string): T | null {
  let hit: T | null = null;
  for (const r of rows) if (r.day <= day) hit = r;
  return hit ?? rows[0] ?? null;
}

/** The store's pricer: its own currency as is, another one by the owner's rate of that day, else none (null). */
export async function pricerFor(db: Db, resolver: Resolver, storeId: number): Promise<Pricer> {
  const at = { storeId };
  const [store, tz] = await Promise.all([resolver.value('store.currency', at), resolver.value('store.timeZone', at)]);
  const raw = await db.exchangeRate.findMany({ where: { storeId, quoteCurrency: store }, orderBy: { effectiveFrom: 'asc' }, select: { id: true, baseCurrency: true, rate: true, effectiveFrom: true } });
  const rows: RateRow[] = raw.map((r) => ({ id: r.id, base: r.baseCurrency, rate: Number(r.rate.toString()), day: localClock(r.effectiveFrom, tz).day })).filter((r) => r.rate > 0);
  return (minor, currency, day) => {
    if (currency === store) return { storeMinor: minor, exchangeRateId: null };
    const r = rateOnDay(
      rows.filter((x) => x.base === currency),
      day,
    );
    return r ? { storeMinor: convertMinor(minor, currency, store, r.rate), exchangeRateId: r.id } : null;
  };
}

/**
 * After a new rate: the ad spend in another currency priced again from `fromDay` (the new rate's day) onwards, and
 * every day still without a figure. Days before keep the rate they were priced with. Answers how many days changed.
 */
export async function repriceAdSpend(db: Db & Pick<PrismaClient, '$transaction'>, resolver: Resolver, storeId: number, fromDay: string): Promise<number> {
  const store = await resolver.value('store.currency', { storeId });
  const price = await pricerFor(db, resolver, storeId);
  const rows = await db.adSpendDaily.findMany({
    where: { storeId, currency: { not: store }, OR: [{ spendStoreMinor: null }, { date: { gte: new Date(`${fromDay}T00:00:00Z`) } }] },
    select: { id: true, spendMinor: true, currency: true, date: true, spendStoreMinor: true, exchangeRateId: true },
  });
  let changed = 0;
  await db.$transaction(async (tx) => {
    for (const r of rows) {
      const p = price(r.spendMinor, r.currency, r.date.toISOString().slice(0, 10));
      if (!p || (p.storeMinor === r.spendStoreMinor && p.exchangeRateId === r.exchangeRateId)) continue;
      await tx.adSpendDaily.update({ where: { id: r.id }, data: { spendStoreMinor: p.storeMinor, exchangeRateId: p.exchangeRateId } });
      changed += 1;
    }
  });
  return changed;
}

/** The newest rate of a currency into the store's (for showing), or null. */
export async function currentRate(db: Pick<PrismaClient, 'exchangeRate'>, storeId: number, base: string, quote: string): Promise<{ rate: string; from: string } | null> {
  const r = await db.exchangeRate.findFirst({ where: { storeId, baseCurrency: base, quoteCurrency: quote }, orderBy: { effectiveFrom: 'desc' }, select: { rate: true, effectiveFrom: true } });
  return r ? { rate: r.rate.toString(), from: r.effectiveFrom.toISOString() } : null;
}

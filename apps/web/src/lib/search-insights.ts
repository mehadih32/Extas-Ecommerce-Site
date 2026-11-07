// PR 72 follow-up 100 — what shoppers search for (Reports › Searches, CN-019's analytics section). While the owner keeps
// it on (`search.insights`, off as shipped), each search on the results page adds one to its words' count for the day,
// and to the "found nothing" count when no product came back. Words only: never who searched, no visitor, customer or
// address, and a word that looks like a phone number, an order number or an e-mail is never kept. A search the
// catalogue could not answer (slow, down) is not counted. The report sums the days of a period: the most searched
// words, and the words that found nothing — what customers look for that the shop lacks. Nothing is ever deleted.
// The settings card's API is lib/search-insights-api.ts.
// Follow-up 101: `search.popular` (off) fills the empty-box popular words from these counts while the owner's own
// list is empty — the words searched most that found products (`popularFromSearches`).
import { cache } from 'react';
import { getPrisma, type PrismaClient } from '@extas/db/client';
import { settingsResolver, settingsTimeoutMs, withTimeout } from './settings';
import { todayIn } from './shop/theme';

/** The longest word kept (the same as a word of the search lists). */
export const TERM_MAX = 40;
const DIGITS_MAX = 4;

/** The words as they are counted (lower case, spaces folded, at most 40 characters), or null when they are not kept. */
export function termOf(q: string): string | null {
  const t = [...q.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()].slice(0, TERM_MAX).join('').trim();
  if ([...t].length < 2) return null;
  // a phone or order number, or an e-mail: never a customer's own details
  if (t.includes('@') || (t.match(/\p{Nd}/gu) ?? []).length > DIGITS_MAX) return null;
  return t;
}

type Db = Pick<PrismaClient, 'searchTerm'>;

/** Adds one search of these words to today's count (and to "found nothing" when `found` is false). */
export async function countSearch(db: Db, storeId: number, input: { q: string; found: boolean; day: string }): Promise<boolean> {
  const term = termOf(input.q);
  if (!term) return false;
  const day = new Date(`${input.day}T00:00:00Z`);
  const empty = input.found ? 0 : 1;
  const where = { storeId_day_term: { storeId, day, term } };
  try {
    await db.searchTerm.upsert({ where, create: { storeId, day, term, searches: 1, emptySearches: empty }, update: { searches: { increment: 1 }, emptySearches: { increment: empty } } });
  } catch {
    // two first searches of a word at once: the other one made the row
    await db.searchTerm.update({ where, data: { searches: { increment: 1 }, emptySearches: { increment: empty } } });
  }
  return true;
}

/** The results page's call: counts the search while the owner keeps them; never fails the page. */
export async function recordSearch(storeId: number, q: string, found: boolean): Promise<void> {
  const resolver = settingsResolver();
  if (!resolver || !q.trim()) return;
  try {
    await withTimeout(
      (async () => {
        const [set, tz] = await Promise.all([resolver.value('search.insights', { storeId }), resolver.value('store.timeZone', { storeId })]);
        if (!set.keep) return;
        await countSearch(getPrisma(), storeId, { q, found, day: todayIn(tz) });
      })(),
      settingsTimeoutMs(),
    );
  } catch {
    // a count is never worth a broken search page
  }
}

export interface SearchWord {
  term: string;
  searches: number;
  empty: number;
}

export interface SearchReport {
  from: string;
  to: string;
  searches: number;
  empty: number;
  words: number;
  /** The most searched words, most first. */
  top: SearchWord[];
  /** The words that found nothing at least once, most "nothing" first. */
  missing: SearchWord[];
}

const PERIODS = [7, 30, 90] as const;

/** The report's periods: 7, 30 and 90 days, never past the owner's longest, which is offered too. */
export function periodsOf(longest: number): number[] {
  return [...new Set([...PERIODS.filter((p) => p <= longest), longest])].sort((a, b) => a - b);
}

/** The first day of a period of `days` days that ends today (YYYY-MM-DD). */
export function fromDay(today: string, days: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d.toISOString().slice(0, 10);
}

/** The period's sums per word. */
export async function searchReport(db: Db, storeId: number, input: { today: string; days: number; rows: number }): Promise<SearchReport> {
  const from = fromDay(input.today, input.days);
  const where = { storeId, day: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${input.today}T00:00:00Z`) } };
  const [sums, top, missing] = await Promise.all([
    db.searchTerm.aggregate({ where, _sum: { searches: true, emptySearches: true } }),
    db.searchTerm.groupBy({ by: ['term'], where, _sum: { searches: true, emptySearches: true }, orderBy: [{ _sum: { searches: 'desc' } }, { term: 'asc' }], take: input.rows }),
    db.searchTerm.groupBy({ by: ['term'], where: { ...where, emptySearches: { gt: 0 } }, _sum: { searches: true, emptySearches: true }, orderBy: [{ _sum: { emptySearches: 'desc' } }, { term: 'asc' }], take: input.rows }),
  ]);
  const words = (await db.searchTerm.groupBy({ by: ['term'], where })).length;
  const row = (r: { term: string; _sum: { searches: number | null; emptySearches: number | null } }): SearchWord => ({ term: r.term, searches: r._sum.searches ?? 0, empty: r._sum.emptySearches ?? 0 });
  return { from, to: input.today, searches: sums._sum.searches ?? 0, empty: sums._sum.emptySearches ?? 0, words, top: top.map(row), missing: missing.map(row) };
}

/**
 * Follow-up 101 — the words searched most in the last `days` days that found products (searches less the ones that
 * found nothing), each at least `min` times, most first, at most `max`.
 */
export async function foundWords(db: Db, storeId: number, input: { today: string; days: number; min: number; max: number }): Promise<string[]> {
  const where = { storeId, day: { gte: new Date(`${fromDay(input.today, input.days)}T00:00:00Z`), lte: new Date(`${input.today}T00:00:00Z`) } };
  const rows = await db.searchTerm.groupBy({ by: ['term'], where, _sum: { searches: true, emptySearches: true } });
  return rows
    .map((r) => ({ term: r.term, found: (r._sum.searches ?? 0) - (r._sum.emptySearches ?? 0) }))
    .filter((r) => r.found >= input.min)
    .sort((a, b) => b.found - a.found || a.term.localeCompare(b.term))
    .slice(0, input.max)
    .map((r) => r.term);
}

/** The shop's popular words from real searches, or null while `search.insights`' popular switch is off (once per request). */
export const popularFromSearches = cache(async (storeId: number): Promise<string[] | null> => {
  const resolver = settingsResolver();
  if (!resolver) return null;
  try {
    return await withTimeout(
      (async () => {
        const [set, tz] = await Promise.all([resolver.value('search.popular', { storeId }), resolver.value('store.timeZone', { storeId })]);
        if (!set.on) return null;
        return foundWords(getPrisma(), storeId, { today: todayIn(tz), days: set.days, min: set.min, max: set.max });
      })(),
      settingsTimeoutMs(),
    );
  } catch {
    return null;
  }
});

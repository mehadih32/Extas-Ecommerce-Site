// S13 · PR 265 (Blueprint C6.2) — what an ad platform says it spent, per campaign and per day, in one platform-neutral
// shape (`AdsSpendFacts`), read by each reader's `spend(range)` (Meta's insights, TikTok's report, Google's GAQL
// metrics). The shop keeps these as AdSpendDaily rows (apps/web lib/marketing/ad-spend.ts); a practice copy's rows are
// shown, never saved. Read only: nothing here changes a budget or a campaign.
//
// Money: each platform states spend in the account currency's major unit (Meta and TikTok as a decimal, Google in
// micros); the shop keeps the currency's minor unit by its own digits (BDT 2, JPY 0).

/** One campaign's day as the platform reports it. */
export interface AdsSpendFacts {
  campaignExternalId: string;
  /** The day (`YYYY-MM-DD`) in the ad account's own time zone, as the platform reports it. */
  day: string;
  /** Spend in the account currency's minor unit (0 = nothing spent that day). */
  spendMinor: number;
  impressions: number;
  clicks: number;
  /** Purchases as the platform counts them (its own claim; the shop's delivered figure is separate). */
  purchases: number;
}

/** The days to read, both included (`YYYY-MM-DD`). */
export interface AdsSpendRange {
  from: string;
  to: string;
}

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The currency's minor digits (BDT 2, JPY 0); an unknown code keeps the common two. */
export function minorDigitsOf(currency: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2; // hardcode-ok: ISO 4217's usual minor digits, only for a code Intl does not know
  }
}

/** A spend in the major unit (a number or a decimal string) in the minor unit; zero stays 0, nonsense is null. */
export function spendMinorOf(v: unknown, currency: string): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d{1,13}(\.\d{1,9})?$/.test(v.trim()) ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 10 ** minorDigitsOf(currency));
}

/** A count (a number or a numeric string, decimals rounded: Google states conversions as a double); else 0. */
export function countOf(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d{1,15}(\.\d{1,9})?$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

/** Every day of a range, oldest first (an empty list for a range that is not one). */
export function daysOf(r: AdsSpendRange): string[] {
  if (!DAY_RE.test(r.from) || !DAY_RE.test(r.to) || r.from > r.to) return [];
  const out: string[] = [];
  for (let d = new Date(`${r.from}T00:00:00Z`); out.length < 4000; d = new Date(d.getTime() + 86_400_000)) {
    const s = d.toISOString().slice(0, 10);
    if (s > r.to) break;
    out.push(s);
  }
  return out;
}

// CN-028 · PR 617, 618 (CN-029 Phase 0) — the profit and loss ledger the shop sends the ERP (docs/RETAIL-ERP-MODEL.md
// §3.3): where every line of the daily summary comes from, which cost line a shop cost feeds, and the one rule for
// spreading a month's fixed costs over its days (the ERP's rule, exact to the paisa, the remainder on the last day).
import type { ErpDailySummary } from './contract-v6';

/** The cost lines a shop cost can feed (Prisma enum CostSummaryLine, same values in the same order). */
export const COST_SUMMARY_LINES = ['PACKAGING', 'ACCESSORIES', 'PAYMENT_FEES', 'DELIVERY', 'ADS_FACEBOOK', 'ADS_INSTAGRAM', 'ADS_GOOGLE', 'ADS_TIKTOK', 'ADS_OTHER', 'OTHER'] as const;
export type CostSummaryLine = (typeof COST_SUMMARY_LINES)[number];

/** Where each cost line sits in the daily summary body (`costs.*`). */
export const COST_LINE_PATH: Readonly<Record<CostSummaryLine, readonly [keyof ErpDailySummary['costs'], ...string[]]>> = {
  PACKAGING: ['packaging'],
  ACCESSORIES: ['accessories'],
  PAYMENT_FEES: ['paymentFees'],
  DELIVERY: ['delivery'],
  ADS_FACEBOOK: ['ads', 'facebook'],
  ADS_INSTAGRAM: ['ads', 'instagram'],
  ADS_GOOGLE: ['ads', 'google'],
  ADS_TIKTOK: ['ads', 'tiktok'],
  ADS_OTHER: ['ads', 'other'],
  OTHER: ['other'],
};

/** The day a summary line counts on (§3.3). */
export type SummaryDayBasis = 'placed' | 'delivered' | 'result' | 'deliveredOrExchange' | 'decision' | 'cost' | 'month';

/** Every line of the summary with its one source in the shop, for the builder (PR 617) and the explain view (PR 616). */
export const SUMMARY_LINE_SOURCES: readonly { line: string; source: string; day: SummaryDayBasis }[] = [
  { line: 'orders', source: 'orders placed (exchange orders are not orders)', day: 'placed' },
  { line: 'sales.gross', source: 'delivered pieces at the customer price', day: 'delivered' },
  { line: 'sales.discounts', source: 'discounts on delivered pieces', day: 'delivered' },
  { line: 'sales.net', source: 'delivered pieces at the customer price after discounts', day: 'delivered' },
  { line: 'income.deliveryCharges', source: 'delivery charges customers paid on delivered orders', day: 'delivered' },
  { line: 'deliveries', source: 'courier results', day: 'result' },
  { line: 'costs.goods', source: 'buying price of the pieces delivered, plus exchange extras, minus exchange adjustments', day: 'deliveredOrExchange' },
  { line: 'costs.returnLosses', source: 'declined pieces + exchange.billed − exchange.credited, at the price paid to the ERP', day: 'decision' },
  { line: 'costs.packaging', source: 'cost entries (summaryLine PACKAGING)', day: 'cost' },
  { line: 'costs.accessories', source: 'cost entries (summaryLine ACCESSORIES)', day: 'cost' },
  { line: 'costs.paymentFees', source: 'gateway and COD statements (summaryLine PAYMENT_FEES)', day: 'cost' },
  { line: 'costs.delivery', source: 'courier statements (summaryLine DELIVERY)', day: 'cost' },
  { line: 'costs.ads', source: 'ad accounts (summaryLine ADS_*)', day: 'cost' },
  { line: 'costs.other', source: 'manual cost entries (summaryLine OTHER); never fixed costs', day: 'cost' },
  { line: 'fixedCosts', source: 'PUT /fixed-costs/{month}, spread by the days of the month', day: 'month' },
];

/** Why a version of a day's summary was built (ErpDailySummary.reason). */
export const SUMMARY_BUILD_REASONS = ['NIGHTLY', 'LATE_FACT', 'MISSING', 'BACKFILL'] as const;
export type SummaryBuildReason = (typeof SUMMARY_BUILD_REASONS)[number];

/** What was sent to the ERP and logged (Prisma enum ErpBooksSendKind). */
export const ERP_BOOKS_SEND_KINDS = ['DAILY_SUMMARY', 'FIXED_COSTS'] as const;
export type ErpBooksSendKind = (typeof ERP_BOOKS_SEND_KINDS)[number];

/** How fixed costs are spread over the month (setting `erp.fixedCosts.spread`): the ERP's rule, by the days of the month. */
export const ERP_FIXED_COST_SPREADS = ['daysOfMonth'] as const;
export type ErpFixedCostSpread = (typeof ERP_FIXED_COST_SPREADS)[number];

/** Days in a month (`month` 1–12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * A month's fixed cost spread by the days of the month (§3.3, PR 618): every day the same whole number of minor units,
 * the remainder on the last day, so the days add up to the month exactly.
 */
export function spreadByDays(totalMinor: number, year: number, month: number): number[] {
  if (!Number.isSafeInteger(totalMinor) || totalMinor < 0) throw new RangeError('a fixed cost is a whole, non-negative number of minor units');
  const days = daysInMonth(year, month);
  const each = Math.floor(totalMinor / days);
  const out = Array.from({ length: days }, () => each);
  out[days - 1] = totalMinor - each * (days - 1);
  return out;
}

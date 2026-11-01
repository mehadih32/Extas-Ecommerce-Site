// S16 · PR 537 (B3.10 V2, the 18 Oct round) — the VAT report on Money → VAT (`/admin/money/vat?from=&to=`) and its CSV,
// and the "VAT inside Sales" line of Money → Profit & loss. The figure is @extas/metrics `vatReport` (delivered orders of
// the period, the VAT already inside what the customer paid, by the owner's rates of `vat.rates`); the period rules are
// those of Costs and Profit & loss (`costs.report`, lib/cost-report.ts). Only while the VAT system is on
// (`vat.system.enabled`): off, there is no report and no line. Read-only; nothing here changes a price or moves money.
//   GET /api/admin/money/vat/report?from=YYYY-MM-DD&to=YYYY-MM-DD   the period as a CSV file (`books.read`)
import { type PrismaClient } from '@extas/db/client';
import { vatReport, type VatReport } from '@extas/metrics';
import type { AppResolver } from './settings';

export type { VatReport } from '@extas/metrics';

/** The VAT report of one store over `from`–`to`, or null while the VAT system is off. */
export async function vatReportFor(deps: { db: PrismaClient; resolver: AppResolver }, storeId: number, from: string, to: string): Promise<VatReport | null> {
  const at = { storeId };
  const [system, rates, timeZone] = await Promise.all([deps.resolver.value('vat.system', at), deps.resolver.value('vat.rates', at), deps.resolver.value('store.timeZone', at)]);
  if (!system.enabled) return null;
  return vatReport(deps.db, storeId, { from, to }, { timeZone, rates, onDelivery: system.onDelivery });
}

const cell = (v: string | number | null) => {
  if (v === null) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** The report as CSV: the totals, then by rate, by category and day by day (amounts in minor units; empty = not known,
 * a rate in basis points; an empty rate = no rate). `categoryName` gives each category's name for the file. */
export function vatCsv(r: VatReport, currency: string, categoryName: (id: string | null) => string): string {
  const lines: (string | number | null)[][] = [
    ['line', 'amountMinor', 'currency'],
    ['sales.delivered', r.salesMinor, currency],
    ['vat.goods', r.goodsVatMinor, currency],
    ['goods.noRate', r.unratedMinor, currency],
    ['deliveryCharges', r.deliveryMinor, currency],
    ['vat.delivery', r.deliveryVatMinor, currency],
    ['vat.total', r.totalVatMinor, currency],
    ['orders', r.orders, ''],
    [],
    ['rateBps', 'lines', 'netMinor', 'vatMinor'],
    ...r.byRate.map((x) => [x.bps, x.lines, x.netMinor, x.vatMinor]),
    [],
    ['category', 'lines', 'netMinor', 'vatMinor', 'noRateMinor'],
    ...r.byCategory.map((x) => [categoryName(x.categoryId), x.lines, x.netMinor, x.vatMinor, x.unratedMinor]),
    [],
    ['day', 'orders', 'salesMinor', 'vatMinor'],
    ...[...r.byDay].reverse().map((d) => [d.day, d.orders, d.salesMinor, d.vatMinor]),
  ];
  return lines.map((l) => l.map(cell).join(',')).join('\r\n') + '\r\n';
}

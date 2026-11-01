// S16 · PR 349 (B3.10; BACKEND-ARCHITECTURE §5 MNY-01), moved here by PR 351 so the admin's Profit & loss page and the
// worker's money report read one and the same figure: a period's profit and loss from @extas/metrics `profitAndLoss`
// (the per-order profit, so the order page and the report agree), with the owner's figures (`costs.gatewayFees`,
// `costs.packaging`) and the fixed costs of PR 618 (salary, rent, utilities, other): each month's latest version spread
// over its days by the ERP's rule (`fixedCostDays`), the days inside the period added. Read-only; nothing here pays,
// charges or changes a price.
import type { PrismaClient } from '@extas/db/client';
import { profitAndLoss, type Pnl } from '@extas/metrics';
import { gatewayFeeMinor } from '@extas/settings';
import { fixedCostDays } from './books-rules';
import type { SettingsReader } from './context';

export interface ProfitReport extends Pnl {
  /** The fixed costs on the period's days, or null when none were entered for any of its months. */
  fixedMinor: number | null;
  /** Contribution − ad spend − other costs − fixed costs; null while the ad spend is not known. */
  netProfitMinor: number | null;
}

/** Fixed costs (PR 618) on the days `from`–`to`: each month's latest version spread by its days. */
export async function fixedCostsIn(db: Pick<PrismaClient, 'erpFixedCostMonth'>, storeId: number, from: string, to: string): Promise<number | null> {
  const rows = await db.erpFixedCostMonth.findMany({
    where: { storeId, month: { gte: new Date(`${from.slice(0, 7)}-01T00:00:00Z`), lte: new Date(`${to.slice(0, 7)}-01T00:00:00Z`) } },
    orderBy: [{ month: 'asc' }, { version: 'desc' }],
    select: { month: true, version: true, salaryMinor: true, rentMinor: true, utilitiesMinor: true, otherMinor: true },
  });
  if (!rows.length) return null;
  const seen = new Set<string>();
  let total = 0;
  for (const r of rows) {
    const month = r.month.toISOString().slice(0, 7);
    if (seen.has(month)) continue;
    seen.add(month);
    const days = fixedCostDays(month, { salary: Number(r.salaryMinor), rent: Number(r.rentMinor), utilities: Number(r.utilitiesMinor), other: Number(r.otherMinor) });
    for (const d of days) if (d.day >= from && d.day <= to) total += d.minor;
  }
  return total;
}

/** The profit and loss of one store over `from`–`to` (the store's own days), fixed costs and net profit included. */
export async function profitReport(deps: { db: PrismaClient; settings: SettingsReader }, storeId: number, from: string, to: string): Promise<ProfitReport> {
  const at = { storeId };
  const [currency, timeZone, fees, packaging, courierEstimate] = await Promise.all([
    deps.settings.value('store.currency', at),
    deps.settings.value('store.timeZone', at),
    deps.settings.value('costs.gatewayFees', at),
    deps.settings.value('costs.packaging', at),
    deps.settings.value('costs.courierEstimate', at), // PR 354
  ]);
  const [p, fixedMinor] = await Promise.all([
    profitAndLoss(deps.db, storeId, { from, to }, { currency, timeZone, packagingMinor: packaging?.perOrderMinor ?? null, gatewayFee: (amount, provider) => gatewayFeeMinor(amount, provider, fees), courierEstimate }),
    fixedCostsIn(deps.db, storeId, from, to),
  ]);
  return { ...p, fixedMinor, netProfitMinor: p.adsMinor === null ? null : p.contributionMinor - p.adsMinor - p.otherCostsMinor - (fixedMinor ?? 0) };
}

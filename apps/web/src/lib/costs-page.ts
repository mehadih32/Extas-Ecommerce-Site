// PR 1040 (S28, final round D14) — everything the one-page "Costs & budgets" shows, read from what is really there:
//   1 · Fixed costs & salaries: the list in `books.staffCosts` (amounts from a month on) with the advance, bonus and deduction
//       rows (StaffPayRow), the last six months, the history of every change (FixedCostChange) and the share per delivered order;
//   2 · Budgets & other expenses: this month's budgets against what is spent (budgetsView), the expenses with or without a
//       receipt (RetailExpense) and the ad spend by platform for this month and the one before (AdSpendDaily).
// Read-only; nothing here moves money.
import * as inv from '@extas/inventory';
import { staffTotalsFor, withPayRows, type StaffCostPerson } from '@extas/settings';
import type { AdminDeps } from './admin-auth';
import { expensesView, type ExpensesView } from './expenses-api';
import { payRows, costChanges, type CostChangeView, type PayRowView } from './staff-pay';

export interface TrendMonth {
  month: string;
  salaryMinor: number;
  otherMinor: number;
}
export interface AdSpendRow {
  platform: string;
  thisMinor: number;
  lastMinor: number;
  /** In the platform's own money (dollars): the ad accounts' native spend, this month. */
  thisNative: { currency: string; minor: number }[];
  lastNative: { currency: string; minor: number }[];
  shareOfSalesBp: number | null;
}
export interface CostsOverview {
  month: string;
  lastMonth: string;
  day: number;
  days: number;
  today: string;
  /** The six months ending with this one, oldest first. */
  trend: TrendMonth[];
  totalMinor: number;
  prevTotalMinor: number;
  deliveredSoFar: number;
  perOrderMinor: number | null;
  deliveriesAtPace: number;
  rows: PayRowView[];
  changes: CostChangeView[];
  budgets: inv.BudgetsView;
  expenses: { thisMonth: ExpensesView; lastMonth: ExpensesView; withoutReceipt: number };
  ads: { rows: AdSpendRow[]; salesMinor: number; rate: { rate: string; from: string } | null };
}

const addMonth = (ym: string, n: number): string => {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** A month's cost of the list (the amount plus bonus less deduction, per person), rows applied. */
export function monthTotals(people: readonly StaffCostPerson[], month: string): { salaryMinor: number; otherMinor: number } {
  const t = staffTotalsFor(people, month);
  return { salaryMinor: t.salary, otherMinor: t.rent + t.utilities + t.other };
}

export async function costsOverview(admin: AdminDeps, deps: inv.InventoryDeps, who: inv.Who, people: readonly StaffCostPerson[], currency: string): Promise<CostsOverview> {
  const budgets = await inv.budgetsView(deps, who);
  const month = budgets.month;
  const lastMonth = addMonth(month, -1);
  const months = Array.from({ length: 6 }, (_, i) => addMonth(month, i - 5));
  const todayDay = `${month}-${String(budgets.day).padStart(2, '0')}`;
  const [rows, changes, expThis, expLast, profit, adRows, rate] = await Promise.all([
    payRows(admin.db, who.storeId, months),
    costChanges(admin, who.storeId, undefined, 60), // hardcode-ok: the latest changes
    expensesView(admin.db, who.storeId, month),
    expensesView(admin.db, who.storeId, lastMonth),
    inv.profitReport(deps, who.storeId, `${month}-01`, todayDay),
    admin.db.adSpendDaily.findMany({
      where: { storeId: who.storeId, date: { gte: new Date(`${lastMonth}-01T00:00:00Z`), lt: new Date(`${addMonth(month, 1)}-01T00:00:00Z`) } },
      select: { platform: true, date: true, spendMinor: true, currency: true, spendStoreMinor: true },
    }),
    admin.db.exchangeRate.findFirst({ where: { storeId: who.storeId, baseCurrency: 'USD', quoteCurrency: currency }, orderBy: { effectiveFrom: 'desc' }, select: { rate: true, effectiveFrom: true } }), // hardcode-ok: the dollar rate row
  ]);
  const withRows = withPayRows(people, rows);
  // the fixed heads count what the list says for this month (what the page above shows), once the list has people in it
  if (people.length) {
    const t = staffTotalsFor(withRows, month);
    const fixed: Record<string, number> = { SALARY: t.salary, RENT: t.rent, UTILITIES: t.utilities, OTHER_FIXED: t.other };
    budgets.lines = budgets.lines.map((l) => (l.headKey in fixed ? inv.budgetLine(l.headKey, l.budgetMinor, fixed[l.headKey]!, { day: budgets.day, days: budgets.days, fixed: true, warnAtPct: budgets.warnAtPct }) : l));
  }
  const trend: TrendMonth[] = months.map((m) => ({ month: m, ...monthTotals(withRows, m) }));
  const totalMinor = trend[5]!.salaryMinor + trend[5]!.otherMinor;
  const prevTotalMinor = trend[4]!.salaryMinor + trend[4]!.otherMinor;
  const deliveriesAtPace = Math.max(1, Math.round((profit.orders / Math.max(1, budgets.day)) * budgets.days));
  const byPlat = new Map<string, AdSpendRow>();
  for (const r of adRows) {
    const here = r.date.toISOString().slice(0, 7) === month;
    const x = byPlat.get(r.platform) ?? { platform: r.platform, thisMinor: 0, lastMinor: 0, thisNative: [], lastNative: [], shareOfSalesBp: null };
    const store = r.spendStoreMinor ?? (r.currency === currency ? r.spendMinor : 0);
    if (here) x.thisMinor += store;
    else x.lastMinor += store;
    const list = here ? x.thisNative : x.lastNative;
    const slot = list.find((n) => n.currency === r.currency);
    if (slot) slot.minor += r.spendMinor;
    else list.push({ currency: r.currency, minor: r.spendMinor });
    byPlat.set(r.platform, x);
  }
  const ads = [...byPlat.values()]
    .map((x) => ({ ...x, shareOfSalesBp: profit.salesMinor > 0 ? Math.round((x.thisMinor / profit.salesMinor) * 10_000) : null })) // hardcode-ok: basis points
    .sort((a, b) => b.thisMinor - a.thisMinor);
  return {
    month,
    lastMonth,
    day: budgets.day,
    days: budgets.days,
    today: todayDay,
    trend,
    totalMinor,
    prevTotalMinor,
    deliveredSoFar: profit.orders,
    perOrderMinor: totalMinor > 0 && profit.orders > 0 ? Math.round(totalMinor / deliveriesAtPace) : null,
    deliveriesAtPace,
    rows: rows,
    changes,
    budgets,
    expenses: { thisMonth: expThis, lastMonth: expLast, withoutReceipt: [...expThis.rows, ...expLast.rows].filter((r) => !r.reversal && !r.reversed && !r.receiptId).length },
    ads: { rows: ads, salesMinor: profit.salesMinor, rate: rate ? { rate: rate.rate.toString(), from: rate.effectiveFrom.toISOString() } : null },
  };
}

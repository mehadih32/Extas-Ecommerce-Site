// S28 · PR 688 (admin prototype v5, Finance › Costs & budgets) — monthly budgets per cost head, spent against them with an
// "at this pace" warning, and the profit snapshot (today, this week, this month) the Finance page and Home both show.
//   - A budget is a number the owner sets for a head (salary, rent, utilities, other fixed, or one of the cost lines) from a
//     month on. It is append-only: a change is a new row, the latest one up to the month counts; nothing is edited or deleted.
//     Setting budgets needs `fixedcosts.write` and the owner's PIN. Nothing here moves money.
//   - Spent: the fixed heads count the month's entered amount; a cost line counts its entries (reversals included) on the
//     month's days. "At this pace" = spent so far spread over the whole month; a head is flagged when that reaches
//     `books.budget.warnAtPct` of its budget.
//   - The profit snapshot is `profitReport` (the one profit and loss) over three spans, so Finance and Home never disagree.
import { z } from 'zod';
import { COST_SUMMARY_LINES, minorOf } from '@extas/erp-types';
import { BooksError } from './books-errors';
import { checkBooksPin, needPin } from './books-close';
import { profitReport } from './books-profit';
import { addDays } from './books-rules';
import { logChange, nowOf, parse, setting, type InventoryDeps, type Who } from './context';
import { allowBooks } from './erp-account';
import { storeDate } from './erp-events-pull';

export const FIXED_BUDGET_HEADS = ['SALARY', 'RENT', 'UTILITIES', 'OTHER_FIXED'] as const;
export const BUDGET_HEADS: readonly string[] = [...FIXED_BUDGET_HEADS, ...COST_SUMMARY_LINES];
const AMOUNT_MAX = 2_000_000_000;

const monthText = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'a month, YYYY-MM' });
const setInput = z
  .object({
    fromMonth: monthText,
    budgets: z.record(z.string(), z.int().min(0).max(AMOUNT_MAX)),
    pin: z.string().max(64),
  })
  .strict();
export type SetBudgetsInput = z.input<typeof setInput>;

// ---- pure ---------------------------------------------------------------------------------------------------------------

export type BudgetState = 'none' | 'ok' | 'pace' | 'over';

export interface BudgetLine {
  headKey: string;
  budgetMinor: number | null;
  spentMinor: number;
  /** Spent so far spread over the whole month (a fixed head: what is entered). */
  paceMinor: number;
  state: BudgetState;
}

/** Days in a YYYY-MM month. */
export const daysInMonth = (month: string): number => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/** Where one head stands: over the budget now, on course to pass `warnAtPct` of it at this pace, fine, or no budget. */
export function budgetLine(headKey: string, budgetMinor: number | null, spentMinor: number, o: { day: number; days: number; fixed: boolean; warnAtPct: number }): BudgetLine {
  const day = Math.max(1, Math.min(o.day, o.days));
  const paceMinor = o.fixed ? spentMinor : Math.round((spentMinor * o.days) / day);
  let state: BudgetState = 'none';
  if (budgetMinor !== null && budgetMinor > 0) state = spentMinor > budgetMinor ? 'over' : paceMinor * 100 >= budgetMinor * o.warnAtPct ? 'pace' : 'ok';
  return { headKey, budgetMinor, spentMinor, paceMinor, state };
}

// ---- budgets ------------------------------------------------------------------------------------------------------------

/** The latest budget of each head that counts in `month` (a row from a later month does not). */
async function budgetsFor(deps: InventoryDeps, storeId: number, month: string): Promise<Map<string, number>> {
  const rows = await deps.db.costBudget.findMany({
    where: { storeId, fromMonth: { lte: month } },
    orderBy: [{ fromMonth: 'asc' }, { createdAt: 'asc' }],
    select: { headKey: true, amountMinor: true },
  });
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.headKey, r.amountMinor);
  return out;
}

export interface BudgetsView {
  month: string;
  day: number;
  days: number;
  warnAtPct: number;
  lines: BudgetLine[];
}

/** This month's budgets against what is spent (`books.read`). */
export async function budgetsView(deps: InventoryDeps, who: Who): Promise<BudgetsView> {
  await allowBooks(deps, who, 'books.read');
  const [timeZone, cfg] = await Promise.all([setting(deps, who.storeId, 'store.timeZone'), setting(deps, who.storeId, 'books.budget')]);
  const todayDay = storeDate(nowOf(deps), timeZone);
  const month = todayDay.slice(0, 7);
  const days = daysInMonth(month);
  const day = Number(todayDay.slice(8, 10));
  const from = `${month}-01`;
  const to = `${month}-${String(days).padStart(2, '0')}`;
  const [budgets, fixedRow, spentRows] = await Promise.all([
    budgetsFor(deps, who.storeId, month),
    deps.db.erpFixedCostMonth.findFirst({
      where: { storeId: who.storeId, month: new Date(`${from}T00:00:00Z`) },
      orderBy: { version: 'desc' },
      select: { salaryMinor: true, rentMinor: true, utilitiesMinor: true, otherMinor: true },
    }),
    deps.db.$queryRaw<{ line: string; minor: bigint }[]>`
      SELECT e."summaryLine" AS "line", COALESCE(SUM(e."amountMinor"), 0) AS "minor"
      FROM "CostEntry" e
      WHERE e."storeId" = ${who.storeId} AND e."summaryLine" IS NOT NULL
        AND COALESCE(e."costDate", (e."occurredAt" AT TIME ZONE ${timeZone})::date) BETWEEN ${from}::date AND ${to}::date
      GROUP BY e."summaryLine"`,
  ]);
  const spent = new Map<string, number>(spentRows.map((r) => [r.line, minorOf(Number(r.minor))]));
  const fixed: Record<string, number> = fixedRow
    ? { SALARY: Number(fixedRow.salaryMinor), RENT: Number(fixedRow.rentMinor), UTILITIES: Number(fixedRow.utilitiesMinor), OTHER_FIXED: Number(fixedRow.otherMinor) }
    : {};
  const lines = BUDGET_HEADS.map((h) => {
    const isFixed = (FIXED_BUDGET_HEADS as readonly string[]).includes(h);
    return budgetLine(h, budgets.get(h) ?? null, isFixed ? (fixed[h] ?? 0) : (spent.get(h) ?? 0), { day, days, fixed: isFixed, warnAtPct: cfg.warnAtPct });
  });
  return { month, day, days, warnAtPct: cfg.warnAtPct, lines };
}

/** Sets budgets from a month on: one new row for each head whose number changed. Needs `fixedcosts.write` and the owner's PIN. */
export async function setBudgets(deps: InventoryDeps, who: Who, input: SetBudgetsInput): Promise<{ changed: string[] }> {
  await allowBooks(deps, who, 'fixedcosts.write');
  needPin(input?.pin);
  const d = parse(setInput, input, 'budgets');
  const bad = Object.keys(d.budgets).filter((k) => !BUDGET_HEADS.includes(k));
  if (bad.length) throw new BooksError('INVALID_INPUT', 'not a cost head', bad);
  const timeZone = await setting(deps, who.storeId, 'store.timeZone');
  if (d.fromMonth < addDays(storeDate(nowOf(deps), timeZone), -62).slice(0, 7)) throw new BooksError('INVALID_INPUT', 'a month too far back', ['fromMonth']);
  await checkBooksPin(deps, who, d.pin, 'books.budgets');
  const now = await budgetsFor(deps, who.storeId, d.fromMonth);
  const changed = Object.entries(d.budgets).filter(([k, v]) => (now.get(k) ?? null) !== v);
  for (const [headKey, amountMinor] of changed) {
    const row = await deps.db.costBudget.create({ data: { storeId: who.storeId, headKey, fromMonth: d.fromMonth, amountMinor, createdById: who.actor.staffUserId ?? null } });
    await logChange(deps.db, who, {
      action: 'books.budget.set',
      entityType: 'CostBudget',
      entityId: row.id,
      before: now.get(headKey) ?? null,
      after: { headKey, fromMonth: d.fromMonth, amountMinor },
      storeId: who.storeId,
    });
  }
  return { changed: changed.map(([k]) => k) };
}

// ---- profit snapshot ----------------------------------------------------------------------------------------------------

export interface SnapshotSpan {
  key: 'today' | 'week' | 'month';
  from: string;
  to: string;
  salesMinor: number;
  /** Null while the ad spend is not known. */
  netProfitMinor: number | null;
  fixedMinor: number | null;
}

export interface ProfitSnapshot {
  spans: SnapshotSpan[];
  /** The monthly target (`admin.today.goal`) when it is on and set, with this month's sales against it. */
  target: { amountMinor: number; salesMinor: number } | null;
}

/** Profit today, over the last 7 days and this month, from the one profit and loss (`books.read`). */
export async function profitSnapshot(deps: InventoryDeps, who: Who): Promise<ProfitSnapshot> {
  await allowBooks(deps, who, 'books.read');
  const timeZone = await setting(deps, who.storeId, 'store.timeZone');
  const todayDay = storeDate(nowOf(deps), timeZone);
  const defs = [
    { key: 'today' as const, from: todayDay },
    { key: 'week' as const, from: addDays(todayDay, -6) },
    { key: 'month' as const, from: `${todayDay.slice(0, 7)}-01` },
  ];
  const reports = await Promise.all(defs.map((s) => profitReport(deps, who.storeId, s.from, todayDay)));
  const spans = defs.map((s, i) => ({ key: s.key, from: s.from, to: todayDay, salesMinor: reports[i]!.salesMinor, netProfitMinor: reports[i]!.netProfitMinor, fixedMinor: reports[i]!.fixedMinor }));
  const goal = (await setting(deps, who.storeId, 'admin.today')).goal;
  return { spans, target: goal.on && goal.amountMinor > 0 ? { amountMinor: goal.amountMinor, salesMinor: spans[2]!.salesMinor } : null };
}

// ---- who approves refunds -----------------------------------------------------------------------------------------------

/** The roles that hold `payments.refunds.approve` (one approver is enough: the owner's decision of 13 Nov). Read only. */
export async function refundApprovers(deps: InventoryDeps, who: Who): Promise<{ roles: { key: string; nameEn: string; nameBn: string }[] }> {
  await allowBooks(deps, who, 'books.read');
  const rows = await deps.db.role.findMany({
    where: { archivedAt: null, permissions: { some: { permission: { key: 'payments.refunds.approve' } } } },
    orderBy: { key: 'asc' },
    select: { key: true, nameEn: true, nameBn: true },
  });
  return { roles: rows };
}

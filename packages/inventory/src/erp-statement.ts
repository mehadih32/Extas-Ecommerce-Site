// PR 1041 (S28, final round D14; prototype Finance › ERP account "Monthly statement") — one month of the shop's ERP account
// worked out from the entries already in the ledger (ErpAccountEntry, append-only; no new table): the balance owed at the start,
// the bills (pieces shipped, exchange bills), the credits (approved returns, exchange credits), the payments, anything else
// (a reversal, an adjustment, the switch transfer, with their own sign), the balance owed at the end, how old that balance is,
// and the day-by-day summary. Read-only (`erp.account.read`); nothing here sends, pays or changes an entry.
//
//   - Bills, credits and payments are the ledger's own entry kinds (ENTRY_SIGN): closing = opening + bills - credits - paid + other.
//   - How old the balance is: payments and credits settle the OLDEST bills first (first in, first out), what is left of each bill is
//     aged from its day to the day the statement is read as of (the month's last day, or today for the month that is running).
//     A balance below nothing (the shop paid more than it owes) is shown as "paid ahead", never as age.
import { minorOf, type ErpAccountEntryKind } from '@extas/erp-types';
import { z } from 'zod';
import { nowOf, type InventoryDeps, type Who } from './context';
import { BooksError } from './books-errors';
import { allowBooks, balanceOn, booksLinkFor, dateOfDay, dayText, storeBooks } from './erp-account';
import { storeDate } from './erp-events-pull';
import { isV6 } from './erp-model';

export type StatementGroup = 'bills' | 'credits' | 'paid' | 'other';

/** Which group of the statement an entry kind belongs to. */
export const STATEMENT_GROUP: Readonly<Record<ErpAccountEntryKind, StatementGroup>> = {
  BILL: 'bills',
  EXCHANGE_EXTRA: 'bills',
  EXCHANGE_BILL: 'bills',
  RETURN_CREDIT: 'credits',
  EXCHANGE_CREDIT: 'credits',
  EXCHANGE_ADJUSTMENT: 'credits',
  PAYMENT: 'paid',
  SWITCH_TRANSFER: 'other',
  REVERSAL: 'other',
  ADJUSTMENT: 'other',
};

/** The age bands of the balance, in days (upper bounds; the last band is everything older). */
export const AGE_BANDS = [7, 15, 30] as const;

export interface StatementEntry {
  kind: ErpAccountEntryKind;
  /** YYYY-MM-DD, the entry's business day. */
  day: string;
  /** Signed, as in the ledger (+ owes more, - owes less). */
  amountMinor: number;
}

export interface StatementDay {
  day: string;
  billsMinor: number;
  creditsMinor: number;
  paidMinor: number;
  otherMinor: number;
  /** The balance owed at the end of the day. */
  balanceMinor: number;
}

export interface StatementView {
  month: string;
  from: string;
  to: string;
  /** The day the age of the balance is counted to. */
  asOf: string;
  openingMinor: number;
  billsMinor: number;
  creditsMinor: number;
  paidMinor: number;
  otherMinor: number;
  closingMinor: number;
  counts: { bills: number; credits: number; paid: number; other: number };
  /** What is still owed, by age (days since the bill): 0-7, 8-15, 16-30, over 30. */
  age: { band: 'd7' | 'd15' | 'd30' | 'older'; minor: number }[];
  /** More paid than billed so far: the amount paid ahead (the balance is below nothing). */
  paidAheadMinor: number;
  oldestOpenDay: string | null;
  days: StatementDay[];
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
export const statementInput = z.object({ month: z.string().regex(MONTH, { message: 'a month, YYYY-MM' }) }).strict();

const lastDayOf = (month: string): string => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return dayText(new Date(Date.UTC(y, m, 0)));
};
const daysBetween = (a: string, b: string): number => Math.round((dateOfDay(b).getTime() - dateOfDay(a).getTime()) / 86_400_000);

/**
 * The statement of `month` from the ledger's entries up to the month's end. `opening` is the shop's opening balance (the books
 * before the first entry) and the day it counts from; `today` limits a running month. Pure.
 */
export function buildStatement(entries: readonly StatementEntry[], opening: { minor: number; day: string | null }, month: string, today: string): StatementView {
  const from = `${month}-01`;
  const monthEnd = lastDayOf(month);
  const to = today < monthEnd ? today : monthEnd;
  const live = entries.filter((e) => e.day <= to).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  const openingNow = opening.day !== null && opening.day <= to ? opening : { minor: 0, day: null };
  const open = (openingNow.day !== null && openingNow.day < from ? openingNow.minor : 0) + live.filter((e) => e.day < from).reduce((n, e) => n + e.amountMinor, 0);
  const inMonth = live.filter((e) => e.day >= from);
  const sum = (g: StatementGroup) => inMonth.filter((e) => STATEMENT_GROUP[e.kind] === g).reduce((n, e) => n + e.amountMinor, 0);
  const count = (g: StatementGroup) => inMonth.filter((e) => STATEMENT_GROUP[e.kind] === g).length;
  const billsMinor = sum('bills');
  const creditsMinor = -sum('credits');
  const paidMinor = -sum('paid');
  const otherMinor = sum('other') + (openingNow.day !== null && openingNow.day >= from ? openingNow.minor : 0);
  const closingMinor = open + billsMinor - creditsMinor - paidMinor + otherMinor;
  // the days that had anything, with the balance at the end of each
  const byDay = new Map<string, StatementDay>();
  let run = open;
  const dayRow = (d: string): StatementDay => {
    let r = byDay.get(d);
    if (!r) byDay.set(d, (r = { day: d, billsMinor: 0, creditsMinor: 0, paidMinor: 0, otherMinor: 0, balanceMinor: 0 }));
    return r;
  };
  if (openingNow.day !== null && openingNow.day >= from) dayRow(openingNow.day).otherMinor += openingNow.minor;
  for (const e of inMonth) {
    const r = dayRow(e.day);
    const g = STATEMENT_GROUP[e.kind];
    if (g === 'bills') r.billsMinor += e.amountMinor;
    else if (g === 'credits') r.creditsMinor -= e.amountMinor;
    else if (g === 'paid') r.paidMinor -= e.amountMinor;
    else r.otherMinor += e.amountMinor;
  }
  const days = [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
  for (const r of days) {
    run += r.billsMinor - r.creditsMinor - r.paidMinor + r.otherMinor;
    r.balanceMinor = run;
  }
  // the age of what is owed: first in, first out
  const queue: { day: string; minor: number }[] = [];
  const items: { day: string; minor: number }[] = [];
  if (openingNow.day !== null) items.push({ day: openingNow.day, minor: openingNow.minor });
  for (const e of live) items.push({ day: e.day, minor: e.amountMinor });
  items.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  let ahead = 0;
  for (const it of items) {
    if (it.minor > 0) {
      // new money owed: first it clears what was paid ahead
      const use = Math.min(ahead, it.minor);
      ahead -= use;
      if (it.minor - use > 0) queue.push({ day: it.day, minor: it.minor - use });
    } else {
      let left = -it.minor;
      while (left > 0 && queue.length) {
        const head = queue[0]!;
        const use = Math.min(head.minor, left);
        head.minor -= use;
        left -= use;
        if (head.minor === 0) queue.shift();
      }
      ahead += left;
    }
  }
  const age: StatementView['age'] = [
    { band: 'd7', minor: 0 },
    { band: 'd15', minor: 0 },
    { band: 'd30', minor: 0 },
    { band: 'older', minor: 0 },
  ];
  for (const q of queue) {
    const n = daysBetween(q.day, to);
    age[n <= AGE_BANDS[0] ? 0 : n <= AGE_BANDS[1] ? 1 : n <= AGE_BANDS[2] ? 2 : 3]!.minor += q.minor;
  }
  return {
    month,
    from,
    to: monthEnd,
    asOf: to,
    openingMinor: open,
    billsMinor,
    creditsMinor,
    paidMinor,
    otherMinor,
    closingMinor,
    counts: { bills: count('bills'), credits: count('credits'), paid: count('paid'), other: count('other') },
    age,
    paidAheadMinor: ahead,
    oldestOpenDay: queue[0]?.day ?? null,
    days,
  };
}

/** The months that have a statement: from the month of the first entry to the current month, newest first. */
export function statementMonths(first: string | null, today: string): string[] {
  const out: string[] = [];
  const end = today.slice(0, 7);
  let m = first ? first.slice(0, 7) : end;
  for (let i = 0; i < 120 && m <= end; i++) {
    out.push(m);
    const d = new Date(`${m}-01T00:00:00Z`);
    m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 7);
  }
  return out.reverse();
}

export interface MonthlyStatement extends StatementView {
  /** Months to pick from, newest first. */
  months: string[];
  /** The ledger's own closing balance for the day the statement is read as of (must equal `closingMinor`). */
  ledgerMinor: number;
  /** Where the ERP said the balance was when the account was last checked, or null. */
  erpMinor: number | null;
  erpCheckedAt: string | null;
}

/** One month's statement of the store's ERP account (`erp.account.read`). Before the store's link opens, or in v5, there is none. */
export async function monthlyStatement(deps: InventoryDeps, who: Who, input: z.input<typeof statementInput>): Promise<MonthlyStatement | null> {
  await allowBooks(deps, who, 'erp.account.read');
  const month = statementInput.parse(input).month;
  if (!(await isV6(deps, who.storeId))) return null;
  const { timeZone } = await storeBooks(deps.db, who.storeId);
  const today = storeDate(nowOf(deps), timeZone);
  if (month > today.slice(0, 7)) throw new BooksError('INVALID_INPUT', 'a month that has not begun has no statement', ['month']);
  const link = await booksLinkFor(deps, who.storeId);
  const to = (() => {
    const e = lastDayOf(month);
    return today < e ? today : e;
  })();
  const [rows, first, state] = await Promise.all([
    deps.db.erpAccountEntry.findMany({ where: { linkId: link.id, businessDate: { lte: dateOfDay(to) } }, orderBy: [{ businessDate: 'asc' }, { seq: 'asc' }], select: { kind: true, businessDate: true, amountMinor: true } }),
    deps.db.erpAccountEntry.findFirst({ where: { linkId: link.id }, orderBy: { businessDate: 'asc' }, select: { businessDate: true } }),
    deps.db.erpAccountState.findUnique({ where: { linkId: link.id } }),
  ]);
  const openingMinor = link.openingBalanceMinor ?? 0;
  const opening = { minor: openingMinor, day: link.openingBalanceDate };
  const view = buildStatement(
    rows.map((r) => ({ kind: r.kind as ErpAccountEntryKind, day: dayText(r.businessDate), amountMinor: minorOf(r.amountMinor) })),
    opening,
    month,
    today,
  );
  const ledger = await balanceOn(deps.db, link, view.asOf);
  const firstDay = [first ? dayText(first.businessDate) : null, link.openingBalanceDate].filter((x): x is string => !!x).sort()[0] ?? null;
  return {
    ...view,
    months: statementMonths(firstDay, today),
    ledgerMinor: ledger.endMinor,
    erpMinor: state?.balanceMinor == null ? null : minorOf(state.balanceMinor),
    erpCheckedAt: state?.checkedAt ? state.checkedAt.toISOString() : null,
  };
}

// PR 1040 (S28, final round D14, Finance > Costs "Fixed costs & salaries") — a person's advance, bonus and deduction as NEW ROWS
// (table StaffPayRow, never edited or deleted) and the history of every change of a salary or monthly cost
// (table FixedCostChange). The list of people and their amounts stays in `books.staffCosts`; this file only adds rows.
//
//   - A BONUS or a DEDUCTION is a row and needs the owner's PIN; nothing moves until the month's salary is paid, which counts
//     them (pay route in costs-api.ts). A wrong one is cancelled by a row that points at it (`reversesId`), never edited.
//   - An ADVANCE is money out of a cashbook account: it goes through the cashbook (`inv.recordCash`: `cash.record`, the PIN,
//     a request key so a retry records once) and then writes its row. It is corrected in the cashbook, not here.
//   - A month already paid takes no new row; a row can never take a person's pay below nothing.
//   - Every row is in the audit log. Nothing here is automatic.
import { randomUUID } from 'node:crypto';
import { audit } from '@extas/auth';
import * as inv from '@extas/inventory';
import { staffAmountAt, staffNetAt, withPayRows, type StaffCostPerson, type StaffPayRowLite } from '@extas/settings';
import type { AdminDeps } from './admin-auth';

export const PAY_ROW_KINDS = ['ADVANCE', 'BONUS', 'DEDUCTION'] as const;
export type PayRowKind = (typeof PAY_ROW_KINDS)[number];
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const AMOUNT_MAX = 1_000_000_000;

export class StaffPayError extends Error {
  constructor(
    public code: 'INVALID_INPUT' | 'NOT_FOUND' | 'MONTH_PAID' | 'TOO_BIG' | 'ADVANCE_IN_CASHBOOK' | 'ALREADY_REVERSED' | 'ACCOUNT_NEEDED',
    message: string,
    public details: string[] = [],
  ) {
    super(message);
  }
}

export interface PayRowView extends StaffPayRowLite {
  at: string;
  accountKey: string | null;
  /** This row was cancelled by a later one. */
  cancelled: boolean;
}

/** The rows of the months given (all months when none), oldest first. */
export async function payRows(db: AdminDeps['db'], storeId: number, months?: readonly string[]): Promise<PayRowView[]> {
  const rows = await db.staffPayRow.findMany({ where: { storeId, ...(months ? { month: { in: [...months] } } : {}) }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  const cancelled = new Set(rows.filter((r) => r.reversesId).map((r) => r.reversesId as string));
  return rows.map((r) => ({ id: r.id, personId: r.personId, month: r.month, kind: r.kind as PayRowKind, amountMinor: r.amountMinor, note: r.note, reversesId: r.reversesId, at: r.createdAt.toISOString(), accountKey: r.accountKey, cancelled: cancelled.has(r.id) }));
}

/** The people with this store's rows applied (what the page and the pay route work from). */
export async function peopleWithRows(db: AdminDeps['db'], storeId: number, people: readonly StaffCostPerson[], months?: readonly string[]): Promise<StaffCostPerson[]> {
  return withPayRows(people, await payRows(db, storeId, months));
}

export interface AddPayRowInput {
  personId: string;
  month: string;
  kind: PayRowKind;
  amountMinor: number;
  note?: string;
  /** ADVANCE: the cashbook account the money comes out of. */
  accountKey?: string;
  pin: string;
}

/** One new advance, bonus or deduction. `people` is the stored list (before rows); the caller has checked `fixedcosts.write`. */
export async function addPayRow(admin: AdminDeps, deps: inv.InventoryDeps, who: inv.Who, people: readonly StaffCostPerson[], input: AddPayRowInput): Promise<{ id: string; repeated: boolean }> {
  const { personId, month, kind } = input;
  if (!(PAY_ROW_KINDS as readonly string[]).includes(kind) || !MONTH.test(month) || !Number.isInteger(input.amountMinor) || input.amountMinor <= 0 || input.amountMinor > AMOUNT_MAX) throw new StaffPayError('INVALID_INPUT', 'a kind, a month and an amount are needed', ['amountMinor']);
  const person = people.find((p) => p.id === personId && p.kind === 'salary');
  if (!person) throw new StaffPayError('NOT_FOUND', 'no such person', ['personId']);
  if (person.paid?.[month]) throw new StaffPayError('MONTH_PAID', 'this month is paid already', [month]);
  const base = staffAmountAt(person, month);
  if (!base) throw new StaffPayError('INVALID_INPUT', 'no salary in this month', ['month']);
  const rows = await payRows(admin.db, who.storeId, [month]);
  const now = staffNetAt(withPayRows([person], rows)[0]!, month);
  // the pay of a month may not go below nothing: advance + deduction can be at most the amount + bonus
  const after = { adv: now.adv + (kind === 'ADVANCE' ? input.amountMinor : 0), ded: now.ded + (kind === 'DEDUCTION' ? input.amountMinor : 0), bonus: now.bonus };
  if (after.adv + after.ded > base + after.bonus) throw new StaffPayError('TOO_BIG', 'more than the month pays', ['amountMinor']);
  const id = randomUUID();
  const note = input.note?.trim().slice(0, 120) || null;
  let accountKey: string | null = null;
  let cashRequestKey: string | null = null;
  let repeated = false;
  if (kind === 'ADVANCE') {
    accountKey = input.accountKey?.trim().slice(0, 40) || null;
    if (!accountKey) throw new StaffPayError('ACCOUNT_NEEDED', 'an advance comes out of a cashbook account', ['accountKey']);
    cashRequestKey = `advance:${id}`;
    const day = (admin.now ?? (() => new Date()))().toISOString().slice(0, 10); // hardcode-ok: ISO date
    const r = await inv.recordCash(deps, who, { kind: 'EXPENSE', accountKey, amountMinor: input.amountMinor, day, note: `Salary advance ${month} · ${person.name}`.slice(0, 300), requestKey: cashRequestKey, pin: input.pin }); // hardcode-ok: the cashbook's own entry text
    repeated = r.repeated;
  } else {
    await inv.checkBooksPin(deps, who, input.pin, `staff.pay.${kind.toLowerCase()}`);
  }
  await admin.db.staffPayRow.create({ data: { id, storeId: who.storeId, personId, month, kind, amountMinor: input.amountMinor, note, cashRequestKey, accountKey, enteredById: who.actor.staffUserId ?? null } });
  await audit(admin.db, who.actor, { storeId: who.storeId, action: 'books.staffPayRow', entityType: 'StaffPayRow', entityId: id, before: null, after: { personId, month, kind, amountMinor: input.amountMinor } }, { source: 'admin-api', ...who.ctx });
  return { id, repeated };
}

/** Cancels a bonus or a deduction with a new row that points at it. An advance was paid out of the cashbook: reverse it there. */
export async function reversePayRow(admin: AdminDeps, deps: inv.InventoryDeps, who: inv.Who, people: readonly StaffCostPerson[], rowId: string, input: { reason: string; pin: string }): Promise<{ id: string }> {
  const row = await admin.db.staffPayRow.findFirst({ where: { id: rowId, storeId: who.storeId } });
  if (!row) throw new StaffPayError('NOT_FOUND', 'no such row', ['id']);
  if (row.reversesId) throw new StaffPayError('INVALID_INPUT', 'this row cancels another', ['id']);
  if (row.kind === 'ADVANCE') throw new StaffPayError('ADVANCE_IN_CASHBOOK', 'an advance is reversed in the cashbook', ['id']);
  if (await admin.db.staffPayRow.findFirst({ where: { reversesId: rowId }, select: { id: true } })) throw new StaffPayError('ALREADY_REVERSED', 'cancelled already', ['id']);
  const reason = input.reason.trim();
  if (reason.length < 3) throw new StaffPayError('INVALID_INPUT', 'a short reason is needed', ['reason']);
  if (people.find((p) => p.id === row.personId)?.paid?.[row.month]) throw new StaffPayError('MONTH_PAID', 'this month is paid already', [row.month]);
  await inv.checkBooksPin(deps, who, input.pin, 'staff.pay.reverse');
  const id = randomUUID();
  await admin.db.staffPayRow.create({ data: { id, storeId: who.storeId, personId: row.personId, month: row.month, kind: row.kind, amountMinor: row.amountMinor, note: reason.slice(0, 120), reversesId: rowId, enteredById: who.actor.staffUserId ?? null } });
  await audit(admin.db, who.actor, { storeId: who.storeId, action: 'books.staffPayRow.reverse', entityType: 'StaffPayRow', entityId: id, before: { reverses: rowId }, after: { personId: row.personId, month: row.month, kind: row.kind } }, { source: 'admin-api', ...who.ctx });
  return { id };
}

export interface CostChangeView {
  id: string;
  headId: string;
  headName: string;
  fromMonth: string;
  oldMinor: number | null;
  newMinor: number;
  note: string | null;
  by: string | null;
  at: string;
}

/** Writes one history row for every amount that is new or different between two saves of the list. */
export async function logCostChanges(admin: AdminDeps, who: inv.Who, before: readonly StaffCostPerson[], after: readonly StaffCostPerson[], note: string | null): Promise<number> {
  const rows: { headId: string; headName: string; kind: string; fromMonth: string; oldMinor: number | null; newMinor: number }[] = [];
  for (const p of after) {
    const old = before.find((o) => o.id === p.id);
    for (const a of p.amounts) {
      const was = old?.amounts.find((x) => x.from === a.from);
      if (!was || was.minor !== a.minor) rows.push({ headId: p.id, headName: p.name, kind: p.kind, fromMonth: a.from, oldMinor: was ? was.minor : old ? staffAmountAt(old, a.from) : null, newMinor: a.minor });
    }
    if (old && p.stoppedFrom && p.stoppedFrom !== old.stoppedFrom) rows.push({ headId: p.id, headName: p.name, kind: p.kind, fromMonth: p.stoppedFrom, oldMinor: staffAmountAt(old, p.stoppedFrom), newMinor: 0 });
  }
  if (!rows.length) return 0;
  await admin.db.fixedCostChange.createMany({ data: rows.map((r) => ({ ...r, storeId: who.storeId, note: note?.trim().slice(0, 120) || null, changedById: who.actor.staffUserId ?? null })) });
  return rows.length;
}

/** The history of the heads (newest first), with the name of whoever changed them. */
export async function costChanges(admin: AdminDeps, storeId: number, headId?: string, limit = 200): Promise<CostChangeView[]> { // hardcode-ok: a page of history
  const rows = await admin.db.fixedCostChange.findMany({ where: { storeId, ...(headId ? { headId } : {}) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit });
  const ids = [...new Set(rows.map((r) => r.changedById).filter((x): x is string => !!x))];
  const users = ids.length ? await admin.db.staffUser.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }) : [];
  const name = new Map(users.map((u) => [u.id, u.displayName]));
  return rows.map((r) => ({ id: r.id, headId: r.headId, headName: r.headName, fromMonth: r.fromMonth, oldMinor: r.oldMinor, newMinor: r.newMinor, note: r.note, by: r.changedById ? (name.get(r.changedById) ?? null) : null, at: r.createdAt.toISOString() }));
}

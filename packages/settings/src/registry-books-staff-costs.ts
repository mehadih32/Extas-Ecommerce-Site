// S28 · PR 837 (admin prototype v5, Money › Costs) — the shop's monthly cost heads, one row per person or bill: each
// person's salary and each rent, utility or other monthly cost, with the amount from a month on. Registry version 837.
// Labels: messages/books-summary.<lang>.json (`books.staffCosts`); edited on Money › Costs, in the "Salaries and monthly
// costs" card.
//
// - A change of amount is a new row "from this month": earlier months keep their old amount, so a past month's total never
//   moves (nothing is overwritten). A person who leaves is stopped from a month on; nothing is deleted.
// - The month's fixed costs (salary, rent, utilities, other) are still saved on the Costs card, as before: this list only
//   adds up what each month should be, and the owner presses "Use for this month" and then Save. No money is paid or moved.
import { z } from 'zod';
import { setting } from './define';

const V = 837;

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
export const STAFF_COST_KINDS = ['salary', 'rent', 'utilities', 'other'] as const;
export type StaffCostKind = (typeof STAFF_COST_KINDS)[number];

const monthSchema = z.string().regex(MONTH);

export const staffCostAmountSchema = z.object({ from: monthSchema, minor: z.number().int().min(0).max(1_000_000_000_000) }).strict();

/**
 * parity F4 · PR 849 (prototype Salaries): what changes one person's pay in one month, on top of the amount: an advance already
 * taken, a bonus and a deduction, with a short note. The amount itself is never edited here, so a month's pay can always be
 * worked out again: net to pay = the amount + bonus - deduction - advance (never below 0).
 */
export const staffCostAdjustSchema = z
  .object({
    adv: z.number().int().min(0).max(1_000_000_000_000),
    bonus: z.number().int().min(0).max(1_000_000_000_000),
    ded: z.number().int().min(0).max(1_000_000_000_000),
    note: z.string().trim().max(120),
  })
  .strict();
export type StaffCostAdjust = z.output<typeof staffCostAdjustSchema>;

/**
 * parity F5 · PR 859 (prototype Salaries "Pay salary"): a month's salary was paid, from which cashbook account, on which day and for how
 * much. Written only by the pay route (Accounts / owner, with the PIN) after the cashbook took the entry; once a month is
 * paid its advance, bonus and deduction are locked. Nothing is overwritten: a wrong payment is reversed in the cashbook.
 */
export const staffCostPaidSchema = z
  .object({
    at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    minor: z.number().int().min(1).max(1_000_000_000_000),
    account: z.string().min(1).max(40),
  })
  .strict();
export type StaffCostPaid = z.output<typeof staffCostPaidSchema>;

export const staffCostPersonSchema = z
  .object({
    id: z.string().min(1).max(40),
    name: z.string().trim().min(1).max(80),
    post: z.string().trim().max(60),
    kind: z.enum(STAFF_COST_KINDS),
    /** The day of the month it is paid (1–28, so every month has it). */
    payDay: z.number().int().min(1).max(28),
    /** The amounts, each from a month on (the latest `from` not after the month counts). */
    amounts: z.array(staffCostAmountSchema).min(1).max(120),
    /** Stopped from this month on (null = still running). */
    stoppedFrom: monthSchema.nullable(),
    /** PR 849: the advance, bonus and deduction of a month (key `YYYY-MM`); a month with none is not listed. */
    adj: z.record(monthSchema, staffCostAdjustSchema).optional(),
    /** PR 859: the months whose salary was paid (key `YYYY-MM`); a month not listed is not paid. */
    paid: z.record(monthSchema, staffCostPaidSchema).optional(),
  })
  .strict();
export type StaffCostPerson = z.output<typeof staffCostPersonSchema>;

export const staffCostsSchema = z
  .object({ people: z.array(staffCostPersonSchema).max(300) })
  .strict()
  .refine((v) => new Set(v.people.map((p) => p.id)).size === v.people.length, { message: 'duplicate id' })
  .refine((v) => v.people.every((p) => new Set(p.amounts.map((a) => a.from)).size === p.amounts.length), { message: 'duplicate month' });
export type StaffCostsSettings = z.output<typeof staffCostsSchema>;

/** The amount of one head in a month (minor units): the latest amount that starts on or before it; 0 before the first or once stopped. */
export function staffAmountAt(p: Pick<StaffCostPerson, 'amounts' | 'stoppedFrom'>, month: string): number {
  if (p.stoppedFrom && month >= p.stoppedFrom) return 0;
  let best: { from: string; minor: number } | null = null;
  for (const a of p.amounts) if (a.from <= month && (!best || a.from > best.from)) best = a;
  return best ? best.minor : 0;
}

/** PR 1040: one advance, bonus or deduction row (table StaffPayRow); a row that points at another (`reversesId`) cancels it. */
export interface StaffPayRowLite {
  id: string;
  personId: string;
  month: string;
  kind: 'ADVANCE' | 'BONUS' | 'DEDUCTION';
  amountMinor: number;
  note?: string | null;
  reversesId: string | null;
}

/**
 * PR 1040: the people with their advance, bonus and deduction of each month worked out from the rows (new rows each time,
 * never an edit), on top of anything an older version of the list already holds under `adj` (kept as it was, never changed).
 * A row that was cancelled, and the row that cancels it, count for nothing.
 */
export function withPayRows(people: readonly StaffCostPerson[], rows: readonly StaffPayRowLite[]): StaffCostPerson[] {
  const cancelled = new Set(rows.filter((r) => r.reversesId).map((r) => r.reversesId as string));
  const live = rows.filter((r) => !r.reversesId && !cancelled.has(r.id));
  return people.map((p) => {
    const mine = live.filter((r) => r.personId === p.id);
    if (!mine.length) return p;
    const adj: Record<string, StaffCostAdjust> = { ...(p.adj ?? {}) };
    for (const r of mine) {
      const cur = adj[r.month] ?? { adv: 0, bonus: 0, ded: 0, note: '' };
      adj[r.month] = {
        adv: cur.adv + (r.kind === 'ADVANCE' ? r.amountMinor : 0),
        bonus: cur.bonus + (r.kind === 'BONUS' ? r.amountMinor : 0),
        ded: cur.ded + (r.kind === 'DEDUCTION' ? r.amountMinor : 0),
        note: [cur.note, r.note ?? ''].filter(Boolean).join(' · ').slice(0, 120),
      };
    }
    return { ...p, adj };
  });
}

/** What one person is paid in a month: the amount plus bonus, less deduction and advance (never below 0). */
export function staffNetAt(p: Pick<StaffCostPerson, 'amounts' | 'stoppedFrom' | 'adj'>, month: string): { base: number; adv: number; bonus: number; ded: number; net: number } {
  const base = staffAmountAt(p, month);
  const a = p.adj?.[month];
  const adv = base ? (a?.adv ?? 0) : 0;
  const bonus = base ? (a?.bonus ?? 0) : 0;
  const ded = base ? (a?.ded ?? 0) : 0;
  return { base, adv, bonus, ded, net: Math.max(0, base + bonus - ded - adv) };
}

/** Who is to be paid in a month and how much: salary heads with something to pay that are not paid yet (`ids` narrows it). */
export function salaryPlan(people: readonly StaffCostPerson[], month: string, ids?: readonly string[]): { id: string; name: string; minor: number }[] {
  return people
    .filter((p) => p.kind === 'salary' && !p.paid?.[month] && (!ids || ids.includes(p.id)))
    .map((p) => ({ id: p.id, name: p.name, minor: staffNetAt(p, month).net }))
    .filter((x) => x.minor > 0);
}

/** A month's totals per kind (what the month's fixed costs would be). */
export function staffTotalsFor(people: readonly StaffCostPerson[], month: string): Record<StaffCostKind, number> {
  const t: Record<StaffCostKind, number> = { salary: 0, rent: 0, utilities: 0, other: 0 };
  // The cost of a month is the amount plus bonus less deduction; an advance only moves the day the money is paid, not the cost.
  for (const p of people) {
    const x = staffNetAt(p, month);
    t[p.kind] += x.base ? x.base + x.bonus - x.ded : 0;
  }
  return t;
}

/** The next change of amount after a month (shown beside the current amount), or null. */
export function staffNextChange(p: Pick<StaffCostPerson, 'amounts' | 'stoppedFrom'>, month: string): { from: string; minor: number } | null {
  const later = p.amounts.filter((a) => a.from > month).sort((a, b) => (a.from < b.from ? -1 : 1));
  if (p.stoppedFrom && p.stoppedFrom > month && (!later[0] || p.stoppedFrom <= later[0].from)) return { from: p.stoppedFrom, minor: 0 };
  return later[0] ?? null;
}

export const staffCostsSettings = {
  'books.staffCosts': setting({
    scope: 'store',
    schema: staffCostsSchema,
    default: { people: [] },
    valueType: 'JSON',
    group: 'books',
    labelKey: 'books.staffCosts.label',
    helpKey: 'books.staffCosts.help',
    // hardcode-ok: the shipped list is empty, so no owner data ships; the names and amounts typed in live in the owner's own store only
    isOwnerData: false,
    isPublic: false,
    sortOrder: 12,
    version: V,
  }),
} as const;

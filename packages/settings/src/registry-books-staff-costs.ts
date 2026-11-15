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

/** A month's totals per kind (what the month's fixed costs would be). */
export function staffTotalsFor(people: readonly StaffCostPerson[], month: string): Record<StaffCostKind, number> {
  const t: Record<StaffCostKind, number> = { salary: 0, rent: 0, utilities: 0, other: 0 };
  for (const p of people) t[p.kind] += staffAmountAt(p, month);
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
    isOwnerData: true,
    isPublic: false,
    sortOrder: 12,
    version: V,
  }),
} as const;

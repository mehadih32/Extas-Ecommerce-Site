// S28 · PR 837 (registry v837) — the salaries and monthly costs list of Money › Costs: a change of amount counts from its
// month and never moves an earlier month, a stopped person costs nothing from the stop month, and the setting is per store,
// empty as shipped and labelled in both languages.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { staffAmountAt, staffCostsSchema, staffCostsSettings, staffNextChange, staffTotalsFor, type StaffCostPerson } from '../src/registry-books-staff-costs';

const person = (over: Partial<StaffCostPerson> = {}): StaffCostPerson => ({
  id: 'p1',
  name: 'Rahim',
  post: 'Packer',
  kind: 'salary',
  payDay: 5,
  amounts: [
    { from: '2026-01', minor: 1_200_000 },
    { from: '2026-10', minor: 1_500_000 },
  ],
  stoppedFrom: null,
  ...over,
});

describe('salaries and monthly costs (v837)', () => {
  it('is in the registry at version 837, empty, per store, labelled in English and Bengali', () => {
    const s = staffCostsSettings['books.staffCosts'];
    expect(registry['books.staffCosts']).toBe(s);
    expect([s.version, s.default, s.scope, s.group]).toEqual([837, { people: [] }, 'store', 'books']);
    expect(s.schema.safeParse(s.default).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], s.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], s.helpKey!)).toBeTruthy();
    }
  });

  it('a new amount counts from its month: earlier months keep the old figure', () => {
    const p = person();
    expect(staffAmountAt(p, '2025-12')).toBe(0);
    expect(staffAmountAt(p, '2026-01')).toBe(1_200_000);
    expect(staffAmountAt(p, '2026-09')).toBe(1_200_000);
    expect(staffAmountAt(p, '2026-10')).toBe(1_500_000);
    expect(staffAmountAt(p, '2027-03')).toBe(1_500_000);
  });

  it('a stopped person costs nothing from the stop month, and the list shows the next change', () => {
    const p = person({ stoppedFrom: '2026-12' });
    expect(staffAmountAt(p, '2026-11')).toBe(1_500_000);
    expect(staffAmountAt(p, '2026-12')).toBe(0);
    expect(staffNextChange(p, '2026-11')).toEqual({ from: '2026-12', minor: 0 });
    expect(staffNextChange(person(), '2026-05')).toEqual({ from: '2026-10', minor: 1_500_000 });
    expect(staffNextChange(person(), '2026-10')).toBeNull();
  });

  it('adds a month up by kind', () => {
    const people = [person(), person({ id: 'p2', name: 'Office', kind: 'rent', amounts: [{ from: '2026-01', minor: 3_000_000 }] }), person({ id: 'p3', name: 'Net', kind: 'utilities', amounts: [{ from: '2026-11', minor: 150_000 }] })];
    expect(staffTotalsFor(people, '2026-10')).toEqual({ salary: 1_500_000, rent: 3_000_000, utilities: 0, other: 0 });
    expect(staffTotalsFor(people, '2026-11')).toEqual({ salary: 1_500_000, rent: 3_000_000, utilities: 150_000, other: 0 });
  });

  it('refuses a bad month, a repeated id, a repeated month, a negative or fractional amount and an unknown field', () => {
    const ok = { people: [person()] };
    expect(staffCostsSchema.safeParse(ok).success).toBe(true);
    expect(staffCostsSchema.safeParse({ people: [person({ amounts: [{ from: '2026-13', minor: 1 }] })] }).success).toBe(false);
    expect(staffCostsSchema.safeParse({ people: [person(), person()] }).success).toBe(false);
    expect(staffCostsSchema.safeParse({ people: [person({ amounts: [{ from: '2026-01', minor: 1 }, { from: '2026-01', minor: 2 }] })] }).success).toBe(false);
    expect(staffCostsSchema.safeParse({ people: [person({ amounts: [{ from: '2026-01', minor: -1 }] })] }).success).toBe(false);
    expect(staffCostsSchema.safeParse({ people: [person({ amounts: [{ from: '2026-01', minor: 1.5 }] })] }).success).toBe(false);
    expect(staffCostsSchema.safeParse({ people: [person({ payDay: 31 })] }).success).toBe(false);
    expect(staffCostsSchema.safeParse({ people: [], extra: 1 }).success).toBe(false);
  });
});

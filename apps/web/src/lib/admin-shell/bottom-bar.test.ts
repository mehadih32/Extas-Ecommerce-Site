// PR 794 — the phone bottom bar's five places.
import { describe, expect, it } from 'vitest';
import { QUICK_SECTION_IDS, quickSections } from './bottom-bar';

const all = ['dashboard', 'orders', 'delivery', 'products', 'customers', 'support', 'rules', 'money', 'reports', 'settings'].map((id) => ({ id }));

describe('phone bottom bar (PR 794)', () => {
  it('has the prototype five, in order', () => {
    expect(quickSections(all).map((s) => s.id)).toEqual([...QUICK_SECTION_IDS]);
  });
  it('leaves out a section the person may not open', () => {
    expect(quickSections(all.filter((s) => s.id !== 'reports')).map((s) => s.id)).toEqual(['dashboard', 'orders', 'products', 'support']);
  });
});

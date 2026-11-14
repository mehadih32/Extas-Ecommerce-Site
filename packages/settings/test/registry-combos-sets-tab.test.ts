// S28 · PR 712 (registry v712): Products › Sets — which combo kinds count as a set, and when a set's stock is called low.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { combosSettings, combosSetsTabSchema } from '../src/registry-combos';

describe('combos.setsTab (v712)', () => {
  it('is in the registry at the PR number, per store, labelled in both languages, default valid', () => {
    const spec = combosSettings['combos.setsTab'];
    expect(registry['combos.setsTab']).toBe(spec);
    expect(spec.version).toBe(712);
    expect(spec.scope).toBe('store');
    expect(spec.isOwnerData).toBe(false);
    expect(spec.default).toEqual({ types: ['TOP_BOTTOM', 'FIXED_SET', 'MIXED_SET'], lowStockAt: 5 });
    expect(spec.schema.safeParse(spec.default).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!), lang).toBeTruthy();
    }
  });
  it('needs at least one kind, only known kinds, and a low-stock number in range (0 = no mark)', () => {
    const ok = { types: ['TOP_BOTTOM'], lowStockAt: 0 };
    expect(combosSetsTabSchema.safeParse(ok).success).toBe(true);
    expect(combosSetsTabSchema.safeParse({ ...ok, types: [] }).success).toBe(false);
    expect(combosSetsTabSchema.safeParse({ ...ok, types: ['NOPE'] }).success).toBe(false);
    expect(combosSetsTabSchema.safeParse({ ...ok, lowStockAt: -1 }).success).toBe(false);
    expect(combosSetsTabSchema.safeParse({ ...ok, lowStockAt: 1001 }).success).toBe(false);
    expect(combosSetsTabSchema.safeParse({ ...ok, extra: 1 }).success).toBe(false);
  });
});

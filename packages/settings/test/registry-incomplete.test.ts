// S13 · PR 274 (registry v179): when an unfinished checkout counts as left — at version 179, never owner data,
// labelled in both languages, a bounded number of minutes.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { incompleteOrdersSchema, incompleteSettings } from '../src/registry-incomplete';

describe('orders.incomplete (v179)', () => {
  it('is in the registry at version 179, store-level, labelled in English and Bengali', () => {
    const spec = incompleteSettings['orders.incomplete'];
    expect(registry['orders.incomplete']).toBe(spec);
    expect(spec.version).toBe(179);
    expect(spec.isOwnerData).toBe(false);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!)).toBeTruthy();
    }
  });

  it('ships a valid default and refuses minutes out of range', () => {
    const d = incompleteSettings['orders.incomplete'].default;
    expect(incompleteOrdersSchema.safeParse(d).success).toBe(true);
    for (const bad of [{ leftAfterMinutes: 4 }, { leftAfterMinutes: 1_441 }, { leftAfterMinutes: 7.5 }, { extra: 1 }]) expect(incompleteOrdersSchema.safeParse({ ...d, ...bad }).success).toBe(false);
  });
});

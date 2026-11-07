// Follow-up 596 (PR 423; registry v270): the re-open rule for a fixed customer problem that comes back is one store
// setting, off as shipped, its numbers editable, labelled in both languages.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { healthReopenSettings } from '../src/registry-health-reopen';

describe('customer problem re-open rule (v270)', () => {
  it('is in the registry at version 270, off, per store, labelled in English and Bengali', () => {
    const s = healthReopenSettings['health.problems.reopen'];
    expect(registry['health.problems.reopen']).toBe(s);
    expect([s.version, s.default, s.scope, s.isOwnerData]).toEqual([270, { enabled: false, records: 3, graceMinutes: 60 }, 'store', false]);
    expect(s.schema.safeParse({ enabled: true, records: 1, graceMinutes: 0 }).success).toBe(true);
    expect(s.schema.safeParse({ enabled: true, records: 0, graceMinutes: 0 }).success).toBe(false);
    expect(s.schema.safeParse({ enabled: true, records: 3, graceMinutes: 60, extra: 1 }).success).toBe(false);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], s.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], s.helpKey!)).toBeTruthy();
    }
  });
});

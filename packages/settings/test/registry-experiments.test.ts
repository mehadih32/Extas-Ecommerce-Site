// S02 · PR 83 (registry v243): the A/B test module's switch and numbers — at version 243, off, store level, not public,
// never owner data, labelled in both languages; the numbers stay inside their limits.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { experimentsModuleSchema, experimentsSettings } from '../src/registry-experiments';

describe('experiments.module (v243)', () => {
  it('is in the registry at version 243, off, store-level, labelled in English and Bengali', () => {
    const spec = experimentsSettings['experiments.module'];
    expect(registry['experiments.module']).toBe(spec);
    expect(spec.version).toBe(243);
    expect(spec.default).toEqual({ enabled: false, confidence: 95, minVisitors: 100, cookieDays: 30 });
    expect(spec.isOwnerData).toBe(false);
    expect(spec.isPublic).toBe(false);
    for (const lang of ['en', 'bn'] as const) {
      for (const k of [spec.labelKey, spec.helpKey!, 'groups.experiments']) expect(lookup(messages[lang], k)).toBeTruthy();
    }
  });

  it('keeps every number inside its limits', () => {
    const ok = { enabled: true, confidence: 90, minVisitors: 50, cookieDays: 7 };
    expect(experimentsModuleSchema.safeParse(ok).success).toBe(true);
    expect(experimentsModuleSchema.safeParse({ ...ok, confidence: 100 }).success).toBe(false);
    expect(experimentsModuleSchema.safeParse({ ...ok, confidence: 79 }).success).toBe(false);
    expect(experimentsModuleSchema.safeParse({ ...ok, minVisitors: 5 }).success).toBe(false);
    expect(experimentsModuleSchema.safeParse({ ...ok, cookieDays: 0 }).success).toBe(false);
    expect(experimentsModuleSchema.safeParse({ ...ok, extra: 1 }).success).toBe(false);
  });
});

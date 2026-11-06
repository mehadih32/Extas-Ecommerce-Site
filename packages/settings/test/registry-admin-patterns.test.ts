// PR 627 (CN-036) — the shared Lumen patterns' numbers (v236): Undo stays 5 seconds and "Show more" adds 12 rows as
// shipped, both editable within sane bounds; private, never owner data, labels in both languages.
import { describe, expect, it } from 'vitest';
import { registry, registryVersion } from '../src/index';
import { messages } from '../src/messages';
import { adminPatternsSchema, adminPatternsSettings } from '../src/registry-admin-patterns';

describe('admin patterns setting (v236)', () => {
  it('is in the registry at version 236, private, never owner data, with labels in both languages', () => {
    expect(registryVersion(registry)).toBeGreaterThanOrEqual(236);
    const spec = adminPatternsSettings['admin.patterns'];
    expect(registry['admin.patterns']).toBe(spec);
    expect(spec.version).toBe(236);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.isPublic).toBe(false);
    for (const lang of ['en', 'bn'] as const) {
      const node = (messages[lang].admin as Record<string, Record<string, unknown>>).patterns;
      expect(typeof node?.label, lang).toBe('string');
      expect(typeof node?.help, lang).toBe('string');
    }
  });

  it('ships 5 seconds of Undo and a step of 12 rows, and checks the bounds', () => {
    expect(adminPatternsSettings['admin.patterns'].default).toEqual({ undoSeconds: 5, pageStep: 12 });
    expect(adminPatternsSchema.safeParse({ undoSeconds: 30, pageStep: 100 }).success).toBe(true);
    for (const bad of [{ undoSeconds: 2, pageStep: 12 }, { undoSeconds: 31, pageStep: 12 }, { undoSeconds: 5, pageStep: 5 }, { undoSeconds: 5.5, pageStep: 12 }, { undoSeconds: 5, pageStep: 12, extra: 1 }]) {
      expect(adminPatternsSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});

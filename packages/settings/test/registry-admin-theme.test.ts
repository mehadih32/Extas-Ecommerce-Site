// PR 625 (CN-036) — the admin theme layer's setting (v234): Lumen is the only look that can be chosen, the accent is a
// #RRGGBB colour (coral as shipped), motion is not reduced as shipped; private, never owner data, labels in both languages.
import { describe, expect, it } from 'vitest';
import { registry, registryVersion } from '../src/index';
import { messages } from '../src/messages';
import { ADMIN_ACCENT_PRESETS, ADMIN_THEME_LOOKS, BUILT_ADMIN_LOOKS, accentSchema, adminThemeSchema, adminThemeSettings } from '../src/registry-admin-theme';

describe('admin theme setting (v234)', () => {
  it('is in the registry at version 234, private, never owner data, with labels in both languages', () => {
    expect(registryVersion(registry)).toBeGreaterThanOrEqual(234);
    const spec = adminThemeSettings['admin.theme'];
    expect(registry['admin.theme']).toBe(spec);
    expect(spec.version).toBe(234);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.isPublic).toBe(false);
    for (const lang of ['en', 'bn'] as const) {
      const node = (messages[lang].admin as Record<string, Record<string, unknown>>).theme;
      expect(typeof node?.label, lang).toBe('string');
      expect(typeof node?.help, lang).toBe('string');
    }
  });

  it('ships Lumen in coral with full motion', () => {
    expect(adminThemeSettings['admin.theme'].default).toEqual({ look: 'lumen', accent: '#FF5A36', reduceMotion: false });
    expect(adminThemeSchema.safeParse(adminThemeSettings['admin.theme'].default).success).toBe(true);
  });

  it('lists four looks; only the built ones (Lumen) can be chosen', () => {
    expect(ADMIN_THEME_LOOKS.map((l) => l.id)).toEqual(['lumen', 'clear', 'night', 'studio']);
    expect(BUILT_ADMIN_LOOKS).toEqual(['lumen']);
    expect(adminThemeSchema.safeParse({ look: 'clear', accent: '#FF5A36', reduceMotion: false }).success).toBe(false);
  });

  it('checks the accent colour', () => {
    for (const accent of ['#12B5A6', '#7c5cff']) expect(adminThemeSchema.safeParse({ look: 'lumen', accent, reduceMotion: false }).success).toBe(true);
    for (const accent of ['red', '#FFF', '#12B5A6;x', 'url(x)', '#12B5A699']) expect(adminThemeSchema.safeParse({ look: 'lumen', accent, reduceMotion: true }).success, accent).toBe(false);
    expect(adminThemeSchema.safeParse({ look: 'lumen', accent: '#FF5A36', reduceMotion: false, extra: 1 }).success).toBe(false);
  });

  it('offers ready accent swatches, coral first (the shipped default), each a valid colour', () => {
    expect(ADMIN_ACCENT_PRESETS[0]).toEqual({ id: 'coral', hex: adminThemeSettings['admin.theme'].default.accent });
    expect(new Set(ADMIN_ACCENT_PRESETS.map((p) => p.id)).size).toBe(ADMIN_ACCENT_PRESETS.length);
    for (const p of ADMIN_ACCENT_PRESETS) expect(accentSchema.safeParse(p.hex).success, p.id).toBe(true);
  });
});

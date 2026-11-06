// S12 · PR 547 (registry v252): the journal articles' main photo — off as shipped, studio pictures off, the picker's
// count bounded, labelled in both languages.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { BLOG_IMAGES_DEFAULT, blogImageSettings, blogImagesSchema } from '../src/registry-blog-images';

describe('journal photos (v252)', () => {
  it('is in the registry at version 252, per store, labelled in English and Bengali, its default valid', () => {
    const s = blogImageSettings['blog.images'];
    expect(registry['blog.images']).toBe(s);
    expect(s.version).toBe(252);
    expect(s.scope).toBe('store');
    expect(s.schema.safeParse(s.default).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], s.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], s.helpKey!), lang).toBeTruthy();
    }
  });

  it('ships off: no main photo on the shop, no studio pictures', () => {
    expect(BLOG_IMAGES_DEFAULT).toEqual({ show: false, studio: false, perSource: 24 });
  });

  it('keeps the count inside its bounds and refuses unknown fields (no web-address or AI option)', () => {
    const ok = (patch: Record<string, unknown>) => blogImagesSchema.safeParse({ ...BLOG_IMAGES_DEFAULT, ...patch }).success;
    expect(ok({ show: true, studio: true, perSource: 60 })).toBe(true);
    expect(ok({ perSource: 3 })).toBe(false);
    expect(ok({ perSource: 61 })).toBe(false);
    expect(ok({ fromUrl: true })).toBe(false);
    expect(ok({ aiByItself: true })).toBe(false);
  });
});

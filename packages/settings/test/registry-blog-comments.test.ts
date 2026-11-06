// S12 · PR 251 (registry v250): comments on articles — off as shipped (the journal runs without comments), signed-in
// readers only, every number bounded, labelled in both languages.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { BLOG_COMMENTS_DEFAULT, blogCommentSettings, blogCommentsSchema } from '../src/registry-blog-comments';

describe('blog comments (v250)', () => {
  it('is in the registry at version 250, per store, labelled in English and Bengali, its default valid', () => {
    const s = blogCommentSettings['blog.comments'];
    expect(registry['blog.comments']).toBe(s);
    expect(s.version).toBe(250);
    expect(s.scope).toBe('store');
    expect(s.schema.safeParse(s.default).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], s.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], s.helpKey!), lang).toBeTruthy();
    }
  });

  it('ships off: the journal without comments; when on, signed-in readers only', () => {
    expect(BLOG_COMMENTS_DEFAULT).toEqual({ on: false, who: 'signedIn', maxChars: 600, perDay: 3, shown: 20 });
  });

  it('keeps every number inside its bounds and refuses unknown fields', () => {
    const ok = (patch: Record<string, unknown>) => blogCommentsSchema.safeParse({ ...BLOG_COMMENTS_DEFAULT, ...patch }).success;
    expect(ok({ on: true, who: 'anyone' })).toBe(true);
    expect(ok({ who: 'robots' })).toBe(false);
    expect(ok({ maxChars: 39 })).toBe(false);
    expect(ok({ perDay: 0 })).toBe(false);
    expect(ok({ shown: 101 })).toBe(false);
    expect(ok({ autoShow: true })).toBe(false);
  });
});

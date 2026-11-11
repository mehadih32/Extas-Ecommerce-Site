// S23 · PR 437 (registry v281): the social studio's cadence, voice and AI-caption switches — all off (or empty) as it
// ships, so nothing is generated, queued or sent until the owner sets a real number.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { studioContentSchema, studioSettings, studioVoiceSchema, STUDIO_CONTENT_DEFAULT, STUDIO_VOICE_DEFAULT } from '../src/registry-studio';

describe('social studio settings (v281)', () => {
  it('is in the registry at version 281, store-scoped, labelled in English and Bengali, its default valid', () => {
    for (const [key, s] of Object.entries(studioSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(s);
      expect(s.version, key).toBe(281);
      expect(s.scope, key).toBe('store');
      expect(s.schema.safeParse(s.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], s.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], s.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('ships with nothing generated: no posts, no reels, no weekday, empty voice, AI off', () => {
    expect(studioSettings['studio.content'].default).toEqual(STUDIO_CONTENT_DEFAULT);
    expect(STUDIO_CONTENT_DEFAULT).toEqual({ dailyPosts: 0, dailyReels: 0, activeWeekdays: [] });
    expect(studioSettings['studio.voice'].default).toEqual(STUDIO_VOICE_DEFAULT);
    expect(studioSettings['studio.ai.captions'].default).toBe(false);
  });

  it('cadence takes only 0–20 posts, 0–10 reels and ISO weekdays 1–7, each at most once (as a set)', () => {
    expect(studioContentSchema.safeParse({ dailyPosts: 3, dailyReels: 1, activeWeekdays: [1, 3, 5] }).success).toBe(true);
    expect(studioContentSchema.safeParse({ dailyPosts: 21, dailyReels: 0, activeWeekdays: [] }).success).toBe(false);
    expect(studioContentSchema.safeParse({ dailyPosts: 0, dailyReels: 11, activeWeekdays: [] }).success).toBe(false);
    expect(studioContentSchema.safeParse({ dailyPosts: 0, dailyReels: 0, activeWeekdays: [0] }).success).toBe(false);
    expect(studioContentSchema.safeParse({ dailyPosts: 0, dailyReels: 0, activeWeekdays: [8] }).success).toBe(false);
    expect(studioContentSchema.safeParse({ dailyPosts: -1, dailyReels: 0, activeWeekdays: [] }).success).toBe(false);
  });

  it('voice takes a short tone, a hashtag set and blocked words, each a short list of words', () => {
    expect(studioVoiceSchema.safeParse({ toneEn: 'friendly, honest', hashtagSet: ['extasbd', 'menswear'], blockedWords: ['cheap'] }).success).toBe(true);
    expect(studioVoiceSchema.safeParse({ toneEn: 'x'.repeat(301), hashtagSet: [], blockedWords: [] }).success).toBe(false);
    expect(studioVoiceSchema.safeParse({ toneEn: '', hashtagSet: Array.from({ length: 31 }, (_, i) => `tag${i}`), blockedWords: [] }).success).toBe(false);
    expect(studioVoiceSchema.safeParse({ toneEn: '', hashtagSet: [''], blockedWords: [] }).success).toBe(false);
  });
});

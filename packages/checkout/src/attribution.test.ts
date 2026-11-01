// PR 257 follow-up (go-live gate customer 360°) — the campaign tags as the order keeps them: cleaned and cut, only the
// three platforms a click id names, and the other site's address without its path. Made-up test values.
import { describe, expect, it } from 'vitest';
import { attributionData, cleanReferrer, cleanTag, TAG_MAX } from './attribution';

describe('the order attribution (PR 257 follow-up)', () => {
  it('keeps a tag without markup or control characters, cut to its length; empty is null', () => {
    expect(cleanTag('  Eid <polo>\u0007 ')).toBe('Eid polo');
    expect(cleanTag('ঈদ অফার')).toBe('ঈদ অফার');
    expect(cleanTag('x'.repeat(TAG_MAX + 20))).toHaveLength(TAG_MAX);
    expect(cleanTag('   ')).toBeNull();
    expect(cleanTag(42)).toBeNull();
  });

  it('keeps only the origin of an http(s) referrer', () => {
    expect(cleanReferrer('https://m.facebook.com/story.php?id=1')).toBe('https://m.facebook.com');
    expect(cleanReferrer('javascript:alert(1)')).toBeNull();
    expect(cleanReferrer('not a url')).toBeNull();
  });

  it('a platform is META, GOOGLE or TIKTOK, else nothing', () => {
    expect(attributionData({ adPlatform: 'GOOGLE' }).adPlatform).toBe('GOOGLE');
    expect(attributionData({ adPlatform: 'MYSPACE' as never }).adPlatform).toBeNull();
    expect(attributionData(null)).toEqual({ utmSource: null, utmMedium: null, utmCampaign: null, adPlatform: null, referrer: null });
  });
});

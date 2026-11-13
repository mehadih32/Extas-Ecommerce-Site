// S28 · PR 681 — video links and lengths, as the three providers write them.
import { describe, expect, it } from 'vitest';
import { isoDuration, parseVideoLink } from '../src';

describe('parseVideoLink', () => {
  it('reads YouTube in all its spellings', () => {
    for (const u of [
      'https://www.youtube.com/watch?v=abcDEF12345',
      'https://youtu.be/abcDEF12345',
      'https://www.youtube.com/shorts/abcDEF12345',
      'https://www.youtube.com/watch?feature=share&v=abcDEF12345',
    ]) {
      expect(parseVideoLink(u)).toMatchObject({ provider: 'YOUTUBE', id: 'abcDEF12345' });
    }
    expect(parseVideoLink('https://youtu.be/abcDEF12345')!.embedUrl).toContain('youtube-nocookie.com/embed/abcDEF12345');
  });
  it('reads Vimeo and Facebook', () => {
    expect(parseVideoLink('https://vimeo.com/123456789')).toMatchObject({ provider: 'VIMEO', id: '123456789' });
    expect(parseVideoLink('https://player.vimeo.com/video/123456789')).toMatchObject({ provider: 'VIMEO' });
    expect(parseVideoLink('https://www.facebook.com/extas/videos/1234567890/')).toMatchObject({ provider: 'FACEBOOK' });
    expect(parseVideoLink('https://fb.watch/abc123/')).toMatchObject({ provider: 'FACEBOOK' });
  });
  it('refuses anything else', () => {
    for (const u of ['', 'https://example.com/video.mp4', 'https://www.youtube.com/', 'javascript:alert(1)', 'https://evil.com/?u=youtube.com/watch?v=abcDEF12345x']) {
      expect(parseVideoLink(u)).toBeNull();
    }
  });
  it('writes lengths the way search engines read them', () => {
    expect([isoDuration(15), isoDuration(90), isoDuration(3600), isoDuration(3725), isoDuration(0)]).toEqual(['PT15S', 'PT1M30S', 'PT1H', 'PT1H2M5S', 'PT0S']);
  });
});

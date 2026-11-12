// S12 · PR 529 — the source-link research writer's pure rules: why "Write from a link" is blocked, and which
// addresses `allowedHosts` lets through.
import { describe, expect, it } from 'vitest';
import { JournalError } from './journal';
import { allowedSourceUrl, sourceWriterBlock } from './source-link';

describe('sourceWriterBlock (PR 529)', () => {
  const base = { aiOn: true, enabled: true, used: 0, dailyMax: 6 };

  it('blocks on AI off for the shop first, then the feature off, then the daily count — else open', () => {
    expect(sourceWriterBlock({ ...base, aiOn: false, enabled: false })).toBe('aiOff');
    expect(sourceWriterBlock({ ...base, enabled: false })).toBe('off');
    expect(sourceWriterBlock({ ...base, used: 6 })).toBe('limit');
    expect(sourceWriterBlock({ ...base, used: 7 })).toBe('limit');
    expect(sourceWriterBlock(base)).toBeNull();
  });
});

const err = (f: () => unknown): string => {
  try {
    f();
    return 'ok';
  } catch (e) {
    return (e as JournalError).code;
  }
};

describe('allowedSourceUrl (PR 529)', () => {
  it('accepts any host when allowedHosts is empty, and keeps the hash off', () => {
    const u = allowedSourceUrl('https://news.example.com/a/story#section-2', []);
    expect(u.toString()).toBe('https://news.example.com/a/story');
  });

  it('allows an exact host or a subdomain of an allowed host; refuses any other host', () => {
    expect(err(() => allowedSourceUrl('https://example.com/a', ['example.com']))).toBe('ok');
    expect(err(() => allowedSourceUrl('https://blog.example.com/a', ['example.com']))).toBe('ok');
    expect(err(() => allowedSourceUrl('https://notexample.com/a', ['example.com']))).toBe('HOST_NOT_ALLOWED');
    expect(err(() => allowedSourceUrl('https://other.test/a', ['example.com']))).toBe('HOST_NOT_ALLOWED');
  });

  it('refuses a non-http(s) address, a user name or password in the address, and plain unparseable text', () => {
    expect(err(() => allowedSourceUrl('ftp://example.com/a', []))).toBe('HOST_NOT_ALLOWED');
    expect(err(() => allowedSourceUrl('https://user:pw@example.com/a', []))).toBe('HOST_NOT_ALLOWED');
    expect(err(() => allowedSourceUrl('not a url', []))).toBe('HOST_NOT_ALLOWED');
  });

  it('matches the host case-insensitively and ignores a trailing dot', () => {
    expect(err(() => allowedSourceUrl('https://EXAMPLE.com./a', ['example.com']))).toBe('ok');
  });
});

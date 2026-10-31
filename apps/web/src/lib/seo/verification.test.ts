// S11 · PR 233 — a pasted tag becomes its code; the pages' meta tags; the shop's property among the engine's.
import { describe, expect, it } from 'vitest';
import { propertyFor, verificationCode, verificationLines, verificationMetadata, verificationTags } from './verification';

describe('Website › SEO › Search Console and Bing verification (PR 233)', () => {
  it('takes the code out of the tag the engine shows, or keeps a bare code', () => {
    expect(verificationCode('<meta name="google-site-verification" content="abcDEF123_-xyz7890" />')).toBe('abcDEF123_-xyz7890');
    expect(verificationCode("<meta name='msvalidate.01' content='0123456789ABCDEF' />")).toBe('0123456789ABCDEF');
    expect(verificationCode('  abcDEF123_-xyz7890 ')).toBe('abcDEF123_-xyz7890');
    expect(verificationLines('<meta content="one-code-1234" />\n\n two-code-5678 \n')).toEqual(['one-code-1234', 'two-code-5678']);
  });

  it('the pages carry each code as its own meta tag, nothing while none is set', () => {
    expect(verificationMetadata({ google: [], bing: [] })).toBeUndefined();
    expect(verificationMetadata({ google: ['g-code-12345'], bing: [] })).toEqual({ google: ['g-code-12345'] });
    expect(verificationMetadata({ google: [], bing: ['B1234567890'] })).toEqual({ other: { 'msvalidate.01': ['B1234567890'] } });
    expect(verificationTags({ google: ['g-code-12345'], bing: ['B1234567890'] })).toEqual([
      '<meta name="google-site-verification" content="g-code-12345" />',
      '<meta name="msvalidate.01" content="B1234567890" />',
    ]);
  });

  it("finds the shop's property: the same address, else the whole domain", () => {
    const o = new URL('https://www.shop.example.test');
    expect(propertyFor(['https://other.example.test/', 'https://www.shop.example.test/'], o)).toBe('https://www.shop.example.test/');
    expect(propertyFor(['sc-domain:shop.example.test'], o)).toBe('sc-domain:shop.example.test');
    expect(propertyFor(['https://shop.example.test/'], o)).toBeNull();
    expect(propertyFor([], o)).toBeNull();
  });
});

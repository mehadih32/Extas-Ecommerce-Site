// S11 · PR 588 — the gate's page keys (the same the pages pass to shopMetadata) and who is sent to the English twin.
import { describe, expect, it } from 'vitest';
import { bengaliPageKey, sendToEnglish } from './bengali-gate';

describe('bengaliPageKey', () => {
  it('names each content page as the pages do', () => {
    expect(bengaliPageKey('/', '/p/')).toBe('home');
    expect(bengaliPageKey('/collections/polos?sort=new', '/p/')).toBe('collections/polos');
    expect(bengaliPageKey('/help/delivery', '/p/')).toBe('help-delivery');
    expect(bengaliPageKey('/p/blue-polo', '/p/')).toBe('p/blue-polo');
    expect(bengaliPageKey('/p/blue-polo/navy', '/p/')).toBe('p/blue-polo');
    expect(bengaliPageKey('/item/blue-polo', '/item/')).toBe('item/blue-polo');
    expect(bengaliPageKey('/combo/polo-navy-white-2-piece', '/p/')).toBe('combo/polo-navy-white-2-piece');
    expect(bengaliPageKey('/combos', '/p/')).toBe('combos');
    expect(bengaliPageKey('/combos/build-your-own/tops', '/p/')).toBe('combos/build-your-own');
    expect(bengaliPageKey('/combos/polo-pairs', '/p/')).toBe('combos/polo-pairs');
  });
  it('leaves the pages that are not content alone', () => {
    for (const p of ['/bag', '/checkout', '/checkout/pay/1', '/account', '/account/orders/1', '/search', '/pay/abc', '/wishlist', '/p']) expect(bengaliPageKey(p, '/p/'), p).toBeNull();
  });
});

describe('sendToEnglish', () => {
  const base = { lang: 'bn', bengaliOn: true, gate: { notReady: 'english' as const }, ready: ['home'], key: 'p/blue-polo' as string | null };
  it('only while the owner chose it, for a Bengali content page not ready', () => {
    expect(sendToEnglish(base)).toBe(true);
    expect(sendToEnglish({ ...base, key: 'home' })).toBe(false);
    expect(sendToEnglish({ ...base, gate: { notReady: 'unlisted' } })).toBe(false);
    expect(sendToEnglish({ ...base, lang: 'en' })).toBe(false);
    expect(sendToEnglish({ ...base, key: null })).toBe(false);
    expect(sendToEnglish({ ...base, bengaliOn: false })).toBe(false);
  });
});

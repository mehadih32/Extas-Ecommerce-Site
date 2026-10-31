// S21 · PR 423 — the recorder's pure rules: anonymous addresses and messages, the journey step, the cause and how urgent.
import { describe, expect, it } from 'vitest';
import { browserOf, deviceOf, fingerprintOf, judge, pathPattern, scrub, stepOf, worse } from './kinds';

const P = '/p/';

describe('pathPattern', () => {
  it('drops the origin, query, fragment and language, and masks the changing part', () => {
    expect(pathPattern('https://shop.example/bn/p/blue-polo?utm=1#top', P)).toBe('/p/:x');
    expect(pathPattern('/collections/polos', P)).toBe('/collections/:x');
    expect(pathPattern('/account/orders/EX-10023', P)).toBe('/account/orders/:x');
    expect(pathPattern('/checkout/pay/10023', P)).toBe('/checkout/pay/:x');
    expect(pathPattern('/pay/abcdef0123456789abcdef', P)).toBe('/pay/:x');
    expect(pathPattern('/bn', P)).toBe('/');
    expect(pathPattern('/checkout', P)).toBe('/checkout');
  });
  it('masks id-like segments anywhere, and a combo rule but not the set builder', () => {
    expect(pathPattern('/help/12345', P)).toBe('/help/:x');
    expect(pathPattern('/combos/eid-offer', P)).toBe('/combos/:x');
    expect(pathPattern('/combos/build-your-own', P)).toBe('/combos/build-your-own');
  });
  it('follows the product prefix setting', () => {
    expect(pathPattern('/item/blue-polo', '/item/')).toBe('/item/:x');
    expect(pathPattern('/item/blue-polo', P)).toBe('/item/blue-polo');
  });
});

describe('stepOf', () => {
  it('names the journey step of a pattern', () => {
    expect(stepOf('/', P)).toBe('landing');
    expect(stepOf('/bag', P)).toBe('bag');
    expect(stepOf('/checkout/pay/:x', P)).toBe('checkout');
    expect(stepOf('/pay/:x', P)).toBe('checkout');
    expect(stepOf('/account/orders/:x', P)).toBe('tracking');
    expect(stepOf('/account', P)).toBe('account');
    expect(stepOf('/p/:x', P)).toBe('product');
    expect(stepOf('/collections/:x', P)).toBe('browse');
    expect(stepOf('/search', P)).toBe('browse');
    expect(stepOf('/something', P)).toBe('other');
  });
});

describe('scrub', () => {
  it('leaves nothing personal: no query, e-mail or run of digits', () => {
    const out = scrub('Failed https://shop.example/api/x?phone=01712345678 for a.b@mail.com  call +880 1712-345678 now');
    expect(out).toBe('Failed https://shop.example/api/x for # call # now');
    expect(out).not.toMatch(/\d{4}/);
  });
  it('is cut short', () => {
    expect(scrub('x'.repeat(500))).toHaveLength(200);
  });
});

describe('fingerprintOf', () => {
  it('groups the same cause whatever its numbers, and splits other kinds or pages', () => {
    const a = fingerprintOf('script_error', '/p/:x', 'Cannot read 12 of undefined');
    expect(fingerprintOf('script_error', '/p/:x', 'cannot read 99 of undefined')).toBe(a);
    expect(fingerprintOf('request_failed', '/p/:x', 'Cannot read 12 of undefined')).not.toBe(a);
    expect(fingerprintOf('script_error', '/bag', 'Cannot read 12 of undefined')).not.toBe(a);
  });
});

describe('deviceOf / browserOf', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  const android = 'Mozilla/5.0 (Linux; Android 14; SM-A146B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0 Mobile Safari/537.36';
  const tab = 'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
  const edge = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0';
  it('names only the family', () => {
    expect([deviceOf(iphone), browserOf(iphone)]).toEqual(['phone', 'safari']);
    expect([deviceOf(android), browserOf(android)]).toEqual(['phone', 'samsung']);
    expect([deviceOf(tab), browserOf(tab)]).toEqual(['tablet', 'chrome']);
    expect([deviceOf(edge), browserOf(edge)]).toEqual(['desktop', 'edge']);
    expect(browserOf('')).toBe('other');
  });
});

describe('judge', () => {
  it('is urgent for a break on the bag or checkout, or one that hit many visitors', () => {
    expect(judge('request_failed', 'checkout', 1, 5)).toBe('URGENT');
    expect(judge('form_stuck', 'bag', 1, 5)).toBe('URGENT');
    expect(judge('script_error', 'product', 5, 5)).toBe('URGENT');
  });
  it('is important for another break, a broken picture, or anything that hit many', () => {
    expect(judge('script_error', 'product', 1, 5)).toBe('IMPORTANT');
    expect(judge('broken_image', 'browse', 1, 5)).toBe('IMPORTANT');
    expect(judge('slow_load', 'landing', 9, 5)).toBe('IMPORTANT');
  });
  it("PR 415: the server's own failure is a break, urgent on the money steps", () => {
    expect(judge('server_error', 'checkout', 1, 5)).toBe('URGENT');
    expect(judge('server_error', 'bag', 1, 5)).toBe('URGENT');
    expect(judge('server_error', 'other', 1, 5)).toBe('IMPORTANT');
  });
  it('can wait when it is only slow or annoying for a few', () => {
    expect(judge('slow_request', 'checkout', 1, 5)).toBe('CAN_WAIT');
    expect(judge('rage_click', 'product', 2, 5)).toBe('CAN_WAIT');
  });
  it('worse keeps the more urgent', () => {
    expect(worse('CAN_WAIT', 'URGENT')).toBe('URGENT');
    expect(worse('IMPORTANT', 'CAN_WAIT')).toBe('IMPORTANT');
  });
});

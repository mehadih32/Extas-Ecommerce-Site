// PR 105–114 — the bag's pure helpers: the cookies, the badge, the words that depend on a number or a list, the
// reassurance lines (CN-018), the panel's delivery line (PR 106: never "add ৳X more"), and both languages' bag words.
import { describe, expect, it } from 'vitest';
import { SHOP_DICTS, keysOf, shopT } from './dict';
import { badgeCount, bagCookie, BAG_COOKIE, inSentence, listText, panelDeliveryLine, plural, reassurance } from './bag-model';

describe('PR 105 · the bag cookies and the badge', () => {
  it('HttpOnly, Secure, SameSite=Lax (a customer back from a Facebook link finds the same bag), kept for the days asked', () => {
    expect(bagCookie(BAG_COOKIE, 'abc_DEF-123', 30)).toBe('__Host-extas_bag=abc_DEF-123; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000');
    expect(bagCookie('x', 'a b', 0)).toContain('x=a%20b;');
  });
  it('the badge is a whole number 0–99; anything else is 0', () => {
    expect(badgeCount('3')).toBe(3);
    expect(badgeCount('250')).toBe(99);
    for (const bad of [null, undefined, '', '-1', '1.5', 'x', '9999999']) expect(badgeCount(bad)).toBe(0);
  });
});

describe('PR 107 · words that depend on a number or a list', () => {
  const en = shopT('en');
  const bn = shopT('bn');
  it('one item, many items, in both languages', () => {
    expect(plural(en, 'bag.count', 1, String)).toBe('1 item');
    expect(plural(en, 'bag.count', 3, String)).toBe('3 items');
    expect(plural(bn, 'bag.count', 3, String)).toBe('3টি পণ্য');
  });
  it('"M and L", "S, M and L"; the category in a sentence', () => {
    expect(listText(['M'], ' and ')).toBe('M');
    expect(listText(['M', 'L'], ' and ')).toBe('M and L');
    expect(listText(['S', 'M', 'L'], ' ও ')).toBe('S, M ও L');
    expect(inSentence('Polos', 'en')).toBe('polos');
    expect(inSentence('পোলো', 'bn')).toBe('পোলো');
  });
});

describe('CN-018 · a reassurance line shows only when a setting or flag backs it', () => {
  it('each line follows its own switch', () => {
    expect(reassurance({ cod: true, exchange: false }, { securePayment: false, originalLine: false })).toEqual({ cod: true, exchange: false, secure: false, original: false });
  });
  it('PR 106 · the panel never says "add ৳X more": free, or Cash on Delivery and exchange when they are on, or nothing', () => {
    expect(panelDeliveryLine(true, { cod: false, exchange: false })).toBe('free');
    expect(panelDeliveryLine(false, { cod: true, exchange: true })).toBe('codExchange');
    expect(panelDeliveryLine(false, { cod: true, exchange: false })).toBe('cod');
    expect(panelDeliveryLine(false, { cod: false, exchange: true })).toBe('exchange');
    expect(panelDeliveryLine(false, { cod: false, exchange: false })).toBeNull();
    const panel = keysOf(SHOP_DICTS.en).filter((k) => k.startsWith('bag.panel.'));
    for (const k of panel) expect(shopT('en')(k), k).not.toMatch(/more for free|add .* more/i);
  });
});

describe('PR 107 · the bag speaks both languages', () => {
  it('every bag word exists in English and in Bengali', () => {
    const en = keysOf(SHOP_DICTS.en).filter((k) => k.startsWith('bag.'));
    const bn = keysOf(SHOP_DICTS.bn).filter((k) => k.startsWith('bag.'));
    expect(en.length).toBeGreaterThan(100);
    expect(bn.sort()).toEqual(en.sort());
  });
  it('each code refusal the engine can give has its own words (SIM-F-009: members-only says so)', () => {
    for (const r of ['UNKNOWN', 'OFF', 'NOT_STARTED', 'ENDED', 'USED_UP', 'PER_CUSTOMER', 'MEMBERS_ONLY', 'GUESTS_ONLY', 'FIRST_ORDER_ONLY', 'RULE_NOT_LIVE', 'REFERRAL']) {
      for (const lang of ['en', 'bn'] as const) expect(shopT(lang).has(`bag.code.r.${r}`), `${lang} ${r}`).toBe(true);
    }
    expect(shopT('en')('bag.code.r.MEMBERS_ONLY', { code: 'VIP' })).toBe('The code VIP is for members. Log in to use it.');
    // PR 213 follow-up (SIM-F-050): "guests only" checks only the log-in, so it never claims "new customers"; the
    // first-order code (order history by phone) is the one that says so
    for (const lang of ['en', 'bn'] as const) expect(shopT(lang)('bag.code.r.GUESTS_ONLY', { code: 'X' })).not.toMatch(/new customer|নতুন ক্রেতা/i);
    expect(shopT('en')('bag.code.r.FIRST_ORDER_ONLY', { code: 'WELCOME100' })).toMatch(/first order/);
  });
});

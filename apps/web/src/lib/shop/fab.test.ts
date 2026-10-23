// PR 70 — the floating WhatsApp button: off by default (Note 3.1), a per-page switch, never without the number.
import { shopMoreSettings } from '@extas/settings';
import { describe, expect, it } from 'vitest';
import { fabClass, fabPage, fabShows } from './fab';

const set = shopMoreSettings['shell.fab'].default;
const on = { ...set, on: true };

describe('the floating WhatsApp button', () => {
  it('knows the kind of every page', () => {
    expect(fabPage('/', 'p')).toBe('home');
    expect(fabPage('/bag', 'p')).toBe('bag');
    expect(fabPage('/collections/polos', 'p')).toBe('category');
    expect(fabPage('/p/essential-pique-polo/navy', 'p')).toBe('product');
    expect(fabPage('/products/x', '/products/')).toBe('product');
    expect(fabPage('/help/faq', 'p')).toBe('help');
    expect(fabPage('/account/wishlist', 'p')).toBe('wishlist');
    expect(fabPage('/account/orders', 'p')).toBe('account');
    expect(fabPage('/combos', 'p')).toBe('other');
    expect(fabPage('/pay', 'p')).toBe('other');
  });

  it('is off by default; when on, never on the home page, the product page (demo FAB_PAGES) or the bag (C3, §49.4)', () => {
    expect(fabShows(set, 'category', 'https://wa.me/8801')).toBe(false);
    expect(fabShows(on, 'category', 'https://wa.me/8801')).toBe(true);
    expect(fabShows(on, 'home', 'https://wa.me/8801')).toBe(false);
    expect(fabShows(on, 'product', 'https://wa.me/8801')).toBe(false);
    expect(fabShows(on, 'bag', 'https://wa.me/8801')).toBe(false);
  });

  it('never shows without the store number', () => {
    expect(fabShows(on, 'category', null)).toBe(false);
  });

  it('sits low-right by default (F #62), or left / in the middle', () => {
    expect(fabClass(set)).toBe('wa-fab');
    expect(fabClass({ side: 'left', place: 'middle' })).toBe('wa-fab wa-left wa-mid');
  });
});

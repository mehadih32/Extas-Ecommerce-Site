// PR 624: the Messenger button's link — nothing while off, with no Page or for a place not ticked; the Page from the
// setting (or the Facebook link when allowed); the ref names the place and what was looked at, in Messenger's letters.
import { registry } from '@extas/settings';
import { describe, expect, it } from 'vitest';
import { messengerHref, messengerLink, messengerRef } from './messenger';

const OFF = registry['support.messengerButton'].default;
const ON = { ...OFF, enabled: true };

describe('Messenger button link', () => {
  it('off as it ships, or no Page, or the place not ticked: no button', () => {
    expect(messengerLink(OFF, { page: 'extas.sample', facebook: null, place: 'header', lang: 'en' })).toBeNull();
    expect(messengerLink(ON, { page: null, facebook: null, place: 'header', lang: 'en' })).toBeNull();
    expect(messengerLink(ON, { page: '', facebook: 'https://example.com/x', place: 'header', lang: 'en' })).toBeNull();
    expect(messengerLink({ ...ON, places: ['product'] }, { page: 'extas.sample', facebook: null, place: 'header', lang: 'en' })).toBeNull();
    expect(messengerLink({ ...ON, useFacebookLink: false }, { page: null, facebook: 'https://www.facebook.com/extas.sample', place: 'header', lang: 'en' })).toBeNull();
  });

  it("built from the setting: the Page's m.me address, the ref, the words in the shop's language", () => {
    expect(messengerLink(ON, { page: 'extas.sample', facebook: null, place: 'product', lang: 'bn', detail: 'polo-shirt' })).toEqual({
      href: 'https://m.me/extas.sample?ref=product-polo-shirt',
      label: OFF.label.bn,
      hint: OFF.hint.bn,
    });
    expect(messengerLink(ON, { page: null, facebook: 'https://www.facebook.com/extas.sample/', place: 'contact', lang: 'en' })?.href).toBe('https://m.me/extas.sample?ref=contact');
    expect(messengerLink({ ...ON, sendRef: false }, { page: 'extas.sample', facebook: null, place: 'order', lang: 'en', detail: 'EX1001' })?.href).toBe('https://m.me/extas.sample');
    expect(messengerLink({ ...ON, label: { en: 'Message us', bn: '' } } as typeof ON, { page: '100012345678', facebook: null, place: 'help', lang: 'bn' })?.label).toBe('Message us');
  });

  it("the ref keeps Messenger's letters only and stays short", () => {
    expect(messengerRef('order', 'EX-1001')).toBe('order-EX-1001');
    expect(messengerRef('help', 'ডেলিভারি / খরচ')).toBe('help');
    expect(messengerRef('product', 'polo shirt?x=1&y=<2>')).toBe('product-polo_shirt_x_1_y_2');
    expect(messengerRef('header')).toBe('header');
    expect(messengerRef('product', 'x'.repeat(300))).toHaveLength(120);
    expect(messengerHref('extas.sample', 'a b')).toBe('https://m.me/extas.sample?ref=a%20b');
  });
});

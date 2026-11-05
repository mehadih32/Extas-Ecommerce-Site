// PR 624: a tap's channel from the link's address and its place from where it sat or the page it was on.
import { describe, expect, it } from 'vitest';
import { tapChannelOf, tapPlaceOf } from './support-taps-model';

describe('support button taps', () => {
  it('the channel: Messenger, WhatsApp or a call; any other link is none', () => {
    expect(tapChannelOf('https://m.me/extas.sample?ref=header')).toBe('messenger');
    expect(tapChannelOf('https://wa.me/8801700000000?text=hi')).toBe('whatsapp');
    expect(tapChannelOf('https://api.whatsapp.com/send?phone=1')).toBe('whatsapp');
    expect(tapChannelOf('tel:+8801700000000')).toBe('call');
    for (const other of ['https://facebook.com/x', 'https://m.me.evil.example/x', 'http://m.me/x', '/help/contact', '', null]) expect(tapChannelOf(other)).toBeNull();
  });

  it('the place: the disc, the menu and the header first, then the page in either language', () => {
    const at = (path: string, w: Partial<{ inHeader: boolean; inMenu: boolean; inFab: boolean }> = {}) => tapPlaceOf({ inHeader: false, inMenu: false, inFab: false, path, productPrefix: '/p', ...w });
    expect(at('/p/polo', { inFab: true })).toBe('fab');
    expect(at('/p/polo', { inHeader: true, inMenu: true })).toBe('menu');
    expect(at('/p/polo', { inHeader: true })).toBe('header');
    expect(at('/p/polo/navy')).toBe('product');
    expect(at('/bn/p/polo?color=navy')).toBe('product');
    expect(at('/help/contact')).toBe('contact');
    expect(at('/bn/help/contact/')).toBe('contact');
    expect(at('/help/delivery')).toBe('help');
    expect(at('/account/orders/EX1001')).toBe('order');
    expect(at('/account/orders')).toBe('other');
    expect(at('/')).toBe('other');
    expect(at('/products/x')).toBe('other');
    expect(tapPlaceOf({ inHeader: false, inMenu: false, inFab: false, path: '/x/y', productPrefix: '' })).toBe('other');
  });
});

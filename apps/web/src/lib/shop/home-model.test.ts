import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { colourName, photoFor, productName } from './catalogue';
import { shopT } from './dict';
import { DRAWN_GARMENTS, drawingBackground, garmentArt, isLight, mixHex, safeHex } from './garment-art';
import { cardBadge, cardSwatches, heroButtonClass, heroButtons, heroTrust, homeSectionsOn, productPath, sentences, starFills } from './home-model';
import type { Flags } from './shell-model';

const hero = registry['home.hero'].default;
const none: Flags = { cod: false, freeDelivery: false, exchange: false, whatsapp: false, hotline: false, signupList: false };
const all: Flags = { cod: true, freeDelivery: true, exchange: true, whatsapp: true, hotline: true, signupList: true };
const en = shopT('en');
const bn = shopT('bn');
const num = (n: number) => String(n);

describe('home sections (PR 41)', () => {
  it('draws the sections switched on, in the owner\'s order', () => {
    expect(homeSectionsOn(registry['home.sections'].default)).toEqual([
      'hero', 'festive', 'categories', 'new-in', 'sets', 'size-finder', 'flash-sale', 'shop-the-look', 'reviews', 'journal',
    ]);
    expect(homeSectionsOn([{ id: 'reviews', on: true }, { id: 'hero', on: true }, { id: 'new-in', on: false }])).toEqual(['reviews', 'hero']);
  });
});

describe('the hero (PR 41)', () => {
  it('has the demo\'s two buttons: Shop now (fill) and Shop sets (the v3 brand tint)', () => {
    const b = heroButtons(hero, en, {});
    expect(b.map((x) => x.label)).toEqual(['Shop now', 'Shop sets']);
    expect(b[0]!.className).toBe('btn hm-btn-light');
    expect(b[1]!.className).toBe('btn hm-btn-line hm-sets-v3');
  });

  it('links stay in the shopper\'s language and a switched-off button is gone', () => {
    expect(heroButtons(hero, bn, {}).map((x) => x.href)).toEqual(['/bn/collections/new-in', '/bn/combos']);
    const one = { ...hero, buttons: hero.buttons.map((x, i) => ({ ...x, on: i === 0 })) };
    expect(heroButtons(one, en, {})).toHaveLength(1);
  });

  it('every button look of the demo stays selectable', () => {
    expect(heroButtonClass('line', 'v3')).toBe('btn hm-btn-line');
    expect(heroButtonClass('sets', 'v1')).toBe('btn hm-btn-line hm-sets-v1');
    expect(heroButtonClass('sets', 'current')).toBe('btn hm-btn-line hm-sets-current');
  });

  it('promise lines wait for their rule (COD, exchange) and carry the exchange hours', () => {
    expect(heroTrust(hero, none, en, { windowHours: '72' })).toEqual([]);
    const t = heroTrust(hero, all, en, { windowHours: '72' });
    expect(t.map((x) => x.text)).toEqual(['Cash on Delivery all over Bangladesh', '72-hour size exchange']);
    expect(t[1]!.desk).toBe('72-hour easy exchange for size or fault');
    expect(t[0]!.desk).toBe(t[0]!.text);
    expect(heroTrust(hero, { ...none, exchange: true }, en, { windowHours: '72' }).map((x) => x.id)).toEqual(['exchange']);
  });

  it('splits the line under the title into sentences (Latin and Bengali full stops)', () => {
    expect(sentences('Hoodies, sweatshirts and jackets. 39 new styles, built for Bangladeshi winters.')).toEqual([
      'Hoodies, sweatshirts and jackets.',
      '39 new styles, built for Bangladeshi winters.',
    ]);
    expect(sentences('হুডি আর জ্যাকেট। নতুন স্টাইল।')).toEqual(['হুডি আর জ্যাকেট।', 'নতুন স্টাইল।']);
    expect(sentences('One line')).toEqual(['One line']);
  });
});

describe('product cards (PR 41)', () => {
  it('a saving badge only when the honesty rule gave a struck price, else the first tag', () => {
    expect(cardBadge({ priceMinor: 150000, wasMinor: 200000, badge: 'New' }, en, num)).toEqual({ text: '−25%', sale: true });
    expect(cardBadge({ priceMinor: 150000, wasMinor: null, badge: 'New' }, en, num)).toEqual({ text: 'New', sale: false });
    expect(cardBadge({ priceMinor: 150000, wasMinor: 150000, badge: null }, en, num)).toBeNull();
  });

  it('four swatches, then "+N"', () => {
    const c = (k: string) => ({ key: k, nameEn: k, nameBn: null, hex: '#000000' });
    expect(cardSwatches([c('a'), c('b')])).toEqual({ shown: [c('a'), c('b')], more: 0 });
    const six = cardSwatches(['a', 'b', 'c', 'd', 'e', 'f'].map(c));
    expect(six.shown).toHaveLength(4);
    expect(six.more).toBe(2);
  });

  it('the product address follows the owner\'s prefix', () => {
    expect(productPath('/p', 'pocket-tee')).toBe('/p/pocket-tee');
    expect(productPath('/product/', 'pocket-tee')).toBe('/product/pocket-tee');
  });

  it('names and photos fall back sensibly', () => {
    expect(productName({ nameEn: 'Polo', nameBn: 'পোলো' }, 'bn')).toBe('পোলো');
    expect(productName({ nameEn: 'Polo', nameBn: null }, 'bn')).toBe('Polo');
    expect(colourName({ nameEn: 'Navy', nameBn: null }, 'en')).toBe('Navy');
    const img = { ratio: { width: 4, height: 5 } } as never;
    expect(photoFor({ photos: { navy: img } }, 'navy')).toBe(img);
    expect(photoFor({ photos: { '*': img } }, 'navy')).toBe(img);
    expect(photoFor({ photos: {} }, 'navy')).toBeNull();
  });

  it('stars fill to the rounded rating', () => {
    expect(starFills(4.5)).toEqual([true, true, true, true, true]);
    expect(starFills(4.4)).toEqual([true, true, true, true, false]);
    expect(starFills(0)).toEqual([false, false, false, false, false]);
  });
});

describe('the garment drawing (PR 41)', () => {
  it('mixes colours and tells light from dark like the demo', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(isLight('#F4F2EC')).toBe(true);
    expect(isLight('#1F2A44')).toBe(false);
    expect(drawingBackground('#F4F2EC')).toBe(mixHex('#F4F2EC', '#EFEDE8', 0.55));
    expect(drawingBackground('#1F2A44')).toBe(mixHex('#1F2A44', '#EFEDE8', 0.8));
  });

  it('draws every garment type of the catalogue, and nothing for an unknown one', () => {
    for (const g of DRAWN_GARMENTS) expect(garmentArt(g, '#1F2A44')).toMatch(/^<g><path /);
    expect(garmentArt('accessory', '#1F2A44')).toBe('');
    expect(garmentArt(null, '#1F2A44')).toBe('');
    expect(garmentArt('polo', '#1F2A44', 'detail')).toContain('scale(2)');
  });

  it('never puts an unchecked colour into the drawing', () => {
    expect(safeHex('#1f2a44')).toBe('#1f2a44');
    expect(safeHex('red" onload="x')).toMatch(/^#[0-9A-F]{6}$/i);
    expect(garmentArt('tee', '"/><script>')).not.toContain('<script>');
  });
});

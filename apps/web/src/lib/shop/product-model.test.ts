// PR 49 — the product page's model: its address, the choice, the price it shows and the client model built from the
// catalogue's facts.
import { productSettings } from '@extas/settings';
import { describe, expect, it } from 'vitest';
import type { ProductData } from './product';
import {
  boldParts,
  colourPath,
  digitsOf,
  fillWords,
  isOneSize,
  keepSize,
  nameParts,
  NO_COLOUR,
  openingColour,
  priceFor,
  productRoute,
  stockOf,
  variantFor,
  type PdpModel,
  type PdpPrice,
} from './product-model';
import { toModel } from './product-view';

const price = (minor: number, was: string | null = null): PdpPrice => ({ minor, now: String(minor), was, pct: null, save: null });

const m: PdpModel = {
  productId: 'p1',
  name: 'Essential Piqué Polo',
  garment: 'polo',
  colours: [
    { key: 'navy', name: 'Navy', hex: '#123', note: null },
    { key: 'white', name: 'White', hex: '#fff', note: null },
  ],
  sizes: [
    { key: 'M', label: 'M' },
    { key: 'L', label: 'L' },
  ],
  variants: [
    { id: 'v1', colour: 'navy', size: 'M', stock: 0, price: 0 },
    { id: 'v2', colour: 'navy', size: 'L', stock: 2, price: 1 },
    { id: 'v3', colour: 'white', size: 'M', stock: 5, price: 0 },
    { id: 'v4', colour: 'white', size: 'L', stock: 1, price: 0 },
  ],
  prices: [price(1200), price(1100)],
  shots: {},
  chart: null,
  onSale: true,
};

describe('PR 49 · the product address', () => {
  it('the product and its colour address under the owner prefix; anything else is not a product page', () => {
    expect(productRoute('/p/essential-pique-polo', '/p')).toEqual({ slug: 'essential-pique-polo', colour: null });
    expect(productRoute('/p/essential-pique-polo/navy/', '/p/')).toEqual({ slug: 'essential-pique-polo', colour: 'navy' });
    expect(productRoute('/p/polo/navy/extra', '/p')).toBeNull();
    expect(productRoute('/p', '/p')).toBeNull();
    expect(productRoute('/shop/polo', '/p')).toBeNull();
    expect(productRoute('/p//navy', '/p')).toBeNull();
    expect(productRoute('/p/%E0%A6', '/p')).toBeNull();
    expect(productRoute('/item/a%20b', '/item')).toEqual({ slug: 'a b', colour: null });
  });

  it('a colour address is the product address plus the colour', () => {
    expect(colourPath('/p/polo/', 'sky blue')).toBe('/p/polo/sky%20blue');
  });
});

describe('PR 49 · the choice', () => {
  it('counts stock per colour and per size', () => {
    expect(stockOf(m, 'navy')).toBe(2);
    expect(stockOf(m, 'navy', 'M')).toBe(0);
    expect(stockOf(m, 'white', 'M')).toBe(5);
    expect(stockOf({ variants: [{ id: 'x', colour: null, size: null, stock: 4, price: 0 }] }, null)).toBe(4);
  });

  it('opens on the asked colour, else the first in stock, else the first', () => {
    expect(openingColour(m, 'white')).toBe('white');
    expect(openingColour(m, 'pink')).toBe('navy');
    const soldNavy = { ...m, variants: m.variants.map((v) => (v.colour === 'navy' ? { ...v, stock: 0 } : v)) };
    expect(openingColour(soldNavy, null)).toBe('white');
    const none = { ...m, variants: m.variants.map((v) => ({ ...v, stock: 0 })) };
    expect(openingColour(none, null)).toBe('navy');
    expect(openingColour({ ...m, colours: [] }, 'navy')).toBeNull();
  });

  it('a size sold out in the new colour is dropped; a one-size product always has its size', () => {
    expect(keepSize(m, 'navy', 'M')).toBeNull();
    expect(keepSize(m, 'navy', 'L')).toBe('L');
    expect(isOneSize({ sizes: [{ key: 'OS', label: 'One size' }] })).toBe(true);
    expect(keepSize({ ...m, sizes: [{ key: 'OS', label: 'One size' }] }, 'navy', null)).toBe('OS');
  });

  it('a variant is bought only when it is in stock and the product is on sale', () => {
    expect(variantFor(m, { colour: 'navy', size: 'L' })?.id).toBe('v2');
    expect(variantFor(m, { colour: 'navy', size: 'M' })).toBeNull();
    expect(variantFor(m, { colour: 'navy', size: null })).toBeNull();
    expect(variantFor({ ...m, onSale: false }, { colour: 'navy', size: 'L' })).toBeNull();
  });

  it('the price shown: the chosen variant, else the lowest in the colour', () => {
    expect(priceFor(m, { colour: 'navy', size: 'L' })?.minor).toBe(1100);
    expect(priceFor(m, { colour: 'navy', size: 'M' })?.minor).toBe(1200);
    expect(priceFor(m, { colour: 'navy', size: null })?.minor).toBe(1100);
    expect(priceFor(m, { colour: 'white', size: null })?.minor).toBe(1200);
    expect(priceFor({ ...m, variants: [] }, { colour: 'navy', size: null })).toBeNull();
  });
});

describe('PR 49 · the words of the head', () => {
  it('splits the title before its last word, fills slots, writes Bengali digits and finds the bold parts', () => {
    expect(nameParts('Essential Piqué Polo')).toEqual(['Essential Piqué ', 'Polo']);
    expect(nameParts('Polo')).toEqual(['', 'Polo']);
    expect(fillWords('Only {n} left in {colour} {x}', { n: 2, colour: 'Navy' })).toBe('Only 2 left in Navy {x}');
    expect(digitsOf(72, true)).toBe('৭২');
    expect(digitsOf('3.5', false)).toBe('3.5');
    expect(boldParts('**72-hour** size swap')).toEqual([
      { text: '72-hour', b: true },
      { text: ' size swap', b: false },
    ]);
    expect(boldParts('plain')).toEqual([{ text: 'plain', b: false }]);
  });
});

describe('PR 49 · the client model', () => {
  const data: ProductData = {
    id: 'p1',
    slug: 'polo',
    nameEn: 'Polo',
    nameBn: 'পোলো',
    garment: 'polo',
    category: null,
    state: 'live',
    reason: null,
    freeDelivery: false,
    tag: null,
    fit: null,
    fitNote: null,
    fabricEn: null,
    fabricBn: null,
    gsm: null,
    careEn: null,
    careBn: null,
    descriptionEn: null,
    descriptionBn: null,
    colours: [
      { key: 'navy', nameEn: 'Navy', nameBn: 'নেভি', hex: '#123', noteEn: 'Deep', noteBn: null },
      { key: 'red', nameEn: 'Red', nameBn: null, hex: '#f00', noteEn: null, noteBn: null },
    ],
    sizes: [
      { key: 'M', label: 'M' },
      { key: 'XL', label: 'XL' },
    ],
    variants: [
      { id: 'a', colour: 'navy', size: 'M', stock: 1, priceMinor: 1000, wasMinor: 1250 },
      { id: 'b', colour: 'navy', size: 'M', stock: 1, priceMinor: 1000, wasMinor: 1250 },
      { id: 'c', colour: 'navy', size: 'M', stock: 1, priceMinor: 900, wasMinor: 800 },
      { id: 'd', colour: 'red', size: 'XL', stock: 1, priceMinor: null, wasMinor: null },
    ],
    media: [],
    chart: { en: null, bn: null },
    ruleTexts: async () => [],
  };
  const words = { money: (n: number) => `Tk ${n}`, off: (p: number) => `-${p}%`, save: (a: string) => `Save ${a}` };
  const views = productSettings['pdp.gallery'].default.drawingViews;

  it('writes each price once, with the struck price only when it is higher', () => {
    const md = toModel(data, 'en', views, words);
    expect(md.prices).toEqual([
      { minor: 1000, now: 'Tk 1000', was: 'Tk 1250', pct: '-20%', save: 'Save Tk 250' },
      { minor: 900, now: 'Tk 900', was: null, pct: null, save: null },
    ]);
    expect(md.variants.map((v) => v.price)).toEqual([0, 0, 1]);
  });

  it('drops a colour or size with no priced variant, and speaks the page language', () => {
    const md = toModel(data, 'bn', views, words);
    expect(md.colours.map((c) => c.key)).toEqual(['navy']);
    expect(md.sizes.map((s) => s.key)).toEqual(['M']);
    expect(md.name).toBe('পোলো');
    expect(md.colours[0]).toMatchObject({ name: 'নেভি', note: 'Deep' });
    expect(md.shots.navy).toHaveLength(views.length);
    expect(md.onSale).toBe(true);
    expect(toModel({ ...data, state: 'ghost', colours: [] }, 'en', views, words).shots[NO_COLOUR]).toBeDefined();
    expect(toModel({ ...data, state: 'ghost' }, 'en', views, words).onSale).toBe(false);
  });
});

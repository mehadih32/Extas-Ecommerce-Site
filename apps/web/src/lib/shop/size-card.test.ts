// Follow-up 144 — the "Your size" card in For you (lib/shop/size-card).
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import type { GuideEntry } from './size-guide';
import { sizeCard } from './size-card';

const finder = registry['pdp.finder'].default;
const top: GuideEntry = {
  slug: 'polos',
  name: 'Polos',
  garment: 'polo',
  bottom: false,
  href: '/collections/polos',
  chart: {
    name: 'Polo',
    easeInch: 4,
    fields: [{ key: 'chest', label: 'Chest', howTo: null }],
    rows: [
      { size: 'M', inch: [40], cm: [102] },
      { size: 'L', inch: [42], cm: [107] },
      { size: 'XL', inch: [44], cm: [112] },
    ],
  },
  labels: { M: 'M', L: 'L', XL: 'XL' },
  finds: true,
};
const bottom: GuideEntry = {
  ...top,
  slug: 'trousers',
  garment: 'trouser',
  bottom: true,
  chart: {
    name: 'Chino',
    easeInch: 1,
    fields: [{ key: 'waist', label: 'Waist', howTo: null }],
    rows: [
      { size: '30', inch: [30], cm: [76] },
      { size: '32', inch: [32], cm: [81] },
      { size: '34', inch: [34], cm: [86] },
    ],
  },
  labels: { '30': '30', '32': '32', '34': '34' },
};

describe('the Your size card (follow-up 144)', () => {
  it('the kept height and weight give a top and a waist size on the shop`s own charts', () => {
    const c = sizeCard('67.68', finder, [top, bottom])!;
    expect(c.kept).toMatchObject({ ft: 5, inch: 7, kg: 68 });
    expect(c.kept!.top).toMatch(/^(M|L|XL)$/);
    expect(c.kept!.bottom).toMatch(/^(30|32|34)$/);
  });
  it('nothing kept (or a damaged cookie): "not saved yet"; no bottom chart: no waist', () => {
    expect(sizeCard(undefined, finder, [top, bottom])).toEqual({ kept: null });
    expect(sizeCard('x.y', finder, [top])).toEqual({ kept: null });
    expect(sizeCard('67.68', finder, [top])!.kept!.bottom).toBeNull();
  });
  it('no card with Find My Size off, nothing kept on the phone, or no chart the finder reads', () => {
    expect(sizeCard('67.68', { ...finder, on: false }, [top])).toBeNull();
    expect(sizeCard('67.68', { ...finder, remember: false }, [top])).toBeNull();
    expect(sizeCard('67.68', finder, [{ ...top, finds: false }])).toBeNull();
  });
});

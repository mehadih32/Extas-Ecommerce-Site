import { describe, expect, it } from 'vitest';
import { shippingSettings } from '@extas/settings';
import type { StickerParcel } from '@extas/shipping';
import { sampleParcel, stickerInput, stickerSize, stickerWords, type StickerContext } from './sticker';
import { fulfilDicts } from './i18n';

const layout = shippingSettings['delivery.sticker.layout'].default;
const exact = shippingSettings['delivery.sticker.exactAmount'].default;
const ctx = (over: Partial<StickerContext> = {}): StickerContext => ({ layout, exact, shopName: 'Sample Shop', shopPhone: '01700000000', ...over });

const parcel = (over: Partial<StickerParcel> = {}): StickerParcel => ({
  shipmentId: 's1',
  orderNumber: '1042',
  courierName: 'Practice courier',
  practice: true,
  consignmentId: '12345678',
  trackingCode: null,
  receiver: { name: 'Rahim', phone: '01711111111', address: 'House 4, Dhanmondi', addressLatin: null },
  collectMinor: 158_000,
  currency: 'BDT',
  items: [{ name: 'Linen shirt', colour: 'White', size: 'M', quantity: 1 }],
  gift: null,
  note: null,
  reprint: null,
  fixedSets: [],
  ...over,
});

describe('PR 179 · the sticker from a parcel and the owner\'s settings', () => {
  it('CN-018 (4): a Fixed set is named in the sticker\'s language', () => {
    const p = parcel({ fixedSets: [{ nameEn: 'Eid pair', nameBn: 'ঈদ জোড়া' }, { nameEn: 'Polo duo', nameBn: null }] });
    expect(stickerInput(p, ctx()).fixedSets).toEqual(['Eid pair', 'Polo duo']);
    expect(stickerInput(p, ctx({ layout: { ...layout, lang: 'bn' } })).fixedSets).toEqual(['ঈদ জোড়া', 'Polo duo']);
    for (const lang of ['en', 'bn'] as const) expect(stickerWords(lang).setWhole).toContain('{name}');
  });

  it('writes the amount to collect as the shop writes money, in Western digits', () => {
    expect(stickerInput(parcel(), ctx()).collect).toBe('৳1,580');
    expect(stickerInput(parcel({ collectMinor: 0 }), ctx()).collect).toBeNull();
  });

  it('CN-014b idea 10: the exact-amount line is off by default, and never on a paid parcel', () => {
    expect(stickerInput(parcel(), ctx()).exactLine).toBeNull();
    const on = { ...exact, enabled: true };
    expect(stickerInput(parcel(), ctx({ exact: on })).exactLine).toBe('Pay exactly ৳1,580. The rider may not ask for more.');
    expect(stickerInput(parcel(), ctx({ exact: { ...on, link: 'wa.me/8801700000000' } })).exactLine).toBe('Pay exactly ৳1,580. The rider may not ask for more. wa.me/8801700000000');
    expect(stickerInput(parcel({ collectMinor: 0 }), ctx({ exact: on })).exactLine).toBeNull();
    expect(stickerInput(parcel(), ctx({ exact: on, layout: { ...layout, lang: 'bn' } })).exactLine).toBe('ঠিক ৳1,580 দিন। ডেলিভারিম্যান এর বেশি চাইতে পারবেন না।');
  });

  it('the shop\'s name and phone only when the owner shows them', () => {
    expect(stickerInput(parcel(), ctx())).toMatchObject({ shopName: 'Sample Shop', shopPhone: '01700000000' });
    expect(stickerInput(parcel(), ctx({ layout: { ...layout, showShop: false } }))).toMatchObject({ shopName: null, shopPhone: null });
  });

  it('every size on offer has its millimetres; four to an A4 sheet are quarters of it', () => {
    expect(stickerSize(layout)).toEqual({ widthMm: 100, heightMm: 150, sheet: null });
    expect(stickerSize({ ...layout, size: 'a4x4' })).toEqual({ widthMm: 105, heightMm: 148.5, sheet: { widthMm: 210, heightMm: 297, across: 2, down: 2 } });
    expect(stickerSize({ ...layout, size: 'custom', customMm: { width: 80, height: 120 } })).toMatchObject({ widthMm: 80, heightMm: 120 });
    for (const size of ['100x150', '100x100', '75x100', 'a6', 'a5', 'a4x4', 'custom'] as const) expect(stickerSize({ ...layout, size }).widthMm).toBeGreaterThan(0);
  });

  it('has every sticker word and the sample in both languages', () => {
    for (const lang of ['en', 'bn'] as const) {
      for (const [k, v] of Object.entries(stickerWords(lang))) expect(v, `${lang} ${k}`).not.toMatch(/^ful\./);
      const s = sampleParcel(fulfilDicts[lang], 'BDT');
      expect(JSON.stringify(s)).not.toMatch(/ful\.sticker/);
      expect(s.collectMinor).toBeGreaterThan(0);
    }
  });
});

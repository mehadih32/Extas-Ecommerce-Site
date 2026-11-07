// PR 127 follow-up 215 — "Add a line" and "Remove" on one order's screen: every word in both admin languages; only with
// `orders.lines`, only on a Cash on Delivery order and only while the order service has the command open; "Remove" only
// on an active line added after the order was placed (a line that came with the order is changed through Edit); the
// dialog's SKU and "how many" read as the service's input. Sample values only.
import { describe, expect, it } from 'vitest';
import { adminDicts } from '../admin-i18n';
import type { AdminView } from '../admin-page';
import { addLineBody, lineSpecs, type LineItem } from './lines';

const view = (lang: 'en' | 'bn'): AdminView => ({ lang, dict: adminDicts[lang], locale: lang, timeZone: 'Asia/Dhaka', storeName: null });
const O = { id: '01a16af2-30f0-7462-aab8-719bb3ce5542', number: 'S-1042', version: 3, paymentMethod: 'COD' };
const ITEMS: LineItem[] = [
  { id: 'a1', status: 'ACTIVE', isAddOn: false, productName: 'Sample polo', lineTotal: '৳ 1,000' },
  { id: 'a2', status: 'ACTIVE', isAddOn: true, productName: 'Sample tee', lineTotal: '৳ 500' },
  { id: 'a3', status: 'REMOVED', isAddOn: true, productName: 'Sample cap', lineTotal: '৳ 300' },
];
const PERMS = new Set(['orders.lines']);
const words = (s: unknown): string[] => (typeof s === 'string' ? [s] : Array.isArray(s) ? s.flatMap(words) : s && typeof s === 'object' ? Object.values(s).flatMap(words) : []);

describe('follow-up 215 · Add a line and Remove on the order screen', () => {
  it('every word in both languages; Remove only on the active added line', () => {
    for (const lang of ['en', 'bn'] as const) {
      const { add, remove } = lineSpecs(view(lang), O, ['addLine', 'removeLine'], PERMS, ITEMS);
      expect(add).toMatchObject({ id: 'addLine', url: `/api/admin/orders/${O.id}/lines`, version: 3 });
      expect(Object.keys(remove)).toEqual(['a2']);
      expect(remove.a2).toMatchObject({ url: `/api/admin/orders/${O.id}/lines/a2/remove`, okTone: 'badf' });
      for (const w of words([add, remove])) expect(w, lang).not.toMatch(/^orders\.|\{[a-z]+\}/);
      expect(remove.a2!.effects.join(' ')).toContain('৳ 500');
      expect(add!.fields.map((f) => f.name)).toEqual(['sku', 'quantity']);
      expect(add!.fields[1]!.options!.length).toBe(20);
    }
  });

  it('nothing without the key, on a prepaid order, or while the service has the commands closed', () => {
    expect(lineSpecs(view('en'), O, ['addLine', 'removeLine'], new Set(['orders.read']), ITEMS)).toEqual({ add: null, remove: {} });
    expect(lineSpecs(view('en'), { ...O, paymentMethod: 'BKASH' }, ['addLine', 'removeLine'], PERMS, ITEMS)).toEqual({ add: null, remove: {} });
    expect(lineSpecs(view('en'), O, ['confirm'], PERMS, ITEMS)).toEqual({ add: null, remove: {} });
  });

  it('reads the dialog: a trimmed SKU, a whole number, else not a number', () => {
    expect(addLineBody({ sku: ' TEE-M ', quantity: '2' })).toEqual({ sku: 'TEE-M', variantId: null, quantity: 2 });
    expect(addLineBody({ variantId: 'v1' })).toEqual({ sku: null, variantId: 'v1', quantity: undefined });
    expect(addLineBody({ sku: 'X', quantity: 'two' }).quantity).toBeNaN();
    expect(addLineBody({ sku: '  ', quantity: 3 })).toEqual({ sku: null, variantId: null, quantity: 3 });
  });
});

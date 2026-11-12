// S28 · PR 664 — the order page's part of price adjust: the dialog's body, the dialog itself, the waiting-request line and the timeline words.
import { describe, expect, it } from 'vitest';
import type { PriceAdjustView } from '@extas/orders';
import { adminDicts } from '../admin-i18n';
import type { AdminView } from '../admin-page';
import { priceAdjustBody, priceAdjustSpec, priceEventLine, priceRequestBands } from './price-adjust';

const view = (lang: 'en' | 'bn'): AdminView => ({ lang, dict: adminDicts[lang], locale: lang, timeZone: 'Asia/Dhaka', storeName: null });
const ORDER = { id: '0190a0b0-0000-7000-8000-000000000001', number: 'EX-1001', version: 3, currency: 'BDT' };

const ADJ: PriceAdjustView = {
  enabled: true,
  canAdjust: true,
  canApprove: true,
  closed: null,
  limit: { amountMinor: 10_000, percent: 5 },
  reasons: [
    { key: 'customer-asked', en: 'Customer asked', bn: 'কাস্টমার চেয়েছে', noteRequired: false },
    { key: 'other', en: 'Other', bn: 'অন্য', noteRequired: true },
  ],
  dueMinor: 200_000,
  subtotalMinor: 190_000,
  deliveryChargeMinor: 6_000,
  walletBalanceMinor: 0,
  lines: [],
  pending: [
    {
      id: 'req-1',
      kind: 'AMOUNT',
      state: 'PENDING',
      percent: null,
      amountMinor: 20_000,
      reasonKey: 'customer-asked',
      note: null,
      requestId: null,
      requestedById: null,
      decidedById: null,
      pinChecked: false,
      totalBeforeMinor: 200_000,
      totalAfterMinor: 180_000,
      createdAt: new Date('2026-11-01T05:00:00Z'),
    },
  ],
} as unknown as PriceAdjustView;

describe('priceAdjustBody', () => {
  it('turns a typed taka amount into minor units', () => {
    expect(priceAdjustBody({ kind: 'AMOUNT', value: '50', reasonKey: 'x' }, 'BDT')).toMatchObject({ kind: 'AMOUNT', value: 5000 });
  });
  it('keeps a percent whole and refuses a decimal percent', () => {
    expect(priceAdjustBody({ kind: 'PERCENT', value: '10' }, 'BDT').value).toBe(10);
    expect(() => priceAdjustBody({ kind: 'PERCENT', value: '1.5' }, 'BDT')).toThrow();
  });
  it('sends no value for free delivery or an empty box (the whole wallet)', () => {
    expect('value' in priceAdjustBody({ kind: 'FREE_DELIVERY', value: '9' }, 'BDT')).toBe(false);
    expect('value' in priceAdjustBody({ kind: 'WALLET', value: '' }, 'BDT')).toBe(false);
  });
});

describe('priceAdjustSpec', () => {
  it('is hidden when the person cannot adjust', () => {
    expect(priceAdjustSpec(view('en'), ORDER, { ...ADJ, canAdjust: false })).toBeNull();
  });
  it('hides kinds that cannot apply (no wallet money, no delivery charge)', () => {
    const spec = priceAdjustSpec(view('en'), ORDER, { ...ADJ, deliveryChargeMinor: 0 });
    const kinds = spec?.fields.find((f) => f.name === 'kind');
    expect(kinds && 'options' in kinds ? kinds.options.map((o) => o.value) : []).toEqual(['AMOUNT', 'PERCENT']);
  });
  it('asks for the PIN as a hidden field, in both languages', () => {
    for (const l of ['en', 'bn'] as const) {
      const spec = priceAdjustSpec(view(l), ORDER, ADJ);
      expect(spec?.fields.find((f) => f.name === 'pin')).toMatchObject({ secret: true });
      expect(spec?.version).toBe(3);
    }
  });
});

describe('priceRequestBands', () => {
  it('gives approve and refuse only to a person who holds the approval key', () => {
    expect(priceRequestBands(view('en'), ORDER, ADJ)[0]?.specs.map((s) => s.id)).toEqual(['priceApprove-req-1', 'priceRefuse-req-1']);
    expect(priceRequestBands(view('en'), ORDER, { ...ADJ, canApprove: false })[0]?.specs).toEqual([]);
  });
  it('the approve form needs the PIN', () => {
    const approve = priceRequestBands(view('en'), ORDER, ADJ)[0]?.specs[0];
    expect(approve?.fields.find((f) => f.name === 'pin')).toMatchObject({ required: true, secret: true });
    expect(approve?.fixed).toEqual({ decision: 'approve' });
  });
});

describe('priceEventLine', () => {
  it('says what, why and the total before and after', () => {
    const line = priceEventLine(view('en'), { kind: 'AMOUNT', amountMinor: 5000, reason: { en: 'Customer asked', bn: 'x' }, totalBeforeMinor: 200_000, totalAfterMinor: 195_000 }, 'BDT');
    expect(line).toContain('Customer asked');
    expect(line).toContain('→');
  });
  it('is null for data without a kind', () => {
    expect(priceEventLine(view('en'), {}, 'BDT')).toBeNull();
  });
});

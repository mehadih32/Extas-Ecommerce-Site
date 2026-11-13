// S28 · PR 669 — the order page's part of the replacement case: the body the dialog sends, and when the button shows.
import { describe, expect, it } from 'vitest';
import type { ReplacementView } from '@extas/orders';
import { adminDicts } from '../admin-i18n';
import type { AdminView } from '../admin-page';
import { replaceBody, replaceSpec } from './replace';

const view = (lang: 'en' | 'bn'): AdminView => ({ lang, dict: adminDicts[lang], locale: lang, timeZone: 'Asia/Dhaka', storeName: null });
const ORDER = { id: '0190a0b0-0000-7000-8000-000000000001', number: 'EX-1001' };
const RV: ReplacementView = {
  enabled: true,
  canOpen: true,
  closed: null,
  hours: 168,
  oldPieceDays: 7,
  reasons: ['defect', 'damage', 'wrong'],
  rootCauses: [{ key: 'wrong-pick', en: 'Wrong pick', bn: 'ভুল তোলা' }],
  lines: [{ lineId: '0190a0b0-0000-7000-8000-000000000011', sku: 'S', name: 'Polo', colour: 'Sky', size: 'M', quantity: 1 }],
  endsAt: '2026-11-20T00:00:00.000Z',
};

describe('replaceBody', () => {
  it('sends the chosen line as the one item, the reason, the root cause and the note', () => {
    expect(replaceBody({ lineId: 'l1', reason: 'wrong', rootCause: 'wrong-pick', reasonNote: ' x ' })).toEqual({ reason: 'wrong', items: [{ orderItemId: 'l1' }], rootCause: 'wrong-pick', reasonNote: 'x' });
    expect(replaceBody({ lineId: 'l1', reason: 'defect', rootCause: '' })).toEqual({ reason: 'defect', items: [{ orderItemId: 'l1' }] });
  });
});

describe('replaceSpec', () => {
  it('shows only when the person may open one and a line is free', () => {
    expect(replaceSpec(view('en'), ORDER, RV)?.id).toBe('replace');
    expect(replaceSpec(view('en'), ORDER, { ...RV, canOpen: false })).toBeNull();
    expect(replaceSpec(view('en'), ORDER, { ...RV, lines: [] })).toBeNull();
  });
  it('offers the owner\'s reasons, a root cause only with "wrong", and says nothing is refunded', () => {
    const s = replaceSpec(view('en'), ORDER, RV)!;
    expect(s.fields.find((f) => f.name === 'reason')?.options?.map((o) => o.value)).toEqual(['defect', 'damage', 'wrong']);
    expect(s.fields.some((f) => f.name === 'rootCause')).toBe(true);
    expect(replaceSpec(view('en'), ORDER, { ...RV, reasons: ['defect'] })!.fields.some((f) => f.name === 'rootCause')).toBe(false);
    expect(s.effects.join(' ')).toMatch(/refund/i);
    expect(s.version).toBeNull();
  });
  it('builds in Bengali', () => {
    expect(replaceSpec(view('bn'), ORDER, RV)?.label).toBeTruthy();
  });
});

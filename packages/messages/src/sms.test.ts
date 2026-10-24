// S14 · PR 291 — the SMS rules without a database: how many parts a text takes (GSM 160/153, Bengali and other
// unicode 70/67), when the masking name is used, and what an SMS costs from the owner's part prices.
import { describe, expect, it } from 'vitest';
import { maskingSender, smsCostMinor, smsParts } from './pure';

describe('PR 291 · SMS parts', () => {
  it('plain English: 160 in one part, then 153 a part', () => {
    expect(smsParts('')).toEqual({ unicode: false, units: 0, parts: 0, perPart: 160 });
    expect(smsParts('a'.repeat(160))).toMatchObject({ unicode: false, parts: 1 });
    expect(smsParts('a'.repeat(161))).toMatchObject({ unicode: false, parts: 2, perPart: 153 });
    expect(smsParts('a'.repeat(306))).toMatchObject({ parts: 2 });
    expect(smsParts('a'.repeat(307))).toMatchObject({ parts: 3 });
  });

  it('the GSM extra signs take two units; a sign outside GSM (৳, Bengali) makes the whole SMS unicode', () => {
    expect(smsParts('{}')).toMatchObject({ unicode: false, units: 4 });
    expect(smsParts('a'.repeat(159) + '€')).toMatchObject({ unicode: false, units: 161, parts: 2 });
    expect(smsParts('Total ৳1,200')).toMatchObject({ unicode: true, parts: 1, perPart: 70 });
    expect(smsParts('অ'.repeat(70))).toMatchObject({ unicode: true, parts: 1 });
    expect(smsParts('অ'.repeat(71))).toMatchObject({ unicode: true, parts: 2, perPart: 67 });
    expect(smsParts('😀')).toMatchObject({ unicode: true, units: 2 });
  });
});

describe('PR 291 · masking name and cost', () => {
  const m = (state: string, useWhenApproved = true, senderName = 'SHOPNAME') => ({ senderName, state, useWhenApproved });
  it('the masking name only once approved, wanted and filled in', () => {
    expect(maskingSender(null)).toBeNull();
    expect(maskingSender(m('none'))).toBeNull();
    expect(maskingSender(m('requested'))).toBeNull();
    expect(maskingSender(m('rejected'))).toBeNull();
    expect(maskingSender(m('approved', false))).toBeNull();
    expect(maskingSender(m('approved', true, '  '))).toBeNull();
    expect(maskingSender(m('approved', true, ' SHOPNAME '))).toBe('SHOPNAME');
  });

  it('cost = the part price (masked or not) × the parts; an unknown price is no cost', () => {
    expect(smsCostMinor(2, null, false)).toBeNull();
    expect(smsCostMinor(2, { maskedMinor: 60, nonMaskedMinor: null }, false)).toBeNull();
    expect(smsCostMinor(2, { maskedMinor: 60, nonMaskedMinor: 35 }, false)).toBe(70);
    expect(smsCostMinor(3, { maskedMinor: 60, nonMaskedMinor: 35 }, true)).toBe(180);
  });
});

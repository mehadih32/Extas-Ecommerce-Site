import { describe, expect, it } from 'vitest';
import { latinDigits, phoneNormalizeBD } from './phone-bd';

// A made-up mobile number in the shape the rules expect (01 + operator digit + eight digits).
const N = '01712345678';

describe('phoneNormalizeBD (H14 / K10, the demo 07-phone.js rules)', () => {
  it.each([
    [N, N],
    ['01712-345678', N],
    ['017 1234 5678', N],
    ['+8801712345678', N],
    ['+880 1712-345678', N],
    ['008801712345678', N],
    ['8801712345678', N],
    ['001712345678', N],
    ['1712345678', N],
    ['(017) 12.34.56.78', N],
    ['০১৭১২৩৪৫৬৭৮', N],
    ['০১৭১২-34৫678', N],
  ])('cleans %s', (raw, want) => {
    const r = phoneNormalizeBD(raw);
    expect(r).toMatchObject({ ok: true, digits: want, nice: '01712-345678', e164: '+8801712345678', reason: null });
  });

  it('says what is wrong, without inventing a number', () => {
    expect(phoneNormalizeBD('')).toMatchObject({ ok: false, reason: 'empty', digits: '' });
    expect(phoneNormalizeBD('  - ')).toMatchObject({ ok: false, reason: 'empty' });
    expect(phoneNormalizeBD(null)).toMatchObject({ ok: false, reason: 'empty' });
    expect(phoneNormalizeBD('1')).toMatchObject({ ok: false, reason: 'short', digits: '1' });
    expect(phoneNormalizeBD('0171234567')).toMatchObject({ ok: false, reason: 'short' });
    expect(phoneNormalizeBD('017123456789')).toMatchObject({ ok: false, reason: 'short' });
    expect(phoneNormalizeBD('01212345678')).toMatchObject({ ok: false, reason: 'prefix', digits: '01212345678' });
    expect(phoneNormalizeBD('012')).toMatchObject({ ok: false, reason: 'prefix' });
  });

  it('every operator digit 3 to 9 is a mobile number; 0 to 2 are not', () => {
    for (const k of '3456789') expect(phoneNormalizeBD(`01${k}12345678`).ok).toBe(true);
    for (const k of '012') expect(phoneNormalizeBD(`01${k}12345678`).ok).toBe(false);
  });

  it('turns Bengali digits into Latin ones and leaves the rest', () => {
    expect(latinDigits('০১২৩৪৫৬৭৮৯ ab')).toBe('0123456789 ab');
  });
});

// Follow-up 606 (PR 167, 176, 177) — minor units to an API's amount and back take the currency's own fraction digits
// from one helper (`currencyDigits`), never a written-in hundred: taka and dollars have 2, yen 0, dinar 3. The couriers
// and gateways here are Bangladeshi and answer in taka, so nothing changes for BDT.
import { describe, expect, it } from 'vitest';
import { bkashAmount, currencyDigits, majorToMinor, minorToMajor, minorToMajorText, nagadAmount, sslcommerzAmount, takaToMinor } from '../src';

describe('money in the adapters (follow-up 606)', () => {
  it('fraction digits come from the currency', () => {
    expect([currencyDigits('BDT'), currencyDigits('USD'), currencyDigits('JPY'), currencyDigits('KWD')]).toEqual([2, 2, 0, 3]);
    expect(minorToMajor(12_345, 'BDT')).toBe(123.45);
    expect(minorToMajor(12_345, 'JPY')).toBe(12_345);
    expect(minorToMajor(12_345, 'KWD')).toBe(12.345);
    expect(majorToMinor(123.45, 'BDT')).toBe(12_345);
    expect(majorToMinor('12.345', 'KWD')).toBe(12_345);
    expect(majorToMinor('x', 'BDT')).toBeNull();
    expect(minorToMajorText(12_300, 'BDT')).toBe('123.00');
    expect(minorToMajorText(12_300, 'JPY')).toBe('12300');
  });

  it('the gateways and couriers keep their taka amounts', () => {
    expect([bkashAmount(12_345), nagadAmount(12_345), sslcommerzAmount(100)]).toEqual(['123.45', '123.45', '1.00']);
    expect(takaToMinor('250.5')).toBe(25_050);
    expect(takaToMinor(-1)).toBeNull();
  });
});

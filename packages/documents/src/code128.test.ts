import { describe, expect, it } from 'vitest';
import { CODE128_PATTERNS, QUIET_MODULES, canEncode, code128Modules, code128Svg, code128Values, code128Widths } from './code128';
import { decode128 } from './test-kit';

describe('Code 128', () => {
  it('has 107 distinct symbols of 11 modules (13 for the stop), three bars each', () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    expect(new Set(CODE128_PATTERNS).size).toBe(107);
    CODE128_PATTERNS.forEach((p, i) => {
      const total = [...p].reduce((s, c) => s + Number(c), 0);
      expect(total).toBe(i === 106 ? 13 : 11);
      // bars are the odd positions (1st, 3rd, 5th): the bar modules of every symbol are even
      const bars = [...p].filter((_, k) => k % 2 === 0).reduce((s, c) => s + Number(c), 0);
      expect(bars % 2).toBe(0);
    });
  });

  it('uses code set C for an even run of digits and B otherwise, with the weighted checksum', () => {
    // 105 + 12·1 + 34·2 + 56·3 + 78·4 = 665; 665 mod 103 = 47
    expect(code128Values('12345678')).toEqual([105, 12, 34, 56, 78, 47]);
    // "PJJ123C" in set B: 104 + 48 + 42·2 + 42·3 + 17·4 + 18·5 + 19·6 + 35·7 = 879; mod 103 = 55
    expect(code128Values('PJJ123C')).toEqual([104, 48, 42, 42, 17, 18, 19, 35, 55]);
    expect(code128Values('123')[0]).toBe(104);
    expect(code128Values('12')[0]).toBe(104);
  });

  it('reads back to the same text (a scanner round trip)', () => {
    for (const t of ['12345678', '1042-1', 'DH-TRK-90231', '20261024001', 'a b ~']) expect(decode128(code128Widths(t))).toBe(t);
  });

  it('refuses what it cannot draw', () => {
    expect(canEncode('')).toBe(false);
    expect(canEncode('বাংলা')).toBe(false);
    expect(canEncode('x'.repeat(81))).toBe(false);
    expect(() => code128Values('বাংলা')).toThrow();
  });

  it('draws whole-pixel modules, centred, or nothing when it does not fit', () => {
    const modules = code128Modules('12345678');
    expect(modules).toBe((1 + 4 + 1) * 11 + 13 + 2 * QUIET_MODULES);
    const svg = code128Svg('12345678', 0, 0, modules * 3, 40)!;
    const widths = [...svg.matchAll(/width="(\d+)"/g)].map((m) => Number(m[1]));
    expect(widths.every((w) => w % 3 === 0)).toBe(true);
    expect(code128Svg('12345678', 0, 0, modules - 1, 40)).toBeNull();
  });
});

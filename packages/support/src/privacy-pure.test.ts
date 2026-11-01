// PR 434 — numbers typed into a message, masked the shop's one way (customers.phoneMask) for a reader without
// customers.phone: every way customers write them (Bengali digits, +880, spaces, dashes), each one, and nothing else —
// an order number, an amount or a code stays as it is.
import { describe, expect, it } from 'vitest';
import { maskPhonesInText, phoneSpans } from './identity-pure';

const mask = { first: 3, last: 3 };

describe('PR 434 · numbers in a message, masked', () => {
  it('masks each number where it stands and leaves the words around it', () => {
    expect(maskPhonesInText('amar number 01712345678, call koren', mask)).toBe('amar number 017•••••678, call koren');
    expect(maskPhonesInText('+880 1712-345678 ar ০১৮১২৩৪৫৬৭৮', mask)).toBe('017•••••678 ar 018•••••678');
  });

  it('leaves an order number, an amount, a code and a message without numbers as they are', () => {
    for (const s of ['order EX01712345678', 'total 1450 taka', 'code AB01712345678X', 'ki obostha?', '']) expect(maskPhonesInText(s, mask)).toBe(s);
  });

  it('knows where every number stands', () => {
    expect(phoneSpans('a 01712345678 b 01812345678', 10).map((f) => [f.start, f.end, f.e164])).toEqual([
      [2, 13, '+8801712345678'],
      [16, 27, '+8801812345678'],
    ]);
  });
});

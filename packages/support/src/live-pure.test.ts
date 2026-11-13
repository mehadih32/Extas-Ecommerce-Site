// PR 694 — how a live comment is read.
import { describe, expect, it } from 'vitest';
import { liveCodesInput, parseLiveComment } from './live-pure';

const codes = [
  { code: 'P1', productId: '00000000-0000-4000-8000-000000000001' },
  { code: 'P2', productId: '00000000-0000-4000-8000-000000000002' },
  { code: 'P3', productId: '00000000-0000-4000-8000-000000000003' },
];

describe('PR 694 · live selling (pure)', () => {
  it('reads the prototype comments', () => {
    expect(parseLiveComment('P1 L 2 pcs', codes, 10)).toEqual({ ok: true, code: 'P1', guessedCode: false, size: 'L', qty: 2 });
    expect(parseLiveComment('P2 XL 1', codes, 10)).toEqual({ ok: true, code: 'P2', guessedCode: false, size: 'XL', qty: 1 });
    expect(parseLiveComment('p1 m 1 pcs', codes, 10)).toEqual({ ok: true, code: 'P1', guessedCode: false, size: 'M', qty: 1 });
    expect(parseLiveComment('P3 32 1', codes, 10)).toEqual({ ok: true, code: 'P3', guessedCode: false, size: '32', qty: 1 });
    expect(parseLiveComment('P3 34 2 pcs', codes, 10)).toEqual({ ok: true, code: 'P3', guessedCode: false, size: '34', qty: 2 });
    expect(parseLiveComment('P1 XXL x 3', codes, 10)).toEqual({ ok: true, code: 'P1', guessedCode: false, size: 'XXL', qty: 3 });
  });

  it('a comment with no code is the first code, and says so', () => {
    expect(parseLiveComment('L 2 pcs', codes, 10)).toEqual({ ok: true, code: 'P1', guessedCode: true, size: 'L', qty: 2 });
  });

  it('questions and praise are not orders', () => {
    for (const t of ['koto?', 'XL ache?', 'Very nice 👍', 'price?', 'P1', 'size 5']) expect(parseLiveComment(t, codes, 10), t).toEqual({ ok: false, reason: 'NOT_AN_ORDER' });
  });

  it('refuses an unknown code, no codes, a numeric size outside garment sizes and a quantity over the owner limit', () => {
    expect(parseLiveComment('P9 L 1', codes, 10)).toEqual({ ok: false, reason: 'UNKNOWN_CODE' });
    expect(parseLiveComment('P1 L 1', [], 10)).toEqual({ ok: false, reason: 'NO_CODES' });
    expect(parseLiveComment('P1 99 1', codes, 10)).toEqual({ ok: false, reason: 'NOT_AN_ORDER' });
    expect(parseLiveComment('P1 L 11', codes, 10)).toEqual({ ok: false, reason: 'TOO_MANY' });
    expect(parseLiveComment('P1 L 0', codes, 10)).toEqual({ ok: false, reason: 'NOT_AN_ORDER' });
  });

  it('checks the codes a session is started with', () => {
    expect(liveCodesInput.safeParse([{ code: 'p1', productId: codes[0]!.productId }]).success).toBe(true);
    expect(liveCodesInput.safeParse([]).success).toBe(false);
    expect(liveCodesInput.safeParse([codes[0], codes[0]]).success).toBe(false);
    expect(liveCodesInput.safeParse([{ code: 'X1', productId: codes[0]!.productId }]).success).toBe(false);
  });
});

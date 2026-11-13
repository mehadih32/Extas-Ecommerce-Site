// S28 · PR 694 (CN-048) — Live selling, the rules that need no database: how a live comment such as "P1 L 2 pcs" is read
// (a product code said on air, a size, a quantity), and which comments are orders. A comment with no code means the
// session's first code (and says so: `guessedCode`); "koto?" or "XL ache?" is not an order. Letters or numbers sizes
// (S, M, L, XL, XXL, XXXL, XS, or two digits like 32). The largest quantity is the owner's setting, never a number here.
import { z } from 'zod';

export interface LiveCode {
  code: string;
  productId: string;
}

export const liveCodesInput = z
  .array(z.object({ code: z.string().trim().toUpperCase().regex(/^P\d{1,2}$/), productId: z.string().uuid() }).strict())
  .min(1)
  .max(30) // hardcode-ok: how many products a live can carry on screen, a shape limit
  .refine((c) => new Set(c.map((x) => x.code)).size === c.length, { message: 'a code is used twice' });

export type LiveParse =
  | { ok: true; code: string; guessedCode: boolean; size: string; qty: number }
  | { ok: false; reason: 'NOT_AN_ORDER' | 'UNKNOWN_CODE' | 'NO_CODES' | 'TOO_MANY' };

const READ = /(?<![A-Za-z0-9])(?:(P\d{1,2})\s+)?(XXXL|XXL|XL|XS|S|M|L|\d{2})\s*(?:[x×]\s*)?(\d{1,2})(?!\d)/i;
const NUMERIC_SIZE = { min: 24, max: 56 }; // hardcode-ok: the span of garment sizes in numbers, a reading shape

export function parseLiveComment(text: string, codes: readonly LiveCode[], maxQty: number): LiveParse {
  const m = READ.exec(text.normalize('NFKC'));
  if (!m) return { ok: false, reason: 'NOT_AN_ORDER' };
  const size = m[2]!.toUpperCase();
  if (/^\d+$/.test(size) && (Number(size) < NUMERIC_SIZE.min || Number(size) > NUMERIC_SIZE.max)) return { ok: false, reason: 'NOT_AN_ORDER' };
  const qty = Number(m[3]);
  if (qty < 1) return { ok: false, reason: 'NOT_AN_ORDER' };
  if (qty > maxQty) return { ok: false, reason: 'TOO_MANY' };
  if (!codes.length) return { ok: false, reason: 'NO_CODES' };
  const said = m[1]?.toUpperCase();
  const code = said ?? codes[0]!.code;
  if (!codes.some((c) => c.code === code)) return { ok: false, reason: 'UNKNOWN_CODE' };
  return { ok: true, code, guessedCode: !said, size, qty };
}

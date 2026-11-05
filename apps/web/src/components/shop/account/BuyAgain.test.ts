// PR 622 (CN-034) — the "Buy again" notice: what went in, sold-out sizes with the sizes in stock, products no longer sold.
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { buyAgainNotice, type BuyAgainWords } from './BuyAgain';

const d = registry['account.reorder'].default.words;
const words = (lang: 'en' | 'bn'): BuyAgainWords => ({ ...Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v[lang]])), error: 'e', off: 'o' }) as BuyAgainWords;
const num = (n: number) => String(n);
const miss = (size: string | null, inStock: string[] = []) => ({ nameEn: 'Chino', nameBn: 'চিনো', size, inStock });

describe('PR 622 · the Buy again notice', () => {
  it('names what went in, each sold-out size with the sizes in stock and what is no longer sold, in the page language', () => {
    const r = { pieces: 2, inBag: 0, again: false, soldOut: [miss('M', ['L', 'XL'])], gone: [miss(null)] };
    expect(buyAgainNotice(r, words('en'), 'en', num)).toEqual({
      lines: ["Now in your bag at the current price: 2", 'Chino, size M, is sold out. In stock: L, XL', 'Chino is no longer sold.'],
      inBag: true,
    });
    expect(buyAgainNotice(r, words('bn'), 'bn', num).lines[1]).toBe('চিনো, সাইজ M, স্টকে নেই। স্টকে আছে: L, XL');
  });

  it('nothing to buy says so with no bag link; the same tap again keeps the bag link', () => {
    expect(buyAgainNotice({ pieces: 0, inBag: 0, again: false, soldOut: [miss('M')], gone: [] }, words('en'), 'en', num)).toEqual({ lines: ['Chino, size M, is sold out.', 'Nothing from this order can be bought right now.'], inBag: false });
    expect(buyAgainNotice({ pieces: 0, inBag: 2, again: true, soldOut: [], gone: [] }, words('en'), 'en', num)).toEqual({ lines: ["Now in your bag at the current price: 2"], inBag: true });
  });
});

// PR 128 — the thank-you page's "Complete your look" rows and choices, without a database.
import { describe, expect, it } from 'vitest';
import { firstChoice, lookRows, lookShown, openColours, pickVariant, type LookProduct } from './thanks-look-model';

const v = (id: string, colour: string, size: string, stock = 3, payMinor = 120000) => ({ id, colour, size, stock, payMinor });
const chino: LookProduct = { id: 'chino', variants: [v('k30', 'khaki', '30', 0), v('k32', 'khaki', '32'), v('n30', 'navy', '30'), v('n32', 'navy', '32')] };
const belt: LookProduct = { id: 'belt', variants: [v('b1', 'black', 'one')] };
const gone: LookProduct = { id: 'gone', variants: [v('g1', 'grey', 'm', 0)] };
const products = new Map([chino, belt, gone].map((p) => [p.id, p]));

describe('PR 128 · complete your look', () => {
  it('a row per suggestion with stock; an added piece stands where its suggestion stood, one row per added line', () => {
    expect(lookRows({ suggested: ['chino', 'gone', 'belt'], added: [], products })).toEqual([
      { kind: 'add', productId: 'chino' },
      { kind: 'add', productId: 'belt' },
    ]);
    expect(lookRows({ suggested: ['chino', 'belt'], added: [{ id: 'L1', productId: 'chino' }, { id: 'L2', productId: 'chino' }], products })).toEqual([
      { kind: 'added', productId: 'chino', lineId: 'L1' },
      { kind: 'added', productId: 'chino', lineId: 'L2' },
      { kind: 'add', productId: 'belt' },
    ]);
    // a piece added that is no longer suggested (its combo ended, or it sold out since) still shows as added
    expect(lookRows({ suggested: [], added: [{ id: 'L3', productId: 'gone' }, { id: 'L4', productId: null }], products })).toEqual([{ kind: 'added', productId: 'gone', lineId: 'L3' }]);
  });

  it('drawn only with rows, and while open or with a piece added (the demo rule)', () => {
    expect(lookShown([], true)).toBe(false);
    expect(lookShown([{ kind: 'add', productId: 'belt' }], true)).toBe(true);
    expect(lookShown([{ kind: 'add', productId: 'belt' }], false)).toBe(false);
    expect(lookShown([{ kind: 'added', productId: 'belt', lineId: 'L' }], false)).toBe(true);
  });

  it('opens on the first colour and size with stock; a colour change keeps the size when it is there', () => {
    expect(openColours(chino)).toEqual(['khaki', 'navy']);
    expect(firstChoice(chino)).toEqual({ colour: 'khaki', size: '32' });
    expect(firstChoice(gone)).toEqual({ colour: null, size: null });
    expect(pickVariant(chino, 'navy', '32')?.id).toBe('n32');
    expect(pickVariant(chino, 'khaki', '30')?.id).toBe('k32');
    expect(pickVariant(chino, 'red', '30')).toBeNull();
  });
});

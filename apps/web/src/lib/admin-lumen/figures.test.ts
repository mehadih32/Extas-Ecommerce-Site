// Lumen follow-up on PR 644/645 — a report's figures row as summary tiles: each figure counts up in its own way
// (count, money, share), a word or a figure with no number behind it shows as written, the note sits under it.
import { describe, expect, it } from 'vitest';
import { figureTiles } from './figures';

const money = { kind: 'money' as const, locale: 'en-IN', currency: 'BDT', digits: 2 };

describe('figureTiles', () => {
  it('counts a count, an amount and a share each in its own format', () => {
    const [a, b, c] = figureTiles(
      [
        { id: 'orders', label: 'Orders', value: '1,234', n: 1234, foot: 'in 7 days' },
        { id: 'saved', label: 'Saved', value: '৳1,350', n: 135000, kind: 'money' },
        { id: 'rate', label: 'Delivered', value: '82%', n: 0.82, kind: 'percent' },
      ],
      { locale: 'en-IN', money },
    );
    expect(a).toMatchObject({ key: 'orders', value: 1234, shown: '1,234', format: { kind: 'number', locale: 'en-IN' }, extra: 'in 7 days' });
    expect(b).toMatchObject({ value: 135000, format: money });
    expect(c).toMatchObject({ value: 0.82, format: { kind: 'percent' } });
  });

  it('shows a word, a dash or money without the shop format as written at once (value 0 never counts)', () => {
    const tiles = figureTiles(
      [
        { id: 'state', label: 'Overall', value: 'Fine', kind: 'word', tone: 'ok', data: { state: 'fine' } },
        { id: 'saved', label: 'Saved', value: '—', n: null, kind: 'money' },
        { id: 'cost', label: 'Cost', value: '৳9', n: 900, kind: 'money' },
      ],
      { locale: 'en-IN' },
    );
    expect(tiles.map((t) => t.value)).toEqual([0, 0, 0]);
    expect(tiles[0]).toMatchObject({ word: true, tone: 'ok', data: { state: 'fine' }, shown: 'Fine' });
    expect(tiles[1]!.extra).toBeUndefined();
  });
});

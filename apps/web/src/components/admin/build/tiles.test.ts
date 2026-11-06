// PR 648 (CN-036) — Build progress's summary tiles keep the four counts, their order, numbers and notes.
import { describe, expect, it } from 'vitest';
import { buildTiles } from './tiles';

const c = (k: string, vars?: Record<string, string | number>) => `${k}${vars ? JSON.stringify(vars) : ''}`;

describe('build progress tiles', () => {
  it('keeps the four counts in order, built = live + merged', () => {
    const tiles = buildTiles('en-GB', { prs: 1234, stages: 28, live: 15, merged: 483, todo: 149, parked: 6 }, c);
    expect(tiles.map((x) => x.key)).toEqual(['prs', 'done', 'todo', 'parked']);
    expect(tiles.map((x) => x.value)).toEqual([1234, 498, 149, 6]);
    expect(tiles[0]!.shown).toBe('1,234');
    expect(tiles[0]!.vs).toBe('kpi.prsNote{"n":28}');
    expect(tiles[1]!.vs).toBe('kpi.doneNote{"live":15}');
    expect(tiles[2]!.vs).toBeUndefined();
  });

  it('draws Western digits with the Bangladeshi grouping in Bengali too', () => {
    const tiles = buildTiles('bn-BD', { prs: 123456, stages: 1, live: 0, merged: 0, todo: 0, parked: 0 }, c);
    expect(tiles[0]!.shown).toBe('1,23,456');
  });

  it('opens no page from a tile (the counts are read-only)', () => {
    for (const tl of buildTiles('en-GB', { prs: 1, stages: 1, live: 0, merged: 1, todo: 0, parked: 0 }, c)) expect(tl.href).toBeUndefined();
  });
});

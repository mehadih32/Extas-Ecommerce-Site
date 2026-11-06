// Follow-up (PR 281 / 214) — the band a known place settles: only a place wholly inside one charged band names it.
import { describe, expect, it } from 'vitest';
import { bandKeyOfArea, type BandLookup } from './known-band';

type E = { id: string };
const map = (spans: Record<string, string[]>, charged: Record<string, string>): BandLookup<E> => ({
  gazetteer: { get: (id) => (id && spans[id] ? { id } : undefined) },
  spanOf: (e) => new Set(spans[e.id]),
  bandOf: (e) => (charged[e.id] ? { charged: { key: charged[e.id]! } } : null),
});

describe('bandKeyOfArea', () => {
  const m = map({ bogura: ['b-out'], dhaka: ['b-city', 'b-sub', 'b-out'], gulshan: ['b-city'], nowhere: ['b-x'] }, { bogura: 'outside-dhaka', dhaka: 'outside-dhaka', gulshan: 'dhaka-city' });
  it('a place inside one charged band names it', () => {
    expect(bandKeyOfArea(m, 'bogura')).toBe('outside-dhaka');
    expect(bandKeyOfArea(m, 'gulshan')).toBe('dhaka-city');
  });
  it('a place that spans bands, an unknown place, no place, or no band row: not known', () => {
    expect(bandKeyOfArea(m, 'dhaka')).toBeNull();
    expect(bandKeyOfArea(m, 'mars')).toBeNull();
    expect(bandKeyOfArea(m, null)).toBeNull();
    expect(bandKeyOfArea(m, 'nowhere')).toBeNull();
  });
});

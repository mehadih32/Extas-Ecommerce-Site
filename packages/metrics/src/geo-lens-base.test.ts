// S29 · PR 758–760 — the roll-up the three lenses share: an area goes to its division, district, upazila/thana or (inside
// Dhaka City) its own area; none, or one that does not reach the level, is unknown; outside the city is apart; a drill-down
// parent keeps only what is under it; parts add up to the total.
import { describe, expect, it } from 'vitest';
import { bump, parentOf, ratio, Roller, slotOf } from './geo-lens-base';
import { BOGURA, DHAKA, GABTALI, PLACES, RAJ, SAVAR, SECTOR7, SHERPUR, UTTARA } from './geo-lens-fixtures';

const rowOf = (s: ReturnType<typeof slotOf>) => (s.kind === 'row' ? s.place.id : s.kind);

describe('slotOf', () => {
  it('rolls an upazila up to its district and division', () => {
    expect(rowOf(slotOf('upazila', null, GABTALI.id, PLACES))).toBe(GABTALI.id);
    expect(rowOf(slotOf('district', null, GABTALI.id, PLACES))).toBe(BOGURA.id);
    expect(rowOf(slotOf('division', null, GABTALI.id, PLACES))).toBe(RAJ.id);
  });
  it('a thana counts at the upazila level; an area inside the city stays its own at the area level', () => {
    expect(rowOf(slotOf('upazila', null, SECTOR7.id, PLACES))).toBe(UTTARA.id);
    expect(rowOf(slotOf('area', null, SECTOR7.id, PLACES))).toBe(SECTOR7.id);
  });
  it('outside Dhaka City is its own bucket at the area level', () => {
    expect(rowOf(slotOf('area', null, SAVAR.id, PLACES))).toBe('outside');
    expect(rowOf(slotOf('area', null, GABTALI.id, PLACES))).toBe('outside');
  });
  it('no area, or a place that does not reach the level, is unknown', () => {
    expect(rowOf(slotOf('district', null, null, PLACES))).toBe('unknown');
    expect(rowOf(slotOf('district', null, 'nowhere', PLACES))).toBe('unknown');
    expect(rowOf(slotOf('upazila', null, BOGURA.id, PLACES))).toBe('unknown');
  });
  it('a drill-down parent keeps only what is under it, and an order with no area is not under any', () => {
    expect(rowOf(slotOf('upazila', BOGURA.id, SHERPUR.id, PLACES))).toBe(SHERPUR.id);
    expect(rowOf(slotOf('upazila', BOGURA.id, SAVAR.id, PLACES))).toBe('skip');
    expect(rowOf(slotOf('upazila', BOGURA.id, null, PLACES))).toBe('skip');
    expect(rowOf(slotOf('area', DHAKA.id, SECTOR7.id, PLACES))).toBe(SECTOR7.id);
  });
});

describe('Roller', () => {
  it('parts add up to the total, with unknown and outside counted apart', () => {
    const r = new Roller('area', null, PLACES, () => ({ n: 0 }));
    for (const id of [SECTOR7.id, SECTOR7.id, SAVAR.id, null, 'nowhere']) for (const f of r.at(id)) bump(f, 'n');
    expect(r.rows.get(SECTOR7.id)!.f.n).toBe(2);
    expect(r.outside.n).toBe(1);
    expect(r.unknown.n).toBe(2);
    expect(r.total.n).toBe(5);
  });
  it('keyOf names the row an area goes to', () => {
    const r = new Roller('district', null, PLACES, () => ({ n: 0 }));
    expect(r.keyOf(GABTALI.id)).toBe(BOGURA.id);
    expect(r.keyOf(null)).toBeNull();
  });
});

describe('small helpers', () => {
  it('ratio is null for a zero divisor', () => {
    expect(ratio(1, 4)).toBe(0.25);
    expect(ratio(0, 0)).toBeNull();
  });
  it('parentOf finds the district above an upazila, none above a district', () => {
    expect(parentOf(GABTALI, PLACES)?.id).toBe(BOGURA.id);
    expect(parentOf(BOGURA, PLACES)).toBeNull();
  });
});

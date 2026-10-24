// PR 158 — the address and zone checks without a database: no place, place not sure, no house details (a delivery only),
// another district or place than the number is known by (a place inside the known one is the same place), one of the
// owner's places or a place under it, refusals at the same place (our fault and old ones left out). Made-up places.
import { describe, expect, it } from 'vitest';
import { addressNoDetail, addressUnresolved, addressUnsure, areaMismatch, inPlaces, placeRefusalCount, type AddressFacts, type KnownPlace } from './pure';

const name = (en: string) => ({ en, bn: null });
const DHAKA = { id: '00000000-0000-4000-8000-0000000000d1', name: name('Dhaka') };
const BOGURA = { id: '00000000-0000-4000-8000-0000000000d2', name: name('Bogura') };
const DHANMONDI = { id: '00000000-0000-4000-8000-0000000000a1', name: name('Dhanmondi') };
const good: AddressFacts = { delivery: true, resolved: true, placeSure: true, detail: true, area: DHANMONDI, lineage: [DHAKA.id], district: DHAKA };
const known: KnownPlace = { from: 'saved', area: DHANMONDI, lineage: [DHAKA.id], district: DHAKA };
const pickup: AddressFacts = { delivery: false, resolved: false, placeSure: false, detail: false, area: null, lineage: [], district: null };
const T = new Date('2026-10-24T06:00:00Z');
const daysAgo = (n: number) => new Date(T.getTime() - n * 86_400_000);

describe('PR 158 · address and zone checks', () => {
  it('a settled address with house details: nothing is odd', () => {
    expect([addressUnresolved(good), addressUnsure(good), addressNoDetail(good), areaMismatch(good, known, 'district'), inPlaces(good, [])]).toEqual([null, null, null, null, null]);
  });

  it('no place, the place not sure (with its name), no house details — only for a delivery', () => {
    expect(addressUnresolved({ ...good, resolved: false })).toEqual({});
    expect(addressUnsure({ ...good, placeSure: false })).toEqual({ area: 'Dhanmondi', areaBn: null });
    expect(addressUnsure({ ...good, resolved: false, placeSure: false })).toBeNull(); // not settled is the other check
    expect(addressNoDetail({ ...good, detail: false })).toEqual({});
    expect(addressNoDetail({ ...good, detail: null })).toBeNull(); // not checked is not "no details"
    expect([addressUnresolved(pickup), addressUnsure(pickup), addressNoDetail(pickup)]).toEqual([null, null, null]);
  });

  it('another district than the number is known by, with both names and where it is known from', () => {
    const bogura: AddressFacts = { ...good, area: { id: 'b1', name: name('Gabtali') }, lineage: [BOGURA.id], district: BOGURA };
    expect(areaMismatch(bogura, known, 'district')).toEqual({ known: 'Dhaka', knownBn: null, now: 'Bogura', nowBn: null, from: 'saved', level: 'district' });
    expect(areaMismatch(bogura, null, 'district')).toBeNull();
    expect(areaMismatch({ ...bogura, delivery: false }, known, 'district')).toBeNull();
  });

  it('at "area" level a place inside the known one (or above it) is the same place; a sibling is not', () => {
    const inside: AddressFacts = { ...good, area: { id: 'a9', name: name('Road 5') }, lineage: [DHANMONDI.id, DHAKA.id] };
    expect(areaMismatch(inside, known, 'area')).toBeNull();
    const sibling: AddressFacts = { ...good, area: { id: 'a8', name: name('Mirpur') }, lineage: [DHAKA.id] };
    expect(areaMismatch(sibling, known, 'area')).toMatchObject({ known: 'Dhanmondi', now: 'Mirpur', level: 'area' });
  });

  it("one of the owner's places, or a place under it; an empty list never matches", () => {
    expect(inPlaces(good, [DHAKA.id])).toEqual({ areaId: DHAKA.id, area: 'Dhanmondi', areaBn: null });
    expect(inPlaces(good, [BOGURA.id])).toBeNull();
    expect(inPlaces(good, [])).toBeNull();
    expect(inPlaces(pickup, [DHAKA.id])).toBeNull();
  });

  it('refusals at the same place: our fault and older than the window left out', () => {
    const r = [{ at: daysAgo(5), refusalKey: 'changed-mind' }, { at: daysAgo(9), refusalKey: null }, { at: daysAgo(10), refusalKey: 'damaged' }, { at: daysAgo(200), refusalKey: 'no-money' }];
    const ours = new Set(['damaged']);
    expect(placeRefusalCount(good, r, null, ours)).toBe(3);
    expect(placeRefusalCount(good, r, daysAgo(90), ours)).toBe(2);
    expect(placeRefusalCount(pickup, r, null, ours)).toBe(0);
  });
});

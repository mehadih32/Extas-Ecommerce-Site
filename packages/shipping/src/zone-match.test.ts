// PR 554 — the pairing rules of the courier zone sync, without a database: exact names only (through the gazetteer's
// aliases and the loose key), inside the paired city only, an unclear name never guessed, and when a parcel waits.
import { describe, expect, it } from 'vitest';
import { idsOfPlace, matchPlaces, pairCovers, placeKey, zoneNeedOf, type CourierPlaceRow, type GazetteerPlace } from './zone-match';

const g = (id: string, level: GazetteerPlace['level'], ancestorIds: string[], nameEn: string, aliases: string[] = [], nameBn: string | null = null): GazetteerPlace => ({ id, level, ancestorIds, nameEn, nameBn, aliases });
const p = (level: CourierPlaceRow['level'], providerId: string, name: string, cityId: string | null = null, zoneId: string | null = null): CourierPlaceRow => ({ level, providerId, name, cityId, zoneId, nameKey: placeKey(name) }) as CourierPlaceRow & { name: string };

const GAZ: GazetteerPlace[] = [
  g('div-dhaka', 'DIVISION', [], 'Dhaka'),
  g('dist-dhaka', 'DISTRICT', ['div-dhaka'], 'Dhaka'),
  g('mirpur', 'THANA', ['div-dhaka', 'dist-dhaka'], 'Mirpur'),
  g('pallabi', 'AREA', ['div-dhaka', 'dist-dhaka'], 'Pallabi', ['pollobi']),
  g('uttara', 'THANA', ['div-dhaka', 'dist-dhaka'], 'Uttara'),
  g('kotwali-dhaka', 'AREA', ['div-dhaka', 'dist-dhaka'], 'Kotwali'),
  g('savar', 'UPAZILA', ['div-dhaka', 'dist-dhaka'], 'Savar'),
  g('ashulia', 'THANA', ['div-dhaka', 'dist-dhaka', 'savar'], 'Ashulia'),
  g('div-raj', 'DIVISION', [], 'Rajshahi'),
  g('dist-bogura', 'DISTRICT', ['div-raj'], 'Bogura', ['bogra', 'bagura'], 'বগুড়া'),
  g('gabtali', 'UPAZILA', ['div-raj', 'dist-bogura'], 'Gabtali'),
  g('div-khulna', 'DIVISION', [], 'Khulna'),
  g('dist-kushtia', 'DISTRICT', ['div-khulna'], 'Kushtia'),
  g('mirpur-kushtia', 'UPAZILA', ['div-khulna', 'dist-kushtia'], 'Mirpur'),
];

const PLACES: CourierPlaceRow[] = [
  p('CITY', '1', 'Dhaka'),
  p('ZONE', '101', 'Mirpur', '1'),
  p('AREA', '1003', 'Pallabi', '1', '101'),
  p('ZONE', '105', 'Uttara', '1'),
  p('ZONE', '106', 'Uttara', '1'),
  p('ZONE', '107', 'Savar', '1'),
  p('AREA', '1071', 'Ashulia', '1', '107'),
  p('CITY', '4', 'Chittagong'),
  p('ZONE', '401', 'Kotwali', '4'),
  p('CITY', '5', 'Bogra'),
  p('ZONE', '502', 'Gabtoli', '5'),
];

describe('PR 554 · pairing a courier list with the gazetteer', () => {
  const r = matchPlaces(GAZ, PLACES);
  const pair = (id: string) => r.matches.find((m) => m.shopAreaId === id);

  it('a district is a courier city, by its own name or an alias (Bogra = Bogura); a division never is', () => {
    expect(pair('dist-dhaka')).toMatchObject({ cityId: '1', zoneId: null, areaId: null, matchedBy: 'city' });
    expect(pair('dist-bogura')).toMatchObject({ cityId: '5', matchedBy: 'city' });
    expect(pair('div-dhaka')).toBeUndefined();
  });

  it('below a paired district: a thana or upazila to its zone, an area to its area, with every id above it', () => {
    expect(pair('mirpur')).toMatchObject({ cityId: '1', zoneId: '101', areaId: null, matchedBy: 'zone' });
    expect(pair('pallabi')).toMatchObject({ cityId: '1', zoneId: '101', areaId: '1003', matchedBy: 'area' });
    expect(pair('savar')).toMatchObject({ cityId: '1', zoneId: '107' });
    // a thana with no zone of its name falls back to the courier's areas
    expect(pair('ashulia')).toMatchObject({ cityId: '1', zoneId: '107', areaId: '1071', matchedBy: 'area' });
    // the loose key: Gabtoli = Gabtali
    expect(pair('gabtali')).toMatchObject({ cityId: '5', zoneId: '502' });
  });

  it('only inside the paired city: Kotwali of Dhaka is not Kotwali of Chittagong, Mirpur of Kushtia is not Mirpur of Dhaka', () => {
    expect(pair('kotwali-dhaka')).toBeUndefined();
    expect(pair('mirpur-kushtia')).toBeUndefined();
  });

  it('two courier zones with one name are never guessed: the area waits for a person with both candidates', () => {
    expect(pair('uttara')).toBeUndefined();
    expect(r.unclear.find((u) => u.shopAreaId === 'uttara')?.candidates).toEqual([
      { cityId: '1', zoneId: '105', areaId: null },
      { cityId: '1', zoneId: '106', areaId: null },
    ]);
  });

  it('two districts claiming one courier city pair neither', () => {
    const twin = matchPlaces([...GAZ, g('dist-dhaka-2', 'DISTRICT', ['div-dhaka'], 'Dacca', ['dhaka'])], PLACES);
    expect(twin.matches.find((m) => m.shopAreaId === 'dist-dhaka')).toBeUndefined();
    expect(twin.unclear.map((u) => u.shopAreaId)).toEqual(expect.arrayContaining(['dist-dhaka', 'dist-dhaka-2']));
    // and nothing below them is paired either
    expect(twin.matches.find((m) => m.shopAreaId === 'mirpur')).toBeUndefined();
  });

  it('the ids a place stands for', () => {
    expect(idsOfPlace(PLACES[0]!)).toEqual({ cityId: '1', zoneId: null, areaId: null });
    expect(idsOfPlace(PLACES[2]!)).toEqual({ cityId: '1', zoneId: '101', areaId: '1003' });
  });

  it('when a parcel waits for a pair: a courier that needs ids always; with "always", every courier that takes them', () => {
    expect(zoneNeedOf({ zoneIds: true, zoneNeeds: 'zone' }, 'whenRequired')).toBe('zone');
    expect(zoneNeedOf({ zoneIds: true, zoneNeeds: null }, 'whenRequired')).toBeNull();
    expect(zoneNeedOf({ zoneIds: true, zoneNeeds: null }, 'always')).toBe('city');
    // Steadfast takes no ids: never waits
    expect(zoneNeedOf({ zoneIds: false }, 'always')).toBeNull();
    expect(pairCovers({ courierCityId: '1', courierZoneId: null, courierAreaId: null }, 'city')).toBe(true);
    expect(pairCovers({ courierCityId: '1', courierZoneId: null, courierAreaId: null }, 'zone')).toBe(false);
  });
});

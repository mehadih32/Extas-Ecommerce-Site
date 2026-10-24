// PR 554 — pairing a courier's own place list with the shop's gazetteer, without a database. One rule, the same as the
// address resolver's (PR 551): names are compared by one normal form and its loose key (`nameKey` + `fold` of
// @extas/delivery: "Bogra" = "Bogura" through the gazetteer's own aliases, "Gabtoli" = "Gabtali"), as an exact match of
// two keys — never a similarity score, never a guess.
//
// - A courier city is a gazetteer district (the division above it is never a courier city).
// - Below a paired district, an upazila, thana or area is paired with the courier zone, or failing that the courier area,
//   of the same name inside that courier city only (Mirpur of Dhaka is never Mirpur of Kushtia). A gazetteer area tries
//   the courier's areas first, the others try its zones first.
// - Two courier places with the same name in one city (two "Uttara" zones), or two districts claiming one courier city,
//   pair nothing: the shop area waits on the courier's page with its candidates for a person to pick.
// - A shop area without its own pair still books with the nearest pair above it (its district's city), when the courier
//   needs no deeper ids (the booking walks up the tree: booking.ts).
import { fold, nameKey } from '@extas/delivery';

/** The levels of the shop's gazetteer (Prisma `GeoLevel`). */
export type GazetteerLevel = 'DIVISION' | 'DISTRICT' | 'UPAZILA' | 'THANA' | 'AREA';
/** The levels of a courier's list (Prisma `CourierPlaceLevel`). */
export type PlaceLevel = 'CITY' | 'ZONE' | 'AREA';

/** The matching key of a place name (stored on every courier place as `nameKey`). */
export const placeKey = (name: string): string => fold(nameKey(name));

/** One gazetteer row as the matcher reads it. */
export interface GazetteerPlace {
  id: string;
  level: GazetteerLevel;
  /** Root first (division, district, …), as the importer writes them. */
  ancestorIds: readonly string[];
  nameEn: string;
  nameBn: string | null;
  aliases: readonly string[];
}

/** One courier place as the matcher reads it. */
export interface CourierPlaceRow {
  level: PlaceLevel;
  providerId: string;
  /** A zone's city; an area's city. */
  cityId: string | null;
  /** An area's zone. */
  zoneId: string | null;
  nameKey: string;
}

/** The courier's ids for one shop area. */
export interface CourierIds {
  cityId: string;
  zoneId: string | null;
  areaId: string | null;
}

export interface ZoneMatch extends CourierIds {
  /** The shop's area (GeoArea id). */
  shopAreaId: string;
  /** Which of the courier's levels the name matched. */
  matchedBy: 'city' | 'zone' | 'area';
}

export interface ZoneMatchResult {
  matches: ZoneMatch[];
  /** Shop areas whose name fits more than one courier place: a person picks (the candidates' ids). */
  unclear: { shopAreaId: string; candidates: CourierIds[] }[];
}

/** The courier ids a place stands for (a city: its own; a zone: its city and itself; an area: all three). */
export function idsOfPlace(p: Pick<CourierPlaceRow, 'level' | 'providerId' | 'cityId' | 'zoneId'>): CourierIds {
  if (p.level === 'CITY') return { cityId: p.providerId, zoneId: null, areaId: null };
  if (p.level === 'ZONE') return { cityId: p.cityId ?? '', zoneId: p.providerId, areaId: null };
  return { cityId: p.cityId ?? '', zoneId: p.zoneId, areaId: p.providerId };
}

/** Every key a gazetteer row answers to: its English and Bengali names and its aliases. */
export function keysOfArea(g: Pick<GazetteerPlace, 'nameEn' | 'nameBn' | 'aliases'>): string[] {
  return [...new Set([g.nameEn, g.nameBn ?? '', ...g.aliases].map(placeKey).filter(Boolean))];
}

const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => {
  const list = m.get(k);
  if (list) list.push(v);
  else m.set(k, [v]);
};

/** The places of `pool` answering to any of `keys`, each once. */
function hits(pool: Map<string, CourierPlaceRow[]> | undefined, keys: readonly string[]): CourierPlaceRow[] {
  if (!pool) return [];
  const out = new Map<string, CourierPlaceRow>();
  for (const k of keys) for (const p of pool.get(k) ?? []) out.set(`${p.level}:${p.providerId}`, p);
  return [...out.values()];
}

/** The courier city each gazetteer district pairs with (only the clear ones). */
function districtCities(gazetteer: readonly GazetteerPlace[], cities: Map<string, CourierPlaceRow[]>): { paired: Map<string, CourierPlaceRow>; unclear: ZoneMatchResult['unclear'] } {
  const claims = new Map<string, string[]>();
  const found = new Map<string, CourierPlaceRow[]>();
  for (const g of gazetteer) {
    if (g.level !== 'DISTRICT') continue;
    const h = hits(cities, keysOfArea(g));
    found.set(g.id, h);
    if (h.length === 1) push(claims, h[0]!.providerId, g.id);
  }
  const paired = new Map<string, CourierPlaceRow>();
  const unclear: ZoneMatchResult['unclear'] = [];
  for (const [id, h] of found) {
    if (h.length === 1 && claims.get(h[0]!.providerId)!.length === 1) paired.set(id, h[0]!);
    else if (h.length) unclear.push({ shopAreaId: id, candidates: h.map(idsOfPlace) });
  }
  return { paired, unclear };
}

/**
 * Pairs the gazetteer with one courier's places (see the header). Pure: the zone sync stores the result for the shop
 * areas without a pair yet (a pair a person made is never replaced).
 */
export function matchPlaces(gazetteer: readonly GazetteerPlace[], places: readonly CourierPlaceRow[]): ZoneMatchResult {
  const cities = new Map<string, CourierPlaceRow[]>();
  const zones = new Map<string, Map<string, CourierPlaceRow[]>>();
  const areas = new Map<string, Map<string, CourierPlaceRow[]>>();
  for (const p of places) {
    if (p.level === 'CITY') push(cities, p.nameKey, p);
    else {
      const pools = p.level === 'ZONE' ? zones : areas;
      const city = p.cityId ?? '';
      if (!pools.has(city)) pools.set(city, new Map());
      push(pools.get(city)!, p.nameKey, p);
    }
  }
  const { paired, unclear } = districtCities(gazetteer, cities);
  const matches: ZoneMatch[] = [...paired].map(([shopAreaId, c]) => ({ shopAreaId, ...idsOfPlace(c), matchedBy: 'city' as const }));
  for (const g of gazetteer) {
    if (g.level === 'DIVISION' || g.level === 'DISTRICT') continue;
    const district = g.ancestorIds.find((a) => paired.has(a));
    if (!district) continue;
    const city = paired.get(district)!.providerId;
    const keys = keysOfArea(g);
    const order = g.level === 'AREA' ? [areas, zones] : [zones, areas];
    for (const pools of order) {
      const h = hits(pools.get(city), keys);
      if (h.length === 1) {
        const p = h[0]!;
        matches.push({ shopAreaId: g.id, ...idsOfPlace(p), matchedBy: p.level === 'ZONE' ? 'zone' : 'area' });
        break;
      }
      if (h.length > 1) {
        unclear.push({ shopAreaId: g.id, candidates: h.map(idsOfPlace) });
        break;
      }
    }
  }
  return { matches, unclear };
}

/** The deepest of a courier's levels a booking must carry (CourierCapabilities.zoneNeeds), in the shop's words. */
export type ZoneNeed = 'city' | 'zone' | 'area';

/** True when a pair carries the ids down to `need`. */
export function pairCovers(ids: { courierCityId: string | null; courierZoneId: string | null; courierAreaId: string | null }, need: ZoneNeed): boolean {
  if (need === 'area') return !!ids.courierAreaId;
  if (need === 'zone') return !!ids.courierZoneId;
  return !!ids.courierCityId;
}

/**
 * Whether a parcel to an area without a pair waits, for one courier (the owner's `delivery.courier.zoneSync.unmapped`):
 * a courier that needs its own ids always waits (down to the level it needs); with `always`, every courier that takes
 * ids waits for at least its city. Null: the parcel goes with the address only.
 */
export function zoneNeedOf(caps: { zoneIds: boolean; zoneNeeds?: ZoneNeed | null }, rule: 'whenRequired' | 'always'): ZoneNeed | null {
  if (caps.zoneNeeds) return caps.zoneNeeds;
  return rule === 'always' && caps.zoneIds ? 'city' : null;
}

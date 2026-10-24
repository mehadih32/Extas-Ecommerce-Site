// S06 · PR 158 — address and zone checks against the gazetteer, without a database: the place the checkout stored for
// the order (never read again from the text, SIM-F-003) and the place its number is known by in, what is odd about it
// out — no place settles the address, two places share its name, the line says nowhere where the house is, another
// district (or area) than the number is known by, inside one of the owner's places, many refusals at the same place.
// Each check gives the values its words need, or null. The risk score (PR 156) turns each into a signal with the
// owner's weight; these checks decide nothing about the order.

/** A place with its names (the gazetteer's English and Bengali). */
export interface NamedPlace {
  id: string;
  name: { en: string; bn: string | null };
}

/** The order's address as the checkout read it against the gazetteer. */
export interface AddressFacts {
  /** Only a delivery has an address to check (a pickup or a counter sale has none). */
  delivery: boolean;
  /** A place in the gazetteer settles the address. */
  resolved: boolean;
  /** The band is sure but not the exact place (null: not known). */
  placeSure: boolean | null;
  /** The line says where the house is (null: not checked). */
  detail: boolean | null;
  /** The place charged, every place above it (nearest first) and its district, with names for the reasons. */
  area: NamedPlace | null;
  lineage: string[];
  district: NamedPlace | null;
}

/** The place a number is known by: its saved address, else its latest delivered order (phone-first, PR 555). */
export interface KnownPlace {
  from: 'saved' | 'order';
  area: NamedPlace;
  /** The places above the known one, nearest first. */
  lineage: string[];
  district: NamedPlace | null;
}

/** An earlier parcel to the same place that came back: when, and why (a refusal reason key). */
export interface PlaceRefusal {
  at: Date;
  refusalKey: string | null;
}

/** What a check saw, for its words (names, counts). */
export type CheckValues = Record<string, string | number | boolean | null>;

/** No place in the gazetteer settles the address. */
export const addressUnresolved = (a: AddressFacts): CheckValues | null => (a.delivery && !a.resolved ? {} : null);

/** The address is settled, but two places share its name (the band is sure, the exact place is not). */
export const addressUnsure = (a: AddressFacts): CheckValues | null =>
  a.delivery && a.resolved && a.placeSure === false ? { area: a.area?.name.en ?? null, areaBn: a.area?.name.bn ?? null } : null;

/** The line says nowhere where the house is (a landmark only, PR 563's check). */
export const addressNoDetail = (a: AddressFacts): CheckValues | null => (a.delivery && a.detail === false ? {} : null);

/**
 * Another district (`level: 'district'`) or another place (`'area'`) than the number is known by. At area level a place
 * inside the known one, or above it, is the same place said more or less exactly.
 */
export function areaMismatch(a: AddressFacts, known: KnownPlace | null, level: 'district' | 'area'): CheckValues | null {
  if (!a.delivery || !known || !a.area) return null;
  const district = level === 'district';
  const was = district ? known.district : known.area;
  const now = district ? a.district : a.area;
  if (!was || !now || was.id === now.id) return null;
  if (!district && (a.lineage.includes(was.id) || known.lineage.includes(now.id))) return null;
  return { known: was.name.en, knownBn: was.name.bn, now: now.name.en, nowBn: now.name.bn, from: known.from, level };
}

/** The place is one of `areaIds`, or inside one of them. */
export function inPlaces(a: AddressFacts, areaIds: readonly string[]): CheckValues | null {
  if (!a.delivery || !a.area || !areaIds.length) return null;
  const listed = new Set(areaIds);
  const hit = [a.area.id, ...a.lineage].find((id) => listed.has(id));
  return hit ? { areaId: hit, area: a.area.name.en, areaBn: a.area.name.bn } : null;
}

/** Parcels to the same place refused since `since` (null: ever), the shop's own fault (`ourFault`) left out. */
export function placeRefusalCount(a: AddressFacts, refusals: readonly PlaceRefusal[], since: Date | null, ourFault: ReadonlySet<string>): number {
  if (!a.delivery || !a.area) return 0;
  return refusals.filter((r) => (!since || r.at >= since) && !(r.refusalKey && ourFault.has(r.refusalKey))).length;
}

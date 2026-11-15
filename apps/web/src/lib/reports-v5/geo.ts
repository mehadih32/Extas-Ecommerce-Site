// PR 798 (prototype v5 Reports › Areas, Customers, Profit): where an order went — division, district, thana, area. An order that has a
// place in the place tree (Order.areaId, PR 549-552) takes the names from the tree; an order with only its typed address ("…, Mirpur 10,
// Dhaka") takes the last two parts as area and district, and the division from the district. Pure; the page loads the tree.
// The 64 districts and their 8 divisions are geography, not a shop setting.

/** District (lower case) → division, with the common spellings. */
const DIV_LIST: Record<string, readonly string[]> = {
  Dhaka: [
    "dhaka",
    "gazipur",
    "narayanganj",
    "narsingdi",
    "manikganj",
    "munshiganj",
    "tangail",
    "kishoreganj",
    "faridpur",
    "gopalganj",
    "madaripur",
    "rajbari",
    "shariatpur",
  ], // hardcode-ok: geography
  Chattogram: [
    "chattogram",
    "chittagong",
    "cox's bazar",
    "coxs bazar",
    "cumilla",
    "comilla",
    "feni",
    "noakhali",
    "lakshmipur",
    "chandpur",
    "brahmanbaria",
    "khagrachhari",
    "rangamati",
    "bandarban",
  ], // hardcode-ok: geography
  Sylhet: ["sylhet", "moulvibazar", "habiganj", "sunamganj"], // hardcode-ok: geography
  Rajshahi: [
    "rajshahi",
    "bogura",
    "bogra",
    "pabna",
    "sirajganj",
    "natore",
    "naogaon",
    "chapainawabganj",
    "joypurhat",
  ], // hardcode-ok: geography
  Khulna: [
    "khulna",
    "jessore",
    "jashore",
    "satkhira",
    "bagerhat",
    "kushtia",
    "jhenaidah",
    "magura",
    "narail",
    "chuadanga",
    "meherpur",
  ], // hardcode-ok: geography
  Mymensingh: ["mymensingh", "jamalpur", "sherpur", "netrokona"], // hardcode-ok: geography
  Rangpur: [
    "rangpur",
    "dinajpur",
    "gaibandha",
    "kurigram",
    "lalmonirhat",
    "nilphamari",
    "panchagarh",
    "thakurgaon",
  ], // hardcode-ok: geography
  Barishal: [
    "barishal",
    "barisal",
    "bhola",
    "jhalokati",
    "patuakhali",
    "pirojpur",
    "barguna",
  ], // hardcode-ok: geography
};
export const DIVISIONS = Object.keys(DIV_LIST);
const DIV_OF = new Map<string, string>(
  Object.entries(DIV_LIST).flatMap(([d, list]) =>
    list.map((x) => [x, d] as const),
  ),
);

export const norm = (s: string | null | undefined) =>
  (s ?? "").trim().toLowerCase();
/** The division a district is in; null when the district is not one of the 64. */
export const divisionOf = (
  district: string | null | undefined,
): string | null => DIV_OF.get(norm(district)) ?? null;

export interface Place {
  division: string | null;
  district: string | null;
  thana: string | null;
  area: string | null;
}

/** The typed address's last two parts: "House 5, Road 3, Mirpur 10, Dhaka" → area "Mirpur 10", district "Dhaka". */
export function placeFromAddress(text: string | null | undefined): Place {
  const parts = (text ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const last = parts[parts.length - 1] ?? null;
  if (!last || !divisionOf(last))
    return { division: null, district: null, thana: null, area: null };
  const area = parts.length >= 2 ? parts[parts.length - 2]! : null;
  return { division: divisionOf(last), district: last, thana: area, area };
}

export interface GeoNode {
  id: string;
  level: "DIVISION" | "DISTRICT" | "UPAZILA" | "THANA" | "AREA";
  nameEn: string;
  nameBn: string | null;
}

/** A place from the tree: the area itself and the places above it, by level (the thana level is an upazila or a thana). */
export function placeFromTree(
  self: GeoNode,
  ancestors: readonly GeoNode[],
): Place {
  const all = [...ancestors, self];
  const at = (...lv: GeoNode["level"][]) =>
    all.find((n) => lv.includes(n.level))?.nameEn ?? null;
  const district = at("DISTRICT");
  const division = at("DIVISION") ?? divisionOf(district);
  const thana = at("THANA", "UPAZILA");
  const area = self.level === "AREA" ? self.nameEn : thana;
  return { division, district, thana: thana ?? area, area };
}

export const PLACE_LEVELS = ["division", "district", "thana", "area"] as const;
export type PlaceLevel = (typeof PLACE_LEVELS)[number];

/** The place's name at a level, or "—" when it is not known. */
export const nameAt = (p: Place, lv: PlaceLevel) => p[lv] ?? "—";

/** True when the place is under the path (division / district / thana), level by level. */
export const underPath = (p: Place, path: readonly string[]) =>
  path.every((x, i) => nameAt(p, PLACE_LEVELS[i]!) === x);

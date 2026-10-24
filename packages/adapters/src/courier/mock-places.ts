// PR 554 — the practice courier's own place list (cities → zones → areas), so the courier zone sync can be built and
// tried before any real courier is connected. Public place names only, the way couriers spell them (a courier's list
// is never the shop's gazetteer: "Bogra" for Bogura, "Chittagong" for Chattogram, "Mirpur 10" as a zone). The ids are
// numbers written as text, like a real courier's. Two zones of one city share the name "Uttara" on purpose: the shop
// never guesses between them (a person picks). Every practice world starts from this list; tests and the staging check
// change their own copy (`mockCourierWorld(…).dropPlace`, `addPlace`) to play a courier changing its list.

export interface MockPlaceRow {
  id: string;
  name: string;
  /** The city of a zone, the zone of an area; null for a city. */
  parentId: string | null;
}

type Tree = readonly (readonly [id: number, name: string, zones?: readonly (readonly [id: number, name: string, areas?: readonly (readonly [id: number, name: string])[]])[]])[];

const TREE: Tree = [
  [
    1,
    'Dhaka',
    [
      [101, 'Mirpur', [[1001, 'Mirpur 1'], [1002, 'Mirpur 10'], [1003, 'Pallabi'], [1004, 'Kazipara']]],
      [102, 'Dhanmondi', [[1011, 'Dhanmondi Road 1'], [1012, 'Jigatola']]],
      [103, 'Gulshan', [[1021, 'Gulshan 1'], [1022, 'Gulshan 2'], [1023, 'Niketon']]],
      [104, 'Mohammadpur', [[1031, 'Shyamoli'], [1032, 'Adabor']]],
      [105, 'Uttara'],
      [106, 'Uttara'],
      [107, 'Savar', [[1071, 'Ashulia'], [1072, 'Hemayetpur']]],
      [108, 'Keraniganj'],
      [109, 'Badda', [[1091, 'Merul Badda']]],
      [110, 'Motijheel'],
    ],
  ],
  [2, 'Gazipur', [[201, 'Tongi'], [202, 'Gazipur Sadar'], [203, 'Sreepur'], [204, 'Kaliakair']]],
  [3, 'Narayanganj', [[301, 'Fatullah'], [302, 'Siddhirganj'], [303, 'Narayanganj Sadar']]],
  [4, 'Chittagong', [[401, 'Kotwali'], [402, 'Pahartali'], [403, 'Halishahar']]],
  [5, 'Bogra', [[501, 'Bogra Sadar'], [502, 'Gabtali'], [503, 'Sherpur']]],
  [6, 'Sylhet', [[601, 'Sylhet Sadar']]],
  [7, 'Rajshahi', [[701, 'Boalia']]],
  [8, 'Khulna', [[801, 'Sonadanga']]],
];

/** The practice list, flat by level. */
export function practicePlaces(): { city: MockPlaceRow[]; zone: MockPlaceRow[]; area: MockPlaceRow[] } {
  const out = { city: [] as MockPlaceRow[], zone: [] as MockPlaceRow[], area: [] as MockPlaceRow[] };
  for (const [cid, cname, zones] of TREE) {
    out.city.push({ id: String(cid), name: cname, parentId: null });
    for (const [zid, zname, areas] of zones ?? []) {
      out.zone.push({ id: String(zid), name: zname, parentId: String(cid) });
      for (const [aid, aname] of areas ?? []) out.area.push({ id: String(aid), name: aname, parentId: String(zid) });
    }
  }
  return out;
}

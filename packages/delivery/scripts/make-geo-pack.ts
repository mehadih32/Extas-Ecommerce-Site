// S29 · PR 750 — builds the Geography map's boundary pack (data/geo/*.json) from the geoBoundaries open files.
//
//   1. Download once (outside the repo; the files are NOT committed, only the simplified result is):
//        https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/main/releaseData/gbOpen/BGD/ADM1/geoBoundaries-BGD-ADM1_simplified.geojson   (and ADM2, ADM3)
//      into one folder as ADM1.geojson, ADM2.geojson, ADM3.geojson.
//   2. pnpm --filter @extas/delivery geo:pack <folder>      (or: tsx scripts/make-geo-pack.ts <folder>)
//
// Output (stable text, so a rebuild with the same input changes nothing):
//   data/geo/division.json, district.json, upazila.json   one GeoPack each (see packages/metrics/src/geo-types.ts)
//   data/geo/centroids.json                               code → [lat, lng], fills GeoArea.lat/lng where empty
//   data/geo/unmatched.json                               shapes that did not match exactly one place, and places no
//                                                         shape claimed: the list for hand fixing in hand-fixes.json
// A shape is matched by name and by the district it lies in; the aliases of the gazetteer carry the spellings
// (Bogra/Bogura, Gabtali/Gabtoli). Nothing is guessed: no match, two matches or a duplicate goes to unmatched.json.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GEO_VIEWBOX_TEXT,
  districtByPosition,
  matchLevel,
  packToJson,
  type GeoJsonFeature,
  type HandFixes,
  type PlaceRef,
} from '../src/geo-pack';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '../data');
const outDir = join(dataDir, 'geo');
const rawDir = process.argv[2];
if (!rawDir) throw new Error('usage: make-geo-pack.ts <folder with ADM1.geojson ADM2.geojson ADM3.geojson>');

export const ATTRIBUTION =
  'Boundaries: geoBoundaries (William & Mary geoLab), built from Bangladesh Bureau of Statistics / OCHA ROAP data (districts and upazilas, CC BY 3.0 IGO) and Wikimedia Commons (divisions, CC0). Simplified by Extas. See data/geo/LICENSE-NOTICE.md.';

/** Tolerance in viewBox units (1 unit = 1/400 degree of latitude, about 280 m) and the smallest island kept. */
const LEVELS = {
  division: { tolerance: 0.6, minRingArea: 6 },
  district: { tolerance: 0.6, minRingArea: 4 },
  upazila: { tolerance: 0.5, minRingArea: 2 },
} as const;

function readCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.length > 1 || row[0] !== '') out.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    out.push(row);
  }
  return out;
}

const csvPath = join(dataDir, 'gazetteer-sample.csv');
const csvText = readFileSync(csvPath, 'utf8');
const table = readCsv(csvText);
const head = table[0]!;
const col = (name: string) => head.indexOf(name);
const places: PlaceRef[] = table.slice(1).map((r) => ({
  code: r[col('code')]!,
  level: r[col('level')]! as PlaceRef['level'],
  nameEn: r[col('nameEn')]!,
  aliases: (r[col('aliases')] ?? '').split('|').filter(Boolean),
  cityCorporation: r[col('cityCorporation')] || null,
}));

const features = (name: string): GeoJsonFeature[] => JSON.parse(readFileSync(join(rawDir, `${name}.geojson`), 'utf8')).features;
const fixesPath = join(outDir, 'hand-fixes.json');
const fixes: Record<string, HandFixes> = existsSync(fixesPath) ? JSON.parse(readFileSync(fixesPath, 'utf8')) : { division: {}, district: {}, upazila: {}, dhakaThana: {} };

mkdirSync(outDir, { recursive: true });
const report: Record<string, unknown> = {};
const centroids: Record<string, [number, number]> = {};

const write = (level: 'division' | 'district' | 'upazila' | 'dhakaThana', shapes: ReturnType<typeof matchLevel>['shapes']) => {
  writeFileSync(join(outDir, `${level}.json`), packToJson({ level, viewBox: GEO_VIEWBOX_TEXT, attribution: ATTRIBUTION, shapes }) + '\n');
  for (const s of shapes) centroids[s.code] = [s.lat, s.lng];
};

const div = matchLevel({ features: features('ADM1'), places, levels: ['DIVISION'], pathOptions: LEVELS.division, fixes: fixes.division });
write('division', div.shapes);
report.division = { shapes: div.shapes.length, unmatched: div.unmatched, unclaimed: div.unclaimed };

const dis = matchLevel({ features: features('ADM2'), places, levels: ['DISTRICT'], pathOptions: LEVELS.district, fixes: fixes.district });
write('district', dis.shapes);
report.district = { shapes: dis.shapes.length, unmatched: dis.unmatched, unclaimed: dis.unclaimed };

// upazila / thana shapes (ADM3) sit in the district whose polygon holds them
const districtShapes = dis.shapes.map((s) => ({ place: places.find((p) => p.code === s.code)!, feature: dis.featureOf.get(s.code)! }));
const upa = matchLevel({
  features: features('ADM3'),
  places,
  levels: ['UPAZILA', 'THANA'],
  districtOf: districtByPosition(districtShapes),
  pathOptions: LEVELS.upazila,
  fixes: fixes.upazila,
});
write('upazila', upa.shapes);

// Dhaka City: the thana shapes inside Dhaka district, matched to the city's thanas first and then to its areas
// (the gazetteer carries Badda, Dhanmondi, Adabor ... as city areas). Only places of a city corporation can match.
const DHAKA = 'bd.dhaka.dhaka';
const cityPlaces = places.filter((p) => p.cityCorporation && p.code.startsWith(`${DHAKA}.`));
const inDhakaOf = districtByPosition(districtShapes);
const inDhaka = features('ADM3').filter((f) => inDhakaOf(f)?.code === DHAKA);
const cityFixes = fixes.dhakaThana ?? {};
const cityThana = matchLevel({ features: inDhaka, places: cityPlaces, levels: ['THANA'], districtOf: () => ({ code: DHAKA }) as PlaceRef, pathOptions: LEVELS.upazila, fixes: cityFixes });
const leftover = new Set(cityThana.unmatched.map((u) => u.shapeName));
const cityArea = matchLevel({ features: inDhaka.filter((f) => leftover.has(f.properties.shapeName)), places: cityPlaces, levels: ['AREA'], districtOf: () => ({ code: DHAKA }) as PlaceRef, pathOptions: LEVELS.upazila, fixes: cityFixes });
const cityShapes = [...cityThana.shapes, ...cityArea.shapes].sort((a, b) => (a.code < b.code ? -1 : 1));
const cityNames = new Set(cityShapes.map((s) => s.code));
write('dhakaThana', cityShapes);
const cityShapeNames = new Set([...cityThana.shapes.map((c) => cityThana.featureOf.get(c.code)?.properties.shapeName), ...cityArea.shapes.map((c) => cityArea.featureOf.get(c.code)?.properties.shapeName)]);
const upaMatchedCodes = new Set(upa.shapes.map((s) => s.code));
// a Dhaka City shape that the upazila pass could not match is not a problem: it is in the Dhaka City pack
const upaUnmatched = upa.unmatched.filter((u) => !(u.district === DHAKA && cityShapeNames.has(u.shapeName)));
report.upazila = { shapes: upa.shapes.length, unmatched: upaUnmatched, unclaimed: upa.unclaimed.filter((c) => !cityNames.has(c)) };
// a shape of Dhaka district that is an upazila (Savar, Dhamrai ...) is in the upazila pack, not a Dhaka City miss
const upaShapeNames = new Set([...upa.featureOf.values()].map((f) => f.properties.shapeName));
const cityMiss = cityArea.unmatched.filter((u) => !upaShapeNames.has(u.shapeName));
report.dhakaThana = { shapes: cityShapes.length, unmatched: cityMiss, unclaimedCityThanas: cityPlaces.filter((p) => p.level === 'THANA' && !upaMatchedCodes.has(p.code) && !cityNames.has(p.code)).map((p) => p.code) };

const sorted = Object.fromEntries(Object.entries(centroids).sort(([a], [b]) => (a < b ? -1 : 1)));
writeFileSync(join(outDir, 'centroids.json'), JSON.stringify(sorted) + '\n');
writeFileSync(join(outDir, 'unmatched.json'), JSON.stringify(report, null, 2) + '\n');

// fill GeoArea.lat/lng where empty in the sample gazetteer (the importer's existing path reads these columns)
const latI = col('lat');
const lngI = col('lng');
const codeI = col('code');
let filled = 0;
const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const lines = [head.join(',')];
for (const r of table.slice(1)) {
  const c = centroids[r[codeI]!];
  if (c && !r[latI] && !r[lngI]) {
    r[latI] = String(c[0]);
    r[lngI] = String(c[1]);
    filled++;
  }
  lines.push(r.map(cell).join(','));
}
writeFileSync(csvPath, `${lines.join('\n')}\n`);
console.log(`division ${div.shapes.length}/8, district ${dis.shapes.length}/64, upazila ${upa.shapes.length}, Dhaka City ${cityShapes.length}; unmatched: ${div.unmatched.length}/${dis.unmatched.length}/${upaUnmatched.length}/${cityMiss.length}; lat/lng filled on ${filled} places`);

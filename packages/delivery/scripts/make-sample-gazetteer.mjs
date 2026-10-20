// PR 549 — builds the SAMPLE gazetteer (data/gazetteer-sample.csv) from public place names only: the national list the
// approved demo carries (docs/demo/src/05-gazetteer.js, made from BD-AREA-MASTER.csv) plus the curated overlay below
// (the 8 divisions, which district sits in which division, the upazilas of Dhaka, Gazipur and Narayanganj, and which
// Dhaka City areas belong to DNCC or DSCC). Nothing of the owner's is read or written: the demo's own band numbers are
// NOT copied — the sub-area list is the owner's (PR 550) and ships empty. Only "band 0 = Dhaka City" is used, to put a
// DNCC / DSCC tag on the city areas (the public city-corporation map).
//
// It is a representative sample, not the finished national gazetteer: every district and the demo's upazilas and
// thanas, the Dhaka City areas, the Gazipur / Savar / Narayanganj areas and the demo's landmarks, with the names that
// collide across the country (Gabtoli ↔ Gabtali, Sreepur ↔ Sripur, Bogra ↔ Bogura, Nawabganj, Kaliganj, Mirpur …).
// The full list goes in through the same importer (`pnpm --filter @extas/delivery gazetteer:import <file.csv>`).
//
//   node packages/delivery/scripts/make-sample-gazetteer.mjs     (writes data/gazetteer-sample.csv)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '../../..');
const out = join(here, '../data/gazetteer-sample.csv');

const src = readFileSync(join(repo, 'docs/demo/src/05-gazetteer.js'), 'utf8');
const { GZ, GZ_DISTRICTS } = new Function(`${src};return {GZ, GZ_DISTRICTS};`)();

// ---- the curated overlay -------------------------------------------------------------------------------------------

const DIVISIONS = [
  { slug: 'barishal', en: 'Barishal', bn: 'বরিশাল', aliases: ['barisal'] },
  { slug: 'chattogram', en: 'Chattogram', bn: 'চট্টগ্রাম', aliases: ['chittagong'] },
  { slug: 'dhaka', en: 'Dhaka', bn: 'ঢাকা', aliases: ['dacca'] },
  { slug: 'khulna', en: 'Khulna', bn: 'খুলনা', aliases: [] },
  { slug: 'mymensingh', en: 'Mymensingh', bn: 'ময়মনসিংহ', aliases: ['moymonsingh'] },
  { slug: 'rajshahi', en: 'Rajshahi', bn: 'রাজশাহী', aliases: [] },
  { slug: 'rangpur', en: 'Rangpur', bn: 'রংপুর', aliases: [] },
  { slug: 'sylhet', en: 'Sylhet', bn: 'সিলেট', aliases: [] },
];

const DIVISION_OF = {
  barishal: ['Barguna', 'Barishal', 'Bhola', 'Jhalakathi', 'Patuakhali', 'Pirojpur'],
  chattogram: ['Bandarban', 'Brahmanbaria', 'Chandpur', 'Chattogram', 'Cumilla', "Cox's Bazar", 'Feni', 'Khagrachhari', 'Lakshmipur', 'Noakhali', 'Rangamati'],
  dhaka: ['Dhaka', 'Faridpur', 'Gazipur', 'Gopalganj', 'Kishoreganj', 'Madaripur', 'Manikganj', 'Munshiganj', 'Narayanganj', 'Narsingdi', 'Rajbari', 'Shariatpur', 'Tangail'],
  khulna: ['Bagerhat', 'Chuadanga', 'Jashore', 'Jhenaidah', 'Khulna', 'Kushtia', 'Magura', 'Meherpur', 'Narail', 'Satkhira'],
  mymensingh: ['Jamalpur', 'Mymensingh', 'Netrokona', 'Sherpur'],
  rajshahi: ['Bogura', 'Chapai Nawabganj', 'Joypurhat', 'Naogaon', 'Natore', 'Pabna', 'Rajshahi', 'Sirajganj'],
  rangpur: ['Dinajpur', 'Gaibandha', 'Kurigram', 'Lalmonirhat', 'Nilphamari', 'Panchagarh', 'Rangpur', 'Thakurgaon'],
  sylhet: ['Habiganj', 'Moulvibazar', 'Sunamganj', 'Sylhet'],
};

/**
 * The upazilas and thanas of the three districts around Dhaka City, made by hand. `from` names the demo entries whose
 * spellings they take over (and which are then not imported a second time); `postcodes` decide which upazila an area
 * of the demo list sits in.
 */
const METRO = [
  // Dhaka district outside the two city corporations
  { district: 'Dhaka', slug: 'savar', level: 'UPAZILA', en: 'Savar', from: ['Savar|4', 'Savar|3', 'Savar (Tetuljhora)|3'], postcodes: ['1340', '1342', '1343', '1344', '1345', '1346', '1347', '1348', '1349'] },
  { district: 'Dhaka', parent: 'savar', slug: 'ashulia', level: 'THANA', en: 'Ashulia', from: ['Ashulia|4', 'Ashulia Thana|4', 'Ashulia (Dhamsona)|3'], postcodes: ['1341'] },
  { district: 'Dhaka', slug: 'dhamrai', level: 'UPAZILA', en: 'Dhamrai', from: ['Dhamrai|4'], postcodes: ['1350', '1351'] },
  { district: 'Dhaka', slug: 'dohar', level: 'UPAZILA', en: 'Dohar', from: ['Dohar|4'], postcodes: ['1330', '1331', '1332'] },
  { district: 'Dhaka', slug: 'keraniganj', level: 'UPAZILA', en: 'Keraniganj', from: ['Keraniganj|2', 'Keraniganj|3'], postcodes: ['1310', '1311', '1312'] },
  { district: 'Dhaka', slug: 'nawabganj', level: 'UPAZILA', en: 'Nawabganj', from: ['Nawabganj|2', 'Nawabganj (Dhaka)|4'], postcodes: ['1320', '1321', '1322', '1323'] },
  // Gazipur
  { district: 'Gazipur', slug: 'gazipur-sadar', level: 'UPAZILA', en: 'Gazipur Sadar', from: ['Gazipur|4', 'Gazipur Sadar (Tongi)|3'], dropNames: ['gazipur', 'গাজীপুর'], postcodes: ['1700', '1701', '1702', '1703', '1704', '1705', '1706', '1707', '1708', '1709'] },
  { district: 'Gazipur', parent: 'gazipur-sadar', slug: 'tongi', level: 'THANA', en: 'Tongi', from: ['Tongi|4'], postcodes: ['1710', '1711', '1712'] },
  { district: 'Gazipur', slug: 'kaliganj', level: 'UPAZILA', en: 'Kaliganj', from: ['Kaliganj|2'], postcodes: ['1720', '1721', '1722', '1723'] },
  { district: 'Gazipur', slug: 'kapasia', level: 'UPAZILA', en: 'Kapasia', from: ['Kapasia|4'], postcodes: ['1730'] },
  { district: 'Gazipur', slug: 'sreepur', level: 'UPAZILA', en: 'Sreepur', from: ['Sreepur|4', 'Sreepur / Kapasia|3'], postcodes: ['1740', '1741', '1742', '1743', '1744', '1745', '1746', '1747', '1748'] },
  { district: 'Gazipur', slug: 'kaliakair', level: 'UPAZILA', en: 'Kaliakair', from: ['Kaliakair|4'], postcodes: ['1750', '1751'] },
  // Narayanganj
  { district: 'Narayanganj', slug: 'narayanganj-sadar', level: 'UPAZILA', en: 'Narayanganj Sadar', from: ['Narayanganj|4', 'Narayanganj Sadar (Fatullah)|3'], dropNames: ['narayanganj', 'নারায়ণগঞ্জ', 'n ganj', 'nganj', 'narayan ganj', 'naraynganj', 'narayangonj'], postcodes: ['1400'] },
  { district: 'Narayanganj', parent: 'narayanganj-sadar', slug: 'fatullah', level: 'THANA', en: 'Fatullah', from: ['Fatullah|4', 'Fatullah Thana|3'], postcodes: ['1420', '1421'] },
  { district: 'Narayanganj', parent: 'narayanganj-sadar', slug: 'siddhirganj', level: 'THANA', en: 'Siddhirganj', from: ['Siddhirganj|4', 'Siddhirganj Thana|3'], postcodes: ['1430', '1431', '1432'] },
  { district: 'Narayanganj', slug: 'bandar', level: 'UPAZILA', en: 'Bandar', from: ['Bandar|4'], postcodes: ['1410', '1411', '1412', '1413', '1414'] },
  { district: 'Narayanganj', slug: 'sonargaon', level: 'UPAZILA', en: 'Sonargaon', from: ['Sonargaon|4'], postcodes: ['1440', '1441', '1442'] },
  { district: 'Narayanganj', slug: 'araihazar', level: 'UPAZILA', en: 'Araihazar', from: ['Araihazar|4'], postcodes: ['1450', '1451'] },
  { district: 'Narayanganj', slug: 'rupganj', level: 'UPAZILA', en: 'Rupganj', from: ['Rupganj|4', 'Rupganj (Bhulta)|3'], postcodes: ['1460', '1461', '1462', '1463', '1464'] },
];

/** Demo thanas of the district that are only a duplicate spelling of the district itself. */
const DISTRICT_DUPLICATES = ['Gazipur|3', 'Narayanganj|3'];

/** The Dhaka City thanas of the demo list and their city corporation. */
const CITY_THANAS = {
  'Uttara West': 'DNCC', 'Uttara East': 'DNCC', Uttara: 'DNCC', Bimanbandar: 'DNCC', Gulshan: 'DNCC', Cantonment: 'DNCC',
  Mirpur: 'DNCC', 'Tejgaon I/A': 'DNCC', Gandaria: 'DSCC',
};

/** Dhaka City areas: which city corporation a post office's area sits in (a few areas on a boundary named below). */
const CITY_BY_POSTCODE = {
  1000: 'DSCC', 1100: 'DSCC', 1203: 'DSCC', 1204: 'DSCC', 1205: 'DSCC', 1206: 'DNCC', 1207: 'DNCC', 1208: 'DNCC',
  1209: 'DSCC', 1211: 'DSCC', 1212: 'DNCC', 1213: 'DNCC', 1214: 'DSCC', 1215: 'DNCC', 1216: 'DNCC', 1217: 'DSCC',
  1219: 'DSCC', 1229: 'DNCC', 1230: 'DNCC', 1236: 'DSCC', 1360: 'DSCC', 1361: 'DSCC', 1362: 'DSCC',
};
const CITY_BY_NAME = { Rampura: 'DNCC', 'Hajipara (Rampura)': 'DNCC', Ulon: 'DNCC', 'Mohanagar Project': 'DNCC', Hatirjheel: 'DNCC' };

const LEVEL = { 1: 'DISTRICT', 2: 'UPAZILA', 3: 'THANA', 4: 'AREA', 5: 'AREA' };

// ---- building ------------------------------------------------------------------------------------------------------

const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
const isBn = (s) => /[ঀ-৿]/.test(s);
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9ঀ-৿]+/g, ' ').trim();

// One demo place = canonical name + district + level (+ band: the demo files Savar twice in different bands).
const places = new Map();
for (const e of GZ) {
  const [name, band, level, d, postcode, canonical] = e;
  const key = `${canonical}|${d}|${level}|${band}`;
  let p = places.get(key);
  if (!p) places.set(key, (p = { canonical, band, level, district: GZ_DISTRICTS[d], postcodes: new Set(), names: [] }));
  if (postcode) p.postcodes.add(postcode);
  if (!p.names.includes(name)) p.names.push(name);
}
const byRef = (district, ref) => {
  const [canonical, level] = ref.split('|');
  return [...places.values()].filter((p) => p.district === district && p.canonical === canonical && String(p.level) === level);
};

const rows = new Map(); // code → row
const used = new Set();
const divisionSlugOf = {};
for (const [div, list] of Object.entries(DIVISION_OF)) for (const d of list) divisionSlugOf[d] = div;
if (Object.keys(divisionSlugOf).length !== 64 || GZ_DISTRICTS.some((d) => !divisionSlugOf[d])) throw new Error('every district needs its division');

function addRow(r) {
  let code = r.code;
  for (let i = 2; rows.has(code); i++) code = `${r.code}-${i}`;
  rows.set(code, { ...r, code });
  return code;
}

function namesOf(list, nameEn, drop = []) {
  const all = list.flatMap((p) => p.names);
  const bn = all.find(isBn) ?? '';
  const seen = new Set([norm(nameEn), norm(bn), ...drop.map(norm)]);
  const aliases = [];
  for (const n of all) {
    const k = norm(n);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    aliases.push(n);
  }
  return { bn, aliases };
}

for (const d of DIVISIONS) {
  addRow({ code: `bd.${d.slug}`, level: 'DIVISION', parent: '', nameEn: d.en, nameBn: d.bn, aliases: d.aliases, postcodes: [], cityCorporation: '' });
}

const districtCode = {};
for (const name of GZ_DISTRICTS) {
  const list = [...places.values()].filter((p) => p.district === name && p.level === 1);
  for (const p of list) used.add(p);
  for (const ref of DISTRICT_DUPLICATES) if (ref.startsWith(`${name}|`)) for (const p of byRef(name, ref)) { used.add(p); list.push(p); }
  const { bn, aliases } = namesOf(list, name);
  districtCode[name] = addRow({
    code: `bd.${divisionSlugOf[name]}.${slug(name)}`,
    level: 'DISTRICT',
    parent: `bd.${divisionSlugOf[name]}`,
    nameEn: name,
    nameBn: bn,
    aliases,
    postcodes: [...new Set(list.flatMap((p) => [...p.postcodes]))],
    cityCorporation: '',
  });
}

// The metro upazilas and thanas, by hand.
const metroByPostcode = {};
const metroCode = {};
for (const m of METRO) {
  const list = m.from.flatMap((ref) => byRef(m.district, ref));
  if (!list.length) throw new Error(`no demo entry for ${m.en}`);
  for (const p of list) used.add(p);
  const { bn, aliases } = namesOf(list, m.en, m.dropNames);
  const parent = m.parent ? metroCode[`${m.district}|${m.parent}`] : districtCode[m.district];
  const code = addRow({ code: `${parent}.${m.slug}`, level: m.level, parent, nameEn: m.en, nameBn: bn, aliases, postcodes: m.postcodes, cityCorporation: '' });
  metroCode[`${m.district}|${m.slug}`] = code;
  for (const pc of m.postcodes) metroByPostcode[`${m.district}|${pc}`] = code;
}

// Dhaka City thanas.
for (const [name, corp] of Object.entries(CITY_THANAS)) {
  const list = byRef('Dhaka', `${name}|3`);
  if (!list.length) throw new Error(`no demo thana ${name}`);
  for (const p of list) used.add(p);
  const { bn, aliases } = namesOf(list, name);
  addRow({ code: `${districtCode.Dhaka}.${slug(name)}`, level: 'THANA', parent: districtCode.Dhaka, nameEn: name, nameBn: bn, aliases, postcodes: [], cityCorporation: corp });
}

// Everything else of the demo list: upazilas and thanas under their district, areas and landmarks under their district,
// or under the metro upazila their post office belongs to.
const sorted = [...places.values()].filter((p) => !used.has(p)).sort((a, b) => a.level - b.level || a.district.localeCompare(b.district) || a.canonical.localeCompare(b.canonical));
let unparented = 0;
for (const p of sorted) {
  const pcs = [...p.postcodes];
  let parent = districtCode[p.district];
  let cityCorporation = '';
  if (p.district === 'Dhaka' && p.band === 0) {
    cityCorporation = CITY_BY_NAME[p.canonical] ?? CITY_BY_POSTCODE[pcs[0]] ?? '';
    if (!cityCorporation) throw new Error(`Dhaka City area ${p.canonical} has no city corporation`);
  } else if (['Dhaka', 'Gazipur', 'Narayanganj'].includes(p.district) && p.level >= 4) {
    const m = pcs.map((pc) => metroByPostcode[`${p.district}|${pc}`]).find(Boolean);
    if (m) parent = m;
    else unparented++;
  }
  const { bn, aliases } = namesOf([p], p.canonical);
  addRow({ code: `${parent}.${slug(p.canonical)}`, level: LEVEL[p.level], parent, nameEn: p.canonical, nameBn: bn, aliases, postcodes: pcs, cityCorporation });
}

// ---- writing -------------------------------------------------------------------------------------------------------

const cell = (v) => {
  const s = Array.isArray(v) ? v.join('|') : String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const header = ['code', 'level', 'parent', 'nameEn', 'nameBn', 'aliases', 'postcodes', 'cityCorporation', 'lat', 'lng'];
const lines = [header.join(',')];
for (const r of rows.values()) lines.push(header.map((h) => cell(r[h] ?? '')).join(','));
writeFileSync(out, `${lines.join('\n')}\n`);

const count = {};
for (const r of rows.values()) count[r.level] = (count[r.level] ?? 0) + 1;
console.log(`gazetteer sample: ${rows.size} places ${JSON.stringify(count)}; metro areas left under their district: ${unparented}`);

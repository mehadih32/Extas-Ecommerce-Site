// PR 549 — the gazetteer file. One place per line, parents by code, several values in a cell split by "|":
//
//   code,level,parent,nameEn,nameBn,aliases,postcodes,cityCorporation,lat,lng
//   bd.rajshahi.bogura.gabtali,UPAZILA,bd.rajshahi.bogura,Gabtali,গাবতলী,,5820,,,
//
// - code: a stable key in lower case (`bd.<division>.<district>…`); a later import with the same code updates the row;
// - level: DIVISION, DISTRICT, UPAZILA, THANA or AREA; a division has no parent, everything else names one in the file;
// - cityCorporation: DNCC / DSCC (or another city's code) for a place inside a city corporation (PR 550 reads it);
// - lat / lng: where they exist.
// Reading never guesses: a broken line is reported with its line number and nothing is imported.
import { z } from 'zod';
import { GEO_LEVELS, type GeoLevelName } from './gazetteer';

export interface GazetteerRow {
  code: string;
  level: GeoLevelName;
  parent: string | null;
  nameEn: string;
  nameBn: string | null;
  aliases: string[];
  postcodes: string[];
  cityCorporation: string | null;
  lat: number | null;
  lng: number | null;
}

export interface CsvProblem {
  line: number;
  field?: string;
  message: string;
}

export class GazetteerFileError extends Error {
  constructor(readonly problems: CsvProblem[]) {
    super(`the gazetteer file has ${problems.length} problem(s): ${problems.slice(0, 5).map((p) => `line ${p.line}${p.field ? ` ${p.field}` : ''}: ${p.message}`).join('; ')}`);
    this.name = 'GazetteerFileError';
  }
}

export const GAZETTEER_COLUMNS = ['code', 'level', 'parent', 'nameEn', 'nameBn', 'aliases', 'postcodes', 'cityCorporation', 'lat', 'lng'] as const;

/** A byte-order mark some spreadsheet programs put at the start of a file. */
const BOM = 0xfeff;

/** RFC 4180 records: commas, double-quoted cells with "" for a quote, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.charCodeAt(0) === BOM ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      out.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    out.push(row);
  }
  return out.filter((r) => !(r.length === 1 && r[0] === ''));
}

const list = (s: string) =>
  s
    .split('|')
    .map((x) => x.trim())
    .filter(Boolean);

const codeSchema = z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/, { message: 'a code is lower-case words joined by dots or hyphens' }).max(200);
const rowSchema = z.object({
  code: codeSchema,
  level: z.enum(GEO_LEVELS),
  parent: codeSchema.nullable(),
  nameEn: z.string().min(1).max(120),
  nameBn: z.string().min(1).max(120).nullable(),
  aliases: z.array(z.string().min(1).max(120)).max(40),
  postcodes: z.array(z.string().regex(/^\d{4}$/, { message: 'a postcode is 4 digits' })).max(40),
  cityCorporation: z.string().regex(/^[A-Z]{2,10}$/, { message: 'a city corporation code is 2–10 capital letters, e.g. DNCC' }).nullable(),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
});

const num = (s: string): number | null => (s.trim() === '' ? null : Number(s));
const opt = (s: string): string | null => (s.trim() === '' ? null : s.trim());

/** Reads and checks a gazetteer file. Throws GazetteerFileError naming every broken line. */
export function readGazetteerCsv(text: string): GazetteerRow[] {
  const records = parseCsv(text);
  const problems: CsvProblem[] = [];
  const header = records[0]?.map((h) => h.trim());
  if (!header || GAZETTEER_COLUMNS.some((c, i) => header[i] !== c)) {
    throw new GazetteerFileError([{ line: 1, message: `the first line must be: ${GAZETTEER_COLUMNS.join(',')}` }]);
  }
  const rows: GazetteerRow[] = [];
  const at = new Map<string, number>();
  records.slice(1).forEach((r, i) => {
    const line = i + 2;
    if (r.length !== GAZETTEER_COLUMNS.length) {
      problems.push({ line, message: `expected ${GAZETTEER_COLUMNS.length} cells, found ${r.length}` });
      return;
    }
    const [code, level, parent, nameEn, nameBn, aliases, postcodes, city, lat, lng] = r as [string, string, string, string, string, string, string, string, string, string];
    const parsed = rowSchema.safeParse({
      code: code.trim(),
      level: level.trim(),
      parent: opt(parent),
      nameEn: nameEn.trim(),
      nameBn: opt(nameBn),
      aliases: list(aliases),
      postcodes: list(postcodes),
      cityCorporation: opt(city),
      lat: num(lat),
      lng: num(lng),
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) problems.push({ line, field: issue.path.join('.'), message: issue.message });
      return;
    }
    const row = parsed.data;
    if (at.has(row.code)) problems.push({ line, field: 'code', message: `the code is already used on line ${at.get(row.code)}` });
    at.set(row.code, line);
    if (row.level === 'DIVISION' ? row.parent !== null : row.parent === null) {
      problems.push({ line, field: 'parent', message: row.level === 'DIVISION' ? 'a division has no parent' : 'every place below a division names its parent' });
    }
    rows.push(row);
  });
  const byCode = new Map(rows.map((r) => [r.code, r]));
  for (const r of rows) {
    if (r.parent && !byCode.has(r.parent)) problems.push({ line: at.get(r.code)!, field: 'parent', message: `no place with the code ${r.parent} in the file` });
    if (r.parent === r.code) problems.push({ line: at.get(r.code)!, field: 'parent', message: 'a place cannot be its own parent' });
  }
  // A chain that loops back on itself never reaches a division.
  for (const r of rows) {
    const seen = new Set<string>();
    for (let p: GazetteerRow | undefined = r; p?.parent; p = byCode.get(p.parent)) {
      if (seen.has(p.code)) {
        problems.push({ line: at.get(r.code)!, field: 'parent', message: 'the parents go round in a circle' });
        break;
      }
      seen.add(p.code);
    }
  }
  if (problems.length) throw new GazetteerFileError(problems);
  return rows;
}

/** Rows ordered so that every parent comes before its children (the importer writes them in this order). */
export function parentsFirst(rows: readonly GazetteerRow[]): GazetteerRow[][] {
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const depthOf = new Map<string, number>();
  const depth = (r: GazetteerRow): number => {
    const known = depthOf.get(r.code);
    if (known !== undefined) return known;
    const d = r.parent ? depth(byCode.get(r.parent)!) + 1 : 0;
    depthOf.set(r.code, d);
    return d;
  };
  const tiers: GazetteerRow[][] = [];
  for (const r of rows) (tiers[depth(r)] ??= []).push(r);
  return tiers.filter(Boolean);
}

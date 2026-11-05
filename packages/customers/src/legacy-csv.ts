// S14 · PR 535 — reading the old shop's order list (pure: no database, no settings). One row of the file is one old
// order: a phone number (needed), and the name, address, order date, total, status and the old order number when the
// file has them. Which column is which, and what each status word means (delivered, returned, cancelled or other), is
// the person's choice on the preview; a first guess comes from the words the admin passes (its own dictionary, en + bn),
// never from words written here. Digits may be Bengali. A row's fingerprint (number, day, total, old order number)
// finds the same old order twice, in one file or in an earlier import.
import { parseMoney, readTable } from '@extas/catalogue';
import { asciiDigits, phoneNormalizeBD } from '@extas/delivery';

/** The columns an old order list may carry, in the preview's order. Only `phone` is needed. */
export const LEGACY_FIELDS = ['phone', 'name', 'address', 'orderedAt', 'total', 'status', 'ref'] as const;
export type LegacyField = (typeof LEGACY_FIELDS)[number];

/** What an old order's status means for his history. */
export const LEGACY_OUTCOMES = ['delivered', 'returned', 'cancelled', 'other'] as const;
export type LegacyOutcome = (typeof LEGACY_OUTCOMES)[number];

/** How a date like 04/03/2025 is read (an ISO date, 2025-03-04, is always year first). */
export const LEGACY_DATE_ORDERS = ['dmy', 'mdy'] as const;
export type LegacyDateOrder = (typeof LEGACY_DATE_ORDERS)[number];

/** Column index (0-based) per field; null: the file has no such column. */
export type LegacyMapping = Record<LegacyField, number | null>;

export interface LegacyRow {
  /** The row's line in the file (1 = the header). */
  line: number;
  /** E.164, or null when the number is not a Bangladeshi mobile number. */
  phone: string | null;
  phoneRaw: string;
  name: string | null;
  address: string | null;
  ref: string | null;
  orderedAt: Date | null;
  totalMinor: number | null;
  statusText: string | null;
  outcome: LegacyOutcome;
  fingerprint: string;
}

const SEPARATORS = [',', ';', '\t'] as const;

/** The file's separator: the one the header line holds most of (a comma when none). */
export function guessDelimiter(text: string): string {
  const first = (text.startsWith('﻿') ? text.slice(1) : text).split(/\r?\n/, 1)[0] ?? '';
  let best: string = SEPARATORS[0];
  let most = 0;
  for (const s of SEPARATORS) {
    const n = first.split(s).length - 1;
    if (n > most) [best, most] = [s, n];
  }
  return best;
}

/** A header or a word, compared without case, spaces or punctuation. */
export const wordKey = (s: string): string => asciiDigits(s).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** A first guess at which column is which: a header equal to one of the field's words (or its own key), then one that
 * holds such a word. A column is given to one field only. */
export function guessMapping(header: readonly string[], hints: Partial<Record<LegacyField, readonly string[]>>): LegacyMapping {
  const keys = header.map(wordKey);
  const taken = new Set<number>();
  const out = Object.fromEntries(LEGACY_FIELDS.map((f) => [f, null])) as LegacyMapping;
  const words = (f: LegacyField) => [f, ...(hints[f] ?? [])].map(wordKey).filter((w) => w.length > 0);
  for (const pass of ['equal', 'holds'] as const) {
    for (const f of LEGACY_FIELDS) {
      if (out[f] !== null) continue;
      const i = keys.findIndex((k, idx) => !taken.has(idx) && k.length > 0 && words(f).some((w) => (pass === 'equal' ? k === w : k.includes(w))));
      if (i >= 0) {
        out[f] = i;
        taken.add(i);
      }
    }
  }
  return out;
}

/** A first guess at what each status word means: one that holds a word of an outcome; anything else is "other". */
export function guessOutcome(status: string, hints: Partial<Record<LegacyOutcome, readonly string[]>>): LegacyOutcome {
  const k = wordKey(status);
  if (!k) return 'other';
  for (const o of LEGACY_OUTCOMES) if ((hints[o] ?? []).map(wordKey).some((w) => w.length > 0 && k.includes(w))) return o;
  return 'other';
}

/** A day from the file, at noon UTC (the same calendar day in every zone the shop could be in); null when unreadable. */
export function parseLegacyDate(cell: string, order: LegacyDateOrder): Date | null {
  const s = asciiDigits(cell).trim();
  let y: number, m: number, d: number;
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/.exec(s);
  const local = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:[ T].*)?$/.exec(s);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (local) {
    const [a, b, yy] = [Number(local[1]), Number(local[2]), local[3]!];
    [d, m] = order === 'dmy' ? [a, b] : [b, a];
    y = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
  } else return null;
  const t = new Date(Date.UTC(y, m - 1, d, 12));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? t : null;
}

const cellOf = (cells: readonly string[], i: number | null): string => (i === null ? '' : (cells[i] ?? '').trim());
const orNull = (s: string): string | null => (s === '' ? null : s);

/** The row's fingerprint: the same old order in one file or in an earlier import. */
export const fingerprintOf = (phone: string, orderedAt: Date | null, totalMinor: number | null, ref: string | null): string =>
  [phone, orderedAt ? orderedAt.toISOString().slice(0, 10) : '', totalMinor ?? '', ref ? wordKey(ref) : ''].join('|');

export interface LegacyFile {
  header: string[];
  rows: LegacyRow[];
}

/** The file's rows with the person's choices (statuses not in `statuses` are "other"). Throws CsvSyntaxError on an
 * unclosed quote. */
export function readLegacyFile(text: string, opts: { mapping: LegacyMapping; statuses: Readonly<Record<string, LegacyOutcome>>; digits: number; dateOrder: LegacyDateOrder }): LegacyFile {
  const table = readTable(text, guessDelimiter(text));
  const { mapping: mp } = opts;
  const rows = table.rows.map(({ line, cells }): LegacyRow => {
    const phoneRaw = cellOf(cells, mp.phone);
    const p = phoneNormalizeBD(phoneRaw);
    const ref = orNull(cellOf(cells, mp.ref));
    const orderedAt = parseLegacyDate(cellOf(cells, mp.orderedAt), opts.dateOrder);
    const totalMinor = parseMoney(asciiDigits(cellOf(cells, mp.total)).replace(/^[^\d]+|[^\d]+$/g, ''), opts.digits);
    const statusText = orNull(cellOf(cells, mp.status));
    const phone = p.ok ? p.e164 : null;
    return {
      line,
      phone,
      phoneRaw,
      name: orNull(cellOf(cells, mp.name)),
      address: orNull(cellOf(cells, mp.address)),
      ref,
      orderedAt,
      totalMinor,
      statusText,
      outcome: statusText === null ? 'other' : (opts.statuses[statusText] ?? 'other'),
      fingerprint: phone ? fingerprintOf(phone, orderedAt, totalMinor, ref) : '',
    };
  });
  return { header: table.header, rows };
}

/** The header only (for the first guess), without reading the rows' meaning. */
export function legacyHeader(text: string): string[] {
  return readTable(text, guessDelimiter(text)).header;
}

/** Each status word in the file with how many rows carry it, most first. */
export function statusWords(text: string, statusColumn: number | null): { text: string; rows: number }[] {
  if (statusColumn === null) return [];
  const count = new Map<string, number>();
  for (const r of readTable(text, guessDelimiter(text)).rows) {
    const s = cellOf(r.cells, statusColumn);
    if (s) count.set(s, (count.get(s) ?? 0) + 1);
  }
  return [...count].map(([t, n]) => ({ text: t, rows: n })).sort((a, b) => b.rows - a.rows || a.text.localeCompare(b.text));
}

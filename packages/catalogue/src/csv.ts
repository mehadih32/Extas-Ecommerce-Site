// PR 34 — reading and writing CSV (RFC 4180): quoted cells with commas, quotes and line breaks, CRLF or LF, a UTF-8
// byte-order mark, a chosen separator. Pure: no database, no settings (callers pass the separator).

export interface CsvTable {
  header: string[];
  /** Data rows with their line number in the file (1 = the header), for row-level errors. */
  rows: { line: number; cells: string[] }[];
}

/** Splits CSV text into records. Throws CsvSyntaxError on an unclosed quote. */
export function parseCsv(text: string, delimiter: string): string[][] {
  const s = text.startsWith('\uFEFF') ? text.slice(1) : text;
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let i = 0;
  let line = 1;
  let quoteLine = 0;
  while (i < s.length) {
    const ch = s[i]!;
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      if (ch === '\n') line++;
      cell += ch;
      i++;
      continue;
    }
    if (ch === '"' && cell === '') {
      quoted = true;
      quoteLine = line;
      i++;
      continue;
    }
    if (ch === delimiter) {
      row.push(cell);
      cell = '';
      i++;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      row.push(cell);
      out.push(row);
      row = [];
      cell = '';
      i += ch === '\r' && s[i + 1] === '\n' ? 2 : 1;
      line++;
      continue;
    }
    cell += ch;
    i++;
  }
  if (quoted) throw new CsvSyntaxError(quoteLine);
  if (cell !== '' || row.length) {
    row.push(cell);
    out.push(row);
  }
  return out;
}

export class CsvSyntaxError extends Error {
  constructor(readonly line: number) {
    super(`a quote opened on line ${line} is never closed`);
    this.name = 'CsvSyntaxError';
  }
}

/** The header and the data rows (blank lines skipped), with line numbers. */
export function readTable(text: string, delimiter: string): CsvTable {
  const records = parseCsv(text, delimiter);
  const numbered: { line: number; cells: string[] }[] = [];
  // Line numbers count records (a quoted line break stays inside its record, as a spreadsheet shows it).
  records.forEach((cells, idx) => numbered.push({ line: idx + 1, cells }));
  const nonBlank = numbered.filter((r) => r.cells.some((c) => c.trim() !== ''));
  const [head, ...rows] = nonBlank;
  return { header: (head?.cells ?? []).map((h) => h.trim()), rows };
}

/**
 * One cell as written to a file. A cell that a spreadsheet would run as a formula (=, +, -, @, tab, CR at the start)
 * gets a leading apostrophe, so an exported file can never carry a formula into Excel.
 */
export function csvCell(value: string | number | boolean | null | undefined, delimiter: string): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return s.includes(delimiter) || /["\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

/** A whole file: header + rows, CRLF line ends (what spreadsheets expect), with a BOM so Excel reads UTF-8. */
export function writeCsv(header: readonly string[], rows: readonly (readonly (string | number | boolean | null | undefined)[])[], delimiter: string): string {
  const line = (cells: readonly (string | number | boolean | null | undefined)[]) => cells.map((c) => csvCell(c, delimiter)).join(delimiter);
  return `\uFEFF${[line(header), ...rows.map(line)].join('\r\n')}\r\n`;
}

/** Undoes the export's formula guard on import ("'=x" → "=x" is never wanted back as a formula, so only the mark goes). */
export function uncell(s: string): string {
  return /^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s;
}

/** A money cell ("850", "1,450.50") in minor units for a currency with `digits` decimals, or null when not a number. */
export function parseMoney(cell: string, digits: number): number | null {
  const s = cell.trim().replace(/[,\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  if (frac.length > digits) return null;
  return Number(whole) * 10 ** digits + Number(frac.padEnd(digits, '0') || '0');
}

/** Minor units as a money cell ("85000" → "850" for 2 decimals; "1450.50" keeps its fraction). */
export function formatMoneyCell(minor: number | null, digits: number): string {
  if (minor == null) return '';
  const f = 10 ** digits;
  const whole = Math.trunc(minor / f);
  const frac = minor % f;
  return frac ? `${whole}.${String(frac).padStart(digits, '0')}` : String(whole);
}

/** A yes/no cell: 1/0, true/false, yes/no, y/n (any case); null when it is neither. */
export function parseBool(cell: string): boolean | null {
  const s = cell.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(s)) return true;
  if (['0', 'false', 'no', 'n'].includes(s)) return false;
  return null;
}

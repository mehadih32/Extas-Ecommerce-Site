// PR 628 (CN-036, LUMEN-SPEC §3 items 3–4) — the list's filter chips, search and "Show more", pure so the list + filter +
// bulk pattern (components/admin/lumen/ListView.tsx) and its tests share it.

export interface ListRowLike {
  id: string;
  chips: readonly string[];
  text: string;
}

const fold = (s: string) => s.normalize('NFKC').toLocaleLowerCase();

/** The rows of one chip ("all" = every row) whose text holds every word of the search. */
export function filterRows<R extends ListRowLike>(rows: readonly R[], chip: string, query: string): R[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return rows.filter((r) => (chip === 'all' || r.chips.includes(chip)) && (!words.length || words.every((w) => fold(r.text).includes(w))));
}

/** How many rows each chip has (with the search applied, so a chip never promises rows the search hides). */
export function chipCounts(rows: readonly ListRowLike[], chips: readonly string[], query: string): Record<string, number> {
  const found = filterRows(rows, 'all', query);
  const out: Record<string, number> = { all: found.length };
  for (const c of chips) out[c] = found.filter((r) => r.chips.includes(c)).length;
  return out;
}

/** How many rows "show more" adds next (at most the step, never more than are left). */
export function moreCount(total: number, shown: number, step: number): number {
  return Math.max(0, Math.min(step, total - shown));
}


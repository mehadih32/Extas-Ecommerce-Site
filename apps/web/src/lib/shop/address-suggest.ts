// PR 117 / 552 · follow-up 57 — the places under the checkout's address box (GET /api/delivery/suggest): the part of
// the line being typed (after the last comma or line break) is what is looked up, a row shows the place, its district
// and its band's charge (only when the place settles one band), and picking a row writes "place, district" in place of
// that part, so the rest of what he wrote stays as it was. Pure; the fetch is the one call at the end.

/** One row as the API sends it (packages/delivery Suggestion, the fields the box uses). */
export interface SuggestRow {
  place: { id: string; nameEn: string; nameBn: string | null; parentEn: string | null; parentBn: string | null };
  matched: string;
  band: { priced: boolean; chargeMinor: number | null } | null;
}

export interface Fragment {
  /** Where the looked-up part starts and ends in the line. */
  start: number;
  end: number;
  query: string;
}

export interface SuggestView {
  id: string;
  name: string;
  parent: string | null;
  /** The band's charge, only when picking this place settles one priced band. */
  chargeMinor: number | null;
  /** What picking it writes into the line. */
  text: string;
}

const BREAK = /[,\n،;।]/;

/** The part of the line the caret is in: from the comma (or line break) before it to the one after it, trimmed. */
export function fragmentOf(line: string, caret: number = line.length): Fragment {
  const at = Math.max(0, Math.min(caret, line.length));
  let start = at;
  while (start > 0 && !BREAK.test(line[start - 1]!)) start--;
  let end = at;
  while (end < line.length && !BREAK.test(line[end]!)) end++;
  while (start < end && /\s/.test(line[start]!)) start++;
  while (end > start && /\s/.test(line[end - 1]!)) end--;
  return { start, end, query: line.slice(start, end) };
}

/**
 * What to look up, in turn, until one finds places: the whole part, then its last two words, then its last word — so
 * "House 12 Road 5 Gabt" still finds Gabtoli and "Cox's Ba" finds Cox's Bazar. Each keeps where it sits in the line.
 */
export function lookupsOf(line: string, f: Fragment): Fragment[] {
  const out: Fragment[] = [f];
  const starts: number[] = [];
  for (let i = f.start; i < f.end; i++) if (!/\s/.test(line[i]!) && (i === f.start || /\s/.test(line[i - 1]!))) starts.push(i);
  for (const s of [starts[starts.length - 2], starts[starts.length - 1]]) {
    if (s === undefined || s === f.start || out.some((x) => x.start === s)) continue;
    out.push({ start: s, end: f.end, query: line.slice(s, f.end) });
  }
  return out;
}

/** The line after a pick: the looked-up part becomes the place's text; what came before and after stays. */
export function applyPick(line: string, f: Fragment, text: string): { line: string; caret: number } {
  const before = line.slice(0, f.start);
  const after = line.slice(f.end);
  const next = `${before}${text}${after}`;
  return { line: next, caret: before.length + text.length };
}

/** A row in the page's language: the place, the district that tells it apart, the charge when it is one band's. */
export function rowView(r: SuggestRow, lang: 'en' | 'bn'): SuggestView {
  const name = (lang === 'bn' && r.place.nameBn) || r.place.nameEn;
  const parent = (lang === 'bn' && r.place.parentBn) || r.place.parentEn || null;
  const chargeMinor = r.band?.priced && typeof r.band.chargeMinor === 'number' ? r.band.chargeMinor : null;
  return { id: r.place.id, name, parent, chargeMinor, text: parent ? `${name}, ${parent}` : name };
}

/** Whether to ask: enough letters, and the line is not just the one a pick wrote (a space or comma after it). */
export function wantsRows(line: string, f: Fragment, minChars: number, pickedLine: string | null): boolean {
  if (pickedLine !== null && line.replace(/[\s,]+$/, '') === pickedLine.replace(/[\s,]+$/, '')) return false;
  return [...f.query].length >= minChars;
}

/** The rows for a part of the line (none when the service is off, slow or unreachable: the box stays a plain box). */
export async function fetchRows(query: string, storeId: number, signal?: AbortSignal): Promise<SuggestRow[]> {
  try {
    const r = await fetch(`/api/delivery/suggest?storeId=${encodeURIComponent(String(storeId))}&q=${encodeURIComponent(query)}`, { signal, credentials: 'same-origin' });
    if (!r.ok) return [];
    const d = (await r.json()) as { ok?: boolean; enabled?: boolean; rows?: SuggestRow[] };
    return d.ok && d.enabled && Array.isArray(d.rows) ? d.rows : [];
  } catch {
    return [];
  }
}

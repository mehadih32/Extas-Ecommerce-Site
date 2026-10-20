// Prefix matching over the gazetteer (PR 552 rule: prefix only, never fuzzy scoring — fuzzy turns "Sadar" into sixty
// wrong hits). The admin's place search (PR 550, adding a place to the sub-area list) and the storefront's address
// autocomplete (PR 552) both read this one function, so the owner sees the same places the customer does.
import type { Gazetteer, GeoEntry, GeoLevelName } from './gazetteer';
import { fold, normalize } from './text';

/** Bigger places first when two names match equally well (a district before an area of the same name). */
const LEVEL_RANK: Record<GeoLevelName, number> = { DISTRICT: 0, UPAZILA: 1, THANA: 2, AREA: 3, DIVISION: 4 };

export interface PlaceMatch {
  entry: GeoEntry;
  /** The name that matched (an alias when the customer typed one). */
  name: string;
  /** The whole name matched, not only its start. */
  whole: boolean;
}

/**
 * Places whose name (English, Bengali, alias or the loose Banglish form of one) starts with what was typed, each
 * place once: whole-name matches first, then the place's own name before an alias, then bigger places, then A–Z.
 */
export function matchPlaces(gazetteer: Gazetteer, query: string, limit: number): PlaceMatch[] {
  const q = normalize(query);
  if (!q || limit < 1) return [];
  const f = fold(q);
  const best = new Map<string, { m: PlaceMatch; primary: boolean }>();
  for (const k of gazetteer.prefixed(q)) {
    const whole = k.key === q || k.folded === f;
    const held = best.get(k.entry.id);
    const rank = (w: boolean, p: boolean) => (w ? 0 : 2) + (p ? 0 : 1);
    if (held && rank(held.m.whole, held.primary) <= rank(whole, k.primary)) continue;
    best.set(k.entry.id, { m: { entry: k.entry, name: k.name, whole }, primary: k.primary });
  }
  return [...best.values()]
    .sort(
      (a, b) =>
        Number(b.m.whole) - Number(a.m.whole) ||
        Number(b.primary) - Number(a.primary) ||
        LEVEL_RANK[a.m.entry.level] - LEVEL_RANK[b.m.entry.level] ||
        a.m.entry.nameEn.localeCompare(b.m.entry.nameEn) ||
        (a.m.entry.code ?? a.m.entry.id).localeCompare(b.m.entry.code ?? b.m.entry.id),
    )
    .slice(0, limit)
    .map((x) => x.m);
}

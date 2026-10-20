// PR 551 — the ambiguity resolver: it reads the whole line, and only once the customer has finished it (settle.ts says
// when). People write the district a few words later ("Gabtoli Bus Stand, Dhaka"; "Masterpara, Gabtali, Bogura"), so
// nothing is decided from the first name typed.
//
// 1. Clues: every place named in the line (longest names first, no word used twice, the exact and the loose Banglish
//    spelling), and every postcode of the gazetteer — but not a number written after "House", "Road", "Sector" …
//    (the labels are a setting).
// 2. The district that explains most clues wins; a district (or a postcode) written out breaks a tie — "the district
//    settles it", silently, with no question. Names outside that district are thrown out.
// 3. Inside it, the most official name decides (an upazila or thana over a neighbourhood); the place charged is the
//    most specific name that agrees with it.
// 4. Only a line still ambiguous after that full read asks: two places in different bands ("Gabtoli": Dhaka or
//    Bogura?), a place that holds more than one band ("Dhaka" alone), or no place at all.
// A returning customer's saved address outranks a guess (an ask), never a sure read. A band the customer confirmed is
// kept; if a later sure read disagrees, the customer is asked again — nothing changes silently.
import type { BandMap, BandRow } from './bands';
import type { Gazetteer, GeoEntry, GeoLevelName } from './gazetteer';
import { normalize, words } from './text';

export interface ResolverOptions {
  /** A name shorter than this is not looked up (two-letter words are not place names). */
  minKeyChars: number;
  /** Words after which a number is a house / road / sector number, not a postcode (normalized). */
  numberLabels: readonly string[];
}

export interface Clue {
  /** The words of the line that named it (normalized). */
  text: string;
  places: GeoEntry[];
  postcode: boolean;
}

const POSTCODE = /^\d{4}$/;
const DIGITS = /^\d+$/;

/** Every place named in the line, longest names first, no word used twice; then the postcodes. */
export function readClues(g: Gazetteer, line: string, opts: ResolverOptions): Clue[] {
  const w = words(line);
  const used = new Array<boolean>(w.length).fill(false);
  const clues: Clue[] = [];
  for (let n = Math.min(g.maxNameWords, w.length); n >= 1; n--) {
    for (let i = 0; i + n <= w.length; i++) {
      if (used.slice(i, i + n).some(Boolean)) continue;
      const key = w.slice(i, i + n).join(' ');
      if (key.length < opts.minKeyChars || DIGITS.test(key.replace(/ /g, ''))) continue;
      const places = g.lookup(key);
      if (!places.length) continue;
      clues.push({ text: key, places, postcode: false });
      for (let q = i; q < i + n; q++) used[q] = true;
    }
  }
  const labels = new Set(opts.numberLabels.map((l) => normalize(l)));
  w.forEach((t, i) => {
    if (used[i] || !POSTCODE.test(t) || (i > 0 && labels.has(w[i - 1]!))) return;
    const places = g.withPostcode(t);
    if (places.length) clues.push({ text: t, places: [...places], postcode: true });
  });
  return clues;
}

/** Bigger administrative units first: an upazila or thana is more official than a neighbourhood. */
const LEVEL_RANK: Record<GeoLevelName, number> = { DIVISION: 0, DISTRICT: 0, UPAZILA: 1, THANA: 1, AREA: 2 };

/** One choice the customer is asked to make: a band (its charged form), and the places that lead to it. */
export interface AskOption {
  band: BandRow;
  places: GeoEntry[];
}

export type AskReason = 'no-place' | 'two-places' | 'wide-place' | 'changed';

export type LineRead =
  | {
      status: 'resolved';
      /** The place charged: the most specific one the line names. */
      area: GeoEntry;
      /** The charged band (the sub-area band folded by its mode). */
      band: BandRow;
      /** Two places of the same name both read, in the same band: the band is sure, the exact place is not. */
      placeSure: boolean;
      clues: string[];
    }
  | { status: 'ask'; reason: Exclude<AskReason, 'changed'>; options: AskOption[]; clues: string[] };

const inside = (g: Gazetteer, p: GeoEntry, unit: GeoEntry) => p.id === unit.id || g.isAncestor(unit, p);
const related = (g: Gazetteer, p: GeoEntry, unit: GeoEntry) => inside(g, p, unit) || g.isAncestor(p, unit);

function optionsFor(map: BandMap, entries: GeoEntry[], bandIds: ReadonlySet<string>): AskOption[] {
  return map.choices(bandIds).map((band) => ({ band, places: entries.filter((e) => map.spanOf(e).has(band.id)) }));
}

/** What one district (or other unit) makes of the clues that point into it. */
function readUnit(map: BandMap, unit: GeoEntry, clues: Clue[]): LineRead {
  const g = map.gazetteer;
  const text = clues.map((c) => c.text);
  const named = clues.flatMap((c) => c.places.filter((p) => p.id !== unit.id && inside(g, p, unit)));
  if (!named.length) {
    const span = map.spanOf(unit);
    const own = map.bandOf(unit);
    if (span.size === 1 && own) return { status: 'resolved', area: unit, band: own.charged, placeSure: true, clues: text };
    return { status: 'ask', reason: span.size ? 'wide-place' : 'no-place', options: optionsFor(map, [unit], span), clues: text };
  }
  const top = Math.min(...named.map((p) => LEVEL_RANK[p.level]));
  const official = [...new Set(named.filter((p) => LEVEL_RANK[p.level] === top))];
  // "Ashulia, Savar" is one place, not two: a place above another one named drops out (the nearer one decides)
  const deciding = official.filter((p) => !official.some((q) => q !== p && g.isAncestor(p, q)));
  const bands = new Set(deciding.flatMap((p) => [...map.spanOf(p)]));
  if (bands.size !== 1) {
    return { status: 'ask', reason: deciding.length > 1 ? 'two-places' : 'wide-place', options: optionsFor(map, deciding, bands), clues: text };
  }
  const bandId = [...bands][0]!;
  // the most specific name under a deciding place that sits in the same band
  const agree = named.filter((p) => deciding.some((d) => inside(g, p, d)) && map.bandOf(p)?.charged.id === bandId);
  const area = agree.sort((a, b) => g.depth(b) - g.depth(a))[0] ?? deciding[0]!;
  const band = map.bandById(bandId)!;
  return { status: 'resolved', area, band, placeSure: deciding.length === 1, clues: text };
}

/** Reads one finished address line. */
export function readLine(map: BandMap, line: string, opts: ResolverOptions): LineRead {
  const g = map.gazetteer;
  const clues = readClues(g, line, opts);
  if (!clues.length) return { status: 'ask', reason: 'no-place', options: optionsFor(map, [], new Set(map.choices().map((b) => b.id))), clues: [] };

  // the units that can explain the line: the districts of the places named (a division only when nothing else is)
  const unitOf = (p: GeoEntry) => (p.level === 'DIVISION' ? undefined : (g.district(p) ?? p));
  let units = [...new Set(clues.flatMap((c) => c.places.map(unitOf)).filter((u): u is GeoEntry => !!u))];
  if (!units.length) units = [...new Set(clues.flatMap((c) => c.places))];
  const scored = units.map((u) => ({
    u,
    support: clues.filter((c) => c.places.some((p) => related(g, p, u))).length,
    strong: clues.filter((c) => c.places.some((p) => p.id === u.id || (c.postcode && inside(g, p, u)))).length,
  }));
  const best = Math.max(...scored.map((s) => s.support));
  const atBest = scored.filter((s) => s.support === best);
  const strongest = Math.max(...atBest.map((s) => s.strong));
  const top = atBest.filter((s) => s.strong === strongest).map((s) => s.u);

  const reads = top.map((u) =>
    readUnit(
      map,
      u,
      clues.filter((c) => c.places.some((p) => related(g, p, u))),
    ),
  );
  if (reads.length === 1) return reads[0]!;
  const sure = reads.filter((r): r is Extract<LineRead, { status: 'resolved' }> => r.status === 'resolved');
  if (sure.length === reads.length && new Set(sure.map((r) => r.band.id)).size === 1) {
    // "Sreepur" in two districts, both charged alike: the charge is sure, the place is not (the line keeps asking
    // nothing; the courier booking reads the full address)
    return { ...sure[0]!, placeSure: false };
  }
  // different places in different bands: ask, naming them
  const entries = reads.flatMap((r) => (r.status === 'resolved' ? [r.area] : r.options.flatMap((o) => o.places)));
  const bandIds = new Set(entries.flatMap((e) => [...map.spanOf(e)]));
  return { status: 'ask', reason: 'two-places', options: optionsFor(map, [...new Set(entries)], bandIds), clues: clues.map((c) => c.text) };
}

/** What the checkout knows besides the line. */
export interface ResolveContext {
  /** The returning customer's saved address's place (PR 555 / the account). */
  savedAreaId?: string | null;
  /** What the customer confirmed earlier for this checkout: a band (and the place, when he picked one). */
  confirmed?: { bandId: string; areaId?: string | null } | null;
}

export type Resolution =
  | {
      status: 'resolved';
      /** The gazetteer place charged; null only when the customer chose a band himself. */
      areaId: string | null;
      band: BandRow;
      /** Why: the line, the saved address, or the customer's own choice. */
      via: 'line' | 'saved' | 'choice';
      placeSure: boolean;
      clues: string[];
    }
  | { status: 'ask'; reason: AskReason; options: AskOption[]; clues: string[] };

/** The line, read with what the checkout already knows. */
export function resolveAddress(map: BandMap, line: string, opts: ResolverOptions, ctx: ResolveContext = {}): Resolution {
  const read = readLine(map, line, opts);
  const confirmed = ctx.confirmed ? map.bandById(ctx.confirmed.bandId) : undefined;
  if (confirmed && ctx.confirmed) {
    if (read.status === 'resolved' && read.band.id !== confirmed.id) {
      // a sure read now disagrees with what he confirmed: ask again, never a silent change
      const keep: AskOption = { band: confirmed, places: [] };
      return { status: 'ask', reason: 'changed', options: [keep, { band: read.band, places: [read.area] }], clues: read.clues };
    }
    if (read.status === 'resolved') return { status: 'resolved', areaId: read.area.id, band: read.band, via: 'line', placeSure: read.placeSure, clues: read.clues };
    const place = ctx.confirmed.areaId ? map.gazetteer.get(ctx.confirmed.areaId) : undefined;
    return { status: 'resolved', areaId: place && map.bandOf(place)?.charged.id === confirmed.id ? place.id : null, band: confirmed, via: 'choice', placeSure: !!place, clues: read.clues };
  }
  if (read.status === 'resolved') return { status: 'resolved', areaId: read.area.id, band: read.band, via: 'line', placeSure: read.placeSure, clues: read.clues };
  const saved = map.gazetteer.get(ctx.savedAreaId);
  const savedBand = saved ? map.bandOf(saved) : null;
  if (saved && savedBand && (read.reason === 'no-place' || read.options.some((o) => o.band.id === savedBand.charged.id))) {
    return { status: 'resolved', areaId: saved.id, band: savedBand.charged, via: 'saved', placeSure: true, clues: read.clues };
  }
  return read;
}

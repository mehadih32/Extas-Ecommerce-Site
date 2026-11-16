// S29 · PR 750 (CN-054) — the boundary pack of Reports › Geography map, without a map library.
// Pure functions that turn open boundary shapes (GeoJSON, longitude / latitude) into small ready-drawn SVG paths in one
// shared viewBox, find each shape's middle, and match every shape to exactly one gazetteer place by name and parent
// district (never by guess: a shape that does not match exactly one place is returned in `unmatched`, for hand fixing).
// Nothing here reads a file or calls the network; the builder script (scripts/make-geo-pack.ts) does the file work and
// the files themselves live in `data/geo/` (see LICENSE-NOTICE.md there for source, date and licence).
import { fold, nameKey } from './text';

export type Position = [number, number];
export type Ring = Position[];
/** A polygon: the outer ring first, then holes. */
export type Polygon = Ring[];

export interface GeoJsonFeature {
  properties: { shapeName: string; [k: string]: unknown };
  geometry: { type: 'Polygon'; coordinates: Polygon } | { type: 'MultiPolygon'; coordinates: Polygon[] };
}

/** The pack's one viewBox for every level, so a drill-down overlays exactly. Units are 1/UNITS_PER_DEGREE of latitude. */
export const GEO_UNITS_PER_DEGREE = 400;
const BOUNDS = { west: 87.9, east: 92.8, north: 26.7, south: 20.5 };
const MID_LAT = (BOUNDS.north + BOUNDS.south) / 2;
/** Longitude is narrower than latitude at Bangladesh's latitude; this keeps shapes true. */
const LNG_SCALE = Math.cos((MID_LAT * Math.PI) / 180);
export const GEO_VIEWBOX = {
  width: Math.ceil((BOUNDS.east - BOUNDS.west) * LNG_SCALE * GEO_UNITS_PER_DEGREE),
  height: Math.ceil((BOUNDS.north - BOUNDS.south) * GEO_UNITS_PER_DEGREE),
};
export const GEO_VIEWBOX_TEXT = `0 0 ${GEO_VIEWBOX.width} ${GEO_VIEWBOX.height}`;

/** Longitude / latitude to the viewBox (y grows downwards). */
export function project([lng, lat]: Position): Position {
  return [(lng - BOUNDS.west) * LNG_SCALE * GEO_UNITS_PER_DEGREE, (BOUNDS.north - lat) * GEO_UNITS_PER_DEGREE];
}

/** The polygons of a feature, whatever its geometry type. */
export function polygonsOf(f: GeoJsonFeature): Polygon[] {
  return f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
}

/** Signed area of a ring (shoelace); positive when counter-clockwise in the plane. */
export function ringArea(ring: Ring): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j]![0] + ring[i]![0]) * (ring[j]![1] - ring[i]![1]);
  return a / 2;
}

/** Douglas–Peucker, iterative (a long coast never overflows the stack). `tol` is in the ring's own units. */
export function simplifyRing(ring: Ring, tol: number): Ring {
  if (ring.length <= 4) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  keep[ring.length - 1] = 1;
  const stack: [number, number][] = [[0, ring.length - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = ring[a]!;
    const [bx, by] = ring[b]!;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let far = -1;
    let farD = t2;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = ring[i]!;
      let d2: number;
      if (len2 === 0) d2 = (px - ax) ** 2 + (py - ay) ** 2;
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        d2 = (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2;
      }
      if (d2 > farD) {
        far = i;
        farD = d2;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return ring.filter((_, i) => keep[i]);
}

export interface PathOptions {
  /** Simplification tolerance in viewBox units. */
  tolerance: number;
  /** A ring (outer or hole) with a smaller area than this is dropped, unless it is the shape's largest. */
  minRingArea: number;
}

/**
 * The SVG path (`d`) of a feature: every ring projected, simplified, snapped to whole units and written as one move
 * and relative line steps (the smallest text), closed with `z`. Fill with `fill-rule="evenodd"` (holes are rings).
 * Returns the path and the area-weighted middle (longitude / latitude, and in viewBox units) of the largest ring.
 */
export function featureToPath(f: GeoJsonFeature, opts: PathOptions): { d: string; cx: number; cy: number; lng: number; lat: number } {
  const polys = polygonsOf(f);
  let best: { ring: Ring; area: number } | null = null;
  for (const poly of polys) {
    const outer = poly[0];
    if (!outer) continue;
    const area = Math.abs(ringArea(outer));
    if (!best || area > best.area) best = { ring: outer, area };
  }
  if (!best) throw new Error(`shape "${f.properties.shapeName}" has no ring`);
  const parts: string[] = [];
  for (const poly of polys) {
    for (const ring of poly) {
      const proj = ring.map(project);
      const isLargest = ring === best.ring;
      if (!isLargest && Math.abs(ringArea(proj)) < opts.minRingArea) continue;
      const snapped: Ring = [];
      for (const p of simplifyRing(proj, opts.tolerance)) {
        const q: Position = [Math.round(p[0]), Math.round(p[1])];
        const last = snapped[snapped.length - 1];
        if (!last || last[0] !== q[0] || last[1] !== q[1]) snapped.push(q);
      }
      // a ring closes on its first point: drop the repeat
      if (snapped.length > 1 && snapped[0]![0] === snapped[snapped.length - 1]![0] && snapped[0]![1] === snapped[snapped.length - 1]![1]) snapped.pop();
      if (snapped.length < 3) continue;
      let d = `M${snapped[0]![0]} ${snapped[0]![1]}l`;
      let px = snapped[0]![0];
      let py = snapped[0]![1];
      const steps: string[] = [];
      for (let i = 1; i < snapped.length; i++) {
        steps.push(`${snapped[i]![0] - px} ${snapped[i]![1] - py}`);
        px = snapped[i]![0];
        py = snapped[i]![1];
      }
      d += steps.join(' ').replace(/ -/g, '-') + 'z';
      parts.push(d);
    }
  }
  const [lng, lat] = ringCentroid(best.ring);
  const [cx, cy] = project([lng, lat]);
  return { d: parts.join(''), cx: Math.round(cx), cy: Math.round(cy), lng: round(lng, 5), lat: round(lat, 5) };
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

/** Area-weighted centroid of a ring (planar, enough at this size); falls back to the mean of the points. */
export function ringCentroid(ring: Ring): Position {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j]![0] * ring[i]![1] - ring[i]![0] * ring[j]![1];
    a += f;
    cx += (ring[j]![0] + ring[i]![0]) * f;
    cy += (ring[j]![1] + ring[i]![1]) * f;
  }
  if (Math.abs(a) < 1e-12) {
    const n = ring.length || 1;
    return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

/** Ray casting: is the point inside the polygon (outer ring in, holes out)? */
export function pointInPolygon(pt: Position, poly: Polygon): boolean {
  let inside = false;
  for (const ring of poly) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!;
      const [xj, yj] = ring[j]!;
      if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

export function pointInFeature(pt: Position, f: GeoJsonFeature): boolean {
  return polygonsOf(f).some((p) => pointInPolygon(pt, p));
}

// ---- matching to the gazetteer -------------------------------------------------------------------------------------

/** A gazetteer place as the matcher needs it (readGazetteerCsv rows fit; so does a hand-parsed line). */
export interface PlaceRef {
  code: string;
  level: 'DIVISION' | 'DISTRICT' | 'UPAZILA' | 'THANA' | 'AREA';
  nameEn: string;
  aliases: string[];
  cityCorporation: string | null;
}

/** The words that change between sources for the same place and carry no meaning for matching. */
const NOISE = /\b(division|district|zila|zilla|upazila|upazilla|thana|sadar|sador|city|metropolitan|pourashava|municipality)\b/g;

/** Every comparison form of a name: the exact key, the folded key, and both again without the noise words. */
export function nameForms(name: string): string[] {
  const k = nameKey(name);
  const stripped = k.replace(NOISE, ' ').replace(/\s+/g, ' ').trim();
  const forms = new Set<string>();
  for (const x of [k, stripped]) {
    if (!x) continue;
    forms.add(x);
    forms.add(fold(x));
  }
  return [...forms];
}

/** Spaces, hyphens, the silent h after a consonant and doubled letters dropped, on top of `fold`. */
export function loose(form: string): string {
  return fold(form).replace(/[\s-]+/g, '').replace(/([bcdgjkpstr])h/g, '$1').replace(/(.)\1+/g, '$1');
}

export interface Matcher {
  /** The one place a shape name means among `candidates`, or why not. */
  find(shapeName: string, candidates: PlaceRef[]): { place: PlaceRef } | { reason: 'none' | 'ambiguous'; options: string[] };
}

/**
 * Names are compared in three rounds, each only when the one before found nothing: the exact normal key, the key
 * without noise words ("Sadar", "Upazila", "Thana"), then the folded forms (Gabtoli = Gabtali). A round that finds
 * more than one place is "ambiguous": it is reported, never picked.
 */
export function makeMatcher(): Matcher {
  return {
    find(shapeName, candidates) {
      const key = nameKey(shapeName);
      const stripped = key.replace(NOISE, ' ').replace(/\s+/g, ' ').trim();
      const rounds: ((form: string) => boolean)[] = [
        (f) => f === key,
        (f) => !!stripped && f === stripped,
        (f) => f === fold(key) || (!!stripped && f === fold(stripped)),
        // last round: spaces and the silent h of Bengali spellings ignored (Bagati Para = Bagatipara, Jhalokati = Jhalakathi)
        (f) => loose(f) === loose(key) || (!!stripped && loose(f) === loose(stripped)),
      ];
      for (const same of rounds) {
        const hits = candidates.filter((c) => [c.nameEn, ...c.aliases].some((n) => nameForms(n).some(same)));
        const unique = [...new Map(hits.map((h) => [h.code, h])).values()];
        if (unique.length === 1) return { place: unique[0]! };
        if (unique.length > 1) {
          // a place's own name beats another place's alias
          const own = unique.filter((c) => nameForms(c.nameEn).some(same));
          if (own.length === 1) return { place: own[0]! };
          return { reason: 'ambiguous', options: unique.map((u) => u.code) };
        }
      }
      return { reason: 'none', options: [] };
    },
  };
}

export interface MatchedShape {
  code: string;
  d: string;
  cx: number;
  cy: number;
  lng: number;
  lat: number;
}
export interface UnmatchedShape {
  shapeName: string;
  /** The district the shape sits in (for upazila shapes), by position. */
  district: string | null;
  reason: 'none' | 'ambiguous' | 'no-district' | 'duplicate';
  options: string[];
}
export interface MatchResult {
  shapes: MatchedShape[];
  unmatched: UnmatchedShape[];
  /** Gazetteer places of the level that no shape claimed (they show in the table, grey on the map). */
  unclaimed: string[];
  /** The source feature of each matched code (the builder uses the district polygons to place upazila shapes). */
  featureOf: Map<string, GeoJsonFeature>;
}

/** Hand fixes: `"<shapeName>|<district code or ''>"` → gazetteer code (a fix is the only way past an ambiguity). */
export type HandFixes = Record<string, string>;

const within = (code: string, parentCode: string) => code === parentCode || code.startsWith(`${parentCode}.`);

/** Match one level. `levels` are the gazetteer levels the shapes may mean; `parentOf` gives a shape's district code. */
export function matchLevel(args: {
  features: GeoJsonFeature[];
  places: PlaceRef[];
  levels: PlaceRef['level'][];
  /** The district place a shape sits in, or null (division and district shapes are matched without a parent). */
  districtOf?: (f: GeoJsonFeature) => PlaceRef | null;
  pathOptions: PathOptions;
  fixes?: HandFixes;
}): MatchResult {
  const matcher = makeMatcher();
  const pool = args.places.filter((p) => args.levels.includes(p.level));
  const claimed = new Map<string, string>();
  const shapes: MatchedShape[] = [];
  const featureOf = new Map<string, GeoJsonFeature>();
  const unmatched: UnmatchedShape[] = [];
  for (const f of args.features) {
    const name = f.properties.shapeName;
    let district: PlaceRef | null = null;
    let candidates = pool;
    if (args.districtOf) {
      district = args.districtOf(f);
      if (!district) {
        unmatched.push({ shapeName: name, district: null, reason: 'no-district', options: [] });
        continue;
      }
      candidates = pool.filter((p) => within(p.code, district!.code));
    }
    const fixKey = `${name}|${district?.code ?? ''}`;
    const fixed = args.fixes?.[fixKey];
    let code: string | null = null;
    if (fixed) {
      if (pool.some((p) => p.code === fixed)) code = fixed;
    } else {
      const r = matcher.find(name, candidates);
      if ('place' in r) code = r.place.code;
      else {
        unmatched.push({ shapeName: name, district: district?.code ?? null, reason: r.reason, options: r.options });
        continue;
      }
    }
    if (!code) {
      unmatched.push({ shapeName: name, district: district?.code ?? null, reason: 'none', options: [] });
      continue;
    }
    if (claimed.has(code)) {
      unmatched.push({ shapeName: name, district: district?.code ?? null, reason: 'duplicate', options: [code, claimed.get(code)!] });
      continue;
    }
    claimed.set(code, name);
    featureOf.set(code, f);
    shapes.push({ code, ...featureToPath(f, args.pathOptions) });
  }
  shapes.sort((a, b) => (a.code < b.code ? -1 : 1));
  const unclaimed = pool.filter((p) => !claimed.has(p.code)).map((p) => p.code).sort();
  return { shapes, unmatched, unclaimed, featureOf };
}

/** The district a point-shape sits in: the district whose polygon holds the shape's middle, else most of its vertices. */
export function districtByPosition(districts: { place: PlaceRef; feature: GeoJsonFeature }[]): (f: GeoJsonFeature) => PlaceRef | null {
  return (f) => {
    const polys = polygonsOf(f);
    let best: { ring: Ring; area: number } | null = null;
    for (const poly of polys) {
      const outer = poly[0];
      if (!outer) continue;
      const area = Math.abs(ringArea(outer));
      if (!best || area > best.area) best = { ring: outer, area };
    }
    if (!best) return null;
    const mid = ringCentroid(best.ring);
    const hit = districts.find((d) => pointInFeature(mid, d.feature));
    if (hit) return hit.place;
    // a bent shape whose middle falls outside itself: vote with a sample of its own vertices
    const votes = new Map<string, number>();
    const step = Math.max(1, Math.floor(best.ring.length / 25));
    for (let i = 0; i < best.ring.length; i += step) {
      const d = districts.find((x) => pointInFeature(best!.ring[i]!, x.feature));
      if (d) votes.set(d.place.code, (votes.get(d.place.code) ?? 0) + 1);
    }
    const top = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
    return top ? (districts.find((d) => d.place.code === top[0])?.place ?? null) : null;
  };
}

/** A built pack file's text, stable (sorted shapes, no spaces) so a rebuild shows no change when nothing changed. */
export function packToJson(pack: { level: string; viewBox: string; attribution: string; shapes: MatchedShape[] }): string {
  return JSON.stringify(pack);
}

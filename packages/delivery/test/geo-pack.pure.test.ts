// S29 · PR 750 — the Geography map's boundary pack without a database: the geometry helpers, the name matching (nothing
// guessed), and the shipped pack files (every shape is exactly one gazetteer place, the size budget of each level, the
// licence notice, no network call).
import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  GEO_VIEWBOX,
  featureToPath,
  makeMatcher,
  matchLevel,
  pointInPolygon,
  project,
  ringCentroid,
  simplifyRing,
  type GeoJsonFeature,
  type PlaceRef,
  type Ring,
} from '../src/geo-pack';
import { GEO_DATA_DIR, GEO_PACK_LEVELS, readGeoCentroids, readGeoPack } from '../src/geo';
import { sampleGazetteerRows } from '../src/sample';

const square = (x: number, y: number, w: number): Ring => [
  [x, y],
  [x + w, y],
  [x + w, y + w],
  [x, y + w],
  [x, y],
];
const feature = (name: string, ring: Ring): GeoJsonFeature => ({ properties: { shapeName: name }, geometry: { type: 'Polygon', coordinates: [ring] } });
const place = (code: string, level: PlaceRef['level'], nameEn: string, aliases: string[] = []): PlaceRef => ({ code, level, nameEn, aliases, cityCorporation: null });

describe('geometry', () => {
  it('projects Bangladesh into the shared viewBox, north up', () => {
    const [x, y] = project([90.4, 23.8]);
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(GEO_VIEWBOX.width);
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(GEO_VIEWBOX.height);
    expect(project([90.4, 25])[1]).toBeLessThan(project([90.4, 22])[1]);
  });

  it('simplifies a ring, keeping its ends and its corners', () => {
    const wavy: Ring = Array.from({ length: 101 }, (_, i) => [i, i % 2 === 0 ? 0 : 0.05] as [number, number]);
    const out = simplifyRing(wavy, 0.5);
    expect(out[0]).toEqual(wavy[0]);
    expect(out[out.length - 1]).toEqual(wavy[100]);
    expect(out.length).toBeLessThan(5);
    const sq = simplifyRing(square(0, 0, 100), 0.5);
    expect(sq).toHaveLength(5);
  });

  it('finds the middle of a ring and whether a point is inside', () => {
    const [cx, cy] = ringCentroid(square(10, 20, 4));
    expect(cx).toBeCloseTo(12);
    expect(cy).toBeCloseTo(22);
    expect(pointInPolygon([12, 22], [square(10, 20, 4)])).toBe(true);
    expect(pointInPolygon([30, 22], [square(10, 20, 4)])).toBe(false);
    // a hole is outside
    expect(pointInPolygon([12, 22], [square(10, 20, 4), square(11, 21, 2)])).toBe(false);
  });

  it('writes one closed path of whole numbers and drops small islands but never the main shape', () => {
    const f: GeoJsonFeature = {
      properties: { shapeName: 'X' },
      geometry: { type: 'MultiPolygon', coordinates: [[square(90, 23, 0.2)], [square(91, 24, 0.0001)]] },
    };
    const r = featureToPath(f, { tolerance: 0.5, minRingArea: 2 });
    expect(r.d.startsWith('M')).toBe(true);
    expect(r.d.match(/z/g)).toHaveLength(1); // the island is gone
    expect(r.d).not.toMatch(/\d\.\d/); // whole units only
    expect(r.lng).toBeCloseTo(90.1, 3);
    expect(r.lat).toBeCloseTo(23.1, 3);
    // a main shape smaller than the island limit is still kept
    const tiny = featureToPath(feature('T', square(90, 23, 0.0001)), { tolerance: 0.5, minRingArea: 1e9 });
    expect(tiny.d).toBe('');
  });
});

describe('name matching never guesses', () => {
  const m = makeMatcher();
  const list = [place('bd.d.gabtali', 'UPAZILA', 'Gabtali', ['gabtoli']), place('bd.d.sripur', 'UPAZILA', 'Sripur'), place('bd.d.kaliganj', 'UPAZILA', 'Kaliganj')];

  it('takes the exact name, then the soft spellings', () => {
    expect(m.find('Gabtali', list)).toEqual({ place: list[0] });
    expect(m.find('Gabtoli', list)).toEqual({ place: list[0] });
    expect(m.find('Sreepur', list)).toEqual({ place: list[1] });
    expect(m.find('Gabtali Upazila', list)).toEqual({ place: list[0] });
    expect(m.find('Gab Tali', list)).toEqual({ place: list[0] });
  });

  it('knows the Bogra / Bogura and Jhalokati / Jhalakathi cases', () => {
    const d = [place('bd.r.bogura', 'DISTRICT', 'Bogura', ['bogra']), place('bd.b.jhalakathi', 'DISTRICT', 'Jhalakathi', ['jhalokathi'])];
    expect(m.find('Bogra', d)).toEqual({ place: d[0] });
    expect(m.find('Jhalokati Sadar', d)).toEqual({ place: d[1] });
  });

  it('reports no match and ambiguity instead of picking one', () => {
    expect(m.find('Atlantis', list)).toEqual({ reason: 'none', options: [] });
    const two = [place('bd.a.kaliganj', 'UPAZILA', 'Kaliganj'), place('bd.b.kaliganj', 'UPAZILA', 'Kaliganj')];
    expect(m.find('Kaliganj', two)).toEqual({ reason: 'ambiguous', options: ['bd.a.kaliganj', 'bd.b.kaliganj'] });
  });

  it('matches inside the district the shape lies in, so the same name in two districts is two places', () => {
    const places = [place('bd.x.d1', 'DISTRICT', 'D1'), place('bd.x.d2', 'DISTRICT', 'D2'), place('bd.x.d1.kaliganj', 'UPAZILA', 'Kaliganj'), place('bd.x.d2.kaliganj', 'UPAZILA', 'Kaliganj')];
    const f1 = feature('Kaliganj', square(90, 23, 0.1));
    const f2 = feature('Kaliganj', square(91, 23, 0.1));
    const r = matchLevel({
      features: [f1, f2],
      places,
      levels: ['UPAZILA'],
      districtOf: (f) => (f === f1 ? places[0]! : places[1]!),
      pathOptions: { tolerance: 0.5, minRingArea: 1 },
    });
    expect(r.shapes.map((s) => s.code)).toEqual(['bd.x.d1.kaliganj', 'bd.x.d2.kaliganj']);
    expect(r.unmatched).toEqual([]);
  });

  it('refuses a second shape for the same place and lists it', () => {
    const places = [place('bd.x', 'DIVISION', 'X')];
    const r = matchLevel({ features: [feature('X', square(90, 23, 0.1)), feature('X', square(91, 23, 0.1))], places, levels: ['DIVISION'], pathOptions: { tolerance: 0.5, minRingArea: 1 } });
    expect(r.shapes).toHaveLength(1);
    expect(r.unmatched).toEqual([{ shapeName: 'X', district: null, reason: 'duplicate', options: ['bd.x', 'X'] }]);
  });

  it('takes a hand fix only when its code is a place of the level', () => {
    const places = [place('bd.x', 'DIVISION', 'X')];
    const ok = matchLevel({ features: [feature('Zed', square(90, 23, 0.1))], places, levels: ['DIVISION'], pathOptions: { tolerance: 0.5, minRingArea: 1 }, fixes: { 'Zed|': 'bd.x' } });
    expect(ok.shapes.map((s) => s.code)).toEqual(['bd.x']);
    const bad = matchLevel({ features: [feature('Zed', square(90, 23, 0.1))], places, levels: ['DIVISION'], pathOptions: { tolerance: 0.5, minRingArea: 1 }, fixes: { 'Zed|': 'bd.nowhere' } });
    expect(bad.shapes).toEqual([]);
    expect(bad.unmatched[0]!.reason).toBe('none');
  });
});

describe('the shipped pack files', () => {
  const rows = sampleGazetteerRows();
  const byCode = new Map(rows.map((r) => [r.code, r]));
  /** Size budget per level, in bytes (the plan: about 100-200 KB for districts, under 1 MB for upazilas). */
  const BUDGET = { division: 40_000, district: 250_000, upazila: 800_000, dhakaThana: 100_000 } as const;
  const LEVEL_OF = { division: ['DIVISION'], district: ['DISTRICT'], upazila: ['UPAZILA', 'THANA'], dhakaThana: ['THANA', 'AREA'] } as const;

  for (const level of GEO_PACK_LEVELS) {
    it(`${level}: every shape is exactly one gazetteer place of that level, once`, () => {
      const pack = readGeoPack(level);
      expect(pack.level).toBe(level);
      const codes = pack.shapes.map((s) => s.code);
      expect(new Set(codes).size).toBe(codes.length);
      for (const s of pack.shapes) {
        const g = byCode.get(s.code);
        expect(g, `${s.code} is not in the gazetteer`).toBeTruthy();
        expect(LEVEL_OF[level]).toContain(g!.level);
        expect(s.d.startsWith('M')).toBe(true);
        expect(Number.isInteger(s.cx) && Number.isInteger(s.cy)).toBe(true);
        expect(s.lat).toBeGreaterThan(20.5);
        expect(s.lat).toBeLessThan(26.7);
        expect(s.lng).toBeGreaterThan(87.9);
        expect(s.lng).toBeLessThan(92.8);
      }
    });

    it(`${level}: within its size budget, one viewBox, credit written in`, () => {
      expect(statSync(`${GEO_DATA_DIR}${level}.json`).size).toBeLessThan(BUDGET[level]);
      const pack = readGeoPack(level);
      expect(pack.viewBox).toBe(`0 0 ${GEO_VIEWBOX.width} ${GEO_VIEWBOX.height}`);
      expect(pack.attribution).toMatch(/geoBoundaries/);
      expect(pack.attribution).toMatch(/CC BY 3\.0 IGO/);
    });
  }

  it('has every division and every district of the gazetteer', () => {
    const div = new Set(readGeoPack('division').shapes.map((s) => s.code));
    const dis = new Set(readGeoPack('district').shapes.map((s) => s.code));
    expect(div.size).toBe(8);
    expect(dis.size).toBe(64);
    for (const r of rows) {
      if (r.level === 'DIVISION') expect(div.has(r.code)).toBe(true);
      if (r.level === 'DISTRICT') expect(dis.has(r.code)).toBe(true);
    }
  });

  it('puts every upazila shape under a district that has a shape', () => {
    const dis = new Set(readGeoPack('district').shapes.map((s) => s.code));
    for (const s of readGeoPack('upazila').shapes) {
      const parent = byCode.get(s.code)!.parent;
      const district = parent && byCode.get(parent)?.level === 'DISTRICT' ? parent : byCode.get(byCode.get(parent!)?.parent ?? '')?.parent;
      expect(dis.has(district ?? ''), `${s.code} has no district shape`).toBe(true);
    }
  });

  it('lists what did not match, and nothing that is in a pack', () => {
    const report = JSON.parse(readFileSync(`${GEO_DATA_DIR}unmatched.json`, 'utf8')) as Record<string, { unmatched: { shapeName: string }[] }>;
    expect(report.division!.unmatched).toEqual([]);
    expect(report.district!.unmatched).toEqual([]);
    // the two known misses are listed, by name, for hand fixing
    expect(report.upazila!.unmatched.map((u) => u.shapeName).sort()).toEqual(['Chittagong Port', 'Dakshin Sunamganj']);
  });

  it('fills the map point of every shaped place in the sample gazetteer (the bubble map draws again)', () => {
    const centroids = readGeoCentroids();
    expect(Object.keys(centroids).length).toBeGreaterThan(500);
    for (const [code, [lat, lng]] of Object.entries(centroids)) {
      const g = byCode.get(code)!;
      expect(g.lat, `${code} has no lat`).toBe(lat);
      expect(g.lng).toBe(lng);
    }
    expect(rows.filter((r) => r.level === 'DISTRICT').every((r) => r.lat !== null && r.lng !== null)).toBe(true);
  });

  it('carries the licence notice with source, date and licence', () => {
    const notice = readFileSync(`${GEO_DATA_DIR}LICENSE-NOTICE.md`, 'utf8');
    expect(notice).toMatch(/geoBoundaries/);
    expect(notice).toMatch(/CC BY 3\.0 IGO/);
    expect(notice).toMatch(/CC0/);
    expect(notice).toMatch(/16 Nov 2026/);
    expect(notice).toMatch(/GADM/); // named as not used
    for (const l of ['ADM1', 'ADM2', 'ADM3']) expect(statSync(`${GEO_DATA_DIR}source/geoBoundaries-BGD-${l}-metaData.json`).size).toBeGreaterThan(100);
  });

  it('makes no network call at all', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    for (const level of GEO_PACK_LEVELS) readGeoPack(level);
    readGeoCentroids();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    for (const f of ['../src/geo.ts', '../src/geo-pack.ts']) {
      const text = readFileSync(new URL(f, import.meta.url), 'utf8');
      expect(text).not.toMatch(/\bfetch\(|https?:\/\/(?!creativecommons)\S+\.(json|geojson)|node:https?|XMLHttpRequest/);
    }
  });

  it('refuses a level that does not exist', () => {
    expect(() => readGeoPack('galaxy')).toThrow(/unknown map level/);
  });
});

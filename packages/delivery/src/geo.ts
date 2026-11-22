// S29 · PR 750 — reads the boundary pack files of the Geography map (data/geo/*.json). Server only (the packs are bundled with it);
// the screen gets a pack from the shapes route, one level at a time. No network call, no map library.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import centroids from '../data/geo/centroids.json';
import dhakaThana from '../data/geo/dhakaThana.json';
import district from '../data/geo/district.json';
import division from '../data/geo/division.json';
import upazila from '../data/geo/upazila.json';

export * from './geo-pack';

export const GEO_PACK_LEVELS = ['division', 'district', 'upazila', 'dhakaThana'] as const;
export type GeoPackLevel = (typeof GEO_PACK_LEVELS)[number];

export interface GeoPackShape {
  code: string;
  d: string;
  cx: number;
  cy: number;
  lng: number;
  lat: number;
}
export interface GeoPackFile {
  level: GeoPackLevel;
  viewBox: string;
  attribution: string;
  shapes: GeoPackShape[];
}

/** The folder of the pack files (the pack script and the tests read it; the app gets the packs through the imports above,
 * so the server bundle carries them and nothing is read from a folder at run time). */
export const GEO_DATA_DIR = `${join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'geo')}/`;

const PACKS: Record<GeoPackLevel, unknown> = { division, district, upazila, dhakaThana };

const cache = new Map<GeoPackLevel, GeoPackFile>();

/** One level's pack (read once, then kept). Throws a plain error for a level that is not in the list. */
export function readGeoPack(level: string): GeoPackFile {
  if (!(GEO_PACK_LEVELS as readonly string[]).includes(level)) throw new Error(`unknown map level: ${level}`);
  const key = level as GeoPackLevel;
  const hit = cache.get(key);
  if (hit) return hit;
  const pack = PACKS[key] as GeoPackFile;
  cache.set(key, pack);
  return pack;
}

/** The middle of every shape, `code` to `[lat, lng]`. */
export function readGeoCentroids(): Record<string, [number, number]> {
  return centroids as unknown as Record<string, [number, number]>;
}

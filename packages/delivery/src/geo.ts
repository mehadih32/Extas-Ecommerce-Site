// S29 · PR 750 — reads the boundary pack files of the Geography map (data/geo/*.json). Server only (it reads files);
// the screen gets a pack from the shapes route, one level at a time. No network call, no map library.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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

export const GEO_DATA_DIR = fileURLToPath(new URL('../data/geo/', import.meta.url));

const cache = new Map<GeoPackLevel, GeoPackFile>();

/** One level's pack (read once, then kept). Throws a plain error for a level that is not in the list. */
export function readGeoPack(level: string): GeoPackFile {
  if (!(GEO_PACK_LEVELS as readonly string[]).includes(level)) throw new Error(`unknown map level: ${level}`);
  const key = level as GeoPackLevel;
  const hit = cache.get(key);
  if (hit) return hit;
  const pack = JSON.parse(readFileSync(`${GEO_DATA_DIR}${key}.json`, 'utf8')) as GeoPackFile;
  cache.set(key, pack);
  return pack;
}

/** The middle of every shape, `code` to `[lat, lng]`. */
export function readGeoCentroids(): Record<string, [number, number]> {
  return JSON.parse(readFileSync(`${GEO_DATA_DIR}centroids.json`, 'utf8')) as Record<string, [number, number]>;
}

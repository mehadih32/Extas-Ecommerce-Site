// S29 · PR 758–760 (CN-054) — what the three lenses of Reports › Geography map (risk, money and stock, demand and
// customers) share: the place tree and the roll-up of one order's area to the level the map is drawn at. The rules are
// those of `salesByArea` (areas.ts): a place rolls up to its division, district, upazila/thana, or — inside Dhaka City —
// stays its own area; an order with no area, or whose area does not reach the level, is `unknown`; at the Dhaka-City
// level an order outside the city is `outside`. With a `parentAreaId` (the drill-down) only the places under it count.
// Read-only, store-scoped, counts only: nothing here names or reaches a customer.
import type { Db } from './metrics';
import type { GeoLevel } from './geo-types';

/** One place of the gazetteer tree (GeoArea), with the ids above it from the top down. */
export interface LensPlace {
  id: string;
  level: string;
  parentId: string | null;
  ancestorIds: string[];
  nameEn: string;
  nameBn: string | null;
  cityCorporation: string | null;
}

/** Where one order's area goes at the chosen level. */
export type LensSlot = { kind: 'row'; place: LensPlace } | { kind: 'unknown' } | { kind: 'outside' } | { kind: 'skip' };

/** The deepest tree walked (a loop in the tree never hangs). */
const MAX_DEPTH = 32;

/** The places of `areaIds` and every place above them, by id. Empty for no ids. */
export async function loadPlaces(db: Db, areaIds: readonly string[]): Promise<Map<string, LensPlace>> {
  const ids = [...new Set(areaIds)];
  if (!ids.length) return new Map();
  const select = (list: string[]) =>
    db.$queryRaw<LensPlace[]>`
      SELECT g."id", g."level"::text AS "level", g."parentId", g."ancestorIds", g."nameEn", g."nameBn", g."cityCorporation"
        FROM "GeoArea" g WHERE g."id" = ANY(${list}::uuid[])`;
  const own = await select(ids);
  const above = [...new Set(own.flatMap((p) => p.ancestorIds))].filter((id) => !ids.includes(id));
  const rest = above.length ? await select(above) : [];
  return new Map([...own, ...rest].map((p) => [p.id, p]));
}

/** The place and the places above it, nearest first. */
function chainOf(own: LensPlace, places: ReadonlyMap<string, LensPlace>): LensPlace[] {
  return [own, ...[...own.ancestorIds].reverse().map((id) => places.get(id)).filter((p): p is LensPlace => !!p)].slice(0, MAX_DEPTH);
}

/** Is this the level's own kind of place? */
function atLevel(level: GeoLevel, p: LensPlace): boolean {
  if (level === 'division') return p.level === 'DIVISION';
  if (level === 'district') return p.level === 'DISTRICT';
  if (level === 'upazila') return p.level === 'UPAZILA' || p.level === 'THANA';
  return false;
}

/** The slot of one order's area at `level`, under `parentAreaId` when given. */
export function slotOf(level: GeoLevel, parentAreaId: string | null, areaId: string | null, places: ReadonlyMap<string, LensPlace>): LensSlot {
  const own = areaId ? places.get(areaId) : undefined;
  if (!own) return parentAreaId ? { kind: 'skip' } : { kind: 'unknown' };
  const chain = chainOf(own, places);
  if (parentAreaId && !chain.some((p) => p.id === parentAreaId)) return { kind: 'skip' };
  if (level === 'area') {
    // inside Dhaka City: the order's own place when it, or a place above it, carries a city corporation
    return chain.some((p) => p.cityCorporation) ? { kind: 'row', place: own } : { kind: 'outside' };
  }
  const at = chain.find((p) => atLevel(level, p));
  return at ? { kind: 'row', place: at } : { kind: 'unknown' };
}

/** The district above a place (for "Gabtali, Bogura"); null at the district level or above, or when none is known. */
export function parentOf(place: LensPlace, places: ReadonlyMap<string, LensPlace>): LensPlace | null {
  const chain = [...place.ancestorIds].reverse().map((id) => places.get(id));
  return chain.find((p) => p?.level === 'DISTRICT') ?? null;
}

/** A bucket of numbers, named. */
export type Counts = Record<string, number>;

/** The rows of one lens while it is counted: one bucket per area, plus unknown, outside and the total. */
export class Roller<T extends Counts> {
  readonly rows = new Map<string, { place: LensPlace; f: T }>();
  readonly unknown: T;
  readonly outside: T;
  readonly total: T;

  constructor(
    private readonly level: GeoLevel,
    private readonly parentAreaId: string | null,
    readonly places: ReadonlyMap<string, LensPlace>,
    private readonly zero: () => T,
  ) {
    this.unknown = zero();
    this.outside = zero();
    this.total = zero();
  }

  /** The buckets to add one order (or one record) of `areaId` to: its row (or unknown/outside) and the total; none when skipped. */
  at(areaId: string | null): T[] {
    const slot = slotOf(this.level, this.parentAreaId, areaId, this.places);
    if (slot.kind === 'skip') return [];
    if (slot.kind === 'unknown') return [this.unknown, this.total];
    if (slot.kind === 'outside') return [this.outside, this.total];
    const row = this.rows.get(slot.place.id) ?? { place: slot.place, f: this.zero() };
    this.rows.set(slot.place.id, row);
    return [row.f, this.total];
  }

  /** The row key (an area id) an `areaId` rolls up to; null for unknown, outside or skipped. */
  keyOf(areaId: string | null): string | null {
    const slot = slotOf(this.level, this.parentAreaId, areaId, this.places);
    return slot.kind === 'row' ? slot.place.id : null;
  }
}

/** a ÷ b as 0–1; null when b is 0. */
export const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

/** Add `n` to a counter. */
export function bump(f: Counts, key: string, n = 1): void {
  f[key] = (f[key] ?? 0) + n;
}

/** One row of a lens as the screen gets it (the `GeoLensRow` of geo-types, with the place named). */
export interface LensRowOut {
  areaId: string;
  nameEn: string;
  nameBn: string | null;
  parentAreaId: string | null;
  parentNameEn: string | null;
  parentNameBn: string | null;
  /** Numeric figures; null when not known (or the viewer may not see that part). */
  figures: Record<string, number | null>;
  /** Short flags the screen words itself. */
  flags: string[];
}

/** A lens's answer: parts add up to `total`; unknown and outside are counted apart; `hidden` names the parts the viewer may not see. */
export interface LensResult {
  level: GeoLevel;
  days: { from: string; to: string };
  rows: LensRowOut[];
  unknown: Record<string, number | null>;
  outside: Record<string, number | null>;
  total: Record<string, number | null>;
  /** Per-lens detail beside the rows (reasons, top products), keyed as the lens documents. */
  extras: Record<string, unknown>;
  hidden: string[];
}

/** Rows of a roller as `LensRowOut`, the figures made by `figures(f)` and the flags by `flags(f, figures)`. */
export function rowsOf<T extends Counts>(
  roller: Roller<T>,
  figures: (f: T) => Record<string, number | null>,
  flags: (f: T, fig: Record<string, number | null>) => string[],
  order: (a: LensRowOut, b: LensRowOut) => number,
): LensRowOut[] {
  const out: LensRowOut[] = [...roller.rows.values()].map(({ place, f }) => {
    const parent = parentOf(place, roller.places);
    const fig = figures(f);
    return {
      areaId: place.id,
      nameEn: place.nameEn,
      nameBn: place.nameBn,
      parentAreaId: parent?.id ?? null,
      parentNameEn: parent?.nameEn ?? null,
      parentNameBn: parent?.nameBn ?? null,
      figures: fig,
      flags: flags(f, fig),
    };
  });
  return out.sort(order);
}

/** Biggest first by a figure, then by name. */
export const byFigure = (key: string) => (a: LensRowOut, b: LensRowOut) => (b.figures[key] ?? -1) - (a.figures[key] ?? -1) || a.nameEn.localeCompare(b.nameEn);

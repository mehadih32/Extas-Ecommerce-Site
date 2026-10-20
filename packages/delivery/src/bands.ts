// PR 550 — band mapping: one band per area, simple.
// - Dhaka City is the official city-corporation map and nothing else: a place inside DNCC or DSCC (the gazetteer's
//   `cityCorporation` tag on it or on a place above it; which tags count is the setting delivery.bands.cityCorporations)
//   is in the city band.
// - The owner's list (AreaBand rows, owner data) is the only exception to the map: an area on it — or under a place on
//   it, the nearest one winning — sits in the band the owner chose (normally the sub-area band).
// - Everywhere else is the outside band, one flat rate.
// - The charge the customer sees is the owner's figure on the band row; it never depends on the courier. The sub-area
//   band has three modes: its own charge · folded into the city charge · folded into the outside charge.
// - A band that is switched off has no charge yet: nothing is quoted from it (PR 553), checkout asks or confirms.
// The band keys come from settings (delivery.bands.*Key), matching the default pack's three rows (PR 508).
import type { Gazetteer, GeoEntry } from './gazetteer';

export const SUB_AREA_MODES = ['own', 'city', 'outside'] as const;
export type SubAreaMode = (typeof SUB_AREA_MODES)[number];
export const isSubAreaMode = (v: unknown): v is SubAreaMode => typeof v === 'string' && (SUB_AREA_MODES as readonly string[]).includes(v);

export type BandRole = 'city' | 'subArea' | 'outside' | 'other';

/** A DeliveryBand row as the engine reads it (money in minor units, the owner's figures). */
export interface BandRow {
  id: string;
  key: string;
  nameEn: string;
  nameBn: string | null;
  chargeMinor: number;
  codLimitMinor: number | null;
  hoursMin: number | null;
  hoursMax: number | null;
  mode: string | null;
  enabled: boolean;
  sortOrder: number;
}

/** One entry of the owner's list: this area (and what is under it) sits in this band. */
export interface AreaOverride {
  areaId: string;
  bandId: string;
}

export interface BandConfig {
  cityKey: string;
  subAreaKey: string;
  outsideKey: string;
  cityCorporations: readonly string[];
}

/** Where a place sits and what it is charged. */
export interface BandAnswer {
  areaId: string;
  /** The band the place sits in. */
  band: BandRow;
  role: BandRole;
  /** The band whose charge and hours the customer gets (the sub-area band folded by its mode). */
  charged: BandRow;
  chargedRole: BandRole;
  /** Why: the owner's list, the city-corporation map, or neither (outside). */
  via: 'owner-list' | 'city-map' | 'outside';
  /** The owner's list entry that decided it, when one did. */
  listedAreaId: string | null;
  /** False while the charged band is switched off (no charge set yet). */
  priced: boolean;
}

export class BandMap {
  private readonly byId = new Map<string, BandRow>();
  private readonly byKey = new Map<string, BandRow>();
  private readonly override = new Map<string, string>();
  private readonly answers = new Map<string, BandAnswer | null>();
  private readonly spans = new Map<string, ReadonlySet<string>>();
  private readonly cityTags: ReadonlySet<string>;

  constructor(
    readonly gazetteer: Gazetteer,
    readonly bands: readonly BandRow[],
    overrides: readonly AreaOverride[],
    readonly config: BandConfig,
  ) {
    for (const b of bands) {
      this.byId.set(b.id, b);
      this.byKey.set(b.key, b);
    }
    for (const o of overrides) if (this.byId.has(o.bandId)) this.override.set(o.areaId, o.bandId);
    this.cityTags = new Set(config.cityCorporations);
  }

  band(key: string): BandRow | undefined {
    return this.byKey.get(key);
  }

  bandById(id: string): BandRow | undefined {
    return this.byId.get(id);
  }

  roleOf(b: BandRow): BandRole {
    if (b.key === this.config.cityKey) return 'city';
    if (b.key === this.config.subAreaKey) return 'subArea';
    if (b.key === this.config.outsideKey) return 'outside';
    return 'other';
  }

  /** The band whose charge applies to a band: the sub-area band follows its mode, every other band is its own. */
  chargedBand(b: BandRow): BandRow {
    if (this.roleOf(b) !== 'subArea') return b;
    const mode = isSubAreaMode(b.mode) ? b.mode : 'own';
    if (mode === 'city') return this.band(this.config.cityKey) ?? b;
    if (mode === 'outside') return this.band(this.config.outsideKey) ?? b;
    return b;
  }

  /** Where a place sits; null when the store has no band row for it (a store without the three bands). */
  bandOf(entry: GeoEntry): BandAnswer | null {
    const hit = this.answers.get(entry.id);
    if (hit !== undefined) return hit;
    const answer = this.decide(entry);
    this.answers.set(entry.id, answer);
    return answer;
  }

  private decide(entry: GeoEntry): BandAnswer | null {
    const lineage = this.gazetteer.lineage(entry);
    let band: BandRow | undefined;
    let via: BandAnswer['via'] = 'outside';
    let listedAreaId: string | null = null;
    const listed = lineage.find((e) => this.override.has(e.id));
    if (listed) {
      band = this.byId.get(this.override.get(listed.id)!);
      via = 'owner-list';
      listedAreaId = listed.id;
    } else if (lineage.some((e) => e.cityCorporation && this.cityTags.has(e.cityCorporation))) {
      band = this.band(this.config.cityKey);
      via = 'city-map';
    } else {
      band = this.band(this.config.outsideKey);
    }
    if (!band) return null;
    const charged = this.chargedBand(band);
    return { areaId: entry.id, band, role: this.roleOf(band), charged, chargedRole: this.roleOf(charged), via, listedAreaId, priced: charged.enabled };
  }

  /**
   * The charged bands a place and everything under it can fall in. One band = the place settles the charge by itself
   * (Bogura); more = it does not (Dhaka district holds the city, the sub-area and the outside band).
   */
  spanOf(entry: GeoEntry): ReadonlySet<string> {
    const hit = this.spans.get(entry.id);
    if (hit) return hit;
    const out = new Set<string>();
    const own = this.bandOf(entry);
    if (own) out.add(own.charged.id);
    this.spans.set(entry.id, out); // a loop in the tree cannot recurse for ever
    for (const child of this.gazetteer.children(entry)) for (const id of this.spanOf(child)) out.add(id);
    return out;
  }

  /** The bands a customer can pick when nothing settles it: the charged form of every band, each once, in order. */
  choices(within?: ReadonlySet<string>): BandRow[] {
    const seen = new Set<string>();
    const out: BandRow[] = [];
    for (const b of [...this.bands].sort((a, z) => a.sortOrder - z.sortOrder || a.key.localeCompare(z.key))) {
      const c = this.chargedBand(b);
      if (seen.has(c.id) || (within && !within.has(c.id))) continue;
      seen.add(c.id);
      out.push(c);
    }
    return out;
  }
}

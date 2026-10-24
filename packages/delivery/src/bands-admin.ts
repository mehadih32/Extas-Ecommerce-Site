// PR 550 — the owner's side of the band map: the three bands (charge, delivery hours, on/off, the sub-area mode) and
// the sub-area list. Both are owner data (PR 509): the default pack ships the bands switched off with no charge, and
// the list empty; the owner types them in here.
//
// - A band is switched on only together with its charge in the same change (CHARGE_REQUIRED): a band never goes live
//   on a figure nobody typed. Charges are the owner's decision (CLAUDE.md rule 6), behind `delivery.charges`.
// - The mode (own · city · outside) belongs to the sub-area band only (MODE_NOT_ALLOWED elsewhere).
// - PR 502: the sub-area band's on/off is its own switch: while it is off, the places on it go by the map (bands.ts);
//   charged as Dhaka City or as outside, it switches on without a charge of its own.
// - A place on the list is taken off by archiving its row (rule 3: nothing is deleted); adding it again brings the
//   same row back. Only a place of the gazetteer can be listed.
// - Every change writes one audit row in the same transaction.
import { z } from 'zod';
import { BandMap, isSubAreaMode, SUB_AREA_MODES, type BandRole, type BandRow } from './bands';
import { allow, BAND_SELECT, bandConfig, gazetteerOf, loadBandMap, logChange, nowOf, type DeliveryDeps, type Who } from './context';
import { DeliveryError } from './errors';
import type { Gazetteer, GeoEntry, GeoLevelName } from './gazetteer';
import { matchPlaces } from './places';

/** The biggest figure a Postgres `integer` holds (money is in minor units, paisa). */
const PG_INT_MAX = 2_147_483_647;
/** The longest delivery promise a band can carry: the seed pack's own bound (30 days). */
const HOURS_CAP = 24 * 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idSchema = z.string().regex(UUID, { message: 'an id' });
const minor = z.int().min(0).max(PG_INT_MAX);
const hours = z.int().min(1).max(HOURS_CAP);

export const bandPatchSchema = z
  .object({
    chargeMinor: minor.optional(),
    codLimitMinor: minor.nullable().optional(),
    hoursMin: hours.nullable().optional(),
    hoursMax: hours.nullable().optional(),
    mode: z.enum(SUB_AREA_MODES).optional(),
    enabled: z.boolean().optional(),
  })
  .strict();
export type BandPatch = z.infer<typeof bandPatchSchema>;

function parse<T extends z.ZodType>(schema: T, input: unknown, what: string): z.output<T> {
  const r = schema.safeParse(input ?? {});
  if (!r.success) throw new DeliveryError('INVALID_INPUT', `the ${what} is not valid`, r.error.issues.map((i) => `${i.path.join('.') || '(input)'}: ${i.message}`));
  return r.data;
}

export interface BandView {
  id: string;
  key: string;
  nameEn: string;
  nameBn: string | null;
  role: BandRole;
  /** The owner's figure; meaningful only while `enabled` (a band switched off has no charge yet). */
  chargeMinor: number;
  codLimitMinor: number | null;
  hoursMin: number | null;
  hoursMax: number | null;
  /** The sub-area band's mode (own · city · outside); null on the other bands. */
  mode: string | null;
  enabled: boolean;
  sortOrder: number;
  /** The band whose charge and hours this band's customers get (the sub-area band folded by its mode). */
  chargedAs: { id: string; key: string; role: BandRole; enabled: boolean };
  /** Places on the owner's list in this band. */
  listed: number;
}

export interface PlaceView {
  id: string;
  code: string | null;
  level: GeoLevelName;
  nameEn: string;
  nameBn: string | null;
  /** The district (or division) that tells it apart from another place of the same name. */
  parentEn: string | null;
  parentBn: string | null;
  cityCorporation: string | null;
}

export interface ListedPlace extends PlaceView {
  bandId: string;
  bandKey: string;
  archived: boolean;
  /** The row's place is no longer in the gazetteer (an import archived it): kept, shown, never charged from. */
  missing: boolean;
}

export interface PlaceAnswer extends PlaceView {
  /** Where the place sits now (null when the store has no band row for it). */
  bandId: string | null;
  bandKey: string | null;
  chargedKey: string | null;
  via: 'owner-list' | 'city-map' | 'outside' | null;
  /** The place on the list that decides it (this place or one above it). */
  listedAreaId: string | null;
  /** The bands it and what is under it can fall in (more than one: it does not settle the charge by itself). */
  spans: number;
}

export function placeView(g: Gazetteer, e: GeoEntry): PlaceView {
  const p = g.parentLabelOf(e);
  return { id: e.id, code: e.code, level: e.level, nameEn: e.nameEn, nameBn: e.nameBn, parentEn: p?.nameEn ?? null, parentBn: p?.nameBn ?? p?.nameEn ?? null, cityCorporation: e.cityCorporation };
}

function bandView(map: BandMap, b: BandRow, listed: number): BandView {
  const c = map.chargedBand(b);
  const role = map.roleOf(b);
  return {
    id: b.id,
    key: b.key,
    nameEn: b.nameEn,
    nameBn: b.nameBn,
    role,
    chargeMinor: b.chargeMinor,
    codLimitMinor: b.codLimitMinor,
    hoursMin: b.hoursMin,
    hoursMax: b.hoursMax,
    mode: role === 'subArea' ? (isSubAreaMode(b.mode) ? b.mode : 'own') : null,
    enabled: b.enabled,
    sortOrder: b.sortOrder,
    chargedAs: { id: c.id, key: c.key, role: map.roleOf(c), enabled: c.enabled },
    listed,
  };
}

/** The store's bands as the admin shows them, in order. */
export async function listBands(deps: DeliveryDeps, who: Who): Promise<BandView[]> {
  await allow(deps, who, 'delivery.read');
  const [map, counts] = await Promise.all([
    loadBandMap(deps, who.storeId),
    deps.db.areaBand.groupBy({ by: ['bandId'], where: { storeId: who.storeId, archivedAt: null }, _count: { _all: true } }),
  ]);
  const n = new Map(counts.map((c) => [c.bandId, c._count._all]));
  return map.bands.map((b) => bandView(map, b, n.get(b.id) ?? 0));
}

/** Changes a band's charge, hours, COD limit, on/off or (sub-area band only) mode. */
export async function updateBand(deps: DeliveryDeps, who: Who, bandId: string, input: unknown): Promise<BandView> {
  await allow(deps, who, 'delivery.charges');
  parse(idSchema, bandId, 'band id');
  const patch = parse(bandPatchSchema, input, 'band change');
  if (!Object.keys(patch).length) throw new DeliveryError('INVALID_INPUT', 'nothing to change', ['(input)']);
  const config = await bandConfig(deps, who.storeId);
  return deps.db.$transaction(async (tx) => {
    const before = await tx.deliveryBand.findFirst({ where: { id: bandId, storeId: who.storeId, archivedAt: null }, select: BAND_SELECT });
    if (!before) throw new DeliveryError('NOT_FOUND', 'no such band in this store', ['bandId']);
    if (patch.mode !== undefined && before.key !== config.subAreaKey) throw new DeliveryError('MODE_NOT_ALLOWED', 'only the sub-area band has a mode', ['mode']);
    // PR 502: the sub-area band charged as Dhaka City or as outside has no charge of its own to type
    const folded = before.key === config.subAreaKey && (patch.mode ?? (isSubAreaMode(before.mode) ? before.mode : 'own')) !== 'own';
    if (patch.enabled === true && !before.enabled && patch.chargeMinor === undefined && !folded) throw new DeliveryError('CHARGE_REQUIRED', 'switching a band on needs its charge in the same change', ['chargeMinor']);
    const hoursMin = patch.hoursMin === undefined ? before.hoursMin : patch.hoursMin;
    const hoursMax = patch.hoursMax === undefined ? before.hoursMax : patch.hoursMax;
    if (hoursMin != null && hoursMax != null && hoursMin > hoursMax) throw new DeliveryError('INVALID_INPUT', 'the shortest time is above the longest', ['hoursMin']);
    const after = await tx.deliveryBand.update({ where: { id: bandId }, data: patch, select: BAND_SELECT });
    await logChange(tx, who, 'delivery.band.update', 'DeliveryBand', bandId, before, after);
    const bands = await tx.deliveryBand.findMany({ where: { storeId: who.storeId, archivedAt: null }, select: BAND_SELECT });
    const listed = await tx.areaBand.count({ where: { storeId: who.storeId, bandId, archivedAt: null } });
    const map = new BandMap(await gazetteerOf(deps), bands as BandRow[], [], config);
    return bandView(map, map.bandById(bandId)!, listed);
  });
}

/** The owner's list: every place on it (taken-off ones too, when asked), biggest places first. */
export async function listSubAreas(deps: DeliveryDeps, who: Who, opts: { includeArchived?: boolean } = {}): Promise<ListedPlace[]> {
  await allow(deps, who, 'delivery.read');
  const [g, rows] = await Promise.all([
    gazetteerOf(deps),
    deps.db.areaBand.findMany({
      where: { storeId: who.storeId, ...(opts.includeArchived ? {} : { archivedAt: null }) },
      select: { areaId: true, bandId: true, archivedAt: true, band: { select: { key: true } }, area: { select: { nameEn: true, nameBn: true, level: true, code: true, cityCorporation: true } } },
    }),
  ]);
  const out: ListedPlace[] = rows.map((r) => {
    const e = g.get(r.areaId);
    const base: PlaceView = e
      ? placeView(g, e)
      : { id: r.areaId, code: r.area.code, level: r.area.level, nameEn: r.area.nameEn, nameBn: r.area.nameBn, parentEn: null, parentBn: null, cityCorporation: r.area.cityCorporation };
    return { ...base, bandId: r.bandId, bandKey: r.band.key, archived: r.archivedAt != null, missing: !e };
  });
  const depth = (p: ListedPlace) => { const e = g.get(p.id); return e ? g.depth(e) : Number.MAX_SAFE_INTEGER; };
  return out.sort((a, b) => Number(a.archived) - Number(b.archived) || depth(a) - depth(b) || a.nameEn.localeCompare(b.nameEn));
}

const listSchema = z.object({ areaId: idSchema, bandId: idSchema.optional() }).strict();

/**
 * Puts a place (and everything under it) in a band — the sub-area band unless another is named. A place already on
 * the list moves; one taken off before comes back on the same row.
 */
export async function setAreaBand(deps: DeliveryDeps, who: Who, input: unknown): Promise<ListedPlace> {
  await allow(deps, who, 'delivery.areas');
  const { areaId, bandId: asked } = parse(listSchema, input, 'list entry');
  const [g, config] = await Promise.all([gazetteerOf(deps), bandConfig(deps, who.storeId)]);
  const e = g.get(areaId);
  if (!e) throw new DeliveryError('NOT_FOUND', 'no such place in the gazetteer', ['areaId']);
  return deps.db.$transaction(async (tx) => {
    const band = await tx.deliveryBand.findFirst({ where: { storeId: who.storeId, archivedAt: null, ...(asked ? { id: asked } : { key: config.subAreaKey }) }, select: { id: true, key: true } });
    if (!band) throw new DeliveryError('NOT_FOUND', 'no such band in this store', ['bandId']);
    const before = await tx.areaBand.findUnique({ where: { storeId_areaId: { storeId: who.storeId, areaId } }, select: { id: true, bandId: true, archivedAt: true } });
    const row = before
      ? await tx.areaBand.update({ where: { id: before.id }, data: { bandId: band.id, archivedAt: null }, select: { id: true, bandId: true, archivedAt: true } })
      : await tx.areaBand.create({ data: { storeId: who.storeId, areaId, bandId: band.id }, select: { id: true, bandId: true, archivedAt: true } });
    if (!before || before.bandId !== row.bandId || before.archivedAt) await logChange(tx, who, 'delivery.area.set', 'AreaBand', row.id, before ? { areaId, ...before } : null, { areaId, ...row });
    return { ...placeView(g, e), bandId: band.id, bandKey: band.key, archived: false, missing: false };
  });
}

/** Takes a place off the list (its row is archived, never deleted). */
export async function removeAreaBand(deps: DeliveryDeps, who: Who, areaId: string): Promise<{ areaId: string; archived: boolean }> {
  await allow(deps, who, 'delivery.areas');
  parse(idSchema, areaId, 'place id');
  return deps.db.$transaction(async (tx) => {
    const before = await tx.areaBand.findUnique({ where: { storeId_areaId: { storeId: who.storeId, areaId } }, select: { id: true, bandId: true, archivedAt: true } });
    if (!before) throw new DeliveryError('NOT_FOUND', 'this place is not on the list', ['areaId']);
    if (before.archivedAt) return { areaId, archived: true };
    const row = await tx.areaBand.update({ where: { id: before.id }, data: { archivedAt: nowOf(deps) }, select: { id: true, bandId: true, archivedAt: true } });
    await logChange(tx, who, 'delivery.area.remove', 'AreaBand', row.id, { areaId, ...before }, { areaId, ...row });
    return { areaId, archived: true };
  });
}

/** Where a place sits now, and why. */
export function answerFor(map: BandMap, e: GeoEntry): PlaceAnswer {
  const a = map.bandOf(e);
  return {
    ...placeView(map.gazetteer, e),
    bandId: a?.band.id ?? null,
    bandKey: a?.band.key ?? null,
    chargedKey: a?.charged.key ?? null,
    via: a?.via ?? null,
    listedAreaId: a?.listedAreaId ?? null,
    spans: map.spanOf(e).size,
  };
}

/** The admin's place search (adding to the list): prefix matching, each result with the band it sits in now. */
export async function searchPlaces(deps: DeliveryDeps, who: Who, query: unknown): Promise<PlaceAnswer[]> {
  await allow(deps, who, 'delivery.read');
  const q = parse(z.string().max(120), query ?? '', 'search');
  const [map, limit] = await Promise.all([loadBandMap(deps, who.storeId), deps.settings.value('delivery.bands.searchLimit', { storeId: who.storeId })]);
  return matchPlaces(map.gazetteer, q, limit).map((m) => answerFor(map, m.entry));
}

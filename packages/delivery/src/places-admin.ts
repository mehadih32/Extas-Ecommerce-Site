// S06 · PR 502 — the owner's side of the area list itself (Delivery › Zones & charges): open a place, rename it, edit its
// alternate spellings, add a place the list does not have, and merge two spellings of one place. Moving a place between
// bands is the band map's (bands-admin.ts `setAreaBand`). Every change needs `delivery.areas`, is one transaction with
// its audit row, and the shared index is read again right after (load.ts `forgetGazetteer`).
//
// - Nothing is deleted (hard rule 3): a merged place is archived, its names become the other place's spellings, the
//   places under it move under the other one, and saved customer addresses follow it; placed orders keep the place they
//   had. A place the owner adds has no importer code, so an import never touches it (import.ts).
// - The owner's word wins over a later import: a renamed or re-spelled place keeps the owner's names (the file's new
//   spelling only joins its spellings) and a merged place is never brought back (import.ts reads these audit rows).
// - A rename keeps the old name as a spelling unless the owner says not to, so old addresses still find the place.
// - The area list is installation-wide (GeoArea has no store); the permission is checked in the store that acts.
import { z } from 'zod';
import { answerFor, placeView, type PlaceAnswer, type PlaceView } from './bands-admin';
import { allow, gazetteerOf, loadBandMap, logChange, nowOf, type DeliveryDeps, type Who } from './context';
import { DeliveryError } from './errors';
import { GEO_LEVELS, type GeoLevelName } from './gazetteer';
import { forgetGazetteer } from './load';
import { nameKey } from './text';

/** The audit actions an import reads back: the owner's names and spellings win; a merged place stays merged. */
export const PLACE_ACTIONS = { add: 'delivery.place.add', rename: 'delivery.place.rename', aliases: 'delivery.place.aliases', merge: 'delivery.place.merge', mergedInto: 'delivery.place.mergeInto' } as const;
export const OWNER_NAMED_ACTIONS: readonly string[] = [PLACE_ACTIONS.rename, PLACE_ACTIONS.aliases, PLACE_ACTIONS.mergedInto];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idSchema = z.string().regex(UUID, { message: 'an id' });
/** The longest name or spelling a place can carry (a place name, not a sentence). */
const NAME_MAX = 120;
/** The most spellings one place keeps (the index holds every one of them). */
export const ALIASES_MAX = 40;
const name = z.string().trim().min(1).max(NAME_MAX);
const aliasList = z.array(z.string().max(NAME_MAX)).max(ALIASES_MAX * 2);

function parse<T extends z.ZodType>(schema: T, input: unknown, what: string): z.output<T> {
  const r = schema.safeParse(input ?? {});
  if (!r.success) throw new DeliveryError('INVALID_INPUT', `the ${what} is not valid`, r.error.issues.map((i) => `${i.path.join('.') || '(input)'}: ${i.message}`));
  return r.data;
}

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();

/** The spellings worth keeping: tidy, each once (by its matching key), none that is already one of the place's names. */
export function cleanAliases(list: readonly string[], names: readonly (string | null)[]): string[] {
  const seen = new Set(names.filter((n): n is string => !!n).map(nameKey));
  const out: string[] = [];
  for (const raw of list) {
    const a = tidy(raw);
    const k = nameKey(a);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(a);
  }
  return out;
}

const PLACE_SELECT = { id: true, code: true, level: true, parentId: true, ancestorIds: true, nameEn: true, nameBn: true, aliases: true, postcodes: true, cityCorporation: true, archivedAt: true } as const;

export interface PlaceDetail extends PlaceView {
  aliases: string[];
  postcodes: string[];
  /** Added by the owner (no importer code). */
  ownerMade: boolean;
  /** Places directly under it. */
  children: number;
  /** Its own row on the owner's list (null when it is not on it itself). */
  listed: { bandId: string; bandKey: string; archived: boolean } | null;
  /** Where it sits now, and why. */
  now: PlaceAnswer;
}

/** One place with everything the owner can change (`delivery.read`). */
export async function placeDetail(deps: DeliveryDeps, who: Who, areaId: string): Promise<PlaceDetail> {
  await allow(deps, who, 'delivery.read');
  parse(idSchema, areaId, 'place id');
  const map = await loadBandMap(deps, who.storeId);
  const e = map.gazetteer.get(areaId);
  if (!e) throw new DeliveryError('NOT_FOUND', 'no such place in the area list', ['areaId']);
  const row = await deps.db.areaBand.findUnique({ where: { storeId_areaId: { storeId: who.storeId, areaId } }, select: { bandId: true, archivedAt: true, band: { select: { key: true } } } });
  return {
    ...placeView(map.gazetteer, e),
    aliases: [...e.aliases],
    postcodes: [...e.postcodes],
    ownerMade: e.code === null,
    children: map.gazetteer.children(e).length,
    listed: row ? { bandId: row.bandId, bandKey: row.band.key, archived: row.archivedAt !== null } : null,
    now: answerFor(map, e),
  };
}

async function livePlace(deps: DeliveryDeps, id: string, field: string) {
  const p = await deps.db.geoArea.findFirst({ where: { id, archivedAt: null }, select: PLACE_SELECT });
  if (!p) throw new DeliveryError('NOT_FOUND', 'no such place in the area list', [field]);
  return p;
}

const after = async <T>(work: Promise<T>): Promise<T> => {
  const out = await work;
  forgetGazetteer();
  return out;
};

const renameSchema = z.object({ nameEn: name.optional(), nameBn: name.nullable().optional(), keepOld: z.boolean().optional() }).strict();

/** Renames a place (either language); the old name stays as a spelling unless `keepOld: false`. */
export async function renamePlace(deps: DeliveryDeps, who: Who, areaId: string, input: unknown): Promise<PlaceDetail> {
  await allow(deps, who, 'delivery.areas');
  parse(idSchema, areaId, 'place id');
  const d = parse(renameSchema, input, 'new name');
  if (d.nameEn === undefined && d.nameBn === undefined) throw new DeliveryError('INVALID_INPUT', 'nothing to change', ['(input)']);
  const before = await livePlace(deps, areaId, 'areaId');
  const nameEn = d.nameEn === undefined ? before.nameEn : tidy(d.nameEn);
  const nameBn = d.nameBn === undefined ? before.nameBn : d.nameBn === null ? null : tidy(d.nameBn);
  if (nameEn === before.nameEn && nameBn === before.nameBn) return placeDetail(deps, who, areaId);
  await sameNameUnder(deps, before.parentId, nameEn, areaId);
  const old = d.keepOld === false ? [] : [before.nameEn, before.nameBn].filter((n): n is string => !!n);
  const aliases = cleanAliases([...before.aliases, ...old], [nameEn, nameBn]);
  await after(
    deps.db.$transaction(async (tx) => {
      const row = await tx.geoArea.update({ where: { id: areaId }, data: { nameEn, nameBn, aliases }, select: PLACE_SELECT });
      await logChange(tx, who, PLACE_ACTIONS.rename, 'GeoArea', areaId, pick(before), pick(row));
    }),
  );
  return placeDetail(deps, who, areaId);
}

const aliasesSchema = z.object({ aliases: aliasList }).strict();

/** Replaces a place's alternate spellings (tidied, each once, never one of its own names). */
export async function setPlaceAliases(deps: DeliveryDeps, who: Who, areaId: string, input: unknown): Promise<PlaceDetail> {
  await allow(deps, who, 'delivery.areas');
  parse(idSchema, areaId, 'place id');
  const d = parse(aliasesSchema, input, 'spellings');
  const before = await livePlace(deps, areaId, 'areaId');
  const aliases = cleanAliases(d.aliases, [before.nameEn, before.nameBn]);
  if (aliases.length > ALIASES_MAX) throw new DeliveryError('INVALID_INPUT', 'too many spellings', [`aliases: at most ${ALIASES_MAX}`]);
  if (aliases.length === before.aliases.length && aliases.every((a, i) => a === before.aliases[i])) return placeDetail(deps, who, areaId);
  await after(
    deps.db.$transaction(async (tx) => {
      const row = await tx.geoArea.update({ where: { id: areaId }, data: { aliases }, select: PLACE_SELECT });
      await logChange(tx, who, PLACE_ACTIONS.aliases, 'GeoArea', areaId, pick(before), pick(row));
    }),
  );
  return placeDetail(deps, who, areaId);
}

/** A level that can sit under a parent: deeper than it (an area may hold areas: a para inside a neighbourhood). */
export function canSitUnder(level: GeoLevelName, parent: GeoLevelName): boolean {
  const a = GEO_LEVELS.indexOf(level);
  const p = GEO_LEVELS.indexOf(parent);
  return a > p || (level === 'AREA' && parent === 'AREA');
}

/** The level a new place gets under a parent when none is named. */
export const childLevelOf = (parent: GeoLevelName): GeoLevelName => (parent === 'DIVISION' ? 'DISTRICT' : parent === 'DISTRICT' ? 'UPAZILA' : 'AREA');

async function sameNameUnder(deps: DeliveryDeps, parentId: string | null, nameEn: string, self: string | null): Promise<void> {
  const g = await gazetteerOf(deps);
  const parent = g.get(parentId);
  const siblings = parent ? g.children(parent) : g.entries.filter((e) => e.parentId === null);
  const k = nameKey(nameEn);
  const clash = siblings.find((s) => s.id !== self && nameKey(s.nameEn) === k);
  if (clash) throw new DeliveryError('DUPLICATE_PLACE', 'a place of that name is already there', [clash.id]);
}

const addSchema = z
  .object({ parentId: idSchema, level: z.enum(GEO_LEVELS).optional(), nameEn: name, nameBn: name.nullable().optional(), aliases: aliasList.optional(), bandId: idSchema.optional() })
  .strict();

/** Adds a place under another one (no importer code: an import never changes it); optionally straight onto the list. */
export async function addPlace(deps: DeliveryDeps, who: Who, input: unknown): Promise<PlaceDetail> {
  await allow(deps, who, 'delivery.areas');
  const d = parse(addSchema, input, 'new place');
  const parent = await livePlace(deps, d.parentId, 'parentId');
  const level = d.level ?? childLevelOf(parent.level);
  if (!canSitUnder(level, parent.level)) throw new DeliveryError('INVALID_INPUT', 'that level cannot sit under this place', ['level']);
  const nameEn = tidy(d.nameEn);
  const nameBn = d.nameBn ? tidy(d.nameBn) : null;
  await sameNameUnder(deps, parent.id, nameEn, null);
  const aliases = cleanAliases(d.aliases ?? [], [nameEn, nameBn]);
  if (aliases.length > ALIASES_MAX) throw new DeliveryError('INVALID_INPUT', 'too many spellings', [`aliases: at most ${ALIASES_MAX}`]);
  const made = await after(
    deps.db.$transaction(async (tx) => {
      const band = d.bandId ? await tx.deliveryBand.findFirst({ where: { id: d.bandId, storeId: who.storeId, archivedAt: null }, select: { id: true } }) : null;
      if (d.bandId && !band) throw new DeliveryError('NOT_FOUND', 'no such band in this store', ['bandId']);
      const row = await tx.geoArea.create({
        data: { code: null, level, parentId: parent.id, ancestorIds: [...parent.ancestorIds, parent.id], nameEn, nameBn, aliases, postcodes: [], cityCorporation: null },
        select: PLACE_SELECT,
      });
      await logChange(tx, who, PLACE_ACTIONS.add, 'GeoArea', row.id, null, pick(row));
      if (band) {
        const listed = await tx.areaBand.create({ data: { storeId: who.storeId, areaId: row.id, bandId: band.id }, select: { id: true, bandId: true, archivedAt: true } });
        await logChange(tx, who, 'delivery.area.set', 'AreaBand', listed.id, null, { areaId: row.id, ...listed });
      }
      return row;
    }),
  );
  return placeDetail(deps, who, made.id);
}

const mergeSchema = z.object({ intoId: idSchema }).strict();

export interface MergeResult {
  /** The place that stays, with the merged one's names as its spellings. */
  into: PlaceDetail;
  /** The merged place (archived, never deleted). */
  mergedId: string;
  /** Places moved from under it to under the place that stays. */
  movedChildren: number;
  /** Saved customer addresses that now point at the place that stays. */
  movedAddresses: number;
}

/**
 * Merges two spellings of one place: `areaId` goes into `intoId`. Same level only (LEVEL_MISMATCH); not into a place
 * under itself; refused when the two sit in different bands on the owner's list (BAND_CONFLICT — move one first).
 */
export async function mergePlace(deps: DeliveryDeps, who: Who, areaId: string, input: unknown): Promise<MergeResult> {
  await allow(deps, who, 'delivery.areas');
  parse(idSchema, areaId, 'place id');
  const { intoId } = parse(mergeSchema, input, 'merge');
  if (intoId === areaId) throw new DeliveryError('INVALID_INPUT', 'a place cannot merge into itself', ['intoId']);
  const [from, into] = await Promise.all([livePlace(deps, areaId, 'areaId'), livePlace(deps, intoId, 'intoId')]);
  if (from.level !== into.level) throw new DeliveryError('LEVEL_MISMATCH', 'only places of the same level merge', ['intoId']);
  if (into.ancestorIds.includes(from.id)) throw new DeliveryError('INVALID_INPUT', 'a place cannot merge into a place under itself', ['intoId']);
  const now = nowOf(deps);
  const out = await after(
    deps.db.$transaction(async (tx) => {
      const rows = await tx.areaBand.findMany({ where: { storeId: who.storeId, areaId: { in: [from.id, into.id] } }, select: { id: true, areaId: true, bandId: true, archivedAt: true } });
      const fromRow = rows.find((r) => r.areaId === from.id && !r.archivedAt);
      const intoRow = rows.find((r) => r.areaId === into.id);
      if (fromRow && intoRow && !intoRow.archivedAt && intoRow.bandId !== fromRow.bandId) throw new DeliveryError('BAND_CONFLICT', 'the two places sit in different bands on the list', ['intoId']);
      // the names of the merged place become spellings of the one that stays
      const aliases = cleanAliases([...into.aliases, from.nameEn, ...(from.nameBn ? [from.nameBn] : []), ...from.aliases], [into.nameEn, into.nameBn]).slice(0, ALIASES_MAX);
      const postcodes = [...new Set([...into.postcodes, ...from.postcodes])];
      const kept = await tx.geoArea.update({ where: { id: into.id }, data: { aliases, postcodes }, select: PLACE_SELECT });
      // the places under it move under the place that stays (their chains follow)
      const below = await tx.geoArea.findMany({ where: { ancestorIds: { has: from.id } }, select: { id: true, parentId: true, ancestorIds: true } });
      const base = [...into.ancestorIds, into.id];
      for (const b of below) {
        const rest = b.ancestorIds.slice(b.ancestorIds.indexOf(from.id) + 1);
        await tx.geoArea.update({ where: { id: b.id }, data: { parentId: b.parentId === from.id ? into.id : b.parentId, ancestorIds: [...base, ...rest] } });
      }
      const movedChildren = below.filter((b) => b.parentId === from.id).length;
      // the owner's list: the band of the merged place carries over; its own row is archived
      if (fromRow) {
        if (!intoRow) await tx.areaBand.create({ data: { storeId: who.storeId, areaId: into.id, bandId: fromRow.bandId } });
        else if (intoRow.archivedAt) await tx.areaBand.update({ where: { id: intoRow.id }, data: { bandId: fromRow.bandId, archivedAt: null } });
        await tx.areaBand.update({ where: { id: fromRow.id }, data: { archivedAt: now } });
      }
      const moved = await tx.customerAddress.updateMany({ where: { areaId: from.id }, data: { areaId: into.id } });
      const gone = await tx.geoArea.update({ where: { id: from.id }, data: { archivedAt: now }, select: PLACE_SELECT });
      await logChange(tx, who, PLACE_ACTIONS.merge, 'GeoArea', from.id, pick(from), { ...pick(gone), mergedIntoId: into.id, movedChildren, movedAddresses: moved.count, listedBand: fromRow?.bandId ?? null });
      await logChange(tx, who, PLACE_ACTIONS.mergedInto, 'GeoArea', into.id, pick(into), { ...pick(kept), mergedFromId: from.id });
      return { movedChildren, movedAddresses: moved.count };
    }),
  );
  return { into: await placeDetail(deps, who, into.id), mergedId: from.id, ...out };
}

/** What an audit row keeps of a place (never more than the place itself). */
function pick(p: { nameEn: string; nameBn: string | null; aliases: string[]; level: string; parentId: string | null; code: string | null; archivedAt?: Date | null }) {
  return { code: p.code, level: p.level, parentId: p.parentId, nameEn: p.nameEn, nameBn: p.nameBn, aliases: p.aliases, archivedAt: p.archivedAt ?? null };
}

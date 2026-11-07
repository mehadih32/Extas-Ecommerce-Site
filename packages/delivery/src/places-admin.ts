// S06 · PR 502 — the owner's side of the area list itself (Delivery › Zones & charges): open a place, rename it, edit its
// alternate spellings, add a place the list does not have, and merge two spellings of one place. Moving a place between
// bands is the band map's (bands-admin.ts `setAreaBand`). Every change needs `delivery.areas`, is one transaction with
// its audit row, and the shared index is read again right after (load.ts `forgetGazetteer`).
//
// - Nothing is deleted (hard rule 3): a merged place is archived, its names become the other place's spellings, the
//   places under it move under the other one, and saved customer addresses follow it; placed orders keep the place they
//   had. A place the owner adds has no importer code, so an import never touches it (import.ts).
// - The owner's word wins over a later import: a renamed or re-spelled place keeps the owner's names (the file's new
//   spelling only joins its spellings) and a merged place is never brought back. Follow-up 416: both are columns on the
//   place (`ownerNamedAt`, `mergedIntoId`, set in the same transaction as the change and its audit row), which import.ts
//   reads; the audit rows stay the record of who did what.
// - Follow-up 417: each merge keeps a record of what it moved (GeoMergeRecord: the spellings and postcodes it added, the
//   places and saved addresses it moved, the owner's list rows it changed), in the same transaction. The place that
//   stays lists its merges ("Merged into this place"), and the owner can undo one: the merged place comes back with its
//   own names, the spellings and postcodes the merge added come off, and what moved goes back — only what still sits
//   where the merge put it (a later change of the owner's wins). Audited; the record is marked undone, never deleted.
//   Placed orders are never touched. A merge from before the record existed cannot be undone.
// - A rename keeps the old name as a spelling unless the owner says not to, so old addresses still find the place.
// - The area list is installation-wide (GeoArea has no store); the permission is checked in the store that acts.
import { z } from 'zod';
import { answerFor, placeView, type PlaceAnswer, type PlaceView } from './bands-admin';
import { allow, gazetteerOf, loadBandMap, logChange, nowOf, type DeliveryDeps, type Who } from './context';
import { DeliveryError } from './errors';
import { GEO_LEVELS, type GeoLevelName } from './gazetteer';
import { forgetGazetteer } from './load';
import { nameKey } from './text';

/** The audit actions of the owner's place changes: the names and spellings win; a merged place stays merged (since
 * follow-up 416 the import reads the place's columns; migration 0165 filled them from rows with these actions). */
export const PLACE_ACTIONS = { add: 'delivery.place.add', rename: 'delivery.place.rename', aliases: 'delivery.place.aliases', merge: 'delivery.place.merge', mergedInto: 'delivery.place.mergeInto', unmerge: 'delivery.place.unmerge', unmergeFrom: 'delivery.place.unmergeFrom' } as const;
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
  /** Follow-up 417: the places merged into this one, newest first (with whether each can be undone). */
  merges: PlaceMerge[];
}

export interface PlaceMerge {
  recordId: string;
  /** The merged place (archived while the merge stands). */
  fromId: string;
  fromNameEn: string;
  fromNameBn: string | null;
  at: Date;
  addresses: number;
  children: number;
  undoneAt: Date | null;
  /** It still stands and nothing since stops an undo. */
  undoable: boolean;
}

/** How many merges a place's history shows. */
const MERGES_SHOWN = 20; // hardcode-ok: the list's own length, not a business number

async function mergesInto(deps: DeliveryDeps, storeId: number, areaId: string): Promise<PlaceMerge[]> {
  const rows = await deps.db.geoMergeRecord.findMany({ where: { storeId, intoId: areaId }, orderBy: [{ mergedAt: 'desc' }, { id: 'desc' }], take: MERGES_SHOWN, select: { id: true, fromId: true, mergedAt: true, addressIds: true, children: true, undoneAt: true } });
  if (!rows.length) return [];
  const places = await deps.db.geoArea.findMany({ where: { id: { in: rows.map((r) => r.fromId) } }, select: { id: true, nameEn: true, nameBn: true, mergedIntoId: true, archivedAt: true } });
  const byId = new Map(places.map((p) => [p.id, p]));
  // only the latest record of a merged place can stand (a place merged, undone and merged again has several)
  const latest = new Set<string>();
  return rows.flatMap((r) => {
    const p = byId.get(r.fromId);
    if (!p) return [];
    const first = !latest.has(r.fromId);
    latest.add(r.fromId);
    return [{ recordId: r.id, fromId: r.fromId, fromNameEn: p.nameEn, fromNameBn: p.nameBn, at: r.mergedAt, addresses: r.addressIds.length, children: Array.isArray(r.children) ? r.children.length : 0, undoneAt: r.undoneAt, undoable: first && !r.undoneAt && p.mergedIntoId === areaId && p.archivedAt !== null }];
  });
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
    merges: await mergesInto(deps, who.storeId, areaId),
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
      const row = await tx.geoArea.update({ where: { id: areaId }, data: { nameEn, nameBn, aliases, ownerNamedAt: nowOf(deps) }, select: PLACE_SELECT });
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
      const row = await tx.geoArea.update({ where: { id: areaId }, data: { aliases, ownerNamedAt: nowOf(deps) }, select: PLACE_SELECT });
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
      const kept = await tx.geoArea.update({ where: { id: into.id }, data: { aliases, postcodes, ownerNamedAt: now }, select: PLACE_SELECT });
      // the places under it move under the place that stays (their chains follow)
      const below = await tx.geoArea.findMany({ where: { ancestorIds: { has: from.id } }, select: { id: true, parentId: true, ancestorIds: true } });
      const base = [...into.ancestorIds, into.id];
      for (const b of below) {
        const rest = b.ancestorIds.slice(b.ancestorIds.indexOf(from.id) + 1);
        await tx.geoArea.update({ where: { id: b.id }, data: { parentId: b.parentId === from.id ? into.id : b.parentId, ancestorIds: [...base, ...rest] } });
      }
      const movedChildren = below.filter((b) => b.parentId === from.id).length;
      const children: MovedChild[] = below.map((b) => {
        const rest = b.ancestorIds.slice(b.ancestorIds.indexOf(from.id) + 1);
        return { id: b.id, parentId: b.parentId, ancestorIds: b.ancestorIds, toParentId: b.parentId === from.id ? into.id : b.parentId, toAncestorIds: [...base, ...rest] };
      });
      // the owner's list: the band of the merged place carries over; its own row is archived
      if (fromRow) {
        if (!intoRow) await tx.areaBand.create({ data: { storeId: who.storeId, areaId: into.id, bandId: fromRow.bandId } });
        else if (intoRow.archivedAt) await tx.areaBand.update({ where: { id: intoRow.id }, data: { bandId: fromRow.bandId, archivedAt: null } });
        await tx.areaBand.update({ where: { id: fromRow.id }, data: { archivedAt: now } });
      }
      // follow-up 417: which saved addresses moved (an undo moves exactly these back)
      const addressIds = (await tx.customerAddress.findMany({ where: { areaId: from.id }, select: { id: true } })).map((a) => a.id);
      const moved = await tx.customerAddress.updateMany({ where: { id: { in: addressIds }, areaId: from.id }, data: { areaId: into.id } });
      const gone = await tx.geoArea.update({ where: { id: from.id }, data: { archivedAt: now, mergedIntoId: into.id }, select: PLACE_SELECT });
      const bands: MergeBands = fromRow
        ? { fromRowId: fromRow.id, intoWas: !intoRow ? 'none' : intoRow.archivedAt ? 'archived' : 'live', intoBandId: intoRow?.bandId ?? null, intoArchivedAt: intoRow?.archivedAt?.toISOString() ?? null }
        : { fromRowId: null, intoWas: 'untouched', intoBandId: null, intoArchivedAt: null };
      await tx.geoMergeRecord.create({
        data: { storeId: who.storeId, fromId: from.id, intoId: into.id, addedAliases: aliases.filter((a) => !into.aliases.includes(a)), addedPostcodes: postcodes.filter((c) => !into.postcodes.includes(c)), children: children as unknown as object, addressIds, bands: bands as unknown as object, actorId: who.actor.staffUserId ?? null, mergedAt: now },
      });
      await logChange(tx, who, PLACE_ACTIONS.merge, 'GeoArea', from.id, pick(from), { ...pick(gone), mergedIntoId: into.id, movedChildren, movedAddresses: moved.count, listedBand: fromRow?.bandId ?? null });
      await logChange(tx, who, PLACE_ACTIONS.mergedInto, 'GeoArea', into.id, pick(into), { ...pick(kept), mergedFromId: from.id });
      return { movedChildren, movedAddresses: moved.count };
    }),
  );
  return { into: await placeDetail(deps, who, into.id), mergedId: from.id, ...out };
}

/** Follow-up 417: a place the merge moved from under the merged one, where it was and where it went. */
interface MovedChild {
  id: string;
  parentId: string | null;
  ancestorIds: string[];
  toParentId: string | null;
  toAncestorIds: string[];
}

/** Follow-up 417: the owner's list rows a merge changed (`intoWas`: the stay-place's own row before it). */
interface MergeBands {
  fromRowId: string | null;
  intoWas: 'untouched' | 'none' | 'archived' | 'live';
  intoBandId: string | null;
  intoArchivedAt: string | null;
}

export interface UnmergeResult {
  /** The place brought back. */
  place: PlaceDetail;
  /** The place it had gone into, without the spellings the merge gave it. */
  into: PlaceDetail;
  restoredChildren: number;
  restoredAddresses: number;
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Follow-up 417 — undoes the latest merge of `areaId` (the merged place): it comes back with its own names, the spellings
 * and postcodes the merge added come off the place that stays, and the places, saved addresses and the owner's list rows
 * the merge moved go back — each only while it is still where the merge put it. Refused (CANNOT_UNDO) without a record,
 * when undone already, or when the place it went into or its old parent left the list; DUPLICATE_PLACE when a place of
 * its name was added under its parent since. Audited; placed orders are never touched.
 */
export async function unmergePlace(deps: DeliveryDeps, who: Who, areaId: string): Promise<UnmergeResult> {
  await allow(deps, who, 'delivery.areas');
  parse(idSchema, areaId, 'place id');
  const from = await deps.db.geoArea.findUnique({ where: { id: areaId }, select: { ...PLACE_SELECT, mergedIntoId: true } });
  if (!from) throw new DeliveryError('NOT_FOUND', 'no such place in the area list', ['areaId']);
  if (!from.mergedIntoId || !from.archivedAt) throw new DeliveryError('CANNOT_UNDO', 'this place is not merged', ['notMerged']);
  const record = await deps.db.geoMergeRecord.findFirst({ where: { storeId: who.storeId, fromId: from.id }, orderBy: [{ mergedAt: 'desc' }, { id: 'desc' }] });
  if (!record || record.intoId !== from.mergedIntoId) throw new DeliveryError('CANNOT_UNDO', 'this merge was made before its record was kept', ['noRecord']);
  if (record.undoneAt) throw new DeliveryError('CANNOT_UNDO', 'this merge was undone already', ['undone']);
  const into = await deps.db.geoArea.findFirst({ where: { id: record.intoId, archivedAt: null }, select: PLACE_SELECT });
  if (!into) throw new DeliveryError('CANNOT_UNDO', 'the place it went into is no longer in the list', ['intoGone']);
  if (from.parentId && !(await deps.db.geoArea.findFirst({ where: { id: from.parentId, archivedAt: null }, select: { id: true } }))) throw new DeliveryError('CANNOT_UNDO', 'the place it sat in is no longer in the list', ['parentGone']);
  await sameNameUnder(deps, from.parentId, from.nameEn, from.id);
  const now = nowOf(deps);
  const children = (Array.isArray(record.children) ? record.children : []) as unknown as MovedChild[];
  const bands = record.bands as unknown as MergeBands;
  const out = await after(
    deps.db.$transaction(async (tx) => {
      // once: a second press (or two people at once) finds it undone
      const mark = await tx.geoMergeRecord.updateMany({ where: { id: record.id, undoneAt: null }, data: { undoneAt: now, undoneById: who.actor.staffUserId ?? null } });
      if (!mark.count) throw new DeliveryError('CANNOT_UNDO', 'this merge was undone already', ['undone']);
      // the place that stays: only the spellings and postcodes the merge gave it come off
      const keepAliases = into.aliases.filter((a) => !record.addedAliases.includes(a));
      const keepPostcodes = into.postcodes.filter((c) => !record.addedPostcodes.includes(c));
      const kept = await tx.geoArea.update({ where: { id: into.id }, data: { aliases: keepAliases, postcodes: keepPostcodes, ownerNamedAt: now }, select: PLACE_SELECT });
      // the places under it, each only while it still sits where the merge put it
      const now_ = await tx.geoArea.findMany({ where: { id: { in: children.map((c) => c.id) } }, select: { id: true, parentId: true, ancestorIds: true } });
      const current = new Map(now_.map((c) => [c.id, c]));
      let restoredChildren = 0;
      for (const c of children) {
        const at = current.get(c.id);
        if (!at || at.parentId !== c.toParentId || !sameList(at.ancestorIds, c.toAncestorIds)) continue;
        await tx.geoArea.update({ where: { id: c.id }, data: { parentId: c.parentId, ancestorIds: c.ancestorIds } });
        if (c.parentId === from.id) restoredChildren += 1;
      }
      // the saved addresses that moved, while they still point at the place that stays
      const back = record.addressIds.length ? await tx.customerAddress.updateMany({ where: { id: { in: record.addressIds }, areaId: into.id }, data: { areaId: from.id } }) : { count: 0 };
      // the owner's list: the merged place's row back; the stay-place's row as it was, unless he changed it since
      if (bands.fromRowId) {
        const fromRow = await tx.areaBand.findFirst({ where: { id: bands.fromRowId, storeId: who.storeId }, select: { id: true, bandId: true, archivedAt: true } });
        const intoRow = await tx.areaBand.findUnique({ where: { storeId_areaId: { storeId: who.storeId, areaId: into.id } }, select: { id: true, bandId: true, archivedAt: true } });
        if (fromRow?.archivedAt) await tx.areaBand.update({ where: { id: fromRow.id }, data: { archivedAt: null } });
        const untouched = intoRow && !intoRow.archivedAt && fromRow && intoRow.bandId === fromRow.bandId;
        if (untouched && bands.intoWas === 'none') await tx.areaBand.update({ where: { id: intoRow.id }, data: { archivedAt: now } });
        if (untouched && bands.intoWas === 'archived' && bands.intoBandId) await tx.areaBand.update({ where: { id: intoRow.id }, data: { bandId: bands.intoBandId, archivedAt: bands.intoArchivedAt ? new Date(bands.intoArchivedAt) : now } });
      }
      const back_ = await tx.geoArea.update({ where: { id: from.id }, data: { archivedAt: null, mergedIntoId: null }, select: PLACE_SELECT });
      await logChange(tx, who, PLACE_ACTIONS.unmerge, 'GeoArea', from.id, { ...pick(from), mergedIntoId: into.id }, { ...pick(back_), recordId: record.id, restoredChildren, restoredAddresses: back.count });
      await logChange(tx, who, PLACE_ACTIONS.unmergeFrom, 'GeoArea', into.id, pick(into), { ...pick(kept), unmergedId: from.id, recordId: record.id });
      return { restoredChildren, restoredAddresses: back.count };
    }),
  );
  return { place: await placeDetail(deps, who, from.id), into: await placeDetail(deps, who, into.id), ...out };
}

/** What an audit row keeps of a place (never more than the place itself). */
function pick(p: { nameEn: string; nameBn: string | null; aliases: string[]; level: string; parentId: string | null; code: string | null; archivedAt?: Date | null }) {
  return { code: p.code, level: p.level, parentId: p.parentId, nameEn: p.nameEn, nameBn: p.nameBn, aliases: p.aliases, archivedAt: p.archivedAt ?? null };
}

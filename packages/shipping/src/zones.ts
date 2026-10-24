// PR 554 (BACKEND-ARCHITECTURE §5.6 DLV-05, §7.4 `syncZones`) — the courier zone sync. Each courier's own place list
// (cities → zones → areas) is read through its adapter (`CourierApi.places`: Pathao's lists, the practice courier's
// practice list; Steadfast has none and reads the address itself) and paired with the shop's gazetteer in
// `CourierAreaMapping`, so a booking carries the courier's own ids and never fails on an area the courier does not know.
//
// - A run reads level by level within the owner's `callsPerRun`; the walk left is kept on the run (`cursor`), so a long
//   list is read over several runs. Every place seen is stamped with the run's start.
// - A failed read stops the run (FAILED, with the courier's words) and archives nothing: a courier that did not answer
//   never empties the shop's list.
// - Only a complete read archives the places the courier no longer lists (never deleted; they come back as the same row
//   when the courier lists them again), archives the pairs whose place was dropped (`courierDropped`, kept for the
//   record) and brings such a pair back when its place returns.
// - Names that match exactly are paired on their own (`autoMatch`, zone-match.ts) for shop areas without any pair yet;
//   a pair a person made or took away is never touched by a sync. Unclear names wait for a person with their candidates.
// - The courier's page lists what waits: areas parcels are held for, shop areas without a pair, the pairs, and the pairs
//   the courier dropped. A person pairs an area with any courier place, or takes a pair away (archived, never deleted).
//
// Reading a courier's list books nothing and moves no money.
import { z } from 'zod';
import { SYSTEM } from '@extas/auth';
import type { CourierPlaceLevel, Mode } from '@extas/adapters';
import { Prisma } from '@extas/db/client';
import { courierApi } from './accounts';
import { allow, logChange, nowOf, parse, setting, TX, type Db, type ShippingDeps, type Who } from './context';
import { ShippingError } from './errors';
import { idsOfPlace, keysOfArea, matchPlaces, placeKey, type CourierIds, type CourierPlaceRow, type GazetteerPlace, type PlaceLevel } from './zone-match';

/** A run still going (asked, or read part of the way). */
export const ZONE_SYNC_OPEN = ['QUEUED', 'RUNNING'] as const;

/** Why a pair was archived: the courier dropped its place, or a person took it away. */
export const PAIR_ARCHIVE_REASONS = ['courierDropped', 'staff'] as const;

const LEVEL_DB: Record<CourierPlaceLevel, PlaceLevel> = { city: 'CITY', zone: 'ZONE', area: 'AREA' };

interface Step {
  level: CourierPlaceLevel;
  parentId: string | null;
  /** The city the places of this step are in (a zone list: its parent; an area list: its zone's city). */
  cityId: string | null;
}

interface Cursor {
  queue: Step[];
  calls: number;
  /** Whether the areas level is read in this run (the owner's `areas`, fixed when the run starts). */
  areas: boolean;
}

export interface ZoneSyncStats {
  calls: number;
  seen: { city: number; zone: number; area: number };
  archivedPlaces: number;
  archivedPairs: number;
  restoredPairs: number;
  autoPaired: number;
  unclear: number;
}

export interface ZoneSyncView {
  id: string;
  courierAccountId: string;
  status: string;
  mode: Mode | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  /** Calls made so far and how many steps of the walk are left (a run read over several turns). */
  calls: number;
  left: number;
  stats: ZoneSyncStats | null;
  error: string | null;
}

const RUN_SELECT = { id: true, storeId: true, courierAccountId: true, status: true, mode: true, createdAt: true, startedAt: true, finishedAt: true, cursor: true, stats: true, error: true, requestedById: true } as const;
type RunRow = Prisma.CourierZoneSyncGetPayload<{ select: typeof RUN_SELECT }>;

const runView = (r: RunRow): ZoneSyncView => {
  const c = r.cursor as Cursor | null;
  return { id: r.id, courierAccountId: r.courierAccountId, status: r.status, mode: r.mode, createdAt: r.createdAt, startedAt: r.startedAt, finishedAt: r.finishedAt, calls: c?.calls ?? (r.stats as ZoneSyncStats | null)?.calls ?? 0, left: c?.queue.length ?? 0, stats: (r.stats as ZoneSyncStats | null) ?? null, error: r.error };
};

/** The courier account of this store (not archived) that the sync reads. */
async function accountOf(db: Db, storeId: number, id: string) {
  const a = await db.courierAccount.findFirst({ where: { id, storeId }, select: { id: true, providerKey: true, name: true, archivedAt: true } });
  if (!a || a.archivedAt) throw new ShippingError('NOT_FOUND', 'no such courier account', ['courierAccountId']);
  return a;
}

/** The run still going for this account, if any. */
const openRun = (db: Db, courierAccountId: string) => db.courierZoneSync.findFirst({ where: { courierAccountId, status: { in: [...ZONE_SYNC_OPEN] } }, select: RUN_SELECT, orderBy: { createdAt: 'asc' } });

/** Whether this courier publishes a place list at all (Steadfast does not: nothing to read). */
export async function hasZoneList(deps: Pick<ShippingDeps, 'connections'>, storeId: number, providerKey: string): Promise<boolean> {
  const { api } = await courierApi(deps, storeId, providerKey);
  return !!api.capabilities.zoneList && typeof api.places === 'function';
}

/**
 * Starts a run for one courier account ("Read the list now", or the worker when the owner's interval is up). A run
 * still going is returned instead of a second one. The person who asked is in the audit log.
 */
export async function startZoneSync(deps: ShippingDeps, who: Who, courierAccountId: string): Promise<ZoneSyncView> {
  const account = await accountOf(deps.db, who.storeId, courierAccountId);
  if (!(await hasZoneList(deps, who.storeId, account.providerKey))) throw new ShippingError('NO_ZONE_LIST', 'this courier publishes no place list', ['courierAccountId'], { providerKey: account.providerKey });
  return deps.db.$transaction(async (tx) => {
    // one run at a time per account (the account row's lock orders two presses)
    await tx.$queryRaw`SELECT id FROM "CourierAccount" WHERE id = ${courierAccountId}::uuid FOR UPDATE`;
    const open = await openRun(tx, courierAccountId);
    if (open) return runView(open);
    const r = await tx.courierZoneSync.create({ data: { storeId: who.storeId, courierAccountId, requestedById: who.actor.staffUserId }, select: RUN_SELECT });
    await logChange(tx, who, 'courier.zoneSync.start', 'CourierZoneSync', r.id, null, { courierAccountId, providerKey: account.providerKey });
    return runView(r);
  }, TX);
}

/** Staff: "Read the list now" (`delivery.couriers`). */
export async function requestZoneSync(deps: ShippingDeps, who: Who, courierAccountId: string): Promise<ZoneSyncView> {
  await allow(deps, who, 'delivery.couriers');
  return startZoneSync(deps, who, courierAccountId);
}

/**
 * Staff: "Read the list now". A courier on its practice world is read to the end at once (its list is on the server);
 * a real courier's run waits for the worker's next turn (`courier.zones`), which reads it within the owner's
 * `callsPerRun` and carries on turn after turn — a long list never holds a page open.
 */
export async function readListNow(deps: ShippingDeps, who: Who, courierAccountId: string): Promise<{ run: ZoneSyncView; now: boolean }> {
  const run = await requestZoneSync(deps, who, courierAccountId);
  const account = await accountOf(deps.db, who.storeId, courierAccountId);
  const { mode } = await courierApi(deps, who.storeId, account.providerKey);
  if (mode !== 'MOCK') return { run, now: false };
  let v = run;
  // the practice list is a few dozen calls; each turn reads the owner's `callsPerRun`
  for (let turn = 0; turn < 20 && (ZONE_SYNC_OPEN as readonly string[]).includes(v.status); turn++) v = await runZoneSync(deps, who.storeId, run.id);
  return { run: v, now: true };
}

/** Upserts the places of one answer, stamped with the run's start. */
async function storePlaces(tx: Db, run: RunRow, step: Step, rows: { id: string; name: string }[], seenAt: Date): Promise<void> {
  const level = LEVEL_DB[step.level];
  const cityId = step.level === 'city' ? null : step.cityId;
  const zoneId = step.level === 'area' ? step.parentId : null;
  for (const p of rows) {
    const data = { cityId, zoneId, name: p.name.slice(0, 200), nameKey: placeKey(p.name).slice(0, 200), lastSeenAt: seenAt, archivedAt: null };
    await tx.courierPlace.upsert({
      where: { courierAccountId_level_providerId: { courierAccountId: run.courierAccountId, level, providerId: p.id } },
      create: { storeId: run.storeId, courierAccountId: run.courierAccountId, level, providerId: p.id, ...data },
      update: data,
    });
  }
}

/**
 * Reads on with one run, up to `budget` courier calls (default: the owner's `callsPerRun`), and finishes it when the
 * walk is done. Safe to call again for the same run (the worker after a restart): it carries on from its cursor.
 */
export async function runZoneSync(deps: ShippingDeps, storeId: number, syncId: string, opts: { budget?: number } = {}): Promise<ZoneSyncView> {
  let run = await deps.db.courierZoneSync.findFirst({ where: { id: syncId, storeId }, select: RUN_SELECT });
  if (!run) throw new ShippingError('NOT_FOUND', 'no such zone sync run', ['syncId']);
  if (!(ZONE_SYNC_OPEN as readonly string[]).includes(run.status)) return runView(run);
  const [cfg, account] = await Promise.all([setting(deps, storeId, 'delivery.courier.zoneSync'), accountOf(deps.db, storeId, run.courierAccountId)]);
  const { api, mode } = await courierApi(deps, storeId, account.providerKey);
  const now = nowOf(deps);
  if (!api.places || !api.capabilities.zoneList) {
    const r = await deps.db.courierZoneSync.update({ where: { id: run.id }, data: { status: 'FAILED', finishedAt: now, error: 'this courier publishes no place list' }, select: RUN_SELECT });
    return runView(r);
  }
  if (run.status === 'QUEUED') {
    const cursor: Cursor = { queue: [{ level: 'city', parentId: null, cityId: null }], calls: 0, areas: cfg.areas };
    run = await deps.db.courierZoneSync.update({ where: { id: run.id }, data: { status: 'RUNNING', startedAt: now, mode, cursor: cursor as unknown as Prisma.InputJsonValue }, select: RUN_SELECT });
  }
  const seenAt = run.startedAt!;
  const cursor = structuredClone(run.cursor as unknown as Cursor);
  const budget = Math.max(1, opts.budget ?? cfg.callsPerRun);
  const seen = { city: 0, zone: 0, area: 0, ...((run.stats as { seen?: ZoneSyncStats['seen'] } | null)?.seen ?? {}) };
  let used = 0;
  while (cursor.queue.length && used < budget) {
    const step = cursor.queue[0]!;
    let rows: { id: string; name: string }[];
    try {
      rows = await api.places(step.level, step.parentId);
    } catch (e) {
      // a courier that did not answer: the run stops where it is, and nothing is archived
      const error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      const r = await deps.db.courierZoneSync.update({ where: { id: run.id }, data: { status: 'FAILED', finishedAt: nowOf(deps), error, cursor: cursor as unknown as Prisma.InputJsonValue, stats: { calls: cursor.calls, seen } as unknown as Prisma.InputJsonValue }, select: RUN_SELECT });
      return runView(r);
    }
    used += 1;
    cursor.calls += 1;
    cursor.queue.shift();
    const unique = [...new Map(rows.filter((p) => p.id && p.name.trim()).map((p) => [p.id, p])).values()];
    await deps.db.$transaction((tx) => storePlaces(tx, run!, step, unique, seenAt), TX);
    seen[step.level] += unique.length;
    if (step.level === 'city') for (const c of unique) cursor.queue.push({ level: 'zone', parentId: c.id, cityId: c.id });
    if (step.level === 'zone' && cursor.areas) for (const z of unique) cursor.queue.push({ level: 'area', parentId: z.id, cityId: step.cityId });
  }
  if (cursor.queue.length) {
    const r = await deps.db.courierZoneSync.update({ where: { id: run.id }, data: { cursor: cursor as unknown as Prisma.InputJsonValue, stats: { calls: cursor.calls, seen } as unknown as Prisma.InputJsonValue }, select: RUN_SELECT });
    return runView(r);
  }
  return finish(deps, run, cursor, seen, cfg.autoMatch);
}

/** The whole walk was read: archive what the courier dropped, bring back what returned, pair the exact names. */
async function finish(deps: ShippingDeps, run: RunRow, cursor: Cursor, seen: ZoneSyncStats['seen'], autoMatch: boolean): Promise<ZoneSyncView> {
  const now = nowOf(deps);
  const seenAt = run.startedAt!;
  const levels: PlaceLevel[] = cursor.areas ? ['CITY', 'ZONE', 'AREA'] : ['CITY', 'ZONE'];
  const who: Who = { actor: run.requestedById ? { staffUserId: run.requestedById } : SYSTEM, storeId: run.storeId };
  const gazetteer = autoMatch ? await deps.db.geoArea.findMany({ where: { archivedAt: null, level: { not: 'DIVISION' } }, select: { id: true, level: true, ancestorIds: true, nameEn: true, nameBn: true, aliases: true } }) : [];
  return deps.db.$transaction(async (tx) => {
    const dropped = await tx.courierPlace.updateMany({ where: { courierAccountId: run.courierAccountId, level: { in: levels }, archivedAt: null, lastSeenAt: { lt: seenAt } }, data: { archivedAt: now } });
    const places = await tx.courierPlace.findMany({ where: { courierAccountId: run.courierAccountId, archivedAt: null }, select: { level: true, providerId: true, cityId: true, zoneId: true, nameKey: true } });
    const live = { CITY: new Set<string>(), ZONE: new Set<string>(), AREA: new Set<string>() };
    for (const p of places) live[p.level].add(p.providerId);
    // the deepest id of a pair that this run could check (the areas only when they were read)
    const stillListed = (m: { courierCityId: string | null; courierZoneId: string | null; courierAreaId: string | null }): boolean => {
      if (m.courierAreaId && cursor.areas) return live.AREA.has(m.courierAreaId);
      if (m.courierZoneId) return live.ZONE.has(m.courierZoneId);
      if (m.courierCityId) return live.CITY.has(m.courierCityId);
      return false;
    };
    const pairs = await tx.courierAreaMapping.findMany({ where: { courierAccountId: run.courierAccountId }, select: { id: true, areaId: true, courierCityId: true, courierZoneId: true, courierAreaId: true, archivedAt: true, archivedReason: true } });
    const archive = pairs.filter((m) => !m.archivedAt && !stillListed(m)).map((m) => m.id);
    const restore = pairs.filter((m) => m.archivedAt && m.archivedReason === 'courierDropped' && stillListed(m)).map((m) => m.id);
    if (archive.length) await tx.courierAreaMapping.updateMany({ where: { id: { in: archive } }, data: { archivedAt: now, archivedReason: 'courierDropped' } });
    if (restore.length) await tx.courierAreaMapping.updateMany({ where: { id: { in: restore } }, data: { archivedAt: null, archivedReason: null, syncedAt: now } });
    let autoPaired = 0;
    let unclear = 0;
    if (autoMatch) {
      const result = matchPlaces(gazetteer as GazetteerPlace[], places as CourierPlaceRow[]);
      const taken = new Set(pairs.map((m) => m.areaId));
      const fresh = result.matches.filter((m) => !taken.has(m.shopAreaId));
      if (fresh.length) {
        const r = await tx.courierAreaMapping.createMany({
          data: fresh.map((m) => ({ storeId: run.storeId, courierAccountId: run.courierAccountId, areaId: m.shopAreaId, courierCityId: m.cityId, courierZoneId: m.zoneId, courierAreaId: m.areaId, source: 'auto', matchedBy: m.matchedBy, syncedAt: now })),
          skipDuplicates: true,
        });
        autoPaired = r.count;
      }
      unclear = result.unclear.filter((u) => !taken.has(u.shopAreaId)).length;
    }
    const stats: ZoneSyncStats = { calls: cursor.calls, seen, archivedPlaces: dropped.count, archivedPairs: archive.length, restoredPairs: restore.length, autoPaired, unclear };
    const r = await tx.courierZoneSync.update({ where: { id: run.id }, data: { status: 'SUCCEEDED', finishedAt: now, cursor: Prisma.DbNull, stats: stats as unknown as Prisma.InputJsonValue, error: null }, select: RUN_SELECT });
    await logChange(tx, who, 'courier.zoneSync.finish', 'CourierZoneSync', run.id, null, stats);
    return runView(r);
  }, TX);
}

/**
 * The worker's turn for one store (`courier.zones`): every run still going reads on; every account whose courier has a
 * list and whose last complete read is older than the owner's `everyDays` gets a new run. A courier without a list,
 * or switched off, is left alone.
 */
export async function zoneSyncTurn(deps: ShippingDeps, storeId: number): Promise<{ started: number; ran: number; finished: number; failed: number }> {
  const cfg = await setting(deps, storeId, 'delivery.courier.zoneSync');
  const out = { started: 0, ran: 0, finished: 0, failed: 0 };
  const accounts = await deps.db.courierAccount.findMany({ where: { storeId, enabled: true, archivedAt: null }, select: { id: true, providerKey: true }, orderBy: { createdAt: 'asc' } });
  const due = new Date(nowOf(deps).getTime() - cfg.everyDays * 86_400_000);
  for (const a of accounts) {
    if (!(await hasZoneList(deps, storeId, a.providerKey))) continue;
    let run = await openRun(deps.db, a.id);
    if (!run) {
      if (!cfg.enabled) continue;
      const last = await deps.db.courierZoneSync.findFirst({ where: { courierAccountId: a.id, status: 'SUCCEEDED' }, select: { finishedAt: true }, orderBy: { finishedAt: 'desc' } });
      if (last?.finishedAt && last.finishedAt > due) continue;
      const v = await startZoneSync(deps, { actor: SYSTEM, storeId }, a.id);
      out.started += 1;
      run = await deps.db.courierZoneSync.findUniqueOrThrow({ where: { id: v.id }, select: RUN_SELECT });
    }
    const v = await runZoneSync(deps, storeId, run.id);
    out.ran += 1;
    if (v.status === 'SUCCEEDED') out.finished += 1;
    if (v.status === 'FAILED') out.failed += 1;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// The courier's page: what waits, the pairs, and pairing by hand.

export const ZONE_TABS = ['needed', 'unmapped', 'mapped', 'dropped'] as const;
export type ZoneTab = (typeof ZONE_TABS)[number];

export const zonesQuery = z
  .object({
    tab: z.enum(ZONE_TABS).default('needed'),
    q: z.string().trim().max(80).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();

export interface CourierPlaceView {
  id: string;
  level: PlaceLevel;
  providerId: string;
  name: string;
  /** The city (and zone) it is in, by name. */
  path: string[];
  archived: boolean;
}

export interface ShopAreaView {
  id: string;
  level: string;
  name: string;
  nameBn: string | null;
  /** The district (and upazila) above it, by name. */
  path: string[];
}

export interface ZoneRow {
  area: ShopAreaView;
  /** The courier place it is paired with (mapped, dropped). */
  place: CourierPlaceView | null;
  source: string | null;
  archivedAt: Date | null;
  /** Orders held for this area (needed). */
  held: number;
  /** Courier places with the same name in the paired city (unmapped, needed). */
  candidates: CourierPlaceView[];
}

export interface CourierZonesView {
  courier: { id: string; name: string; providerKey: string; hasList: boolean };
  counts: { places: { city: number; zone: number; area: number }; archivedPlaces: number; mapped: number; dropped: number; needed: number; unmapped: number };
  lastRun: ZoneSyncView | null;
  openRun: ZoneSyncView | null;
  tab: ZoneTab;
  rows: ZoneRow[];
  total: number;
  page: number;
  pages: number;
}

/** The shop areas parcels are held for with this courier (the booking's `shipment.areaHeld`), still without a pair. */
async function heldAreas(db: Db, storeId: number, courierAccountId: string, mapped: Set<string>): Promise<Map<string, number>> {
  const events = await db.orderEvent.findMany({ where: { storeId, type: 'shipment.areaHeld', data: { path: ['courierAccountId'], equals: courierAccountId } }, select: { orderId: true, data: true } });
  const orders = new Map<string, string>();
  for (const e of events) {
    const areaId = (e.data as { areaId?: string | null } | null)?.areaId;
    if (areaId) orders.set(e.orderId, areaId);
  }
  // an order booked since, or cancelled, no longer waits
  const still = await db.order.findMany({ where: { id: { in: [...orders.keys()] }, storeId, archivedAt: null, status: { in: ['CONFIRMED', 'PROCESSING', 'PACKED'] }, shipments: { none: { status: { notIn: ['BOOKING_FAILED', 'CANCELLED'] } } } }, select: { id: true } });
  const out = new Map<string, number>();
  for (const o of still) {
    const a = orders.get(o.id)!;
    if (!mapped.has(a)) out.set(a, (out.get(a) ?? 0) + 1);
  }
  return out;
}

/** Names of gazetteer rows by id (for the paths). */
async function areaNames(db: Db, ids: readonly string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = await db.geoArea.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, nameEn: true } });
  return new Map(rows.map((r) => [r.id, r.nameEn]));
}

type AreaRow = { id: string; level: string; nameEn: string; nameBn: string | null; ancestorIds: string[]; aliases: string[] };
const AREA_SELECT = { id: true, level: true, nameEn: true, nameBn: true, ancestorIds: true, aliases: true } as const;

async function shopAreaViews(db: Db, rows: readonly AreaRow[]): Promise<ShopAreaView[]> {
  const names = await areaNames(
    db,
    rows.flatMap((r) => r.ancestorIds.slice(1)),
  );
  return rows.map((r) => ({ id: r.id, level: r.level, name: r.nameEn, nameBn: r.nameBn, path: r.ancestorIds.slice(1).map((a) => names.get(a) ?? '') }));
}

/** Every place of the account, by level and id, for names and candidates. */
async function placesOfAccount(db: Db, courierAccountId: string) {
  const rows = await db.courierPlace.findMany({ where: { courierAccountId }, select: { id: true, level: true, providerId: true, cityId: true, zoneId: true, name: true, nameKey: true, archivedAt: true } });
  const by = { CITY: new Map<string, (typeof rows)[number]>(), ZONE: new Map<string, (typeof rows)[number]>(), AREA: new Map<string, (typeof rows)[number]>() };
  for (const r of rows) by[r.level].set(r.providerId, r);
  const view = (r: (typeof rows)[number]): CourierPlaceView => ({
    id: r.id,
    level: r.level,
    providerId: r.providerId,
    name: r.name,
    path: [...(r.cityId ? [by.CITY.get(r.cityId)?.name ?? r.cityId] : []), ...(r.level === 'AREA' && r.zoneId ? [by.ZONE.get(r.zoneId)?.name ?? r.zoneId] : [])],
    archived: r.archivedAt !== null,
  });
  /** The place a pair stands for (its deepest id). */
  const ofPair = (m: { courierCityId: string | null; courierZoneId: string | null; courierAreaId: string | null }) => {
    const r = (m.courierAreaId && by.AREA.get(m.courierAreaId)) || (m.courierZoneId && by.ZONE.get(m.courierZoneId)) || (m.courierCityId && by.CITY.get(m.courierCityId)) || null;
    return r ? view(r) : null;
  };
  return { rows, by, view, ofPair };
}

/** The courier's page (DLV-05 detail): counts, the last run, and one tab of rows. */
export async function courierZones(deps: ShippingDeps, who: Who, courierAccountId: string, query: unknown = {}): Promise<CourierZonesView> {
  await allow(deps, who, 'delivery.read');
  const q = parse(zonesQuery, query, 'zone list query');
  const account = await accountOf(deps.db, who.storeId, courierAccountId);
  const db = deps.db;
  const [hasList, pairs, lastRun, open, placeCounts, archivedPlaces] = await Promise.all([
    hasZoneList(deps, who.storeId, account.providerKey),
    db.courierAreaMapping.findMany({ where: { courierAccountId }, select: { id: true, areaId: true, courierCityId: true, courierZoneId: true, courierAreaId: true, source: true, archivedAt: true, archivedReason: true, updatedAt: true } }),
    db.courierZoneSync.findFirst({ where: { courierAccountId, status: { notIn: [...ZONE_SYNC_OPEN] } }, select: RUN_SELECT, orderBy: { createdAt: 'desc' } }),
    openRun(db, courierAccountId),
    db.courierPlace.groupBy({ by: ['level'], where: { courierAccountId, archivedAt: null }, _count: { _all: true } }),
    db.courierPlace.count({ where: { courierAccountId, archivedAt: { not: null } } }),
  ]);
  const active = pairs.filter((p) => !p.archivedAt);
  const mappedIds = new Set(active.map((p) => p.areaId));
  const dropped = pairs.filter((p) => p.archivedAt && p.archivedReason === 'courierDropped');
  const held = await heldAreas(db, who.storeId, courierAccountId, mappedIds);
  const unmappedWhere: Prisma.GeoAreaWhereInput = {
    archivedAt: null,
    level: { not: 'DIVISION' },
    id: { notIn: [...mappedIds] },
    ...(q.q ? { OR: [{ nameEn: { contains: q.q, mode: 'insensitive' } }, { nameBn: { contains: q.q } }, { aliases: { has: q.q.toLowerCase() } }] } : {}),
  };
  const unmappedCount = await db.geoArea.count({ where: unmappedWhere });
  const counts = { places: { city: 0, zone: 0, area: 0 }, archivedPlaces, mapped: active.length, dropped: dropped.length, needed: held.size, unmapped: unmappedCount };
  for (const c of placeCounts) counts.places[c.level.toLowerCase() as 'city'] = c._count._all;
  const places = await placesOfAccount(db, courierAccountId);

  // candidates: the courier places with one of the area's names, inside the city its district is paired with
  const districtCity = new Map(active.filter((p) => p.courierCityId).map((p) => [p.areaId, p.courierCityId!]));
  const candidatesOf = (a: AreaRow): CourierPlaceView[] => {
    const keys = new Set(keysOfArea(a));
    const city = a.ancestorIds.map((x) => districtCity.get(x)).find(Boolean);
    return places.rows.filter((p) => !p.archivedAt && keys.has(p.nameKey) && (a.level === 'DISTRICT' ? p.level === 'CITY' : !city || p.cityId === city)).slice(0, 8).map(places.view);
  };

  let rows: ZoneRow[] = [];
  let total = 0;
  const skip = (q.page - 1) * q.limit;
  if (q.tab === 'needed' || q.tab === 'unmapped') {
    let areas: AreaRow[];
    if (q.tab === 'needed') {
      const ids = [...held.keys()];
      total = ids.length;
      areas = (await db.geoArea.findMany({ where: { id: { in: ids } }, select: AREA_SELECT })).sort((a, b) => (held.get(b.id) ?? 0) - (held.get(a.id) ?? 0) || a.nameEn.localeCompare(b.nameEn)).slice(skip, skip + q.limit);
    } else {
      total = unmappedCount;
      areas = await db.geoArea.findMany({ where: unmappedWhere, select: AREA_SELECT, orderBy: [{ level: 'asc' }, { nameEn: 'asc' }, { id: 'asc' }], skip, take: q.limit });
    }
    const views = await shopAreaViews(db, areas);
    rows = areas.map((a, i) => ({ area: views[i]!, place: null, source: null, archivedAt: null, held: held.get(a.id) ?? 0, candidates: candidatesOf(a) }));
  } else {
    const list = (q.tab === 'mapped' ? active : dropped).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const areasById = new Map((await db.geoArea.findMany({ where: { id: { in: list.map((p) => p.areaId) } }, select: AREA_SELECT })).map((a) => [a.id, a]));
    const filtered = q.q ? list.filter((p) => areasById.get(p.areaId)?.nameEn.toLowerCase().includes(q.q!.toLowerCase())) : list;
    total = filtered.length;
    const page = filtered.slice(skip, skip + q.limit);
    const views = await shopAreaViews(db, page.map((p) => areasById.get(p.areaId)!).filter(Boolean));
    const viewById = new Map(views.map((v) => [v.id, v]));
    rows = page.filter((p) => viewById.has(p.areaId)).map((p) => ({ area: viewById.get(p.areaId)!, place: places.ofPair(p), source: p.source, archivedAt: p.archivedAt, held: 0, candidates: [] }));
  }
  return {
    courier: { id: account.id, name: account.name, providerKey: account.providerKey, hasList },
    counts,
    lastRun: lastRun ? runView(lastRun) : null,
    openRun: open ? runView(open) : null,
    tab: q.tab,
    rows,
    total,
    page: q.page,
    pages: Math.max(1, Math.ceil(total / q.limit)),
  };
}

export const placeSearchQuery = z
  .object({
    q: z.string().trim().min(1).max(80),
    level: z.enum(['CITY', 'ZONE', 'AREA']).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

/** The courier's places by name (the "Pick a courier place" box). Archived places are not offered. */
export async function searchCourierPlaces(deps: ShippingDeps, who: Who, courierAccountId: string, query: unknown): Promise<CourierPlaceView[]> {
  await allow(deps, who, 'delivery.read');
  const q = parse(placeSearchQuery, query, 'place search');
  await accountOf(deps.db, who.storeId, courierAccountId);
  const key = placeKey(q.q);
  const rows = await deps.db.courierPlace.findMany({
    where: { courierAccountId, archivedAt: null, ...(q.level ? { level: q.level } : {}), OR: [{ name: { contains: q.q, mode: 'insensitive' } }, ...(key ? [{ nameKey: { startsWith: key } }] : [])] },
    select: { id: true },
    orderBy: [{ level: 'asc' }, { name: 'asc' }],
    take: q.limit,
  });
  const places = await placesOfAccount(deps.db, courierAccountId);
  const ids = new Set(rows.map((r) => r.id));
  return places.rows.filter((p) => ids.has(p.id)).sort((a, b) => a.level.localeCompare(b.level) || a.name.localeCompare(b.name)).map(places.view);
}

export const mapAreaInput = z.object({ areaId: z.uuid(), placeId: z.uuid() }).strict();

/** A person pairs a shop area with a courier place (`delivery.couriers`). A sync never changes it afterwards. */
export async function mapArea(deps: ShippingDeps, who: Who, courierAccountId: string, input: unknown): Promise<{ areaId: string; ids: CourierIds }> {
  await allow(deps, who, 'delivery.couriers');
  const v = parse(mapAreaInput, input, 'pair');
  await accountOf(deps.db, who.storeId, courierAccountId);
  const [area, place] = await Promise.all([
    deps.db.geoArea.findFirst({ where: { id: v.areaId, archivedAt: null }, select: { id: true } }),
    deps.db.courierPlace.findFirst({ where: { id: v.placeId, courierAccountId, archivedAt: null }, select: { level: true, providerId: true, cityId: true, zoneId: true } }),
  ]);
  if (!area) throw new ShippingError('NOT_FOUND', 'no such area', ['areaId']);
  if (!place) throw new ShippingError('NOT_FOUND', 'no such courier place (or the courier dropped it)', ['placeId']);
  const ids = idsOfPlace(place);
  const now = nowOf(deps);
  await deps.db.$transaction(async (tx) => {
    const before = await tx.courierAreaMapping.findUnique({ where: { courierAccountId_areaId: { courierAccountId, areaId: v.areaId } }, select: { courierCityId: true, courierZoneId: true, courierAreaId: true, source: true, archivedAt: true } });
    const data = { courierCityId: ids.cityId, courierZoneId: ids.zoneId, courierAreaId: ids.areaId, source: 'staff', matchedBy: 'staff', mappedById: who.actor.staffUserId, archivedAt: null, archivedReason: null, syncedAt: now };
    await tx.courierAreaMapping.upsert({ where: { courierAccountId_areaId: { courierAccountId, areaId: v.areaId } }, create: { storeId: who.storeId, courierAccountId, areaId: v.areaId, ...data }, update: data });
    await logChange(tx, who, 'courier.area.map', 'CourierAreaMapping', `${courierAccountId}:${v.areaId}`, before, { ...ids, source: 'staff' });
  }, TX);
  return { areaId: v.areaId, ids };
}

/** A person takes a pair away: archived with the reason, never deleted; a sync will not pair it again on its own. */
export async function unmapArea(deps: ShippingDeps, who: Who, courierAccountId: string, areaId: string): Promise<void> {
  await allow(deps, who, 'delivery.couriers');
  await accountOf(deps.db, who.storeId, courierAccountId);
  await deps.db.$transaction(async (tx) => {
    const before = await tx.courierAreaMapping.findFirst({ where: { courierAccountId, areaId, storeId: who.storeId }, select: { id: true, courierCityId: true, courierZoneId: true, courierAreaId: true, source: true, archivedAt: true } });
    if (!before || before.archivedAt) throw new ShippingError('NOT_FOUND', 'this area has no pair with this courier', ['areaId']);
    await tx.courierAreaMapping.update({ where: { id: before.id }, data: { archivedAt: nowOf(deps), archivedReason: 'staff', mappedById: who.actor.staffUserId } });
    await logChange(tx, who, 'courier.area.unmap', 'CourierAreaMapping', `${courierAccountId}:${areaId}`, before, { archived: true });
  }, TX);
}

/**
 * The pair a booking uses for a shop area: the area's own, else the nearest one above it (thana → upazila → district),
 * active pairs only; with `need`, only a pair that carries ids that deep. Null: no usable pair.
 */
export async function pairFor(db: Db, courierAccountId: string, areaId: string, need: 'city' | 'zone' | 'area' | null): Promise<{ courierCityId: string | null; courierZoneId: string | null; courierAreaId: string | null; areaId: string } | null> {
  const area = await db.geoArea.findUnique({ where: { id: areaId }, select: { ancestorIds: true } });
  const chain = [areaId, ...[...(area?.ancestorIds ?? [])].reverse()];
  const pairs = await db.courierAreaMapping.findMany({ where: { courierAccountId, areaId: { in: chain }, archivedAt: null }, select: { areaId: true, courierCityId: true, courierZoneId: true, courierAreaId: true } });
  const byArea = new Map(pairs.map((p) => [p.areaId, p]));
  for (const id of chain) {
    const p = byArea.get(id);
    if (!p) continue;
    if (!need) return p;
    if (need === 'area' ? p.courierAreaId : need === 'zone' ? p.courierZoneId : p.courierCityId) return p;
  }
  return null;
}

export interface CourierZoneSummary {
  courierAccountId: string;
  hasList: boolean;
  places: number;
  mapped: number;
  dropped: number;
  lastRun: ZoneSyncView | null;
  openRun: ZoneSyncView | null;
}

/** The Couriers list's zone column: per account, whether it has a list, how much is read and paired, the last run. */
export async function zoneSummaries(deps: ShippingDeps, who: Who): Promise<CourierZoneSummary[]> {
  await allow(deps, who, 'delivery.read');
  const accounts = await deps.db.courierAccount.findMany({ where: { storeId: who.storeId, archivedAt: null }, select: { id: true, providerKey: true }, orderBy: { createdAt: 'asc' } });
  return Promise.all(
    accounts.map(async (a) => {
      const [hasList, places, mapped, dropped, last, open] = await Promise.all([
        hasZoneList(deps, who.storeId, a.providerKey),
        deps.db.courierPlace.count({ where: { courierAccountId: a.id, archivedAt: null } }),
        deps.db.courierAreaMapping.count({ where: { courierAccountId: a.id, archivedAt: null } }),
        deps.db.courierAreaMapping.count({ where: { courierAccountId: a.id, archivedReason: 'courierDropped', archivedAt: { not: null } } }),
        deps.db.courierZoneSync.findFirst({ where: { courierAccountId: a.id, status: { notIn: [...ZONE_SYNC_OPEN] } }, select: RUN_SELECT, orderBy: { createdAt: 'desc' } }),
        openRun(deps.db, a.id),
      ]);
      return { courierAccountId: a.id, hasList, places, mapped, dropped, lastRun: last ? runView(last) : null, openRun: open ? runView(open) : null };
    }),
  );
}

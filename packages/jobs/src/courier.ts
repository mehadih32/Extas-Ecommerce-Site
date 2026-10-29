// S08 · PR 176 — reading the parcels the couriers hold (packages/shipping tracking.ts `trackParcels`; the job itself is in
// catalogue.ts with the others). Every store with tracking on gets one `courier.track` per slot of its
// `delivery.courier.tracking.everyMinutes`; the slot is the run key, so a slot planned on many ticks is one run, and a
// parcel read twice stores nothing twice (its events are unique per parcel). Each courier answers through its own
// connection (main.ts: the courier adapters, each its practice world until the owner's keys pass the Test).
// PR 554: `courier.zones` — the courier zone sync's turn per store (packages/shipping zones.ts `zoneSyncTurn`): runs still
// going read on within the owner's `callsPerRun`, and a courier whose list is older than `everyDays` is read again. It is
// planned once per hour slot for a store with the sync on, or with a run still going (a "Read the list now" of a real
// courier); the turn itself decides what is due, so an hour planned twice is one run.
// PR 182: `packing.photos.expire` — the daily sweep of a store's packing photos past the owner's days to keep
// (packages/shipping packing.ts `expirePackingPhotos`: archived, never deleted). Planned once per day slot for a store
// that has a photo past its day; it needs no courier connection.
// This module imports `./keys`, never `./scheduler` (the scheduler imports the catalogue, which imports this).
import type { ShippingDeps } from '@extas/shipping';
import type { JobDeps } from './context';
import { runKey, slotOf } from './keys';
import type { Planner } from './worker';

export const COURIER_TRACK_JOB = 'courier.track';
export const COURIER_QUEUE = 'courier';
export const COURIER_ZONES_JOB = 'courier.zones';
/** PR 182: the daily sweep of packing photos past their days to keep. */
export const PACKING_PHOTOS_JOB = 'packing.photos.expire';
/** How often a store's zone sync turn is looked at (the owner's `everyDays` decides when a list is read again). */
export const ZONE_TURN_MINUTES = 60;

const MINUTE = 60_000;

/** The shipping service's dependencies from the worker's (the courier connections come from main.ts). */
export function courierDeps(deps: JobDeps): ShippingDeps | null {
  if (!deps.couriers) return null;
  return { db: deps.db, settings: deps.settings, connections: deps.couriers.connections, now: deps.now };
}

/** Each live store with tracking on: one read per slot of its interval. */
export const courierPlanner: Planner = async (deps, now) => {
  if (!deps.couriers) return [];
  const stores = await deps.db.store.findMany({ where: { status: { not: 'ARCHIVED' }, archivedAt: null }, select: { id: true }, orderBy: { id: 'asc' } });
  const out: Awaited<ReturnType<Planner>> = [];
  for (const s of stores) {
    const cfg = await deps.settings.value('delivery.courier.tracking', { storeId: s.id });
    if (!cfg.enabled) continue;
    const payload = { storeId: s.id };
    out.push({ queue: COURIER_QUEUE, name: COURIER_TRACK_JOB, payload, key: runKey(COURIER_TRACK_JOB, payload, slotOf(now.getTime(), cfg.everyMinutes * MINUTE)) });
  }
  return out;
};

/** PR 554: each live store with the zone sync on, or a run still going: one turn per hour slot. */
export const courierZonesPlanner: Planner = async (deps, now) => {
  if (!deps.couriers) return [];
  const stores = await deps.db.store.findMany({ where: { status: { not: 'ARCHIVED' }, archivedAt: null }, select: { id: true }, orderBy: { id: 'asc' } });
  const out: Awaited<ReturnType<Planner>> = [];
  for (const s of stores) {
    const cfg = await deps.settings.value('delivery.courier.zoneSync', { storeId: s.id });
    if (!cfg.enabled && !(await deps.db.courierZoneSync.count({ where: { storeId: s.id, status: { in: ['QUEUED', 'RUNNING'] } } }))) continue;
    const payload = { storeId: s.id };
    out.push({ queue: COURIER_QUEUE, name: COURIER_ZONES_JOB, payload, key: runKey(COURIER_ZONES_JOB, payload, slotOf(now.getTime(), ZONE_TURN_MINUTES * MINUTE)) });
  }
  return out;
};

/** PR 182: each live store with a packing photo past its day to keep: one sweep per day slot. */
export const packingPhotosPlanner: Planner = async (deps, now) => {
  const stores = await deps.db.store.findMany({ where: { status: { not: 'ARCHIVED' }, archivedAt: null }, select: { id: true }, orderBy: { id: 'asc' } });
  const out: Awaited<ReturnType<Planner>> = [];
  for (const s of stores) {
    if (!(await deps.db.packingPhoto.count({ where: { storeId: s.id, archivedAt: null, keepUntil: { lt: now } } }))) continue;
    const payload = { storeId: s.id };
    out.push({ queue: COURIER_QUEUE, name: PACKING_PHOTOS_JOB, payload, key: runKey(PACKING_PHOTOS_JOB, payload, slotOf(now.getTime(), 24 * 60 * MINUTE)) });
  }
  return out;
};

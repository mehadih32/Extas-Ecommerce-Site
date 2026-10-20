// What every delivery service gets: the database, the settings (the two-tier resolver, PR 492) and, for the admin
// services, who acts in which store. Like the catalogue, the admin services check the permission themselves (B6.5),
// scope every store row by `storeId` (A4.1) and write the audit log in the same transaction as the change. The
// storefront services (resolver, autocomplete, phone-first) need no person: they read only.
import type { Prisma, PrismaClient } from '@extas/db/client';
import { audit, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import type { Key, Value } from '@extas/settings';
import { BandMap, type BandConfig, type BandRow } from './bands';
import { DeliveryError } from './errors';
import type { Gazetteer } from './gazetteer';
import { loadGazetteer } from './load';

export type Db = PrismaClient | Prisma.TransactionClient;

/** Reads effective settings for a store (the app passes its SettingsResolver). */
export interface SettingsReader {
  value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>>;
}

export interface DeliveryDeps {
  db: PrismaClient;
  settings: SettingsReader;
  /** Clock, for tests. */
  now?: () => Date;
  /** The gazetteer to use instead of the shared one read from the database (tests). */
  gazetteer?: Gazetteer;
}

export interface Who {
  actor: Actor;
  storeId: number;
  ctx?: RequestContext;
}

export type DeliveryPermission = 'delivery.read' | 'delivery.charges' | 'delivery.areas';

export const nowOf = (deps: DeliveryDeps) => deps.now?.() ?? new Date();

/** Checks the permission in that store and that the store exists and is not archived. */
export async function allow(deps: DeliveryDeps, who: Who, permission: DeliveryPermission): Promise<void> {
  await assertStore(deps, who.storeId);
  await requirePermission(deps.db, who.actor, permission, { storeId: who.storeId });
}

export async function assertStore(deps: DeliveryDeps, storeId: number): Promise<void> {
  if (!Number.isInteger(storeId) || storeId < 1) throw new DeliveryError('INVALID_INPUT', 'store id must be a positive integer', ['storeId']);
  const store = await deps.db.store.findUnique({ where: { id: storeId }, select: { archivedAt: true } });
  if (!store || store.archivedAt) throw new DeliveryError('NOT_FOUND', 'no such store', ['storeId']);
}

/** An audit row for a delivery change (same transaction as the change). */
export function logChange(db: Db, who: Who, action: string, entityType: string, entityId: string, before: unknown, after: unknown): Promise<void> {
  return audit(db, who.actor, { action, entityType, entityId, before, after, storeId: who.storeId }, { source: 'admin-api', ...who.ctx });
}

/** The shared gazetteer (or the one the deps carry). */
export async function gazetteerOf(deps: DeliveryDeps): Promise<Gazetteer> {
  if (deps.gazetteer) return deps.gazetteer;
  return loadGazetteer(deps.db, { cacheSeconds: await deps.settings.value('delivery.gazetteer.cacheSeconds') });
}

/** Which band rows play which part, for a store (settings delivery.bands.*). */
export async function bandConfig(deps: DeliveryDeps, storeId: number): Promise<BandConfig> {
  const [cityKey, subAreaKey, outsideKey, cityCorporations] = await Promise.all([
    deps.settings.value('delivery.bands.cityKey', { storeId }),
    deps.settings.value('delivery.bands.subAreaKey', { storeId }),
    deps.settings.value('delivery.bands.outsideKey', { storeId }),
    deps.settings.value('delivery.bands.cityCorporations', { storeId }),
  ]);
  return { cityKey, subAreaKey, outsideKey, cityCorporations };
}

export const BAND_SELECT = {
  id: true,
  key: true,
  nameEn: true,
  nameBn: true,
  chargeMinor: true,
  codLimitMinor: true,
  hoursMin: true,
  hoursMax: true,
  mode: true,
  enabled: true,
  sortOrder: true,
} as const;

/** The store's bands (not archived) and its list, over the gazetteer. Read fresh: the owner's edits show at once. */
export async function loadBandMap(deps: DeliveryDeps, storeId: number): Promise<BandMap> {
  const [gazetteer, config, bands, list] = await Promise.all([
    gazetteerOf(deps),
    bandConfig(deps, storeId),
    deps.db.deliveryBand.findMany({ where: { storeId, archivedAt: null }, select: BAND_SELECT, orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }] }),
    deps.db.areaBand.findMany({ where: { storeId, archivedAt: null, band: { archivedAt: null } }, select: { areaId: true, bandId: true } }),
  ]);
  return new BandMap(gazetteer, bands as BandRow[], list, config);
}

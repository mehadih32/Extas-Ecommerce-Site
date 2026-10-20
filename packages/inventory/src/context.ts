// What every inventory service gets: the database, the settings (through the two-tier resolver, PR 492), the
// connection layer (PR 18) that hands out the store's ERP adapter in its mode, and who acts in which store. Like the
// catalogue, every service checks the permission itself (B6.5), scopes store rows by `storeId` (A4.1) and writes the
// audit log in the same transaction as the change.
//
// Warehouses, locations and the stock mirror are one shared pool for every store (A4.4, schema `@scope
// installation`): changing them needs the permission for every store (an all-store role), not only for one.
import type { Prisma, PrismaClient } from '@extas/db/client';
import type { Connections } from '@extas/adapters';
import { audit, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import type { Key, Value } from '@extas/settings';
import type { z } from 'zod';
import { InventoryError } from './errors';

export type Db = PrismaClient | Prisma.TransactionClient;
export type Tx = Prisma.TransactionClient;

/** Reads effective settings for a store (the app passes its SettingsResolver). */
export interface SettingsReader {
  value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>>;
}

export interface InventoryDeps {
  db: PrismaClient;
  settings: SettingsReader;
  /** The connection layer: the store's ERP connection, built in its mode with the vault's keys. */
  connections: Pick<Connections, 'use'>;
  /** Clock, for tests. */
  now?: () => Date;
  /** Waits between tries (tests pass one that records and returns at once). */
  sleep?: (ms: number) => Promise<void>;
  /** 0 ≤ n < 1, for the backoff spread (tests pass a fixed one). */
  random?: () => number;
  /**
   * Test seams only (never set by the app): `afterPoolLock` runs while a hold has the pool rows locked, so a test can
   * hold the lock open and prove a second checkout waits for it (PR 198).
   */
  hooks?: { afterPoolLock?: () => Promise<void> };
}

export interface Who {
  actor: Actor;
  storeId: number;
  ctx?: RequestContext;
}

export type InventoryPermission = 'inventory.read' | 'inventory.locations' | 'inventory.erp' | 'inventory.sync' | 'inventory.audit';

export const nowOf = (deps: InventoryDeps) => deps.now?.() ?? new Date();

/** Checks the permission in that store and that the store exists and is not archived. */
export async function allow(deps: InventoryDeps, who: Who, permission: InventoryPermission): Promise<void> {
  if (!Number.isInteger(who.storeId) || who.storeId < 1) throw new InventoryError('INVALID_INPUT', 'store id must be a positive integer', ['storeId']);
  await requirePermission(deps.db, who.actor, permission, { storeId: who.storeId });
  const store = await deps.db.store.findUnique({ where: { id: who.storeId }, select: { archivedAt: true } });
  if (!store || store.archivedAt) throw new InventoryError('NOT_FOUND', 'no such store', ['storeId']);
}

/** The shared pool changes for every store at once: the permission must hold for every store. */
export async function allowEveryStore(deps: InventoryDeps, who: Who, permission: InventoryPermission): Promise<void> {
  await requirePermission(deps.db, who.actor, permission, {});
}

/** One setting for the acting store. */
export const setting = <K extends Key>(deps: InventoryDeps, storeId: number | null, key: K): Promise<Value<K>> =>
  deps.settings.value(key, storeId == null ? {} : { storeId });

/** Validates input; a failure names every bad field. */
export function parse<T extends z.ZodType>(schema: T, input: unknown, what: string): z.output<T> {
  const r = schema.safeParse(input ?? {});
  if (!r.success) {
    throw new InventoryError('INVALID_INPUT', `the ${what} is not valid`, r.error.issues.map((i) => `${i.path.join('.') || '(input)'}: ${i.message}`));
  }
  return r.data;
}

/** An audit row (same transaction as the change). `storeId` null = the shared pool. */
export function logChange(db: Db, who: Who, entry: { action: string; entityType: string; entityId: string; before: unknown; after: unknown; storeId: number | null }): Promise<void> {
  return audit(db, who.actor, entry, { source: 'admin-api', ...who.ctx });
}

export function found<T>(row: T | null | undefined, what: string): T {
  if (!row) throw new InventoryError('NOT_FOUND', `no such ${what}`);
  return row;
}

/** Transaction options for writes that touch a page of stock rows. */
export const TX = { maxWait: 10_000, timeout: 60_000 } as const;

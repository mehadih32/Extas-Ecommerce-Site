// What every combo service gets: the database, the settings (through the two-tier resolver, PR 492), optionally the
// storage adapter (for the set photo, PR 575) and who acts in which store. Like the catalogue and Smart Rules, every
// admin service checks the permission itself (B6.5), scopes rows by `storeId` (A4.1) and writes the audit log in the
// same transaction as the change. The storefront's server functions (summary, validation, the bag) take a store id
// and no actor: they only read what is on sale, and the bag writes only into the customer's own open bag.
import type { Prisma, PrismaClient } from '@extas/db/client';
import { audit, can, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import type { StorageFor } from '@extas/media';
import type { Key, Value } from '@extas/settings';
import type { z } from 'zod';
import { CombosError } from './errors';

export type Db = PrismaClient | Prisma.TransactionClient;
export type Tx = Prisma.TransactionClient;

/** Reads effective settings for a store (the app passes its SettingsResolver). */
export interface SettingsReader {
  value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>>;
}

export interface CombosDeps {
  db: PrismaClient;
  settings: SettingsReader;
  /** The storage adapter (the media package's), needed only to make set photos. */
  storage?: StorageFor;
  /** Clock, for tests. */
  now?: () => Date;
}

export interface Who {
  actor: Actor;
  storeId: number;
  ctx?: RequestContext;
}

export type CombosPermission = 'combos.read' | 'combos.write' | 'combos.publish' | 'combos.prices';

export const TX = { maxWait: 10_000, timeout: 60_000 } as const;

export const nowOf = (deps: Pick<CombosDeps, 'now'>) => deps.now?.() ?? new Date();

/** Checks the permission in that store and that the store exists and is not archived. */
export async function allow(deps: CombosDeps, who: Who, permission: CombosPermission): Promise<void> {
  checkStoreId(who.storeId);
  await requirePermission(deps.db, who.actor, permission, { storeId: who.storeId });
  await liveStore(deps.db, who.storeId);
}

export async function liveStore(db: Db, storeId: number): Promise<void> {
  checkStoreId(storeId);
  const store = await db.store.findUnique({ where: { id: storeId }, select: { archivedAt: true } });
  if (!store || store.archivedAt) throw new CombosError('NOT_FOUND', 'no such store', ['storeId']);
}

/** Does the actor hold the permission in the store (no throw)? */
export const holds = (deps: CombosDeps, who: Who, permission: CombosPermission) => can(deps.db, who.actor, permission, { storeId: who.storeId });

/** A price is the owner's decision (CLAUDE.md rule 6): refused without `combos.prices`. */
export async function allowPrice(deps: CombosDeps, who: Who): Promise<void> {
  if (!(await holds(deps, who, 'combos.prices'))) throw new CombosError('OWNER_OK_REQUIRED', 'a set price needs the owner’s permission', ['combos.prices']);
}

export function checkStoreId(storeId: number): void {
  if (!Number.isInteger(storeId) || storeId < 1) throw new CombosError('INVALID_INPUT', 'store id must be a positive integer', ['storeId']);
}

/** One setting for the store. */
export const setting = <K extends Key>(deps: Pick<CombosDeps, 'settings'>, storeId: number, key: K): Promise<Value<K>> => deps.settings.value(key, { storeId });

/** Validates input; a failure names every bad field. */
export function parse<T extends z.ZodType>(schema: T, input: unknown, what: string): z.output<T> {
  const r = schema.safeParse(input ?? {});
  if (!r.success) {
    throw new CombosError('INVALID_INPUT', `the ${what} is not valid`, r.error.issues.map((i) => `${i.path.join('.') || '(input)'}: ${i.message}`));
  }
  return r.data;
}

/** An audit row (same transaction as the change). */
export function logChange(db: Db, who: Who, entry: { action: string; entityType: string; entityId: string; before: unknown; after: unknown }): Promise<void> {
  return audit(db, who.actor, { ...entry, storeId: who.storeId }, { source: 'admin-api', ...who.ctx });
}

export function found<T>(row: T | null | undefined, what: string): T {
  if (!row) throw new CombosError('NOT_FOUND', `no such ${what}`);
  return row;
}

/** The acting staff member's id for createdBy / updatedBy (the system acts without one). */
export const actorId = (who: Who): string | null => who.actor.staffUserId;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

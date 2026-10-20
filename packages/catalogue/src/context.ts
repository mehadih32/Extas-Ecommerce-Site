// What every catalogue service gets: the database, the settings (through the two-tier resolver, PR 492), who acts and
// in which store. Every service checks the permission for that store itself (B6.5: on the server, on every action, not
// only on the page), scopes every query by `storeId` (A4.1) and writes the audit log in the same transaction as the
// change.
import type { Prisma, PrismaClient } from '@extas/db/client';
import { audit, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import type { Key, Value } from '@extas/settings';
import type { z } from 'zod';
import { CatalogueError } from './errors';
import { slugify, type SlugOptions } from './text';

export type Db = PrismaClient | Prisma.TransactionClient;
export type Tx = Prisma.TransactionClient;

/** Reads effective settings for a store (the app passes its SettingsResolver). */
export interface SettingsReader {
  value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>>;
}

export interface CatalogueDeps {
  db: PrismaClient;
  settings: SettingsReader;
  /** Clock, for tests. */
  now?: () => Date;
}

/** Who acts, in which store, and from where (for the audit log). */
export interface Who {
  actor: Actor;
  storeId: number;
  ctx?: RequestContext;
}

export type CataloguePermission = 'catalogue.read' | 'catalogue.write' | 'catalogue.prices' | 'catalogue.import' | 'catalogue.export';

/** Checks the permission in that store and that the store exists and is not archived. */
export async function allow(deps: CatalogueDeps, who: Who, permission: CataloguePermission): Promise<void> {
  if (!Number.isInteger(who.storeId) || who.storeId < 1) throw new CatalogueError('INVALID_INPUT', 'store id must be a positive integer', ['storeId']);
  await requirePermission(deps.db, who.actor, permission, { storeId: who.storeId });
  const store = await deps.db.store.findUnique({ where: { id: who.storeId }, select: { archivedAt: true } });
  if (!store || store.archivedAt) throw new CatalogueError('NOT_FOUND', 'no such store', ['storeId']);
}

/** One setting for the acting store. */
export const setting = <K extends Key>(deps: CatalogueDeps, who: Who, key: K): Promise<Value<K>> => deps.settings.value(key, { storeId: who.storeId });

/** How links are made in this store (`naming.slugMaxLength`, `naming.slugAmpersand`). */
export async function slugOptions(deps: CatalogueDeps, who: Who): Promise<SlugOptions> {
  const [maxLength, ampersand] = await Promise.all([setting(deps, who, 'naming.slugMaxLength'), setting(deps, who, 'naming.slugAmpersand')]);
  return { maxLength, ampersand };
}

/** A dictionary-style key (colour, size, garment type, brand) from a name: a link, at most as long as a key may be. */
export async function keyFrom(deps: CatalogueDeps, who: Who, text: string): Promise<string> {
  const opts = await slugOptions(deps, who);
  return slugify(text, { ...opts, maxLength: Math.min(opts.maxLength, KEY_MAX) });
}

/** The longest key a dictionary-style row may have (the schema of `dictionaryKeySchema`). */
const KEY_MAX = 60;

/** Validates input; a failure names every bad field. */
export function parse<T extends z.ZodType>(schema: T, input: unknown, what: string): z.output<T> {
  const r = schema.safeParse(input ?? {});
  if (!r.success) {
    throw new CatalogueError('INVALID_INPUT', `the ${what} is not valid`, r.error.issues.map((i) => `${i.path.join('.') || '(input)'}: ${i.message}`));
  }
  return r.data;
}

/** An audit row for a catalogue change (same transaction as the change). */
export function logChange(
  db: Db,
  who: Who,
  action: string,
  entityType: string,
  entityId: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  return audit(db, who.actor, { action, entityType, entityId, before, after, storeId: who.storeId }, { source: 'admin-api', ...who.ctx });
}

/** A row of this store, or NOT_FOUND (never another store's row, A4.1). */
export function found<T>(row: T | null | undefined, what: string): T {
  if (!row) throw new CatalogueError('NOT_FOUND', `no such ${what}`);
  return row;
}

/** The fields of `after` that differ from `before` (for a compact audit row). */
export function changed<T extends Record<string, unknown>>(before: T, after: Partial<T>): { before: Partial<T>; after: Partial<T> } {
  const b: Partial<T> = {};
  const a: Partial<T> = {};
  for (const k of Object.keys(after) as (keyof T)[]) {
    if (JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null)) {
      b[k] = before[k];
      a[k] = after[k];
    }
  }
  return { before: b, after: a };
}

/** A MediaAsset this store may use as an image (its own, or a shared studio asset, A4.3). */
export async function assertImage(db: Db, storeId: number, assetId: string | null | undefined, field: string): Promise<void> {
  if (!assetId) return;
  const asset = await db.mediaAsset.findUnique({ where: { id: assetId }, select: { storeId: true, kind: true, archivedAt: true, sharedWithAllStores: true } });
  if (!asset || asset.archivedAt || asset.kind !== 'IMAGE' || (asset.storeId !== storeId && !asset.sharedWithAllStores)) {
    throw new CatalogueError('INVALID_INPUT', 'not an image of this store', [field]);
  }
}

/** Transaction options for catalogue writes (a bulk rename touches many rows). */
export const TX = { maxWait: 10_000, timeout: 60_000 } as const;

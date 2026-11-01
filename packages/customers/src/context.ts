// What every customers function gets: the database, the settings (through the two-tier resolver, PR 492), a clock for
// tests, and who acts in which store. Like the other admin services, every read and command checks its permission
// itself (B6.5), scopes rows by `storeId` (A4.1) and writes the audit log in the same transaction as a change. Customer
// data is personal: the full phone number goes out only to a person holding `customers.phone` (`Viewer.fullPhone`).
import type { Prisma, PrismaClient } from '@extas/db/client';
import { requirePermission, type Actor, type PermissionKey, type RequestContext } from '@extas/auth';
import type { Key, Value } from '@extas/settings';
import type { z } from 'zod';
import { CustomersError } from './errors';

export type Db = PrismaClient | Prisma.TransactionClient;
export type Tx = Prisma.TransactionClient;

/** Reads effective settings for a store (the app passes its SettingsResolver). */
export interface SettingsReader {
  value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>>;
}

/** Writes a store's setting (the app's resolver; the pages' own settings cards, PR 287). */
export interface SettingsWriter {
  set<K extends Key>(key: K, value: Value<K>, target: { level: 'store'; storeId: number }, opts?: { actorId?: string | null; reason?: string | null }): Promise<unknown>;
}

export interface CustomersDeps {
  db: PrismaClient;
  settings: SettingsReader & Partial<SettingsWriter>;
  /** Clock, for tests. */
  now?: () => Date;
}

/** A staff member (or the system, `staffUserId: null`) acting in one store. */
export interface Who {
  actor: Actor;
  storeId: number;
  ctx?: RequestContext;
}

/** The customers permissions (packages/auth/src/catalogue.ts; BACKEND-ARCHITECTURE §5.5, §9.10). */
export const CUSTOMER_PERMISSIONS = ['customers.read', 'customers.phone', 'customers.merge', 'customers.privacy', 'customers.segments.write'] as const satisfies readonly PermissionKey[];
export type CustomersPermission = (typeof CUSTOMER_PERMISSIONS)[number];

/** What the person reading may see, from the keys they hold in the store. */
export interface Viewer {
  /** `customers.phone`: the full number (and a copy or call of it, logged). */
  fullPhone: boolean;
  /** `orders.read`: each order links to its own page. */
  orders: boolean;
  /** `customers.merge`: merge, split, "not the same person". */
  merge: boolean;
  /** `audit.read`: "Who looked at this customer". */
  audit: boolean;
  /** PR 287 · `customers.segments.write`: save, change and archive segments. */
  segments: boolean;
}

export const TX = { maxWait: 10_000, timeout: 30_000 } as const;

export const nowOf = (deps: Pick<CustomersDeps, 'now'>) => deps.now?.() ?? new Date();

export function checkStoreId(storeId: number): void {
  if (!Number.isInteger(storeId) || storeId < 1) throw new CustomersError('INVALID_INPUT', 'store id must be a positive integer', ['storeId']);
}

/** Checks the permission in that store and that the store exists and is not archived; gives what the person may see. */
export async function allow(deps: CustomersDeps, who: Who, permission: CustomersPermission): Promise<Viewer> {
  checkStoreId(who.storeId);
  const held = await requirePermission(deps.db, who.actor, permission, { storeId: who.storeId });
  const store = await deps.db.store.findUnique({ where: { id: who.storeId }, select: { archivedAt: true } });
  if (!store || store.archivedAt) throw new CustomersError('NOT_FOUND', 'no such store', ['storeId']);
  return { fullPhone: held.has('customers.phone'), orders: held.has('orders.read'), merge: held.has('customers.merge'), audit: held.has('audit.read'), segments: held.has('customers.segments.write') };
}

/** One setting for the store. */
export const setting = <K extends Key>(deps: Pick<CustomersDeps, 'settings'>, storeId: number, key: K): Promise<Value<K>> => deps.settings.value(key, { storeId });

/** Validates input; a failure names every bad field. */
export function parse<T extends z.ZodType>(schema: T, input: unknown, what: string): z.output<T> {
  const r = schema.safeParse(input ?? {});
  if (!r.success) throw new CustomersError('INVALID_INPUT', `the ${what} is not valid`, r.error.issues.map((i) => `${i.path.join('.') || '(input)'}: ${i.message}`));
  return r.data;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** An Idempotency-Key as the admin API takes it (§7.7). */
export const KEY = /^[A-Za-z0-9._:-]{8,200}$/;

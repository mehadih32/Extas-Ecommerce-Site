// What every order service gets: the database, the settings (through the two-tier resolver, PR 492), optionally the
// inventory's dependencies (the store's ERP connection for the D6 push; stock holds are released without it), a clock
// for tests, and who acts in which store. Like the other admin services, every staff command checks its permission
// itself (B6.5), scopes rows by `storeId` (A4.1) and writes the audit log in the same transaction as the change. The
// customer's own commands (the cancel of his order) take the customer or the browser that placed the order instead.
import type { Prisma, PrismaClient } from '@extas/db/client';
import { requirePermission, type Actor, type RequestContext } from '@extas/auth';
import type { InventoryDeps } from '@extas/inventory';
import type { Key, Value } from '@extas/settings';
import type { z } from 'zod';
import { OrdersError } from './errors';

export type Db = PrismaClient | Prisma.TransactionClient;
export type Tx = Prisma.TransactionClient;

/** Reads effective settings for a store (the app passes its SettingsResolver). */
export interface SettingsReader {
  value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>>;
}

export interface OrdersDeps {
  db: PrismaClient;
  settings: SettingsReader;
  /** The inventory's dependencies with the connection layer (the admin's); without it the ERP push waits as PENDING. */
  inventory?: InventoryDeps;
  /** Clock, for tests. */
  now?: () => Date;
  /** Test seams only (never set by the app): runs while a command holds the order's row lock. */
  hooks?: { afterLock?: (orderId: string) => Promise<void> };
}

/** A staff member (or the system, `staffUserId: null`) acting in one store. */
export interface Who {
  actor: Actor;
  storeId: number;
  ctx?: RequestContext;
}

/** The order permissions (packages/auth/src/catalogue.ts; BACKEND-ARCHITECTURE §5.3, §9.10). */
export const ORDER_PERMISSIONS = [
  'orders.read',
  'orders.confirm',
  'orders.hold',
  'orders.cancel',
  'orders.cancelAfterBooking',
  'orders.cancelRequests',
  'orders.notes',
  'orders.risk.read',
  'orders.risk.decide',
  'orders.merge',
  'orders.lines',
  'orders.edit',
] as const;
export type OrdersPermission = (typeof ORDER_PERMISSIONS)[number];

export const TX = { maxWait: 10_000, timeout: 30_000 } as const;

export const nowOf = (deps: Pick<OrdersDeps, 'now'>) => deps.now?.() ?? new Date();

export function checkStoreId(storeId: number): void {
  if (!Number.isInteger(storeId) || storeId < 1) throw new OrdersError('INVALID_INPUT', 'store id must be a positive integer', ['storeId']);
}

/** Checks the permission in that store and that the store exists and is not archived. */
export async function allow(deps: OrdersDeps, who: Who, permission: OrdersPermission): Promise<void> {
  checkStoreId(who.storeId);
  await requirePermission(deps.db, who.actor, permission, { storeId: who.storeId });
  const store = await deps.db.store.findUnique({ where: { id: who.storeId }, select: { archivedAt: true } });
  if (!store || store.archivedAt) throw new OrdersError('NOT_FOUND', 'no such store', ['storeId']);
}

/** One setting for the store. */
export const setting = <K extends Key>(deps: Pick<OrdersDeps, 'settings'>, storeId: number, key: K): Promise<Value<K>> => deps.settings.value(key, { storeId });

/** Validates input; a failure names every bad field. */
export function parse<T extends z.ZodType>(schema: T, input: unknown, what: string): z.output<T> {
  const r = schema.safeParse(input ?? {});
  if (!r.success) throw new OrdersError('INVALID_INPUT', `the ${what} is not valid`, r.error.issues.map((i) => `${i.path.join('.') || '(input)'}: ${i.message}`));
  return r.data;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

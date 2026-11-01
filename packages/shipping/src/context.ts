// What every shipping service gets: the database, the settings (the two-tier resolver, PR 492), the courier connection
// layer (PR 18: each courier's adapter in the mode its Keys & connections row says, else its practice world), a clock
// for tests, and who acts in which store. Like the other admin services, every staff action checks its permission
// itself (B6.5), scopes rows by `storeId` (A4.1) and writes the audit log in the same transaction as the change.
import type { Prisma, PrismaClient } from '@extas/db/client';
import type { Connections } from '@extas/adapters';
import { audit, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import type { Key, Value } from '@extas/settings';
import type { z } from 'zod';
import { ShippingError } from './errors';

export type Db = PrismaClient | Prisma.TransactionClient;
export type Tx = Prisma.TransactionClient;

/** Reads effective settings for a store (the app passes its SettingsResolver). */
export interface SettingsReader {
  value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>>;
}

export interface ShippingDeps {
  db: PrismaClient;
  settings: SettingsReader;
  /** The courier connections (built with `courierAdapters`): `use('COURIER', { storeId, provider })`. */
  connections: Pick<Connections, 'use'>;
  /** Clock, for tests. */
  now?: () => Date;
}

/** A staff member (or the system, `staffUserId: null`) acting in one store. */
export interface Who {
  actor: Actor;
  storeId: number;
  ctx?: RequestContext;
}

/**
 * The shipping permissions (packages/auth/src/catalogue.ts; BACKEND-ARCHITECTURE §5.6). `delivery.parcels` is not a
 * `.read` key on purpose: a parcel shows the receiver's name, phone and address, and the read-only smoke check account
 * never gets customers' details.
 */
export const SHIPPING_PERMISSIONS = ['delivery.parcels', 'delivery.book', 'delivery.exceptions', 'delivery.couriers', 'delivery.outcomes'] as const;
export type ShippingPermission = (typeof SHIPPING_PERMISSIONS)[number];

/**
 * PR 179–181 — Orders › Packing & print: `fulfilment.read` sees the print run, the recent prints, the handover lists and
 * the picking list (no customer's details); `fulfilment.print` prints courier stickers (they carry the receiver's
 * details); `fulfilment.handover` prints the rider's handover sheet and marks a batch handed over. PR 182:
 * `fulfilment.pack` starts picking, checks the pieces, adds the packing photo and marks an order packed;
 * `fulfilment.photoWaive` is the owner's override of a required photo for one order, with a reason.
 * `fulfilment.bins` (PR 412) sets the shelf each style is kept on, for the picking list read shelf by shelf.
 */
export const FULFIL_PERMISSIONS = ['fulfilment.read', 'fulfilment.print', 'fulfilment.handover', 'fulfilment.pack', 'fulfilment.photoWaive', 'fulfilment.bins'] as const;
export type FulfilPermission = (typeof FULFIL_PERMISSIONS)[number];

/** PR 164 — the fraud report with the RTO cost book (Reports › Fraud & RTO); it reads only. */
export const REPORT_PERMISSIONS = ['risk.report'] as const;
export type ReportPermission = (typeof REPORT_PERMISSIONS)[number];

export const TX = { maxWait: 10_000, timeout: 30_000 } as const;

export const nowOf = (deps: Pick<ShippingDeps, 'now'>): Date => deps.now?.() ?? new Date();

export function checkStoreId(storeId: number): void {
  if (!Number.isInteger(storeId) || storeId < 1) throw new ShippingError('INVALID_INPUT', 'store id must be a positive integer', ['storeId']);
}

/** Checks the permission in that store (or `delivery.read`, the courier list) and that the store exists and is not archived. */
export async function allow(deps: Pick<ShippingDeps, 'db'>, who: Who, permission: ShippingPermission | FulfilPermission | ReportPermission | 'delivery.read'): Promise<void> {
  checkStoreId(who.storeId);
  await requirePermission(deps.db, who.actor, permission, { storeId: who.storeId });
  const store = await deps.db.store.findUnique({ where: { id: who.storeId }, select: { archivedAt: true } });
  if (!store || store.archivedAt) throw new ShippingError('NOT_FOUND', 'no such store', ['storeId']);
}

/** One setting for the store. */
export const setting = <K extends Key>(deps: Pick<ShippingDeps, 'settings'>, storeId: number, key: K): Promise<Value<K>> => deps.settings.value(key, { storeId });

/** Validates input; a failure names every bad field. */
export function parse<T extends z.ZodType>(schema: T, input: unknown, what: string): z.output<T> {
  const r = schema.safeParse(input ?? {});
  if (!r.success) throw new ShippingError('INVALID_INPUT', `the ${what} is not valid`, r.error.issues.map((i) => `${i.path.join('.') || '(input)'}: ${i.message}`));
  return r.data;
}

/** An audit row for a shipping change (same transaction as the change). */
export function logChange(db: Db, who: Who, action: string, entityType: string, entityId: string, before: unknown, after: unknown): Promise<void> {
  return audit(db, who.actor, { action, entityType, entityId, before, after, storeId: who.storeId }, { source: 'admin-api', ...who.ctx });
}

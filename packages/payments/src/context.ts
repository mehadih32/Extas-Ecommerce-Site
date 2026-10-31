// What every payments function gets: the database, the settings (through the two-tier resolver, PR 492), a clock for
// tests, and — for the staff's own actions — who acts in which store. Like the other admin services, every staff action
// checks its permission itself (B6.5), scopes rows by `storeId` (A4.1) and writes the audit log in the same transaction
// as the change. The order's status is never written here: when money makes an order ready (an advance paid in full),
// the caller's `orders` hook moves it through the one order service (@extas/orders), which this package does not import.
import type { Mode, PaymentGateway } from '@extas/adapters';
import type { Prisma, PrismaClient } from '@extas/db/client';
import { requirePermission, type Actor, type RequestContext } from '@extas/auth';
import type { Key, Value } from '@extas/settings';
import type { z } from 'zod';
import { PaymentsError } from './errors';

export type Db = PrismaClient | Prisma.TransactionClient;
export type Tx = Prisma.TransactionClient;

/** Reads effective settings for a store (the app passes its SettingsResolver). */
export interface SettingsReader {
  value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>>;
}

/** Order moves that money causes, run by the caller through @extas/orders after the money is written. */
export interface OrderHooks {
  /** An order waiting for its advance (AWAITING_ADVANCE) now has it in full: the order service's `recordAdvance`. */
  advancePaid?(storeId: number, orderId: string, by: { actorId: string | null; source: string }): Promise<void>;
}

/**
 * PR 170 — the gateway a payment's provider runs on now for a store (the app's connection layer: the practice gateway
 * until the owner's keys pass the Test button, A1.3).
 */
export type GatewayResolver = (storeId: number, provider: string) => Promise<{ api: PaymentGateway; mode: Mode }>;

/** PR 564 — what the delivery side does with the charges a courier's statement shows (the charge mismatch log). */
export interface CourierChargeHooks {
  /** Called after a statement is stored, with each known parcel and the charge its line shows; a record only. */
  statementCharges?(storeId: number, lines: { shipmentId: string; chargeMinor: number | null }[]): Promise<unknown>;
}

export interface PaymentsDeps {
  db: PrismaClient;
  settings: SettingsReader;
  /** Clock, for tests. */
  now?: () => Date;
  orders?: OrderHooks;
  /** PR 564: the charge mismatch log (none: the statement's charges are only stored on its lines). */
  courier?: CourierChargeHooks;
  /** PR 170: the payment gateways (none: nothing goes through a gateway here). */
  gateways?: GatewayResolver;
}

/** A staff member (or the system, `staffUserId: null`) acting in one store. */
export interface Who {
  actor: Actor;
  storeId: number;
  ctx?: RequestContext;
}

/** The payments permissions (packages/auth/src/catalogue.ts). */
export const PAYMENT_PERMISSIONS = ['payments.view', 'payments.record', 'payments.door', 'payments.partials', 'payments.settle', 'payments.wallet', 'payments.apology', 'payments.refunds.request', 'payments.refunds.approve', 'payments.refunds.execute', 'payments.advance'] as const;
export type PaymentsPermission = (typeof PAYMENT_PERMISSIONS)[number];

export const TX = { maxWait: 10_000, timeout: 30_000 } as const;

export const nowOf = (deps: Pick<PaymentsDeps, 'now'>) => deps.now?.() ?? new Date();

export function checkStoreId(storeId: number): void {
  if (!Number.isInteger(storeId) || storeId < 1) throw new PaymentsError('INVALID_INPUT', 'store id must be a positive integer', ['storeId']);
}

/** Checks the permission in that store and that the store exists and is not archived. */
export async function allow(deps: PaymentsDeps, who: Who, permission: PaymentsPermission): Promise<void> {
  checkStoreId(who.storeId);
  await requirePermission(deps.db, who.actor, permission, { storeId: who.storeId });
  const store = await deps.db.store.findUnique({ where: { id: who.storeId }, select: { archivedAt: true } });
  if (!store || store.archivedAt) throw new PaymentsError('NOT_FOUND', 'no such store', ['storeId']);
}

/** One setting for the store. */
export const setting = <K extends Key>(deps: Pick<PaymentsDeps, 'settings'>, storeId: number, key: K): Promise<Value<K>> => deps.settings.value(key, { storeId });

/** Validates input; a failure names every bad field. */
export function parse<T extends z.ZodType>(schema: T, input: unknown, what: string): z.output<T> {
  const r = schema.safeParse(input ?? {});
  if (!r.success) throw new PaymentsError('INVALID_INPUT', `the ${what} is not valid`, r.error.issues.map((i) => `${i.path.join('.') || '(input)'}: ${i.message}`));
  return r.data;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An idempotency key as the admin screens send it (§7.7: money commands carry one). */
export const KEY = /^[A-Za-z0-9._:-]{8,200}$/;

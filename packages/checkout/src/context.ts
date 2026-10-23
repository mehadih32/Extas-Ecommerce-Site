// What every checkout service gets: the database, the settings (through the two-tier resolver, PR 492) and a clock for
// tests. The checkout needs no staff permission: it is the customer's own bag (found by the random visitor id in his
// cookie) and his own order, and every service writes only into that one bag and that one order of one store (A4.1).
import type { Prisma, PrismaClient } from '@extas/db/client';
import type { Key, Value } from '@extas/settings';
import type { z } from 'zod';

export type Db = PrismaClient | Prisma.TransactionClient;
export type Tx = Prisma.TransactionClient;

/** Reads effective settings for a store (the app passes its SettingsResolver). */
export interface SettingsReader {
  value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>>;
}

export interface CheckoutDeps {
  db: PrismaClient;
  settings: SettingsReader;
  /** Clock, for tests. */
  now?: () => Date;
}

export type CheckoutErrorCode =
  | 'INVALID_INPUT'
  /** No such bag, order or payment for this visitor in this store. */
  | 'NOT_FOUND'
  /** The bag is not open any more (it became an order, or was merged). */
  | 'CART_NOT_OPEN'
  /** The bag has nothing to order. */
  | 'EMPTY';

/** One error type for every refusal of the checkout. The `code` is stable; the shop turns it into words. */
export class CheckoutError extends Error {
  readonly code: CheckoutErrorCode;
  readonly details: string[];
  /** Extra data the screen needs with the refusal (the fresh quote after PRICE_CHANGED, the fields after FORM). */
  readonly data: Record<string, unknown> | undefined;

  constructor(code: CheckoutErrorCode, message: string, details: string[] = [], data?: Record<string, unknown>) {
    super(`${code}: ${message}`);
    this.name = 'CheckoutError';
    this.code = code;
    this.details = details;
    this.data = data;
  }

  /** HTTP status for the shop's checkout API. */
  get status(): number {
    switch (this.code) {
      case 'NOT_FOUND':
        return 404;
      case 'INVALID_INPUT':
        return 400;
      default:
        return 409;
    }
  }
}

export const TX = { maxWait: 10_000, timeout: 30_000 } as const;

export const nowOf = (deps: Pick<CheckoutDeps, 'now'>) => deps.now?.() ?? new Date();

/** One setting for the store. */
export const setting = <K extends Key>(deps: Pick<CheckoutDeps, 'settings'>, storeId: number, key: K): Promise<Value<K>> => deps.settings.value(key, { storeId });

export function checkStoreId(storeId: number): void {
  if (!Number.isInteger(storeId) || storeId < 1) throw new CheckoutError('INVALID_INPUT', 'store id must be a positive integer', ['storeId']);
}

/** Validates input; a failure names every bad field. */
export function parse<T extends z.ZodType>(schema: T, input: unknown, what: string): z.output<T> {
  const r = schema.safeParse(input ?? {});
  if (!r.success) throw new CheckoutError('INVALID_INPUT', `the ${what} is not valid`, r.error.issues.map((i) => `${i.path.join('.') || '(input)'}: ${i.message}`));
  return r.data;
}

// What every bag service gets: the database, the settings (through the two-tier resolver, PR 492) and a clock for
// tests. The bag needs no staff permission: it is the customer's own bag, found by the random visitor id in his
// cookie, and every service writes only into that one open bag of that one store (A4.1).
import type { Prisma, PrismaClient } from '@extas/db/client';
import type { Key, Value } from '@extas/settings';
import type { z } from 'zod';

export type Db = PrismaClient | Prisma.TransactionClient;
export type Tx = Prisma.TransactionClient;

/** Reads effective settings for a store (the app passes its SettingsResolver). */
export interface SettingsReader {
  value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>>;
}

export interface CartDeps {
  db: PrismaClient;
  settings: SettingsReader;
  /** Clock, for tests. */
  now?: () => Date;
}

export type CartErrorCode =
  | 'INVALID_INPUT'
  /** No such line, set or variant in this bag or store. */
  | 'NOT_FOUND'
  /** The bag is not this store's or no longer open (it became an order or was merged). */
  | 'CART_NOT_OPEN'
  /** Not that many pieces can be sold now (details: `variantId:free`). */
  | 'OUT_OF_STOCK'
  /** The product is not on sale (not published, no price, archived). */
  | 'NOT_FOR_SALE'
  /** More than one line may hold (`inventory.reservation.maxUnitsPerLine`). */
  | 'TOO_MANY';

/** One error type for every refusal of the bag. The `code` is stable; the shop turns it into words from its dictionary. */
export class CartError extends Error {
  readonly code: CartErrorCode;
  readonly details: string[];

  constructor(code: CartErrorCode, message: string, details: string[] = []) {
    super(`${code}: ${message}`);
    this.name = 'CartError';
    this.code = code;
    this.details = details;
  }

  /** HTTP status for the shop's bag API. */
  get status(): number {
    switch (this.code) {
      case 'NOT_FOUND':
        return 404;
      case 'CART_NOT_OPEN':
      case 'OUT_OF_STOCK':
      case 'NOT_FOR_SALE':
      case 'TOO_MANY':
        return 409;
      default:
        return 400;
    }
  }
}

export const TX = { maxWait: 10_000, timeout: 30_000 } as const;

export const nowOf = (deps: Pick<CartDeps, 'now'>) => deps.now?.() ?? new Date();

/** One setting for the store. */
export const setting = <K extends Key>(deps: Pick<CartDeps, 'settings'>, storeId: number, key: K): Promise<Value<K>> => deps.settings.value(key, { storeId });

export function checkStoreId(storeId: number): void {
  if (!Number.isInteger(storeId) || storeId < 1) throw new CartError('INVALID_INPUT', 'store id must be a positive integer', ['storeId']);
}

/** Validates input; a failure names every bad field. */
export function parse<T extends z.ZodType>(schema: T, input: unknown, what: string): z.output<T> {
  const r = schema.safeParse(input ?? {});
  if (!r.success) throw new CartError('INVALID_INPUT', `the ${what} is not valid`, r.error.issues.map((i) => `${i.path.join('.') || '(input)'}: ${i.message}`));
  return r.data;
}

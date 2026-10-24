// What every checkout service gets: the database, the settings (through the two-tier resolver, PR 492) and a clock for
// tests. The checkout needs no staff permission: it is the customer's own bag (found by the random visitor id in his
// cookie) and his own order, and every service writes only into that one bag and that one order of one store (A4.1).
import type { Prisma, PrismaClient } from '@extas/db/client';
import type { Gazetteer } from '@extas/delivery';
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
  /** The gazetteer to read addresses with instead of the shared one from the database (tests). */
  gazetteer?: Gazetteer;
  /**
   * Follow-up 50 (PR 125, S07): the mode a payment provider's gateway runs in now for a store (the app's connection
   * layer: MOCK until the owner's keys pass the Test button). Without it there is no gateway here: the test page only.
   */
  paymentMode?: (storeId: number, provider: string) => Promise<'MOCK' | 'SANDBOX' | 'LIVE'>;
}

export type CheckoutErrorCode =
  | 'INVALID_INPUT'
  /** No such bag, order or payment for this visitor in this store. */
  | 'NOT_FOUND'
  /** The bag is not open any more (it became an order, or was merged). */
  | 'CART_NOT_OPEN'
  /** The bag has nothing to order. */
  | 'EMPTY'
  /** PR 125: a field of "Delivery details" is not finished (`data.field`, `data.problem`). */
  | 'FORM'
  /** PR 125: the money changed since the page showed it (`data.view`: the checkout as it is now). */
  | 'PRICE_CHANGED'
  /** PR 125: a line cannot be covered by the stock any more (details name each one). */
  | 'OUT_OF_STOCK'
  /** PR 125: no payment method is open for this order. */
  | 'NO_PAYMENT'
  /** PR 125: the order key belongs to someone else's order. */
  | 'IDEMPOTENCY'
  /** PR 606: the owner has this lane switched off (the bulk / corporate enquiry). */
  | 'NOT_OPEN'
  /** PR 606: enough enquiries from this number or browser today (`data.perDay`). */
  | 'TOO_MANY'
  /** Follow-up 50: the test page's "paid" or "fail" while test payments are off or a real gateway is connected. */
  | 'TEST_PAYMENT_OFF';

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
      case 'NOT_OPEN':
        return 404;
      case 'TOO_MANY':
        return 429;
      case 'INVALID_INPUT':
      case 'FORM':
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

// What every account service gets: the database, the settings (the two-tier resolver, PR 492) and a clock for tests.
// Customers are their own identity: their sessions never touch the staff tables (PR 15).
import type { Prisma, PrismaClient } from '@extas/db/client';
import type { Key, Value } from '@extas/settings';
import type { z } from 'zod';

export type Db = PrismaClient | Prisma.TransactionClient;
export type Tx = Prisma.TransactionClient;

/** Reads effective settings for a store (the app passes its SettingsResolver). */
export interface SettingsReader {
  value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>>;
}

export interface AccountsDeps {
  db: PrismaClient;
  settings: SettingsReader;
  now?: () => Date;
}

export type AccountErrorCode =
  | 'INVALID_INPUT'
  /** No such customer, order or address for this person in this store. */
  | 'NOT_FOUND';

/** One error type for every refusal of the account services. The `code` is stable; the shop turns it into words. */
export class AccountError extends Error {
  readonly code: AccountErrorCode;
  readonly details: string[];
  readonly data: Record<string, unknown> | undefined;

  constructor(code: AccountErrorCode, message: string, details: string[] = [], data?: Record<string, unknown>) {
    super(`${code}: ${message}`);
    this.name = 'AccountError';
    this.code = code;
    this.details = details;
    this.data = data;
  }

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

export const isAccountError = (e: unknown): e is AccountError => e instanceof AccountError;

export const TX = { maxWait: 10_000, timeout: 30_000 } as const;

export const nowOf = (deps: Pick<AccountsDeps, 'now'>) => deps.now?.() ?? new Date();

/** One setting for the store. */
export const setting = <K extends Key>(deps: Pick<AccountsDeps, 'settings'>, storeId: number, key: K): Promise<Value<K>> => deps.settings.value(key, { storeId });

export function checkStoreId(storeId: number): void {
  if (!Number.isInteger(storeId) || storeId < 1) throw new AccountError('INVALID_INPUT', 'store id must be a positive integer', ['storeId']);
}

/** Validates input; a failure names every bad field. */
export function parse<T extends z.ZodType>(schema: T, input: unknown, what: string): z.output<T> {
  const r = schema.safeParse(input ?? {});
  if (!r.success) throw new AccountError('INVALID_INPUT', `the ${what} is not valid`, r.error.issues.map((i) => `${i.path.join('.') || '(input)'}: ${i.message}`));
  return r.data;
}

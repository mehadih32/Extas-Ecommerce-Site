// What every account service gets: the database, the settings (the two-tier resolver, PR 492) and a clock for tests.
// Customers are their own identity: their sessions never touch the staff tables (PR 15).
import type { SmsSender } from '@extas/adapters';
import type { Prisma, PrismaClient } from '@extas/db/client';
import type { Key, Value } from '@extas/settings';
import type { z } from 'zod';

export type Db = PrismaClient | Prisma.TransactionClient;
export type Tx = Prisma.TransactionClient;

/** Reads effective settings for a store (the app passes its SettingsResolver). */
export interface SettingsReader {
  value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>>;
}

/** PR 130 — the SMS sender the store uses right now (the mock until the gateway's key arrives) and its mode. */
export interface SmsConnection {
  sender: SmsSender;
  mode: 'MOCK' | 'SANDBOX' | 'LIVE';
}

export interface AccountsDeps {
  db: PrismaClient;
  settings: SettingsReader;
  now?: () => Date;
  /** PR 130 — the store's SMS connection (the app passes the connection layer's SMS adapter). */
  sms?: (storeId: number) => Promise<SmsConnection>;
}

export type AccountErrorCode =
  | 'INVALID_INPUT'
  /** No such customer, order or address for this person in this store. */
  | 'NOT_FOUND'
  /** PR 130 — too many codes or tries for now; `data.retryAfterSeconds` says when to try again. */
  | 'RATE_LIMITED'
  /** PR 130 — the code is wrong, used or too old (`data.left`: tries left on this code). */
  | 'WRONG_CODE'
  /** PR 130 — the number and password do not match. */
  | 'WRONG_PASSWORD'
  /** PR 130 — the SMS could not be sent. */
  | 'SMS_FAILED'
  /** PR 130 — this way of signing in is switched off, or the account has no password. */
  | 'NOT_ALLOWED'
  /** PR 131 — the list is full (saved addresses). */
  | 'FULL';

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
      case 'RATE_LIMITED':
        return 429;
      case 'WRONG_CODE':
      case 'WRONG_PASSWORD':
        return 401;
      case 'SMS_FAILED':
        return 502;
      case 'NOT_ALLOWED':
        return 403;
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

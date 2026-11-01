// What the support core gets: the database, the settings (through the two-tier resolver, PR 492), the channel adapters
// (PR 426 fills them; none yet) and a clock for tests. Every staff action checks its permission in the store it touches
// (B6.5) and scopes every row by `storeId` (A4.1). "AI agent" means the shop's AI only; a person is an employee (B4.1).
import type { Prisma, PrismaClient } from '@extas/db/client';
import { audit, can, requirePermission, type Actor, type PermissionKey, type RequestContext } from '@extas/auth';
import type { Key, storeTarget, Value } from '@extas/settings';
import type { z } from 'zod';
import type { ChannelAdapters } from './channels';

/** Reads effective settings for a store (the app passes its SettingsResolver). */
export interface SettingsReader {
  value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>>;
}

/** The resolver's write side, for Support settings. */
export interface SettingsWriter {
  set<K extends Key>(key: K, value: Value<K>, target: ReturnType<typeof storeTarget>, opts?: { actorId?: string | null; reason?: string | null }): Promise<unknown>;
}

/** A database handle or an open transaction. */
export type Db = PrismaClient | Prisma.TransactionClient;
export const TX = { maxWait: 10_000, timeout: 30_000 } as const;

export interface SupportDeps {
  db: PrismaClient;
  settings: SettingsReader;
  /** The channels that can send a reply (PR 426). Missing or empty: a reply is kept and marked not sent. */
  channels?: ChannelAdapters;
  now?: () => Date;
}

export const nowOf = (deps: Pick<SupportDeps, 'now'>): Date => deps.now?.() ?? new Date();

export const setting = <K extends Key>(deps: Pick<SupportDeps, 'settings'>, storeId: number, key: K): Promise<Value<K>> => deps.settings.value(key, { storeId });

/** Every refusal the support core answers with (the screens have words for each). */
export const SUPPORT_ERROR_CODES = [
  'INVALID_INPUT',
  'NOT_FOUND',
  'STALE',
  'EMPTY',
  'TOO_LONG',
  'FILES_OFF',
  'TOO_MANY_FILES',
  'FILE_NOT_ALLOWED',
  'FILE_PENDING',
  'NOT_ASSIGNABLE',
  'IDEMPOTENCY_MISMATCH',
  // CN-020 (3): "Call me" at checkout is switched off, or this number asked too often today
  'CALLBACK_OFF',
  'TOO_MANY',
  // PR 75 follow-up: the contact page's form is switched off
  'CONTACT_FORM_OFF',
  // PR 427: the chat has no customer or no other chat to undo
  'NOT_LINKED',
  // PR 429: products in the chat are switched off; the colour and size picked is sold out
  'CATALOGUE_OFF',
  'OUT_OF_STOCK',
  // PR 430: orders from the chat are switched off; Cash on Delivery is closed for this order and no advance is asked;
  // the checkout refused the order (its own code in `data.code`: FORM, PRICE_CHANGED, OUT_OF_STOCK, EMPTY …)
  'CART_OFF',
  'NO_COD',
  'CHECKOUT',
] as const;
export type SupportErrorCode = (typeof SUPPORT_ERROR_CODES)[number];

export class SupportError extends Error {
  constructor(
    public readonly code: SupportErrorCode,
    message: string,
    public readonly details: string[] = [],
    public readonly data?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'SupportError';
  }

  get status(): number {
    if (this.code === 'NOT_FOUND' || this.code === 'FILE_PENDING') return 404;
    if (this.code === 'INVALID_INPUT' || this.code === 'EMPTY' || this.code === 'TOO_LONG') return 400;
    if (this.code === 'STALE' || this.code === 'IDEMPOTENCY_MISMATCH') return 409;
    if (this.code === 'TOO_MANY') return 429;
    return 422;
  }
}

export const isSupportError = (e: unknown): e is SupportError => e instanceof SupportError;

/** A staff member acting in one store. */
export interface Who {
  actor: Actor;
  storeId: number;
  ctx?: RequestContext;
}

/** The support permissions (packages/auth/src/catalogue.ts). */
export const SUPPORT_PERMISSIONS = ['support.read', 'support.reply', 'support.assign', 'support.settings', 'support.identity', 'support.order'] as const satisfies readonly PermissionKey[];
export type SupportPermission = (typeof SUPPORT_PERMISSIONS)[number];

export function checkStoreId(storeId: number): void {
  if (!Number.isInteger(storeId) || storeId < 1) throw new SupportError('INVALID_INPUT', 'store id must be a positive integer', ['storeId']);
}

/** Throws unless the actor holds the permission in the store; answers every permission held there. */
export async function allow(deps: Pick<SupportDeps, 'db'>, who: Who, permission: SupportPermission): Promise<Set<PermissionKey>> {
  checkStoreId(who.storeId);
  return requirePermission(deps.db, who.actor, permission, { storeId: who.storeId });
}

/** Does the actor hold the permission in the store (no throw)? */
export const holds = (deps: Pick<SupportDeps, 'db'>, who: Who, permission: SupportPermission): Promise<boolean> => can(deps.db, who.actor, permission, { storeId: who.storeId });

/** An audit row (in the same transaction as the change when `db` is one). */
export function logChange(db: Db, who: Who, entry: { action: string; entityType: string; entityId: string; before: unknown; after: unknown }): Promise<void> {
  return audit(db, who.actor, { ...entry, storeId: who.storeId }, { source: 'admin-api', ...who.ctx });
}

/** Validates input; a failure names every bad field. */
export function parse<T extends z.ZodType>(schema: T, input: unknown, what: string): z.output<T> {
  const r = schema.safeParse(input ?? {});
  if (!r.success) throw new SupportError('INVALID_INPUT', `the ${what} is not valid`, r.error.issues.map((i) => `${i.path.join('.') || '(input)'}: ${i.message}`));
  return r.data;
}

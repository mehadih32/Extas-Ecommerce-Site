// S23 · PR 437 (Blueprint C5 · Social & content studio) — what the studio core gets: the database and the settings
// (through the two-tier resolver, PR 492). Every staff action checks its permission in the store it touches (B6.5)
// and scopes every row by `storeId` (A4.1). Nothing here posts to a real account or spends anything; PR 439 only
// assembles a render plan (its output is today's own existing product photos), and posting/scheduling is PR 440–442,
// each behind its own permission and the owner's settings.
import type { Prisma, PrismaClient } from '@extas/db/client';
import { audit, can, requirePermission, type Actor, type PermissionKey, type RequestContext } from '@extas/auth';
import type { Key, storeTarget, Value } from '@extas/settings';
import type { z } from 'zod';

/** Reads effective settings for a store (the app passes its SettingsResolver). */
export interface SettingsReader {
  value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>>;
}

/** The resolver's write side, for Studio settings. */
export interface SettingsWriter {
  set<K extends Key>(key: K, value: Value<K>, target: ReturnType<typeof storeTarget>, opts?: { actorId?: string | null; reason?: string | null }): Promise<unknown>;
}

/** A database handle or an open transaction. */
export type Db = PrismaClient | Prisma.TransactionClient;
export const TX = { maxWait: 10_000, timeout: 30_000 } as const;

export interface StudioDeps {
  db: PrismaClient;
  settings: SettingsReader;
  now?: () => Date;
}

export const nowOf = (deps: Pick<StudioDeps, 'now'>): Date => deps.now?.() ?? new Date();

export const setting = <K extends Key>(deps: Pick<StudioDeps, 'settings'>, storeId: number, key: K): Promise<Value<K>> => deps.settings.value(key, { storeId });

/** Every refusal the studio core answers with (the screens have words for each). */
export const STUDIO_ERROR_CODES = [
  'INVALID_INPUT',
  'NOT_FOUND',
  'STALE',
  'EMPTY',
  'TOO_LONG',
  // PR 437: adding an account of a platform that is already added (one row per platform + its page/channel id)
  'ALREADY_ADDED',
  // PR 439: the job's template or product list is empty, or the template is archived
  'TEMPLATE_ARCHIVED',
  'NO_PRODUCTS',
  // PR 440–442: the post's platform account is switched off, archived, or over its daily limit
  'ACCOUNT_OFF',
  'DAILY_LIMIT',
  // PR 440–442: a post not DRAFT/QUEUED cannot be approved, rejected or edited again
  'WRONG_STATE',
  // PR 443: the channel is not added in Support, or is switched off
  'CHANNEL_OFF',
] as const;
export type StudioErrorCode = (typeof STUDIO_ERROR_CODES)[number];

export class StudioError extends Error {
  constructor(
    public readonly code: StudioErrorCode,
    message: string,
    public readonly details: string[] = [],
  ) {
    super(message);
    this.name = 'StudioError';
  }

  get status(): number {
    if (this.code === 'NOT_FOUND') return 404;
    if (this.code === 'INVALID_INPUT' || this.code === 'EMPTY' || this.code === 'TOO_LONG' || this.code === 'NO_PRODUCTS') return 400;
    if (this.code === 'STALE' || this.code === 'ALREADY_ADDED' || this.code === 'WRONG_STATE') return 409;
    return 422;
  }
}

export const isStudioError = (e: unknown): e is StudioError => e instanceof StudioError;

/** A staff member acting in one store. */
export interface Who {
  actor: Actor;
  storeId: number;
  ctx?: RequestContext;
}

/** The studio permissions (packages/auth/src/catalogue.ts). */
export const STUDIO_PERMISSIONS = ['studio.read', 'studio.write', 'studio.generate', 'studio.approve', 'studio.publish'] as const satisfies readonly PermissionKey[];
export type StudioPermission = (typeof STUDIO_PERMISSIONS)[number];

export function checkStoreId(storeId: number): void {
  if (!Number.isInteger(storeId) || storeId < 1) throw new StudioError('INVALID_INPUT', 'store id must be a positive integer', ['storeId']);
}

/** Throws unless the actor holds the permission in the store; answers every permission held there. */
export async function allow(deps: Pick<StudioDeps, 'db'>, who: Who, permission: StudioPermission): Promise<Set<PermissionKey>> {
  checkStoreId(who.storeId);
  return requirePermission(deps.db, who.actor, permission, { storeId: who.storeId });
}

/** Does the actor hold the permission in the store (no throw)? */
export const holds = (deps: Pick<StudioDeps, 'db'>, who: Who, permission: StudioPermission): Promise<boolean> => can(deps.db, who.actor, permission, { storeId: who.storeId });

/** An audit row (in the same transaction as the change when `db` is one). */
export function logChange(db: Db, who: Who, entry: { action: string; entityType: string; entityId: string; before: unknown; after: unknown }): Promise<void> {
  return audit(db, who.actor, { ...entry, storeId: who.storeId }, { source: 'admin-api', ...who.ctx });
}

/** Validates input; a failure names every bad field. */
export function parse<T extends z.ZodType>(schema: T, input: unknown, what: string): z.output<T> {
  const r = schema.safeParse(input ?? {});
  if (!r.success) throw new StudioError('INVALID_INPUT', `the ${what} is not valid`, r.error.issues.map((i) => `${i.path.join('.') || '(input)'}: ${i.message}`));
  return r.data;
}

// S24 · PR 444 (Blueprint C7 · Virtual Photoshoot Studio) — what every studio service gets: the database and the
// settings (through the two-tier resolver, PR 492). Every staff action checks its permission in the store it
// touches (B6.5) and scopes every row by `storeId` (A4.1). The photoshoot agent may write to media only — never to
// price, stock, orders or customer data (C7.20); nothing publishes without a human approval (C7.6, mandatory
// permanently).
import type { Prisma, PrismaClient } from '@extas/db/client';
import { audit, can, requirePermission, type Actor, type PermissionKey, type RequestContext } from '@extas/auth';
import type { Key, storeTarget, Value } from '@extas/settings';
import type { z } from 'zod';

/** Reads effective settings for a store (the app passes its SettingsResolver). */
export interface SettingsReader {
  value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>>;
}

/** The resolver's write side, for the studio's own settings. */
export interface SettingsWriter {
  set<K extends Key>(key: K, value: Value<K>, target: ReturnType<typeof storeTarget>, opts?: { actorId?: string | null; reason?: string | null }): Promise<unknown>;
}

/** A database handle or an open transaction. */
export type Db = PrismaClient | Prisma.TransactionClient;
export const TX = { maxWait: 10_000, timeout: 30_000 } as const;

export interface PhotoshootDeps {
  db: PrismaClient;
  settings?: SettingsReader;
  now?: () => Date;
  /** PR 452: the per-view retry's "a new seed" (C7.5 step 7). Injectable so a test can make the "different from
   * last time" guarantee deterministic; real callers get a crypto-random one (see `jobs.ts`'s `generateSeed`). */
  randomSeed?: () => string;
}

export const nowOf = (deps: Pick<PhotoshootDeps, 'now'>): Date => deps.now?.() ?? new Date();

export const setting = <K extends Key>(deps: Required<Pick<PhotoshootDeps, 'settings'>>, storeId: number, key: K): Promise<Value<K>> => deps.settings.value(key, { storeId });

/** Every refusal the photoshoot core answers with (the screens have words for each). */
export const PHOTOSHOOT_ERROR_CODES = [
  'INVALID_INPUT',
  'NOT_FOUND',
  'STALE',
  // PR 444: the asset named as the original of a generated row is missing, in another store, or is itself generated
  'SOURCE_INVALID',
  // PR 444: a role outside the fixed C7.6 taxonomy
  'UNKNOWN_ROLE',
  // PR 444: an attempt to flip isOriginal, change sourceAssetId/isAiGenerated on an existing row, or hard-delete an original
  'ORIGINAL_IMMUTABLE',
  // PR 444 / C7.6 hard rule: generating a back view with no real back_reference asset on file
  'NO_BACK_REFERENCE',
  // PR 466 / C7.12 hard rule: recording a footwear product-only studio output with no real, matching-angle
  // reference asset on file — "never invent" the same way PR 444's own NO_BACK_REFERENCE does, generalised to
  // all six footwear angles rather than just the one ghost mannequin needed.
  'NO_FOOTWEAR_REFERENCE',
  // PR 452: the store's own `studio.photoshoot.maxConcurrentJobs` is already reached — the job stays QUEUED, not failed
  'CONCURRENCY_LIMIT',
  // PR 452 (C7.20): the Photoshoot agent's own monthly spend cap is reached — new generations pause, the job stays QUEUED
  'SPEND_CAP_REACHED',
  // PR 472 / C7.12 hard rule: recording a worn-accessory studio output with no real, matching-view reference asset
  // on file — "never invent" the same way PR 444's own NO_BACK_REFERENCE and PR 466's own NO_FOOTWEAR_REFERENCE do.
  'NO_WORN_ACCESSORY_REFERENCE',
  // PR 472 / C7.12: "Detail re-projection is mandatory for these families" (watches, sunglasses, bags) — a studio
  // output for one of those three families is refused until an approved detail region (PR 454) exists on its own
  // source reference photo; caps are deliberately not gated by this code.
  'DETAIL_REPROJECTION_REQUIRED',
  // PR 473 / C7.12 "Reflective and transparent goods — honest handling": recording a reflective/transparent
  // studio output (perfume, watch glass, sunglass lens) with no real, on-file reflective_reference phone photo
  // — "never invent" the same way NO_BACK_REFERENCE, NO_FOOTWEAR_REFERENCE and NO_WORN_ACCESSORY_REFERENCE do.
  'NO_REFLECTIVE_REFERENCE',
  // PR 475 / C7.22 item 32 hard rule: composing a combo/gift-set studio image with a named piece that has no real,
  // on-file photo actually linked (ProductMedia) to that exact product in this store — "never invent" a piece's
  // own likeness, the same way NO_BACK_REFERENCE, NO_FOOTWEAR_REFERENCE, NO_WORN_ACCESSORY_REFERENCE and
  // NO_REFLECTIVE_REFERENCE already do for their own engines.
  'NO_PIECE_REFERENCE',
  // PR 476 / C7.13 "Scene library" hard rule: saving a scene-library entry with no real, on-file, non-archived
  // photo it was actually demoed from — "never invent" the same way NO_BACK_REFERENCE, NO_FOOTWEAR_REFERENCE,
  // NO_WORN_ACCESSORY_REFERENCE, NO_REFLECTIVE_REFERENCE and NO_PIECE_REFERENCE already do for their own engines.
  'NO_SCENE_REFERENCE',
  // PR 478 / C7.13 "the model must be wearing the complete set in one image" hard rule: recording a set try-on
  // output with either the top or the bottom (or both) missing a real, on-file, matching-angle reference —
  // "never invent" one half of a set the same way NO_BACK_REFERENCE, NO_FOOTWEAR_REFERENCE,
  // NO_WORN_ACCESSORY_REFERENCE, NO_REFLECTIVE_REFERENCE, NO_PIECE_REFERENCE and NO_SCENE_REFERENCE already do.
  'NO_SET_COMPONENT_REFERENCE',
] as const;
export type PhotoshootErrorCode = (typeof PHOTOSHOOT_ERROR_CODES)[number];

export class PhotoshootError extends Error {
  constructor(
    public readonly code: PhotoshootErrorCode,
    message: string,
    public readonly details: string[] = [],
  ) {
    super(message);
    this.name = 'PhotoshootError';
  }

  get status(): number {
    if (this.code === 'NOT_FOUND') return 404;
    if (this.code === 'STALE') return 409;
    if (
      this.code === 'ORIGINAL_IMMUTABLE' ||
      this.code === 'NO_BACK_REFERENCE' ||
      this.code === 'NO_FOOTWEAR_REFERENCE' ||
      this.code === 'NO_WORN_ACCESSORY_REFERENCE' ||
      this.code === 'DETAIL_REPROJECTION_REQUIRED' ||
      this.code === 'NO_REFLECTIVE_REFERENCE' ||
      this.code === 'NO_PIECE_REFERENCE' ||
      this.code === 'NO_SCENE_REFERENCE' ||
      this.code === 'NO_SET_COMPONENT_REFERENCE'
    )
      return 403;
    if (this.code === 'CONCURRENCY_LIMIT' || this.code === 'SPEND_CAP_REACHED') return 429;
    return 400;
  }
}

export const isPhotoshootError = (e: unknown): e is PhotoshootError => e instanceof PhotoshootError;

/** A staff member acting in one store. */
export interface Who {
  actor: Actor;
  storeId: number;
  ctx?: RequestContext;
}

/** The photoshoot permissions (packages/auth/src/catalogue.ts). */
export const PHOTOSHOOT_PERMISSIONS = ['photoshoot.read', 'photoshoot.write', 'photoshoot.generate', 'photoshoot.approve', 'photoshoot.publish'] as const satisfies readonly PermissionKey[];
export type PhotoshootPermission = (typeof PHOTOSHOOT_PERMISSIONS)[number];

export function checkStoreId(storeId: number): void {
  if (!Number.isInteger(storeId) || storeId < 1) throw new PhotoshootError('INVALID_INPUT', 'store id must be a positive integer', ['storeId']);
}

/** Throws unless the actor holds the permission in the store; answers every permission held there. */
export async function allow(deps: Pick<PhotoshootDeps, 'db'>, who: Who, permission: PhotoshootPermission): Promise<Set<PermissionKey>> {
  checkStoreId(who.storeId);
  return requirePermission(deps.db, who.actor, permission, { storeId: who.storeId });
}

/** Does the actor hold the permission in the store (no throw)? */
export const holds = (deps: Pick<PhotoshootDeps, 'db'>, who: Who, permission: PhotoshootPermission): Promise<boolean> => can(deps.db, who.actor, permission, { storeId: who.storeId });

/** An audit row (in the same transaction as the change when `db` is one). */
export function logChange(db: Db, who: Who, entry: { action: string; entityType: string; entityId: string; before: unknown; after: unknown }): Promise<void> {
  return audit(db, who.actor, { ...entry, storeId: who.storeId }, { source: 'admin-api', ...who.ctx });
}

/** Validates input; a failure names every bad field. */
export function parse<T extends z.ZodType>(schema: T, input: unknown, what: string): z.output<T> {
  const r = schema.safeParse(input ?? {});
  if (!r.success) throw new PhotoshootError('INVALID_INPUT', `the ${what} is not valid`, r.error.issues.map((i) => `${i.path.join('.') || '(input)'}: ${i.message}`));
  return r.data;
}

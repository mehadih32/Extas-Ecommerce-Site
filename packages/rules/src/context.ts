// What every rules service gets: the database, the settings (through the two-tier resolver, PR 492) and who acts in
// which store. Like the catalogue and the inventory, every service checks the permission itself (B6.5), scopes rows by
// `storeId` (A4.1) and writes the audit log in the same transaction as the change.
import type { Prisma, PrismaClient } from '@extas/db/client';
import { audit, can, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import type { Key, Value } from '@extas/settings';
import type { z } from 'zod';
import type { CheckLimits } from './check';
import { RulesError } from './errors';
import type { NoticeLimits } from './notices-model';
import type { TextContext } from './text';

export type Db = PrismaClient | Prisma.TransactionClient;
export type Tx = Prisma.TransactionClient;

/** Reads effective settings for a store (the app passes its SettingsResolver). */
export interface SettingsReader {
  value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>>;
}

export interface RulesDeps {
  db: PrismaClient;
  settings: SettingsReader;
  /** Clock, for tests. */
  now?: () => Date;
}

export interface Who {
  actor: Actor;
  storeId: number;
  ctx?: RequestContext;
}

export type RulesPermission = 'rules.read' | 'rules.write' | 'rules.publish' | 'rules.approve';

export const nowOf = (deps: Pick<RulesDeps, 'now'>) => deps.now?.() ?? new Date();

/** Checks the permission in that store and that the store exists and is not archived. */
export async function allow(deps: RulesDeps, who: Who, permission: RulesPermission): Promise<void> {
  checkStoreId(who.storeId);
  await requirePermission(deps.db, who.actor, permission, { storeId: who.storeId });
  const store = await deps.db.store.findUnique({ where: { id: who.storeId }, select: { archivedAt: true } });
  if (!store || store.archivedAt) throw new RulesError('NOT_FOUND', 'no such store', ['storeId']);
}

/** Does the actor hold the permission in the store (no throw)? */
export const holds = (deps: RulesDeps, who: Who, permission: RulesPermission) => can(deps.db, who.actor, permission, { storeId: who.storeId });

export function checkStoreId(storeId: number): void {
  if (!Number.isInteger(storeId) || storeId < 1) throw new RulesError('INVALID_INPUT', 'store id must be a positive integer', ['storeId']);
}

/** One setting for the store. */
export const setting = <K extends Key>(deps: Pick<RulesDeps, 'settings'>, storeId: number, key: K): Promise<Value<K>> => deps.settings.value(key, { storeId });

/** Validates input; a failure names every bad field. */
export function parse<T extends z.ZodType>(schema: T, input: unknown, what: string): z.output<T> {
  const r = schema.safeParse(input ?? {});
  if (!r.success) {
    throw new RulesError('INVALID_INPUT', `the ${what} is not valid`, r.error.issues.map((i) => `${i.path.join('.') || '(input)'}: ${i.message}`));
  }
  return r.data;
}

/** An audit row (same transaction as the change). */
export function logChange(db: Db, who: Who, entry: { action: string; entityType: string; entityId: string; before: unknown; after: unknown }): Promise<void> {
  return audit(db, who.actor, { ...entry, storeId: who.storeId }, { source: 'admin-api', ...who.ctx });
}

export function found<T>(row: T | null | undefined, what: string): T {
  if (!row) throw new RulesError('NOT_FOUND', `no such ${what}`);
  return row;
}

/** The store's language, currency and time zone, for writing values into texts. */
export async function textContext(deps: Pick<RulesDeps, 'settings'>, storeId: number, locale?: string): Promise<TextContext> {
  const [storeLocale, currency, timeZone] = await Promise.all([setting(deps, storeId, 'store.locale'), setting(deps, storeId, 'store.currency'), setting(deps, storeId, 'store.timeZone')]);
  return { locale: locale ?? storeLocale, currency, timeZone };
}

/** The limits a rule is checked against (all from settings). */
export async function checkLimits(deps: Pick<RulesDeps, 'settings'>, storeId: number): Promise<CheckLimits> {
  const [shortMaxChars, fullMaxChars, maxPercentOff, placements] = await Promise.all([
    setting(deps, storeId, 'rules.text.shortMaxChars'),
    setting(deps, storeId, 'rules.text.fullMaxChars'),
    setting(deps, storeId, 'rules.discount.maxPercentOff'),
    setting(deps, storeId, 'rules.placements'),
  ]);
  return { shortMaxChars, fullMaxChars, maxPercentOff, placements: placements.map((p) => p.key) };
}

export async function noticeLimits(deps: Pick<RulesDeps, 'settings'>, storeId: number): Promise<NoticeLimits> {
  const [minDelaySeconds, minScrollPercent, placements] = await Promise.all([
    setting(deps, storeId, 'notices.popup.minDelaySeconds'),
    setting(deps, storeId, 'notices.popup.minScrollPercent'),
    setting(deps, storeId, 'rules.placements'),
  ]);
  return { minDelaySeconds, minScrollPercent, placements: placements.map((p) => p.key) };
}

/** Transaction options for writes that touch several rows. */
export const TX = { maxWait: 10_000, timeout: 60_000 } as const;

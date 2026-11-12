// What every S25 Studio service gets: the database, the settings (through the two-tier resolver), who acts and in
// which store. Every service checks its own permission (B6.5), scopes every query by `storeId` (A4.1) and writes
// the audit log in the same transaction as the change — the same shape packages/catalogue/src/context.ts uses.
import type { Prisma, PrismaClient } from '@extas/db/client';
import type { Actor, RequestContext } from '@extas/auth';
import type { Key, Value } from '@extas/settings';

export type Db = PrismaClient | Prisma.TransactionClient;
export type Tx = Prisma.TransactionClient;

/** Reads effective settings for a store (the app passes its SettingsResolver). */
export interface SettingsReader {
  value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>>;
}

export interface StudioDeps {
  db: PrismaClient;
  /** Only the services that read a setting need it (e.g. the master switch, PR 482). */
  settings?: SettingsReader;
  /** Clock, for tests. */
  now?: () => Date;
}

/** Who acts, in which store, and from where (for the audit log). */
export interface Who {
  actor: Actor;
  storeId: number;
  ctx?: RequestContext;
}

export type StudioPermission = 'marketing.studio.read' | 'marketing.studio.write' | 'marketing.studio.approve';

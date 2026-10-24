// What every job and the worker get: the database, the settings (through the two-tier resolver, PR 492), the
// inventory's dependencies (the ERP connection layer with the vault's keys, PR 18/493) and a clock for tests.
import type { PrismaClient } from '@extas/db/client';
import type { InventoryDeps, SettingsReader } from '@extas/inventory';
import type { MessagesDeps } from '@extas/messages';
import type { MeiliConfig } from '@extas/search';

export type { SettingsReader };

export interface JobDeps {
  db: PrismaClient;
  settings: SettingsReader;
  /** The inventory jobs' dependencies (same database and settings, plus the ERP connection layer). */
  inventory: InventoryDeps;
  /** PR 72: the server's Meilisearch (MEILI_URL and its key), or null — the search index job then does nothing. */
  search?: { meili: MeiliConfig | null };
  /** PR 148: the message senders (SMS, WhatsApp, e-mail; each the mock until its key is entered), or none — no message job. */
  messages?: { sender: MessagesDeps['sender'] };
  /** Clock, for tests. */
  now?: () => Date;
}

export const nowOf = (deps: Pick<JobDeps, 'now'>): Date => deps.now?.() ?? new Date();

/** At most this many characters of a failure reason are kept on a JobRun row (a technical bound, not a setting). */
export const MAX_ERROR = 500;

/** A failure as one line: the error's message, no stack, never longer than MAX_ERROR. */
export function errorLine(e: unknown): string {
  const text = e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e);
  const line = (text ?? 'unknown error').split('\n').map((l) => l.trim()).filter(Boolean).join(' · ') || 'unknown error';
  return line.slice(0, MAX_ERROR);
}

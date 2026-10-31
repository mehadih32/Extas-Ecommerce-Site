// S19 · PR 392 — the vault's keys for the server's own scripts. The server's shell scripts (extas-monitor's Telegram
// alerts, extas-backup's Blob and Drive copies) cannot open the vault themselves: the vault lives in the database and
// its master key in the app's secrets. `infra/server/bin/extas-vault-sync` (a timer on the VM) runs this, through
// `server-sync-cli.ts`, in the live version's migrate image, and writes what it returns into the server's root-only
// `config/secrets/` folder (0600), one file per part:
//   telegram.env   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID — only while the Telegram connection is on and LIVE (its Test
//                  passed); empty otherwise, so the server's alerts stay in its log, never on a half-set bot.
// Later parts (PR 395, 507) add the backup copies' keys and the backup settings the same way.
//
// - Nothing is read from the vault when nothing it depends on changed: every run first works out a fingerprint of the
//   connection rows, the vault's list (names, dates, never a value) and each part's own inputs; the server passes back
//   the last fingerprint, and an unchanged one ends the run without decrypting anything (no access-log row a minute).
// - Values are written single-quoted for the shell (`. telegram.env`), so no value can run as a command.
// - It never prints a value: the CLI prints the file names only.
import { createHash } from 'node:crypto';
import type { PrismaClient } from '@extas/db/client';
import type { Vault } from '@extas/vault';

type Db = Pick<PrismaClient, 'integration'>;

export interface SyncDeps {
  db: Db;
  /** Null when the server has no vault key yet: every part is then empty. */
  vault: Pick<Vault, 'get' | 'list'> | null;
}

/** One installation-wide connection as the parts see it (never a secret). */
export interface SyncConnection {
  id: string;
  kind: string;
  provider: string;
  mode: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface PartContext extends SyncDeps {
  connections: readonly SyncConnection[];
  /** One secret of the installation, read for the server (logged by the vault as `server-sync`). */
  secret(name: string): Promise<string | null>;
}

export interface ServerFilePart {
  /** The file name in the server's `config/secrets/`. */
  file: string;
  /** What, besides the connections and the vault's list, decides this file (never a secret value). */
  watch?(ctx: Omit<PartContext, 'secret'>): Promise<unknown>;
  build(ctx: PartContext): Promise<string>;
}

/** The file's name: letters, digits, dots, dashes; never a path. */
const FILE = /^[a-z][a-z0-9.-]{0,40}$/;

/** A value for a shell `KEY='value'` line: single-quoted, a quote inside closed and reopened. Newlines are refused. */
export function shellValue(v: string): string {
  if (/[\r\n\0]/.test(v)) throw new Error('a value for the server may not hold a line break');
  return `'${v.replaceAll("'", `'\\''`)}'`;
}

export function envLines(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([k, v]) => {
      if (!/^[A-Z][A-Z0-9_]*$/.test(k)) throw new Error(`not an env name: ${k}`);
      return `${k}=${shellValue(v)}\n`;
    })
    .join('');
}

/** The connection the server should use for `kind`: switched on, LIVE (its Test passed) and installation-wide. */
export const liveConnection = (ctx: Pick<PartContext, 'connections'>, kind: string, provider?: string): SyncConnection | null =>
  ctx.connections.find((c) => c.kind === kind && c.enabled && c.mode === 'LIVE' && (!provider || c.provider === provider)) ?? null;

/** PR 392: the owner's Telegram bot for the server's alerts. */
export const telegramPart: ServerFilePart = {
  file: 'telegram.env',
  async build(ctx) {
    const c = liveConnection(ctx, 'TELEGRAM', 'telegram');
    const chat = typeof c?.config.chatId === 'string' ? c.config.chatId.trim() : '';
    if (!c || !chat) return '';
    const token = await ctx.secret('telegram.botToken');
    if (!token) return '';
    return envLines({ TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chat });
  },
};

export const defaultParts: ServerFilePart[] = [telegramPart];

export interface SyncResult {
  fingerprint: string;
  /** Null: nothing changed since `previous`, nothing was read from the vault. */
  files: Record<string, string> | null;
}

async function connectionsOf(db: Db): Promise<SyncConnection[]> {
  const rows = await db.integration.findMany({ where: { storeId: null, archivedAt: null }, orderBy: { createdAt: 'asc' } });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    provider: r.provider,
    mode: r.mode,
    enabled: r.enabled,
    config: (r.config ?? {}) as Record<string, unknown>,
  }));
}

/** Every part's file, or null when the fingerprint is the server's last one. */
export async function serverSync(deps: SyncDeps, opts: { previous?: string | null; parts?: readonly ServerFilePart[] } = {}): Promise<SyncResult> {
  const parts = opts.parts ?? defaultParts;
  for (const p of parts) if (!FILE.test(p.file)) throw new Error(`not a server file name: ${p.file}`);
  const connections = await connectionsOf(deps.db);
  const listed = deps.vault ? await deps.vault.list({ storeId: null }) : [];
  const base = { ...deps, connections };
  const watched = [] as unknown[];
  for (const p of parts) watched.push(p.watch ? await p.watch(base) : null);
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        vault: Boolean(deps.vault),
        connections,
        secrets: listed.map((s) => [s.name, s.revoked, s.keyVersion, s.updatedAt.toISOString()]),
        watched,
        parts: parts.map((p) => p.file),
      }),
    )
    .digest('hex');
  if (opts.previous && opts.previous === fingerprint) return { fingerprint, files: null };

  const vault = deps.vault;
  const ctx: PartContext = {
    ...base,
    secret: (name) => (vault ? vault.get(name, { storeId: null }, { service: 'server-sync', purpose: 'the server scripts' }) : Promise.resolve(null)),
  };
  const files: Record<string, string> = {};
  for (const p of parts) files[p.file] = await p.build(ctx);
  return { fingerprint, files };
}

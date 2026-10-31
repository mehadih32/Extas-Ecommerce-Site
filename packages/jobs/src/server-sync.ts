// S19 · PR 392 — the vault's keys for the server's own scripts. The server's shell scripts (extas-monitor's Telegram
// alerts, extas-backup's Blob and Drive copies) cannot open the vault themselves: the vault lives in the database and
// its master key in the app's secrets. `infra/server/bin/extas-vault-sync` (a timer on the VM) runs this, through
// `server-sync-cli.ts`, in the live version's migrate image, and writes what it returns into the server's root-only
// `config/secrets/` folder (0600), one file per part:
//   telegram.env   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID — only while the Telegram connection is on and LIVE (its Test
//                  passed); empty otherwise, so the server's alerts stay in its log, never on a half-set bot.
//   backup.env     PR 395 (CN-030): the one-click Google Drive for rclone (the owner's client, the refresh token, the
//                  scope drive.file, the backup folder as the remote's root) and how many checked copies Drive keeps
//                  (`backups.drive.keepCopies`); empty while Drive is not connected (the server says "not connected").
//   backup.key     the key that locks the Drive copies, made in the vault at the first connect (never emptied on the
//                  server: no key in the vault keeps the server's own).
//   backup-settings.env  PR 507: the backup settings of Settings → System → Backups for extas-backup, extas-restore
//                  and extas-monitor (the time, the days kept, the free share, the monthly drill, Telegram); built
//                  from the settings alone, so it is there before any key is.
// Later parts (PR 391) add the Blob copy the same way.
//
// - Nothing is read from the vault when nothing it depends on changed: every run first works out a fingerprint of the
//   connection rows, the vault's list (names, dates, never a value) and each part's own inputs; the server passes back
//   the last fingerprint, and an unchanged one ends the run without decrypting anything (no access-log row a minute).
// - Values are written single-quoted for the shell (`. telegram.env`), so no value can run as a command.
// - It never prints a value: the CLI prints the file names only.
import { createHash } from 'node:crypto';
import type { PrismaClient } from '@extas/db/client';
import { registry } from '@extas/settings';
import type { Vault } from '@extas/vault';

type Db = Pick<PrismaClient, 'integration'>;

export interface SyncDeps {
  db: Db;
  /** Null when the server has no vault key yet: every part is then empty. */
  vault: Pick<Vault, 'get' | 'list'> | null;
  /** The installation's settings (the backup settings); absent: every part uses its registry default. */
  settings?: { value(key: string): Promise<unknown> };
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

/** A setting's value, or `fallback` when there is no resolver (tests) or it cannot be read. */
async function settingOr<T>(ctx: Pick<SyncDeps, 'settings'>, key: string, fallback: T): Promise<T> {
  if (!ctx.settings) return fallback;
  try {
    return ((await ctx.settings.value(key)) as T) ?? fallback;
  } catch {
    return fallback;
  }
}

const DRIVE_DEFAULT = registry['backups.drive'].default;

/** PR 395 (CN-030): the one-click Google Drive for the server's rclone copy. */
export const backupPart: ServerFilePart = {
  file: 'backup.env',
  watch: (ctx) => settingOr(ctx, 'backups.drive', DRIVE_DEFAULT),
  async build(ctx) {
    const values: Record<string, string> = {};
    const drive = liveConnection(ctx, 'GOOGLE_DRIVE', 'googleDrive');
    const clientId = typeof drive?.config.clientId === 'string' ? drive.config.clientId : '';
    const folderId = typeof drive?.config.folderId === 'string' ? drive.config.folderId : '';
    if (drive && clientId && folderId) {
      const [secret, token] = [await ctx.secret('googleDrive.clientSecret'), await ctx.secret('googleDrive.refreshToken')];
      if (secret && token) {
        const keep = (await settingOr(ctx, 'backups.drive', DRIVE_DEFAULT)).keepCopies;
        Object.assign(values, {
          RCLONE_CONFIG_DRIVE_TYPE: 'drive',
          RCLONE_CONFIG_DRIVE_CLIENT_ID: clientId,
          RCLONE_CONFIG_DRIVE_CLIENT_SECRET: secret,
          RCLONE_CONFIG_DRIVE_SCOPE: 'drive.file',
          RCLONE_CONFIG_DRIVE_ROOT_FOLDER_ID: folderId,
          // An expired access token: rclone gets a fresh one from the refresh token at once.
          RCLONE_CONFIG_DRIVE_TOKEN: JSON.stringify({ access_token: '', token_type: 'Bearer', refresh_token: token, expiry: '2000-01-01T00:00:00Z' }),
          BACKUP_DRIVE_FOLDER: '',
          BACKUP_DRIVE_KEEP: String(keep),
        });
      }
    }
    return Object.keys(values).length ? envLines(values) : '';
  },
};

/** PR 395: the key of the Drive copies (one line, base64). */
export const backupKeyPart: ServerFilePart = {
  file: 'backup.key',
  async build(ctx) {
    const k = await ctx.secret('googleDrive.backupKey');
    return k && /^[A-Za-z0-9+/=]{40,200}$/.test(k) ? `${k}\n` : '';
  },
};

const yesNo = (b: boolean) => (b ? 'yes' : 'no');

/** PR 507: the backup settings for the server's scripts (they read it after server.conf, so it wins). */
export const backupSettingsPart: ServerFilePart = {
  file: 'backup-settings.env',
  watch: async (ctx) => [
    await settingOr(ctx, 'backups.plan', registry['backups.plan'].default),
    await settingOr(ctx, 'backups.drill', registry['backups.drill'].default),
    await settingOr(ctx, 'backups.alerts', registry['backups.alerts'].default),
  ],
  async build(ctx) {
    const plan = await settingOr(ctx, 'backups.plan', registry['backups.plan'].default);
    const drill = await settingOr(ctx, 'backups.drill', registry['backups.drill'].default);
    const alerts = await settingOr(ctx, 'backups.alerts', registry['backups.alerts'].default);
    return envLines({
      BACKUP_TIME: plan.dailyTime,
      BACKUP_KEEP_LOCAL_DAYS: String(plan.keepLocalDays),
      BACKUP_KEEP_BLOB_DAYS: String(plan.keepBlobDays),
      BACKUP_KEEP_DRIVE_DAYS: String(plan.keepDriveDays),
      BACKUP_KEEP_LOCAL_WAL_DAYS: String(plan.keepLocalWalDays),
      BACKUP_MIN_FREE_PCT: String(plan.minFreePct),
      BACKUP_DRILL_ON: yesNo(drill.enabled),
      BACKUP_DRILL_DAY: String(drill.dayOfMonth),
      BACKUP_DRILL_TIME: drill.time,
      BACKUP_DRILL_BLOB: yesNo(drill.blob),
      BACKUP_DRILL_DRIVE: yesNo(drill.drive),
      BACKUP_TELEGRAM_FAIL: yesNo(alerts.telegramOnFail),
      BACKUP_TELEGRAM_OK: yesNo(alerts.telegramOnSuccess),
    });
  },
};

export const defaultParts: ServerFilePart[] = [telegramPart, backupPart, backupKeyPart, backupSettingsPart];

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

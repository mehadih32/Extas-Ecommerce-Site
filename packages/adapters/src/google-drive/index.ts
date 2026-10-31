// S19 · PR 395 (CN-030) — the Google Drive connection of the backups. Its keys are the owner's Google client secret and
// the refresh token the one-click sign-in returns (both in the vault); its plain settings are the client id, the backup
// folder's id and name and the signed-in account. It is set up on Settings → System → Backups (`managedAt`), never by
// typing a token: the screen shows a code, the owner enters it at google.com/device and presses Allow.
// The server's own copy (extas-backup, rclone) uploads the files with the same client and token
// (packages/jobs/src/server-sync.ts `backup.env`); this adapter reads the account, the free space and the backups.
import { z } from 'zod';
import { defineAdapter, requireSecret } from '../define';
import { CHECKED_MARKER, createDriveClient, DriveError, type DriveEndpoints } from './client';

export * from './client';
export * from './fake';

export const GOOGLE_DRIVE_PROVIDER = 'googleDrive';

/** One backup in Drive: a dated folder of encrypted files. */
export interface DriveBackup {
  id: string;
  /** The backup's stamp (YYYYMMDD-HHMM), the folder's name. */
  name: string;
  createdTime: string | null;
  files: number;
  bytes: number;
  /** The server checked every file after the upload (the CHECKED marker is there). */
  checked: boolean;
}

export interface DriveOverview {
  account: string | null;
  freeBytes: number | null;
  totalBytes: number | null;
  folderOk: boolean;
}

export interface DriveBackupsApi {
  provider: string;
  /** The practice Drive: nothing goes to Google. */
  practice?: boolean;
  overview(): Promise<DriveOverview>;
  /** The backups in the shop's folder, newest first. */
  backups(): Promise<DriveBackup[]>;
}

const https = z.url({ protocol: /^https$/, message: 'not an https address' }).max(500);

export const googleDriveConfig = z.object({
  /** The owner's own OAuth client of the type "TVs and Limited Input devices". */
  clientId: z.string().trim().min(10).max(200).regex(/^[A-Za-z0-9._-]+$/, 'a Google client id (….apps.googleusercontent.com)'),
  /** The backup folder in his Drive (made at the first connect). */
  folderId: z.string().min(1).max(200).optional(),
  folderName: z.string().max(200).optional(),
  /** The Google account that pressed Allow. */
  account: z.string().max(320).optional(),
  /** Only for the fake Google of the tests and a test server. */
  oauthBase: https.optional(),
  driveBase: https.optional(),
});
export type GoogleDriveConfig = z.output<typeof googleDriveConfig>;

const STAMP = /^\d{8}-\d{4}$/;

export function createDriveBackups(o: { clientId: string; clientSecret: string; refreshToken: string; folderId: string } & DriveEndpoints): DriveBackupsApi {
  const g = createDriveClient({ clientId: o.clientId, clientSecret: o.clientSecret }, o);
  let token: { value: string; at: number } | null = null;
  const access = async () => {
    if (!token || Date.now() - token.at > 45 * 60_000) token = { value: await g.accessToken(o.refreshToken), at: Date.now() };
    return token.value;
  };
  return {
    provider: GOOGLE_DRIVE_PROVIDER,
    async overview() {
      const t = await access();
      const [account, quota, folderOk] = await Promise.all([g.accountEmail(t), g.storageQuota(t), g.folderExists(t, o.folderId)]);
      return { account, ...quota, folderOk };
    },
    async backups() {
      const t = await access();
      const folders = (await g.listFolders(t, o.folderId)).filter((f) => STAMP.test(f.name));
      const out: DriveBackup[] = [];
      for (const f of folders) {
        const files = await g.listFiles(t, f.id);
        const data = files.filter((x) => x.name !== CHECKED_MARKER);
        out.push({
          id: f.id,
          name: f.name,
          createdTime: f.createdTime ?? null,
          files: data.length,
          bytes: data.reduce((s, x) => s + Number(x.size ?? 0), 0),
          checked: files.some((x) => x.name === CHECKED_MARKER),
        });
      }
      return out.sort((a, b) => b.name.localeCompare(a.name));
    },
  };
}

/** The practice Drive (no Google client yet): nothing connected, no backups. */
export function mockDriveBackups(): DriveBackupsApi {
  return {
    provider: GOOGLE_DRIVE_PROVIDER,
    practice: true,
    async overview() {
      return { account: null, freeBytes: null, totalBytes: null, folderOk: false };
    },
    async backups() {
      return [];
    },
  };
}

export const googleDriveAdapter = defineAdapter<DriveBackupsApi, GoogleDriveConfig>({
  kind: 'GOOGLE_DRIVE',
  provider: GOOGLE_DRIVE_PROVIDER,
  modes: ['LIVE'],
  secrets: ['clientSecret', 'refreshToken'],
  configSchema: googleDriveConfig,
  async create(ctx) {
    if (!ctx.config.folderId) throw new DriveError('Google Drive is not connected yet: press Connect Google Drive', 409, true);
    return createDriveBackups({
      clientId: ctx.config.clientId,
      clientSecret: await requireSecret(ctx, 'clientSecret'),
      refreshToken: await requireSecret(ctx, 'refreshToken'),
      folderId: ctx.config.folderId,
      oauthBase: ctx.config.oauthBase,
      driveBase: ctx.config.driveBase,
    });
  },
  async mock() {
    return mockDriveBackups();
  },
  async test(api) {
    try {
      if (api.practice) return { ok: true, message: 'practice Drive: nothing is sent to Google' };
      const o = await api.overview();
      if (!o.folderOk) return { ok: false, message: 'The backup folder is gone from Google Drive (deleted or in the bin): connect again' };
      return { ok: true, message: `Google Drive: ${o.account ?? 'the account'} — the backup folder is there` };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  },
});

export const googleDriveAdapters = [googleDriveAdapter] as const;

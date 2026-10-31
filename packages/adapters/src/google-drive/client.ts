// S19 · PR 395 (CN-030) — Google Drive for the backups, over plain HTTPS, the same sign-in as the Extas ERP's Backups
// screen: the owner's own OAuth client of the type "TVs and Limited Input devices" and the one scope `drive.file`, so the
// shop sees only the files it made itself. No web client, no redirect address, no service account.
//   connect      startDeviceSignIn → the owner enters the code at google.com/device → pollDeviceSignIn
//   each use     accessToken (from the refresh token) → the folder, the account, the free space, the backups
// The addresses are options (`oauthBase`, `driveBase`): only the tests and the practice mode point them at the fake
// Google (fake.ts). Every error says what failed in words; none carries a token, a code or a secret.
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const FOLDER_MIME = 'application/vnd.google-apps.folder';
export const GOOGLE_OAUTH_BASE = 'https://oauth2.googleapis.com';
export const GOOGLE_DRIVE_BASE = 'https://www.googleapis.com';
/** The label the shop puts on its own backup folder, so a new server finds it again (invisible in Drive). */
export const FOLDER_LABEL = { key: 'extasShop', value: 'backups' } as const;
/** The name of the file the server writes into a backup's folder once every file in it was checked (extas-backup). */
export const CHECKED_MARKER = 'CHECKED';

export interface GoogleClient {
  clientId: string;
  clientSecret: string;
}

export interface DriveEndpoints {
  oauthBase?: string;
  driveBase?: string;
  fetch?: typeof fetch;
}

export class DriveError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** The connection itself is gone (revoked, expired, a deleted client): the owner must connect again. */
    readonly reconnect = false,
  ) {
    super(message);
    this.name = 'DriveError';
  }
}

const trim = (s: string) => s.replace(/\/+$/, '');

export interface DeviceSignIn {
  deviceCode: string;
  /** What the owner types on Google's page ("ABCD-EFGH"). */
  userCode: string;
  /** Google's page to open, on a phone or a computer. */
  verificationUrl: string;
  expiresAt: Date;
  /** Seconds to wait between asks. */
  interval: number;
}

export type DevicePoll =
  | { status: 'waiting' }
  | { status: 'slower' }
  | { status: 'denied' }
  | { status: 'expired' }
  | { status: 'connected'; accessToken: string; refreshToken: string };

export interface DriveFile {
  id: string;
  name: string;
  createdTime?: string;
  size?: string;
  md5Checksum?: string;
  mimeType?: string;
  appProperties?: Record<string, string>;
}

const FIELDS = 'id,name,createdTime,size,md5Checksum,mimeType,appProperties';

export function createDriveClient(client: GoogleClient, opts: DriveEndpoints = {}) {
  const oauth = trim(opts.oauthBase ?? GOOGLE_OAUTH_BASE);
  const drive = `${trim(opts.driveBase ?? GOOGLE_DRIVE_BASE)}/drive/v3`;
  const doFetch = opts.fetch ?? fetch;

  async function send(url: string, init: RequestInit, what: string): Promise<Response> {
    try {
      return await doFetch(url, init);
    } catch {
      throw new DriveError(`${what}: Google did not answer`, 503);
    }
  }

  async function failure(res: Response, what: string): Promise<DriveError> {
    let detail = res.statusText || 'refused';
    try {
      const b = (await res.json()) as { error?: string | { message?: string }; error_description?: string };
      detail = b.error_description ?? (typeof b.error === 'string' ? b.error : b.error?.message) ?? detail;
    } catch {
      // not JSON: the status speaks
    }
    detail = detail.slice(0, 200);
    const reconnect = /invalid_grant|invalid_client|deleted_client|revoked|expired/i.test(detail) || res.status === 401;
    return new DriveError(`${what}: ${detail} (HTTP ${res.status})`, res.status, reconnect);
  }

  const form = (url: string, fields: Record<string, string>, what: string) =>
    send(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields) }, what);

  async function call<T>(token: string, url: string, init: RequestInit, what: string): Promise<T> {
    const res = await send(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } }, what);
    if (!res.ok) throw await failure(res, what);
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  async function search(token: string, q: string, what: string): Promise<DriveFile[]> {
    const out: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const p = new URLSearchParams({ q, fields: `nextPageToken,files(${FIELDS})`, pageSize: '1000', orderBy: 'createdTime desc' });
      if (pageToken) p.set('pageToken', pageToken);
      const r = await call<{ files?: DriveFile[]; nextPageToken?: string }>(token, `${drive}/files?${p}`, { method: 'GET' }, what);
      out.push(...(r.files ?? []));
      pageToken = r.nextPageToken || undefined;
    } while (pageToken);
    return out;
  }

  const quoted = (v: string) => `'${v.replace(/['\\]/g, '')}'`;

  return {
    /** Starts a sign-in: a code the owner enters at Google's device page. */
    async startDeviceSignIn(): Promise<DeviceSignIn> {
      const res = await form(`${oauth}/device/code`, { client_id: client.clientId, scope: DRIVE_SCOPE }, 'Google did not give a sign-in code');
      if (!res.ok) {
        const e = await failure(res, 'Google did not give a sign-in code');
        if (e.status === 401 || /invalid_client|unauthorized_client|client was not found/i.test(e.message)) {
          throw new DriveError('Google did not accept this client. It must be an OAuth client of the type "TVs and Limited Input devices".', e.status);
        }
        throw e;
      }
      const b = (await res.json()) as { device_code: string; user_code: string; verification_url?: string; verification_uri?: string; expires_in: number; interval?: number };
      return {
        deviceCode: b.device_code,
        userCode: b.user_code,
        verificationUrl: b.verification_url ?? b.verification_uri ?? 'https://www.google.com/device',
        expiresAt: new Date(Date.now() + b.expires_in * 1000),
        interval: b.interval ?? 5,
      };
    },

    /** Asks Google whether the owner has pressed Allow yet. */
    async pollDeviceSignIn(deviceCode: string): Promise<DevicePoll> {
      const res = await form(
        `${oauth}/token`,
        { client_id: client.clientId, client_secret: client.clientSecret, device_code: deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' },
        'Google sign-in failed',
      );
      const b = (await res.json().catch(() => ({}))) as { error?: string; access_token?: string; refresh_token?: string };
      if (res.ok && b.access_token) {
        if (!b.refresh_token) throw new DriveError('Google did not return a refresh token; connect again.', 400, true);
        return { status: 'connected', accessToken: b.access_token, refreshToken: b.refresh_token };
      }
      if (b.error === 'authorization_pending') return { status: 'waiting' };
      if (b.error === 'slow_down') return { status: 'slower' };
      if (b.error === 'access_denied') return { status: 'denied' };
      if (b.error === 'expired_token') return { status: 'expired' };
      throw new DriveError(`Google sign-in failed: ${(b.error ?? res.statusText).slice(0, 100)} (HTTP ${res.status})`, res.status, b.error === 'invalid_client');
    },

    /** A fresh access token (about an hour) from the stored refresh token. */
    async accessToken(refreshToken: string): Promise<string> {
      const res = await form(
        `${oauth}/token`,
        { refresh_token: refreshToken, client_id: client.clientId, client_secret: client.clientSecret, grant_type: 'refresh_token' },
        'Google Drive access failed',
      );
      if (!res.ok) throw await failure(res, 'Google Drive access failed');
      return ((await res.json()) as { access_token: string }).access_token;
    },

    /** Best effort: tells Google to forget the shop's access. */
    async revoke(refreshToken: string): Promise<void> {
      try {
        await doFetch(`${oauth}/revoke?token=${encodeURIComponent(refreshToken)}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      } catch {
        // disconnecting still forgets the token on the shop's side
      }
    },

    async accountEmail(token: string): Promise<string | null> {
      const a = await call<{ user?: { emailAddress?: string } }>(token, `${drive}/about?fields=user(emailAddress)`, { method: 'GET' }, 'Reading the Google account failed');
      return a.user?.emailAddress ?? null;
    },

    /** The Drive's space in bytes; both null when Google gives no limit. */
    async storageQuota(token: string): Promise<{ freeBytes: number | null; totalBytes: number | null }> {
      const a = await call<{ storageQuota?: { limit?: string; usage?: string } }>(token, `${drive}/about?fields=storageQuota(limit,usage)`, { method: 'GET' }, 'Reading the Drive space failed');
      const limit = Number(a.storageQuota?.limit);
      const usage = Number(a.storageQuota?.usage ?? 0);
      if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(usage)) return { freeBytes: null, totalBytes: null };
      return { freeBytes: Math.max(0, limit - usage), totalBytes: limit };
    },

    async createFolder(token: string, name: string, appProperties?: Record<string, string>, parentId?: string): Promise<DriveFile> {
      return call<DriveFile>(
        token,
        `${drive}/files?fields=${FIELDS}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=UTF-8' },
          body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}), ...(appProperties ? { appProperties } : {}) }),
        },
        'Creating the Drive folder failed',
      );
    },

    /** Whether a folder the shop made still exists (not deleted, not in the bin). */
    async folderExists(token: string, folderId: string): Promise<boolean> {
      const res = await send(`${drive}/files/${encodeURIComponent(folderId)}?fields=id,trashed`, { headers: { Authorization: `Bearer ${token}` } }, 'Checking the Drive folder failed');
      if (res.status === 404) return false;
      if (!res.ok) throw await failure(res, 'Checking the Drive folder failed');
      return !((await res.json()) as { trashed?: boolean }).trashed;
    },

    /** The shop's own backup folders (by their label), newest first. */
    findLabelledFolders(token: string): Promise<DriveFile[]> {
      return search(
        token,
        [`appProperties has { key=${quoted(FOLDER_LABEL.key)} and value=${quoted(FOLDER_LABEL.value)} }`, 'trashed = false', `mimeType = '${FOLDER_MIME}'`].join(' and '),
        'Looking for the backup folder in Drive failed',
      );
    },

    listFolders(token: string, parentId: string): Promise<DriveFile[]> {
      return search(token, [`${quoted(parentId)} in parents`, 'trashed = false', `mimeType = '${FOLDER_MIME}'`].join(' and '), 'Listing the backups in Drive failed');
    },

    listFiles(token: string, folderId: string): Promise<DriveFile[]> {
      return search(token, [`${quoted(folderId)} in parents`, 'trashed = false'].join(' and '), "Listing a backup's files in Drive failed");
    },
  };
}

export type DriveClient = ReturnType<typeof createDriveClient>;

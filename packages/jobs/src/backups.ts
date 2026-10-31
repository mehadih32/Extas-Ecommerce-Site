// S19 · PR 395 (CN-030) — the one-click Google Drive connection of the backups, the same way as the Extas ERP:
//   1. the owner's own Google client (an OAuth client of the type "TVs and Limited Input devices", scope `drive.file`):
//      the client id on the connection, the client secret in the vault (`setDriveClient`, with the PIN when one is
//      already set: changing it ends the connection, so Drive has to be connected again);
//   2. Connect Google Drive (`startDriveConnect`): Google gives a code; the screen shows it with google.com/device; the
//      device code waits in the vault, the code shown on the connection;
//   3. the screen asks (`pollDriveConnect`) until the owner pressed Allow: the refresh token goes into the vault, the
//      backup folder ("Extas E-commerce Backups", setting `backups.drive.folderName`) is found by its label or made,
//      the account is kept, the connection becomes LIVE, and the backup key is made in the vault if there is none;
//   4. Disconnect (`disconnectDrive`): Google is told to forget the access, the token is revoked in the vault (the row
//      stays; nothing is deleted) and the connection goes back to practice.
// One connection per installation (the backups are the whole installation's; a new owner's installation has its own).
// The refresh token, the client secret, the device code and the backup key live only in the vault; nothing here logs,
// returns or audits a value. The checks of who may do it (vault.write, the owner's PIN) are the caller's (the API).
import { randomBytes } from 'node:crypto';
import type { Prisma, PrismaClient } from '@extas/db/client';
import { createDriveBackups, createDriveClient, DriveError, FOLDER_LABEL, type DriveBackup, type DriveEndpoints, type DriveOverview } from '@extas/adapters';
import type { Vault } from '@extas/vault';

export const DRIVE_NAME = 'googleDrive';
/** A vault name of the Drive connection (`googleDrive.<field>`). */
const vaultName = <F extends string>(field: F) => `${DRIVE_NAME}.${field}` as const;
/** The vault names: the owner's client secret, Google's refresh token, the waiting sign-in, the Drive copies' key. */
export const DRIVE_SECRET = {
  clientSecret: vaultName('clientSecret'),
  refreshToken: vaultName('refreshToken'),
  deviceCode: vaultName('deviceCode'),
  backupKey: vaultName('backupKey'),
};

export interface BackupDeps {
  db: Pick<PrismaClient, 'integration'>;
  vault: Pick<Vault, 'get' | 'put' | 'revoke' | 'list'>;
  /** Only the tests and the practice mode point Google's addresses elsewhere (the fake Google). */
  endpoints?: DriveEndpoints;
  now?: () => Date;
}

export interface Who {
  actorId: string | null;
}

interface DriveConfig {
  clientId?: string;
  folderId?: string;
  folderName?: string;
  account?: string;
  pending?: { userCode: string; verificationUrl: string; expiresAt: string; interval: number } | null;
  oauthBase?: string;
  driveBase?: string;
}

export interface DriveView {
  client: { clientId: string; secretSet: boolean } | null;
  connected: boolean;
  account: string | null;
  folderId: string | null;
  folderName: string | null;
  /** A sign-in waiting for the owner's Allow (the code to show), or null. */
  pending: { userCode: string; verificationUrl: string; expiresAt: string; interval: number } | null;
  lastTest: { at: string; ok: boolean; message: string | null } | null;
}

export class BackupError extends Error {
  constructor(
    readonly code: 'NO_CLIENT' | 'NOT_CONNECTED' | 'NO_SIGN_IN' | 'INVALID_INPUT' | 'GOOGLE',
    message: string,
  ) {
    super(message);
    this.name = 'BackupError';
  }
}

const vaultWho = (w: Who, purpose: string) => ({ actorId: w.actorId, service: 'admin:backups', purpose });
const now = (d: BackupDeps) => (d.now ? d.now() : new Date());
const json = (v: DriveConfig) => v as unknown as Prisma.InputJsonValue;
/** A Google client id: "….apps.googleusercontent.com" (letters, digits, dots, dashes). */
export const CLIENT_ID = /^[0-9]{6,30}-[a-z0-9]{10,64}\.apps\.googleusercontent\.com$/;

async function row(d: BackupDeps) {
  return d.db.integration.findFirst({ where: { storeId: null, kind: 'GOOGLE_DRIVE', provider: 'googleDrive', name: DRIVE_NAME, archivedAt: null } });
}
const configOf = (r: { config: unknown } | null): DriveConfig => (r?.config ?? {}) as DriveConfig;
const endpointsOf = (d: BackupDeps, c: DriveConfig): DriveEndpoints => ({ oauthBase: c.oauthBase, driveBase: c.driveBase, ...d.endpoints });

async function secretSet(d: BackupDeps, name: string): Promise<boolean> {
  const s = (await d.vault.list({ storeId: null })).find((x) => x.name === name);
  return Boolean(s && !s.revoked);
}

export async function driveView(d: BackupDeps): Promise<DriveView> {
  const r = await row(d);
  const c = configOf(r);
  const pending = c.pending && new Date(c.pending.expiresAt) > now(d) ? c.pending : null;
  return {
    client: c.clientId ? { clientId: c.clientId, secretSet: await secretSet(d, DRIVE_SECRET.clientSecret) } : null,
    connected: Boolean(r?.enabled && r.mode === 'LIVE' && c.folderId),
    account: r?.enabled ? (c.account ?? null) : null,
    folderId: c.folderId ?? null,
    folderName: c.folderName ?? null,
    pending,
    lastTest: r?.lastTestAt ? { at: r.lastTestAt.toISOString(), ok: r.lastTestOk === true, message: r.lastTestMessage } : null,
  };
}

async function client(d: BackupDeps, w: Who, c: DriveConfig) {
  if (!c.clientId) throw new BackupError('NO_CLIENT', 'Give your Google client first (client ID and secret)');
  const secret = await d.vault.get(DRIVE_SECRET.clientSecret, { storeId: null }, vaultWho(w, 'Google Drive sign-in'));
  if (!secret) throw new BackupError('NO_CLIENT', 'The Google client secret is not saved: give the client again');
  return createDriveClient({ clientId: c.clientId, clientSecret: secret }, endpointsOf(d, c));
}

/** Ends the connection: Google forgets the access (best effort), the token is revoked in the vault, back to practice. */
async function endConnection(d: BackupDeps, w: Who, c: DriveConfig): Promise<void> {
  const token = await d.vault.get(DRIVE_SECRET.refreshToken, { storeId: null }, vaultWho(w, 'Google Drive disconnect'));
  if (token && c.clientId) {
    const secret = await d.vault.get(DRIVE_SECRET.clientSecret, { storeId: null }, vaultWho(w, 'Google Drive disconnect'));
    if (secret) await createDriveClient({ clientId: c.clientId, clientSecret: secret }, endpointsOf(d, c)).revoke(token);
  }
  if (token) await d.vault.revoke(DRIVE_SECRET.refreshToken, { storeId: null }, vaultWho(w, 'Google Drive disconnect'));
}

/** The owner's own Google client. Changing it ends the connection (Drive must be connected again). */
export async function setDriveClient(d: BackupDeps, w: Who, input: { clientId: string; clientSecret: string }): Promise<{ endedConnection: boolean }> {
  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret.trim();
  if (!CLIENT_ID.test(clientId)) throw new BackupError('INVALID_INPUT', 'clientId');
  if (clientSecret.length < 10 || clientSecret.length > 200 || /\s/.test(clientSecret)) throw new BackupError('INVALID_INPUT', 'clientSecret');
  const r = await row(d);
  const c = configOf(r);
  const wasConnected = Boolean(r?.enabled && r.mode === 'LIVE');
  await endConnection(d, w, c);
  await d.vault.put(DRIVE_SECRET.clientSecret, clientSecret, { storeId: null }, vaultWho(w, 'Google client'));
  const config: DriveConfig = { clientId, folderId: c.folderId, folderName: c.folderName, oauthBase: c.oauthBase, driveBase: c.driveBase, pending: null };
  const data = { mode: 'MOCK' as const, enabled: false, config: json(config), secretNames: [DRIVE_SECRET.clientSecret, DRIVE_SECRET.refreshToken] };
  if (r) await d.db.integration.update({ where: { id: r.id }, data });
  else await d.db.integration.create({ data: { storeId: null, kind: 'GOOGLE_DRIVE', provider: 'googleDrive', name: DRIVE_NAME, ...data } });
  return { endedConnection: wasConnected };
}

/** Connect Google Drive: Google's code for the owner to enter at google.com/device. */
export async function startDriveConnect(d: BackupDeps, w: Who): Promise<NonNullable<DriveView['pending']>> {
  const r = await row(d);
  const c = configOf(r);
  const g = await client(d, w, c);
  let s;
  try {
    s = await g.startDeviceSignIn();
  } catch (e) {
    throw new BackupError('GOOGLE', e instanceof Error ? e.message : String(e));
  }
  await d.vault.put(DRIVE_SECRET.deviceCode, s.deviceCode, { storeId: null }, vaultWho(w, 'Google Drive sign-in'));
  const pending = { userCode: s.userCode, verificationUrl: s.verificationUrl, expiresAt: s.expiresAt.toISOString(), interval: s.interval };
  await d.db.integration.update({ where: { id: r!.id }, data: { config: json({ ...c, pending }) } });
  return pending;
}

export type PollOutcome = { status: 'waiting' | 'slower' | 'denied' | 'expired' | 'none' } | { status: 'connected'; account: string | null; folderName: string };

/** Has the owner pressed Allow? On yes: token in the vault, the folder found or made, the connection LIVE. */
export async function pollDriveConnect(d: BackupDeps, w: Who, opts: { folderName: string }): Promise<PollOutcome> {
  const r = await row(d);
  const c = configOf(r);
  if (!r || !c.pending) return { status: 'none' };
  if (new Date(c.pending.expiresAt) <= now(d)) {
    await d.db.integration.update({ where: { id: r.id }, data: { config: json({ ...c, pending: null }) } });
    return { status: 'expired' };
  }
  const deviceCode = await d.vault.get(DRIVE_SECRET.deviceCode, { storeId: null }, vaultWho(w, 'Google Drive sign-in'));
  if (!deviceCode) return { status: 'none' };
  const g = await client(d, w, c);
  let p;
  try {
    p = await g.pollDeviceSignIn(deviceCode);
  } catch (e) {
    throw new BackupError('GOOGLE', e instanceof Error ? e.message : String(e));
  }
  if (p.status !== 'connected') {
    if (p.status === 'denied' || p.status === 'expired') {
      await d.vault.revoke(DRIVE_SECRET.deviceCode, { storeId: null }, vaultWho(w, 'Google Drive sign-in'));
      await d.db.integration.update({ where: { id: r.id }, data: { config: json({ ...c, pending: null }) } });
    }
    return { status: p.status };
  }
  let account: string | null;
  let folder: { id: string; name: string };
  try {
    account = await g.accountEmail(p.accessToken);
    // A folder the shop made before (a reconnect, a new server) is used again; else a new one with the shop's label.
    const found = c.folderId && (await g.folderExists(p.accessToken, c.folderId)) ? { id: c.folderId, name: c.folderName ?? opts.folderName } : (await g.findLabelledFolders(p.accessToken))[0];
    folder = found ? { id: found.id, name: found.name } : await g.createFolder(p.accessToken, opts.folderName, { [FOLDER_LABEL.key]: FOLDER_LABEL.value });
  } catch (e) {
    throw new BackupError('GOOGLE', e instanceof Error ? e.message : String(e));
  }
  // An older token of another sign-in is replaced, never left working.
  await endConnection(d, w, c);
  await d.vault.put(DRIVE_SECRET.refreshToken, p.refreshToken, { storeId: null }, vaultWho(w, 'Google Drive sign-in'));
  await d.vault.revoke(DRIVE_SECRET.deviceCode, { storeId: null }, vaultWho(w, 'Google Drive sign-in'));
  await ensureBackupKey(d, w);
  const config: DriveConfig = { ...c, folderId: folder.id, folderName: folder.name, account: account ?? undefined, pending: null };
  await d.db.integration.update({
    where: { id: r.id },
    data: { config: json(config), mode: 'LIVE', enabled: true, lastTestAt: now(d), lastTestOk: true, lastTestMessage: `Google Drive: ${account ?? 'the account'} — the backup folder is there` },
  });
  return { status: 'connected', account, folderName: folder.name };
}

/** Disconnect: Google forgets the access, the token is revoked in the vault, the client stays. */
export async function disconnectDrive(d: BackupDeps, w: Who): Promise<void> {
  const r = await row(d);
  if (!r) throw new BackupError('NOT_CONNECTED', 'Google Drive is not connected');
  const c = configOf(r);
  await endConnection(d, w, c);
  await d.db.integration.update({ where: { id: r.id }, data: { mode: 'MOCK', enabled: false, config: json({ ...c, account: undefined, pending: null }) } });
}

/** The backup key that locks the Drive copies (48 random bytes, base64), made once, only in the vault. */
export async function ensureBackupKey(d: BackupDeps, w: Who): Promise<boolean> {
  if (await secretSet(d, DRIVE_SECRET.backupKey)) return false;
  await d.vault.put(DRIVE_SECRET.backupKey, randomBytes(48).toString('base64'), { storeId: null }, vaultWho(w, 'backup key'));
  return true;
}

/** The connected Drive's account, space and backups (newest first). */
export async function driveBackups(d: BackupDeps, w: Who): Promise<{ overview: DriveOverview; backups: DriveBackup[] }> {
  const r = await row(d);
  const c = configOf(r);
  if (!r?.enabled || r.mode !== 'LIVE' || !c.folderId || !c.clientId) throw new BackupError('NOT_CONNECTED', 'Google Drive is not connected');
  const [secret, token] = await Promise.all([
    d.vault.get(DRIVE_SECRET.clientSecret, { storeId: null }, vaultWho(w, 'Google Drive backups')),
    d.vault.get(DRIVE_SECRET.refreshToken, { storeId: null }, vaultWho(w, 'Google Drive backups')),
  ]);
  if (!secret || !token) throw new BackupError('NOT_CONNECTED', 'Google Drive is not connected');
  const api = createDriveBackups({ clientId: c.clientId, clientSecret: secret, refreshToken: token, folderId: c.folderId, ...endpointsOf(d, c) });
  try {
    const [overview, backups] = await Promise.all([api.overview(), api.backups()]);
    return { overview, backups };
  } catch (e) {
    if (e instanceof DriveError && e.reconnect) throw new BackupError('NOT_CONNECTED', 'Google ended the access: connect Google Drive again');
    throw new BackupError('GOOGLE', e instanceof Error ? e.message : String(e));
  }
}

// S19 · PR 395 (CN-030) — the one-click Google Drive against the fake Google: the owner's own client, the code for
// google.com/device, Allow → the folder made with the shop's label, the token in the vault, the connection LIVE, the
// backup key made once; a reconnect finds the same folder; Deny and an expired code end the sign-in; changing the
// client ends the connection; disconnect revokes; only drive.file is asked; the server sync then carries it to rclone.
import { describe, expect, it } from 'vitest';
import { createFakeGoogle, DRIVE_SCOPE } from '@extas/adapters';
import { CLIENT_ID, disconnectDrive, driveBackups, driveView, pollDriveConnect, setDriveClient, startDriveConnect, type BackupDeps } from './backups';
import { serverSync, type SyncDeps } from './server-sync';

const CID = '123456789012-abcdefghijklmnop.apps.googleusercontent.com';
const SECRET = 'GOCSPX-owners-own-secret';
const FOLDER = { folderName: 'Extas E-commerce Backups' };
const who = { actorId: 'owner-1' };

function world() {
  const google = createFakeGoogle({ clients: { [CID]: SECRET }, quotaBytes: 15 * 1024 ** 3 });
  const rows: Record<string, unknown>[] = [];
  const secrets = new Map<string, { value: string; revoked: boolean; updatedAt: Date }>();
  const db = {
    integration: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => rows.find((r) => r.kind === where.kind && r.provider === where.provider && r.archivedAt == null) ?? null,
      findMany: async () => rows.filter((r) => r.storeId == null && r.archivedAt == null),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const r = { id: `i${rows.length + 1}`, archivedAt: null, createdAt: new Date(), lastTestAt: null, lastTestOk: null, lastTestMessage: null, ...data };
        rows.push(r);
        return r;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(rows.find((r) => r.id === where.id)!, data),
    },
  };
  const vault = {
    get: async (name: string) => (secrets.get(name)?.revoked === false ? secrets.get(name)!.value : null),
    put: async (name: string, value: string) => void secrets.set(name, { value, revoked: false, updatedAt: new Date() }),
    revoke: async (name: string) => {
      const s = secrets.get(name);
      if (!s) throw new Error('no such secret');
      s.revoked = true;
    },
    list: async () => [...secrets.entries()].map(([name, s]) => ({ name, storeId: null, revoked: s.revoked, keyVersion: 1, updatedAt: s.updatedAt })),
  };
  const deps = { db, vault, endpoints: { oauthBase: 'https://oauth.fake', driveBase: 'https://drive.fake', fetch: google.fetch } } as unknown as BackupDeps;
  return { google, rows, secrets, deps, syncDeps: { db, vault } as unknown as SyncDeps };
}

async function connect(w: ReturnType<typeof world>, email = 'owner@gmail.com') {
  const code = await startDriveConnect(w.deps, who);
  w.google.approve(code.userCode, email);
  return pollDriveConnect(w.deps, who, FOLDER);
}

describe('one-click Google Drive (PR 395, CN-030)', () => {
  it('a client id must be Google’s; nothing works before the client is given', async () => {
    const w = world();
    expect(CLIENT_ID.test(CID)).toBe(true);
    await expect(setDriveClient(w.deps, who, { clientId: 'not-a-client', clientSecret: SECRET })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(startDriveConnect(w.deps, who)).rejects.toMatchObject({ code: 'NO_CLIENT' });
    expect((await driveView(w.deps)).client).toBeNull();
  });

  it('Connect: a code for google.com/device, only drive.file asked, then Allow makes the folder and goes LIVE', async () => {
    const w = world();
    await setDriveClient(w.deps, who, { clientId: CID, clientSecret: SECRET });
    expect(w.secrets.get('googleDrive.clientSecret')?.value).toBe(SECRET);
    const code = await startDriveConnect(w.deps, who);
    expect(code.verificationUrl).toBe('https://www.google.com/device');
    expect(code.userCode).toMatch(/^[A-Z]{4}-[A-Z0-9]{4}$/);
    expect((await driveView(w.deps)).pending?.userCode).toBe(code.userCode);
    expect(await pollDriveConnect(w.deps, who, FOLDER)).toEqual({ status: 'waiting' });
    w.google.approve(code.userCode, 'owner@gmail.com');
    expect(await pollDriveConnect(w.deps, who, FOLDER)).toEqual({ status: 'connected', account: 'owner@gmail.com', folderName: 'Extas E-commerce Backups' });

    const v = await driveView(w.deps);
    expect(v).toMatchObject({ connected: true, account: 'owner@gmail.com', folderName: 'Extas E-commerce Backups', pending: null, client: { clientId: CID, secretSet: true } });
    const folder = w.google.items().find((i) => i.name === 'Extas E-commerce Backups')!;
    expect(folder.appProperties).toEqual({ extasShop: 'backups' });
    expect(w.rows[0]).toMatchObject({ mode: 'LIVE', enabled: true, lastTestOk: true });
    // the token, the device code and the backup key: only in the vault, never on the row
    expect(JSON.stringify(w.rows[0])).not.toMatch(/rt-|dev-|GOCSPX/);
    expect(w.secrets.get('googleDrive.refreshToken')?.revoked).toBe(false);
    expect(w.secrets.get('googleDrive.deviceCode')?.revoked).toBe(true);
    expect(w.secrets.get('googleDrive.backupKey')?.value).toMatch(/^[A-Za-z0-9+/=]{64}$/);
  });

  it('Deny or an expired code ends the sign-in and says so', async () => {
    const w = world();
    await setDriveClient(w.deps, who, { clientId: CID, clientSecret: SECRET });
    const code = await startDriveConnect(w.deps, who);
    w.google.deny(code.userCode);
    expect(await pollDriveConnect(w.deps, who, FOLDER)).toEqual({ status: 'denied' });
    expect((await driveView(w.deps)).pending).toBeNull();
    expect(await pollDriveConnect(w.deps, who, FOLDER)).toEqual({ status: 'none' });
    await startDriveConnect(w.deps, who);
    const later = { ...w.deps, now: () => new Date(Date.now() + 3600_000) };
    expect(await pollDriveConnect(later, who, FOLDER)).toEqual({ status: 'expired' });
  });

  it('a client Google does not know is refused in words', async () => {
    const w = world();
    await setDriveClient(w.deps, who, { clientId: '999999999999-zzzzzzzzzzzzzzzz.apps.googleusercontent.com', clientSecret: SECRET });
    await expect(startDriveConnect(w.deps, who)).rejects.toThrow(/TVs and Limited Input devices/);
  });

  it('a reconnect finds the same folder; the backup key is made only once', async () => {
    const w = world();
    await setDriveClient(w.deps, who, { clientId: CID, clientSecret: SECRET });
    await connect(w);
    const key = w.secrets.get('googleDrive.backupKey')!.value;
    const folderId = (await driveView(w.deps)).folderId;
    await connect(w);
    expect((await driveView(w.deps)).folderId).toBe(folderId);
    expect(w.google.items().filter((i) => i.name === 'Extas E-commerce Backups')).toHaveLength(1);
    expect(w.secrets.get('googleDrive.backupKey')!.value).toBe(key);
  });

  it('the Backups list: newest first, checked or not, the account and the free space', async () => {
    const w = world();
    await setDriveClient(w.deps, who, { clientId: CID, clientSecret: SECRET });
    await connect(w);
    const folderId = (await driveView(w.deps)).folderId!;
    for (const [stamp, checked] of [['20261029-0230', true], ['20261031-0230', false], ['20261030-0230', true]] as const) {
      const d = w.google.add('owner@gmail.com', CID, { name: stamp, parentId: folderId, folder: true });
      w.google.add('owner@gmail.com', CID, { name: `extas-${stamp}.dump.gpg`, parentId: d, size: 1000 });
      if (checked) w.google.add('owner@gmail.com', CID, { name: 'CHECKED', parentId: d });
    }
    // another app's files in the same Drive are never seen (drive.file)
    w.google.add('owner@gmail.com', 'someone-else', { name: '20261101-0230', parentId: folderId, folder: true });
    const r = await driveBackups(w.deps, who);
    expect(r.backups.map((b) => [b.name, b.checked, b.files, b.bytes])).toEqual([
      ['20261031-0230', false, 1, 1000],
      ['20261030-0230', true, 1, 1000],
      ['20261029-0230', true, 1, 1000],
    ]);
    expect(r.overview).toMatchObject({ account: 'owner@gmail.com', folderOk: true, totalBytes: 15 * 1024 ** 3 });
  });

  it('Google ending the access asks to connect again', async () => {
    const w = world();
    await setDriveClient(w.deps, who, { clientId: CID, clientSecret: SECRET });
    await connect(w);
    w.google.revokeAll();
    await expect(driveBackups(w.deps, who)).rejects.toMatchObject({ code: 'NOT_CONNECTED' });
  });

  it('changing the client ends the connection; Disconnect revokes the token at Google and in the vault', async () => {
    const w = world();
    await setDriveClient(w.deps, who, { clientId: CID, clientSecret: SECRET });
    await connect(w);
    expect(await setDriveClient(w.deps, who, { clientId: CID, clientSecret: `${SECRET}-new` })).toEqual({ endedConnection: true });
    expect((await driveView(w.deps)).connected).toBe(false);
    expect(w.secrets.get('googleDrive.refreshToken')?.revoked).toBe(true);
    w.google.addClient(CID, `${SECRET}-new`);
    await connect(w);
    await disconnectDrive(w.deps, who);
    expect(w.google.calls.filter((c) => c.endsWith('/revoke')).length).toBeGreaterThanOrEqual(2);
    expect((await driveView(w.deps))).toMatchObject({ connected: false, account: null });
    expect(w.rows[0]).toMatchObject({ mode: 'MOCK', enabled: false });
  });

  it('the server sync carries a connected Drive to rclone: drive.file, the folder as root, the copies kept, the key', async () => {
    const w = world();
    expect(DRIVE_SCOPE).toBe('https://www.googleapis.com/auth/drive.file');
    await setDriveClient(w.deps, who, { clientId: CID, clientSecret: SECRET });
    let files = (await serverSync(w.syncDeps)).files!;
    expect(files['backup.env']).toBe('');
    await connect(w);
    files = (await serverSync({ ...w.syncDeps, settings: { value: async () => ({ folderName: 'X', keepCopies: 5 }) } })).files!;
    const env = files['backup.env']!;
    const folderId = (await driveView(w.deps)).folderId!;
    expect(env).toContain("RCLONE_CONFIG_DRIVE_TYPE='drive'");
    expect(env).toContain("RCLONE_CONFIG_DRIVE_SCOPE='drive.file'");
    expect(env).toContain(`RCLONE_CONFIG_DRIVE_ROOT_FOLDER_ID='${folderId}'`);
    expect(env).toContain(`RCLONE_CONFIG_DRIVE_CLIENT_ID='${CID}'`);
    expect(env).toContain("BACKUP_DRIVE_FOLDER=''");
    expect(env).toContain("BACKUP_DRIVE_KEEP='5'");
    expect(env).toMatch(/RCLONE_CONFIG_DRIVE_TOKEN='\{"access_token":"","token_type":"Bearer","refresh_token":"rt-[0-9a-z]+","expiry":"2000-01-01T00:00:00Z"\}'/);
    expect(files['backup.key']).toBe(`${w.secrets.get('googleDrive.backupKey')!.value}\n`);
    await disconnectDrive(w.deps, who);
    expect((await serverSync(w.syncDeps)).files!['backup.env']).toBe('');
  });
});

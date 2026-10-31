// S19 · PR 395 (CN-030) — the Backups admin API (Settings → System → Backups). `path` is what comes after
// /api/admin/backups:
//   GET   /api/admin/backups                   the Google Drive connection (never a secret), the server's last
//                                              backups (state files) (system.read)
//   GET   /api/admin/backups/drive/list        the connected Drive's account, free space and backups, newest first
//   POST  /api/admin/backups/drive/client      {clientId, clientSecret, pin?} the owner's own Google client; when one
//                                              is set already it needs the PIN, and it ends the connection (vault.write)
//   POST  /api/admin/backups/drive/connect     {pin?} Google's code for google.com/device; replacing a live connection
//                                              needs the PIN (vault.write)
//   POST  /api/admin/backups/drive/poll        has the owner pressed Allow? (vault.write)
//   POST  /api/admin/backups/drive/disconnect  {pin} Google forgets the access, the token is revoked (vault.write)
// Every action is in the audit log without a value; the owner hears about a new connection or a disconnect on Telegram.
import { createConnections, sendOwnerAlert, telegramAdapters } from '@extas/adapters';
import { audit, verifyOwnerPin, type Actor, type RequestContext } from '@extas/auth';
import { BackupError, disconnectDrive, driveBackups, driveView, pollDriveConnect, setDriveClient, startDriveConnect, type BackupDeps } from '@extas/jobs';
import { MOTHER_STORE_ID } from '@extas/db/client';
import bn from '../../messages/admin-backups.bn.json';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from './admin-auth';
import { t, type Dict } from './i18n';
import { runtimeState } from './status';

const PIN_MAX_DIGITS = 12;

function backupFail(e: unknown): Response {
  if (e instanceof BackupError) {
    const status = e.code === 'INVALID_INPUT' ? 400 : e.code === 'GOOGLE' ? 502 : 409;
    return json({ ok: false, error: `backups.${e.code}`, ...(e.code === 'INVALID_INPUT' ? { details: [e.message] } : { message: e.message }) }, { status });
  }
  return errorResponse(e);
}

async function pinCheck(deps: AdminDeps, actor: Actor, ctx: RequestContext, pin: unknown, action: string): Promise<void> {
  const [minLength, maxAttempts, lockMinutes] = await Promise.all([
    deps.resolver.value('books.pin.minLength'),
    deps.resolver.value('books.pin.maxAttempts'),
    deps.resolver.value('books.pin.lockMinutes'),
  ]);
  await verifyOwnerPin(deps.db, actor, typeof pin === 'string' ? pin : null, { minLength, maxLength: Math.max(minLength, PIN_MAX_DIGITS), maxAttempts, lockMinutes }, {
    action,
    storeId: null,
    now: deps.now ? deps.now() : new Date(),
    ctx: { source: 'admin-api', ...ctx },
  });
}

/** A Telegram line to the owner, in Bengali (the owner's language), from messages/admin-backups.bn.json `alerts.*`. */
async function alertOwner(deps: AdminDeps, key: 'clientChanged' | 'connected' | 'disconnected', vars: Record<string, string> = {}): Promise<void> {
  try {
    const [testS, cacheS, store] = await Promise.all([
      deps.resolver.value('system.integrationTestTimeoutSeconds'),
      deps.resolver.value('system.integrationKeyCacheSeconds'),
      deps.resolver.value('store.name', { storeId: MOTHER_STORE_ID }),
    ]);
    const c = createConnections({ db: deps.db, vault: deps.vault ?? { get: async () => null }, adapters: telegramAdapters, secretCacheMs: cacheS * 1000, testTimeoutMs: testS * 1000 });
    await sendOwnerAlert(c, t(bn as Dict, `alerts.${key}`, { store: store ?? '', ...vars }));
  } catch {
    // an alert never stops the owner's own action
  }
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Every Backups admin route. */
export async function backupsRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  const where = path.join('/');
  const reads = ['', 'drive/list'];
  const writes = ['drive/client', 'drive/connect', 'drive/poll', 'drive/disconnect'];
  if (![...reads, ...writes].includes(where)) return fail(404, 'not-found');
  if ((reads.includes(where) && m !== 'GET') || (writes.includes(where) && m !== 'POST')) return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: m === 'GET' ? 'system.read' : 'vault.write' });
  if (g instanceof Response) return g;
  if (!deps!.vault) return fail(503, 'VAULT_NOT_CONFIGURED');
  const d: BackupDeps = { db: deps!.db, vault: deps!.vault, now: deps!.now };
  const w = { actorId: g.actor.staffUserId ?? null };
  const log = (action: string, after: Record<string, unknown>) =>
    audit(deps!.db, g.actor, { action, entityType: 'Integration', entityId: 'googleDrive', before: null, after, storeId: null }, g.ctx);
  try {
    if (where === '') {
      const [drive, state, folder] = await Promise.all([driveView(d), runtimeState(), deps!.resolver.value('backups.drive')]);
      return json({ ok: true, drive, server: state.backups, restoreTest: state.restoreTest, settings: { drive: folder } });
    }
    if (where === 'drive/list') return json({ ok: true, ...(await driveBackups(d, w)) });
    const b = await body(request);
    const view = await driveView(d);
    if (where === 'drive/client') {
      if (view.client) await pinCheck(deps!, g.actor, g.ctx, b.pin, 'backups.drive.client');
      const r = await setDriveClient(d, w, { clientId: str(b.clientId), clientSecret: str(b.clientSecret) });
      await log('backups.drive.client', { clientId: str(b.clientId).trim(), endedConnection: r.endedConnection });
      if (r.endedConnection) await alertOwner(deps!, 'clientChanged');
      return json({ ok: true, ...r });
    }
    if (where === 'drive/connect') {
      if (view.connected) await pinCheck(deps!, g.actor, g.ctx, b.pin, 'backups.drive.reconnect');
      const pending = await startDriveConnect(d, w);
      await log('backups.drive.connect', { replacing: view.connected });
      return json({ ok: true, pending });
    }
    if (where === 'drive/poll') {
      const r = await pollDriveConnect(d, w, { folderName: (await deps!.resolver.value('backups.drive')).folderName });
      if (r.status === 'connected') {
        await log('backups.drive.connected', { account: r.account, folder: r.folderName });
        await alertOwner(deps!, 'connected', { account: r.account ?? t(bn as Dict, 'alerts.yourAccount'), folder: r.folderName });
      }
      return json({ ok: true, ...r });
    }
    // drive/disconnect
    await pinCheck(deps!, g.actor, g.ctx, b.pin, 'backups.drive.disconnect');
    await disconnectDrive(d, w);
    await log('backups.drive.disconnect', {});
    await alertOwner(deps!, 'disconnected');
    return json({ ok: true });
  } catch (e) {
    return backupFail(e);
  }
}

// S19 · PR 395 (CN-030) — the Backups admin API (Settings → System → Backups). `path` is what comes after
// /api/admin/backups:
//   GET   /api/admin/backups                   the Google Drive connection (never a secret), the server's last
//                                              backups (state files), PR 391: the go-live checks (system.read)
//   GET   /api/admin/backups/drive/list        the connected Drive's account, free space and backups, newest first
//   POST  /api/admin/backups/drive/client      {clientId, clientSecret, pin?} the owner's own Google client; when one
//                                              is set already it needs the PIN, and it ends the connection (vault.write)
//   POST  /api/admin/backups/drive/connect     {pin?} Google's code for google.com/device; replacing a live connection
//                                              needs the PIN (vault.write)
//   POST  /api/admin/backups/drive/poll        has the owner pressed Allow? (vault.write)
//   POST  /api/admin/backups/drive/disconnect  {pin} Google forgets the access, the token is revoked (vault.write)
//   PUT   /api/admin/backups/settings          PR 507 {plan?, drill?, alerts?, drive?, blob?, gate?} the backup settings; each part
//                                              whole, checked against its setting (system.backup)
//   POST  /api/admin/backups/request           PR 507 {kind: BACKUP|RESTORE_DRILL, source?} the server runs it within
//                                              a few minutes; one open request of each kind (system.backup)
// Every action is in the audit log without a value; the owner hears about a new connection or a disconnect on Telegram.
import { createConnections, sendOwnerAlert, telegramAdapters } from '@extas/adapters';
import { audit, verifyOwnerPin, type Actor, type RequestContext } from '@extas/auth';
import {
  BackupError,
  backupRequests,
  disconnectDrive,
  driveBackups,
  driveView,
  pollDriveConnect,
  requestBackup,
  setDriveClient,
  startDriveConnect,
  type BackupDeps,
} from '@extas/jobs';
import { INSTALLATION, registry } from '@extas/settings';
import { MOTHER_STORE_ID } from '@extas/db/client';
import bn from '../../messages/admin-backups.bn.json';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from './admin-auth';
import { t, type Dict } from './i18n';
import { backupGateChecks } from './backup-gate';
import { runtimeState, type RuntimeState } from './status';

const PIN_MAX_DIGITS = 12;

function backupFail(e: unknown): Response {
  if (e instanceof BackupError) {
    const status = e.code === 'INVALID_INPUT' ? 400 : e.code === 'GOOGLE' ? 502 : 409; // BUSY, NO_CLIENT …: 409
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

/** PR 507: the backup settings this page changes, by the body's field. */
// PR 391: the Blob container and the go-live checks' hours and days.
const SETTINGS = {
  drive: 'backups.drive',
  plan: 'backups.plan',
  drill: 'backups.drill',
  alerts: 'backups.alerts',
  blob: 'backups.blob',
  gate: 'backups.gate',
} as const;
type SettingField = keyof typeof SETTINGS;

async function settingsNow(deps: AdminDeps) {
  const [drive, plan, drill, alerts, blob, gate] = await Promise.all([
    deps.resolver.value('backups.drive'),
    deps.resolver.value('backups.plan'),
    deps.resolver.value('backups.drill'),
    deps.resolver.value('backups.alerts'),
    deps.resolver.value('backups.blob'),
    deps.resolver.value('backups.gate'),
  ]);
  return { drive, plan, drill, alerts, blob, gate };
}

/**
 * PR 391: the backups' go-live checks now. A place counts as connected only as the server sees it: its connection
 * installation-wide, switched on and LIVE (its Test passed) — the same rule the vault sync uses.
 */
export async function backupGateNow(deps: Pick<AdminDeps, 'db' | 'resolver' | 'now'>, state: RuntimeState) {
  const [gate, rows] = await Promise.all([
    deps.resolver.value('backups.gate'),
    deps.db.integration.findMany({
      where: { storeId: null, archivedAt: null, enabled: true, mode: 'LIVE', provider: { in: ['azureBlob', 'googleDrive', 'telegram'] } },
      select: { provider: true, kind: true },
    }),
  ]);
  const has = (kind: string, provider: string) => rows.some((r) => r.kind === kind && r.provider === provider);
  return backupGateChecks({
    now: deps.now ? deps.now() : new Date(),
    gate,
    live: { blob: has('STORAGE', 'azureBlob'), drive: has('GOOGLE_DRIVE', 'googleDrive'), telegram: has('TELEGRAM', 'telegram') },
    backups: state.backups,
    drill: state.drill,
    restoreTest: state.restoreTest,
  });
}

/** Every Backups admin route. */
export async function backupsRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  const where = path.join('/');
  const reads = ['', 'drive/list'];
  const writes = ['drive/client', 'drive/connect', 'drive/poll', 'drive/disconnect', 'request'];
  const puts = ['settings'];
  if (![...reads, ...writes, ...puts].includes(where)) return fail(404, 'not-found');
  if ((reads.includes(where) && m !== 'GET') || (writes.includes(where) && m !== 'POST') || (puts.includes(where) && m !== 'PUT')) {
    return fail(405, 'method-not-allowed');
  }
  const permission = m === 'GET' ? 'system.read' : where === 'settings' || where === 'request' ? 'system.backup' : 'vault.write';
  const g = await guardAdmin(request, deps, { permission });
  if (g instanceof Response) return g;
  // The Drive needs the vault; the backup settings and the requests do not (PR 507).
  if (!deps!.vault && where.startsWith('drive')) return fail(503, 'VAULT_NOT_CONFIGURED');
  const d = { db: deps!.db, vault: deps!.vault, now: deps!.now } as BackupDeps;
  const w = { actorId: g.actor.staffUserId ?? null };
  const log = (action: string, after: Record<string, unknown>) =>
    audit(deps!.db, g.actor, { action, entityType: 'Integration', entityId: 'googleDrive', before: null, after, storeId: null }, g.ctx);
  try {
    if (where === '') {
      const [drive, state, settings, requests] = await Promise.all([deps!.vault ? driveView(d) : null, runtimeState(), settingsNow(deps!), backupRequests(deps!.db)]);
      const gate = await backupGateNow(deps!, state);
      return json({ ok: true, drive, server: state.backups, restoreTest: state.restoreTest, drill: state.drill, settings, requests, gate });
    }
    if (where === 'settings') {
      const b = await body(request);
      const before = await settingsNow(deps!);
      const fields = (Object.keys(SETTINGS) as SettingField[]).filter((f) => b[f] !== undefined);
      if (!fields.length) throw new BackupError('INVALID_INPUT', 'nothing to save');
      const problems: string[] = [];
      for (const f of fields) {
        const r = registry[SETTINGS[f]].schema.safeParse(b[f]);
        if (!r.success) problems.push(...r.error.issues.map((i) => `${f}.${i.path.join('.')}: ${i.message}`));
      }
      if (problems.length) return json({ ok: false, error: 'backups.INVALID_INPUT', details: problems }, { status: 400 });
      const changed = fields.filter((f) => JSON.stringify(b[f]) !== JSON.stringify(before[f]));
      for (const f of changed) {
        await deps!.resolver.set(SETTINGS[f], b[f] as never, INSTALLATION, { actorId: g.actor.staffUserId ?? null, reason: 'Settings › System › Backups' });
      }
      if (changed.length) {
        await audit(
          deps!.db,
          g.actor,
          {
            action: 'backups.settings',
            entityType: 'Setting',
            entityId: 'backups',
            before: Object.fromEntries(changed.map((f) => [f, before[f]])),
            after: Object.fromEntries(changed.map((f) => [f, b[f]])),
            storeId: null,
          },
          g.ctx,
        );
      }
      return json({ ok: true, changed, settings: await settingsNow(deps!) });
    }
    if (where === 'request') {
      const b = await body(request);
      const r = await requestBackup(deps!.db, { kind: b.kind, source: b.source, actorId: g.actor.staffUserId ?? null });
      await audit(deps!.db, g.actor, { action: `backups.request.${r.kind.toLowerCase()}`, entityType: 'BackupRequest', entityId: r.id, before: null, after: { kind: r.kind, source: r.source }, storeId: null }, g.ctx);
      return json({ ok: true, request: r });
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

// S02 · PR 597 (register "Launch default — save and restore"; BACKEND-ARCHITECTURE WEB-07; CN-012 (1), CN-014 (3c)) —
// Website › More › Launch default, the server side (the pure rules are lib/website/look-model.ts).
// - Save: the shop's look as it is now (LOOK_KEYS and which house ads and placements are on) under a name, or as the
//   launch default. A newer launch default leaves the older one in the list as a named look (never deleted).
// - Restore: first the look as it is now is saved by itself ("Before restoring …"), then the chosen look is written.
//   Sections, zones, category orders and house ads made since are kept, switched off. "Back to launch default" also
//   pauses the A/B tests that are running (only with `reports.experiments.write`; kept, never ended). Every restore is
//   logged (LayoutRestore, append-only: the look before it, the "before" look's id, the reason and the paused tests)
//   and audited (website.look.restore).
// - Undo: the newest restore can be undone; undo restores its "before" look the same way (so an undo saves a look first
//   and can itself be undone) and lets the tests it paused run again when nothing else runs and the module is on.
// - Rename; set aside and bring back (never deleted; the launch default cannot be set aside).
// Seeing needs `website.read`; every change `website.layout.write`. A refused or stale step changes nothing (STALE when
// the look changed since the page was read). Nothing here touches a price, a discount, COD, a delivery charge, an
// order or a customer; no money moves.
import { audit, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, type Prisma, type PrismaClient } from '@extas/db/client';
import { storeTarget } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { clearLive } from '../experiments/live';
import { windowState } from '../shop/seasonal-home-model';
import { isShopLook, LOOK_KEYS, LOOK_SCOPE, lookOf, planRestore, planRows, summaryOf, versionOf, type LookKey, type LookPayload, type LookRows, type LookSummary } from './look-model';

const S = MOTHER_STORE_ID;
/** List lengths shown on the page (page-length guards, not business numbers). */
const LOOKS_SHOWN = 100; // hardcode-ok: a page-length guard
const LOG_SHOWN = 30; // hardcode-ok: a page-length guard
const NAME_MAX = 80; // hardcode-ok: a text-length guard
const REASON_MAX = 200; // hardcode-ok: a text-length guard
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class LookError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: string[],
  ) {
    super(code);
  }
}

export interface LookDeps {
  db: PrismaClient;
  resolver: AdminDeps['resolver'];
  now?: () => Date;
}

export interface LookWho {
  actor: Actor;
  ctx: RequestContext;
  can: (perm: string) => boolean;
}

export interface SnapRow {
  id: string;
  name: string;
  launch: boolean;
  auto: LookPayload['auto'] | null;
  archived: boolean;
  at: string;
  by: string | null;
  sum: LookSummary;
}

export interface RestoreRow {
  id: string;
  at: string;
  by: string | null;
  look: string;
  launch: boolean;
  kind: 'restore' | 'undo';
  reason: string;
  undone: boolean;
  canUndo: boolean;
  paused: number;
}

export interface LookView {
  /** The look as it is now (a restore or save refuses STALE when it changed). */
  version: string;
  launch: SnapRow | null;
  looks: SnapRow[];
  log: RestoreRow[];
  keys: readonly LookKey[];
  /** A Marketing › Seasonal home window shows its own home look now (not part of any shop look). */
  seasonLive: boolean;
  testsRunning: number;
}

/** The meta a restore keeps in its log row beside the look before it. */
interface RestoreMeta {
  kind: 'restore' | 'undo';
  beforeId: string;
  reason: string;
  paused: string[];
  kept: string[];
}

const metaOf = (prev: unknown): RestoreMeta | null => {
  const m = prev && typeof prev === 'object' ? (prev as Record<string, unknown>).restore : null;
  if (!m || typeof m !== 'object') return null;
  const o = m as Record<string, unknown>;
  if (typeof o.beforeId !== 'string') return null;
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  return { kind: o.kind === 'undo' ? 'undo' : 'restore', beforeId: o.beforeId, reason: typeof o.reason === 'string' ? o.reason : '', paused: strs(o.paused), kept: strs(o.kept) };
};

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// ---- the look as it is now ------------------------------------------------------------------------------------------

async function rowsNow(db: PrismaClient): Promise<LookRows> {
  const [ads, placements] = await Promise.all([
    db.houseAd.findMany({ where: { storeId: S, archivedAt: null, enabled: true }, select: { id: true } }),
    db.houseAdPlacement.findMany({ where: { storeId: S, enabled: true }, select: { id: true } }),
  ]);
  return { houseAds: ads.map((a) => a.id).sort(), placements: placements.map((p) => p.id).sort() };
}

async function settingsNow(deps: LookDeps): Promise<Partial<Record<LookKey, unknown>>> {
  const values = await Promise.all(LOOK_KEYS.map((k) => deps.resolver.value(k, { storeId: S })));
  return Object.fromEntries(LOOK_KEYS.map((k, i) => [k, values[i]]));
}

/** The shop's look as it is now, as a look payload. */
export async function lookNow(deps: LookDeps): Promise<LookPayload> {
  const [settings, rows] = await Promise.all([settingsNow(deps), rowsNow(deps.db)]);
  return { scope: LOOK_SCOPE, settings, rows };
}

// ---- the page ---------------------------------------------------------------------------------------------------------

export async function lookView(deps: LookDeps): Promise<LookView> {
  const now = deps.now?.() ?? new Date();
  const [current, snaps, restores, windows, testsRunning] = await Promise.all([
    lookNow(deps),
    deps.db.layoutSnapshot.findMany({ where: { storeId: S, payload: { path: ['scope'], equals: LOOK_SCOPE } }, orderBy: [{ isLaunchDefault: 'desc' }, { archivedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }], take: LOOKS_SHOWN }),
    deps.db.layoutRestore.findMany({ where: { storeId: S }, orderBy: { createdAt: 'desc' }, take: LOG_SHOWN, include: { snapshot: { select: { name: true, isLaunchDefault: true, payload: true } } } }),
    deps.db.scheduledLayoutSwitch.findMany({ where: { storeId: S, status: 'SCHEDULED', applyAt: { lte: now } }, select: { applyAt: true, revertAt: true, status: true } }),
    deps.db.abTest.count({ where: { storeId: S, status: 'RUNNING', archivedAt: null } }),
  ]);
  const shopRestores = restores.filter((r) => isShopLook(r.snapshot.payload));
  const people = [...new Set([...snaps.map((s) => s.createdById), ...shopRestores.map((r) => r.actorId)].filter((x): x is string => !!x))];
  const staff = people.length ? await deps.db.staffUser.findMany({ where: { id: { in: people } }, select: { id: true, displayName: true } }) : [];
  const nameOf = (id: string | null) => (id ? (staff.find((s) => s.id === id)?.displayName ?? null) : null);
  const row = (s: (typeof snaps)[number]): SnapRow => {
    const look = lookOf(s.payload);
    return { id: s.id, name: s.name, launch: s.isLaunchDefault, auto: look.auto ?? null, archived: !!s.archivedAt, at: s.createdAt.toISOString(), by: nameOf(s.createdById), sum: summaryOf(look) };
  };
  const undoneIds = new Set(shopRestores.map((r) => r.undoOfId).filter((x): x is string => !!x));
  const newest = shopRestores[0]?.id ?? null;
  const log: RestoreRow[] = shopRestores.map((r) => {
    const m = metaOf(r.previousPayload);
    return {
      id: r.id,
      at: r.createdAt.toISOString(),
      by: nameOf(r.actorId),
      look: lookOf(r.snapshot.payload).auto ? '' : r.snapshot.name,
      launch: r.snapshot.isLaunchDefault,
      kind: r.undoOfId ? 'undo' : 'restore',
      reason: m?.reason ?? '',
      undone: undoneIds.has(r.id),
      canUndo: r.id === newest && !undoneIds.has(r.id) && !!m,
      paused: m?.paused.length ?? 0,
    };
  });
  const launch = snaps.find((s) => s.isLaunchDefault && !s.archivedAt);
  return {
    version: versionOf(current),
    launch: launch ? row(launch) : null,
    looks: snaps.filter((s) => s !== launch).map(row),
    log,
    keys: LOOK_KEYS,
    seasonLive: windows.some((w) => windowState(w, now) === 'LIVE'),
    testsRunning,
  };
}

// ---- the steps --------------------------------------------------------------------------------------------------------

async function freshLook(deps: LookDeps, version: unknown): Promise<LookPayload> {
  const current = await lookNow(deps);
  if (version !== versionOf(current)) throw new LookError('STALE', 409);
  return current;
}

async function findLook(deps: LookDeps, id: unknown) {
  if (typeof id !== 'string' || !UUID_RE.test(id)) throw new LookError('INVALID_INPUT', 400, ['id']);
  const row = await deps.db.layoutSnapshot.findFirst({ where: { id, storeId: S } });
  if (!row || !isShopLook(row.payload)) throw new LookError('not-found', 404);
  return row;
}

/** Save the look as it is now under a name (or as the launch default). */
async function saveLook(deps: LookDeps, who: LookWho, o: Record<string, unknown>): Promise<string> {
  const name = str(o.name, NAME_MAX);
  if (!name) throw new LookError('INVALID_INPUT', 400, ['name']);
  const current = await freshLook(deps, o.version);
  const launch = o.launch === true;
  const made = await deps.db.$transaction(async (tx) => {
    const before = launch ? await tx.layoutSnapshot.findMany({ where: { storeId: S, isLaunchDefault: true, payload: { path: ['scope'], equals: LOOK_SCOPE } }, select: { id: true } }) : [];
    if (before.length) await tx.layoutSnapshot.updateMany({ where: { id: { in: before.map((b) => b.id) } }, data: { isLaunchDefault: false } });
    const row = await tx.layoutSnapshot.create({ data: { storeId: S, name, isLaunchDefault: launch, payload: current as unknown as Prisma.InputJsonValue, createdById: who.actor.staffUserId ?? null } });
    return { row, before: before.map((b) => b.id) };
  });
  await audit(deps.db, who.actor, { storeId: S, action: launch ? 'website.look.launchDefault' : 'website.look.save', entityType: 'LayoutSnapshot', entityId: made.row.id, before: made.before.length ? { launchDefault: made.before } : undefined, after: { name, launch, keys: Object.keys(current.settings), summary: summaryOf(current) } }, who.ctx);
  return made.row.id;
}

/** Pause the running A/B tests (back to launch default); answers the ids paused. */
async function pauseTests(deps: LookDeps, who: LookWho): Promise<string[]> {
  if (!who.can('reports.experiments.write')) return [];
  const running = await deps.db.abTest.findMany({ where: { storeId: S, status: 'RUNNING', archivedAt: null }, select: { id: true } });
  const paused: string[] = [];
  for (const t of running) {
    const done = await deps.db.abTest.updateMany({ where: { id: t.id, status: 'RUNNING' }, data: { status: 'PAUSED' } });
    if (!done.count) continue;
    paused.push(t.id);
    await audit(deps.db, who.actor, { storeId: S, action: 'experiments.pause', entityType: 'AbTest', entityId: t.id, before: { status: 'RUNNING' }, after: { status: 'PAUSED', by: 'website.look.restore' } }, who.ctx);
  }
  if (paused.length) clearLive();
  return paused;
}

/** Let the tests a restore paused run again (undo): only while the module is on and no other test runs. */
async function resumeTests(deps: LookDeps, who: LookWho, ids: string[]): Promise<string[]> {
  if (!ids.length || !who.can('reports.experiments.write')) return [];
  const mod = (await deps.resolver.value('experiments.module', { storeId: S })) as { enabled?: boolean };
  if (!mod?.enabled) return [];
  const others = await deps.db.abTest.count({ where: { storeId: S, status: 'RUNNING', archivedAt: null, id: { notIn: ids } } });
  if (others) return [];
  const now = deps.now?.() ?? new Date();
  const resumed: string[] = [];
  for (const id of ids) {
    const done = await deps.db.abTest.updateMany({ where: { id, storeId: S, status: 'PAUSED', archivedAt: null, OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, data: { status: 'RUNNING' } });
    if (!done.count) continue;
    resumed.push(id);
    await audit(deps.db, who.actor, { storeId: S, action: 'experiments.start', entityType: 'AbTest', entityId: id, before: { status: 'PAUSED' }, after: { status: 'RUNNING', by: 'website.look.undo' } }, who.ctx);
  }
  if (resumed.length) clearLive();
  return resumed;
}

export interface RestoreDone {
  restoreId: string;
  beforeId: string;
  written: string[];
  kept: string[];
  hidden: number;
  paused: number;
  resumed: number;
  adsOn: number;
  adsOff: number;
}

async function applyLook(deps: LookDeps, who: LookWho, target: { id: string; name: string; payload: unknown }, opts: { version: unknown; reason: string; undoOf: RestoreMeta & { id: string } | null; pause: boolean }): Promise<RestoreDone> {
  const current = await freshLook(deps, opts.version);
  const saved = lookOf(target.payload);
  const plan = planRestore(saved, current.settings);
  const rows = planRows(saved.rows, current.rows);
  // 1. The look as it is now is saved first, so this step can itself be undone.
  const before = await deps.db.layoutSnapshot.create({
    data: { storeId: S, name: target.name, payload: { ...current, auto: { kind: opts.undoOf ? 'undo' : 'restore', of: target.name } } as unknown as Prisma.InputJsonValue, createdById: who.actor.staffUserId ?? null },
  });
  // 2. The settings, then the house ads and placements (on = in the look; everything else that is on goes off).
  const how = { actorId: who.actor.staffUserId ?? null, reason: opts.undoOf ? 'Website › Launch default: undo a restore' : 'Website › Launch default: restore a look' };
  const written: LookKey[] = [];
  try {
    for (const w of plan.writes) {
      await deps.resolver.set(w.key, w.value as never, storeTarget(S), how);
      written.push(w.key);
    }
  } catch (e) {
    // A write failed half-way: the keys already written go back to how they were, so a restore is all or nothing.
    for (const key of written.reverse()) await deps.resolver.set(key, current.settings[key] as never, storeTarget(S), { ...how, reason: `${how.reason} (rolled back)` }).catch(() => undefined);
    throw e;
  }
  const switchRows = async (on: boolean, list: LookRows) => {
    let n = 0;
    if (list.houseAds.length) n += (await deps.db.houseAd.updateMany({ where: { storeId: S, archivedAt: null, id: { in: list.houseAds }, enabled: !on }, data: { enabled: on } })).count;
    if (list.placements.length) n += (await deps.db.houseAdPlacement.updateMany({ where: { storeId: S, id: { in: list.placements }, enabled: !on }, data: { enabled: on } })).count;
    return n;
  };
  const adsOff = await switchRows(false, rows.off);
  const adsOn = await switchRows(true, rows.on);
  // 3. Tests: back to launch default pauses the running ones; an undo lets the ones it paused run again.
  const paused = opts.pause ? await pauseTests(deps, who) : [];
  const resumed = opts.undoOf ? await resumeTests(deps, who, opts.undoOf.paused) : [];
  const kept = [...plan.kept, ...plan.crowded];
  const meta: RestoreMeta = { kind: opts.undoOf ? 'undo' : 'restore', beforeId: before.id, reason: opts.reason, paused, kept };
  const log = await deps.db.layoutRestore.create({
    data: { storeId: S, snapshotId: target.id, previousPayload: { ...current, restore: meta } as unknown as Prisma.InputJsonValue, undoOfId: opts.undoOf?.id ?? null, actorId: who.actor.staffUserId ?? null },
  });
  await audit(
    deps.db,
    who.actor,
    {
      storeId: S,
      action: opts.undoOf ? 'website.look.undo' : 'website.look.restore',
      entityType: 'LayoutSnapshot',
      entityId: target.id,
      before: { look: before.id, keys: plan.writes.map((w) => w.key) },
      after: { restore: log.id, reason: opts.reason || undefined, written: plan.writes.map((w) => w.key), kept, hidden: plan.hidden, adsOn, adsOff, paused, resumed },
    },
    who.ctx,
  );
  return { restoreId: log.id, beforeId: before.id, written: plan.writes.map((w) => w.key), kept, hidden: plan.hidden, paused: paused.length, resumed: resumed.length, adsOn, adsOff };
}

async function restoreLook(deps: LookDeps, who: LookWho, o: Record<string, unknown>): Promise<RestoreDone> {
  const row =
    o.id === 'launch'
      ? await deps.db.layoutSnapshot.findFirst({ where: { storeId: S, isLaunchDefault: true, archivedAt: null, payload: { path: ['scope'], equals: LOOK_SCOPE } }, orderBy: { createdAt: 'desc' } })
      : await findLook(deps, o.id);
  if (!row) throw new LookError('NO_LAUNCH_DEFAULT', 409);
  if (row.archivedAt) throw new LookError('NOT_ALLOWED', 409, ['archived']);
  return applyLook(deps, who, row, { version: o.version, reason: str(o.reason, REASON_MAX), undoOf: null, pause: row.isLaunchDefault });
}

async function undoRestore(deps: LookDeps, who: LookWho, o: Record<string, unknown>): Promise<RestoreDone> {
  if (typeof o.restoreId !== 'string' || !UUID_RE.test(o.restoreId)) throw new LookError('INVALID_INPUT', 400, ['restoreId']);
  const newest = (await deps.db.layoutRestore.findMany({ where: { storeId: S }, orderBy: { createdAt: 'desc' }, take: LOG_SHOWN, include: { snapshot: { select: { payload: true } } } })).filter((r) => isShopLook(r.snapshot.payload))[0];
  if (!newest || newest.id !== o.restoreId) throw new LookError('NOT_ALLOWED', 409, ['newest']);
  const meta = metaOf(newest.previousPayload);
  if (!meta) throw new LookError('NOT_ALLOWED', 409, ['meta']);
  if (await deps.db.layoutRestore.count({ where: { undoOfId: newest.id } })) throw new LookError('NOT_ALLOWED', 409, ['undone']);
  const before = await findLook(deps, meta.beforeId);
  return applyLook(deps, who, before, { version: o.version, reason: '', undoOf: { ...meta, id: newest.id }, pause: false });
}

async function renameLook(deps: LookDeps, who: LookWho, o: Record<string, unknown>): Promise<void> {
  const row = await findLook(deps, o.id);
  const name = str(o.name, NAME_MAX);
  if (!name) throw new LookError('INVALID_INPUT', 400, ['name']);
  if (name === row.name) return;
  await deps.db.layoutSnapshot.update({ where: { id: row.id }, data: { name } });
  await audit(deps.db, who.actor, { storeId: S, action: 'website.look.rename', entityType: 'LayoutSnapshot', entityId: row.id, before: { name: row.name }, after: { name } }, who.ctx);
}

async function setAside(deps: LookDeps, who: LookWho, o: Record<string, unknown>, aside: boolean): Promise<void> {
  const row = await findLook(deps, o.id);
  if (aside && row.isLaunchDefault) throw new LookError('NOT_ALLOWED', 409, ['launch']);
  if (aside === !!row.archivedAt) return;
  await deps.db.layoutSnapshot.update({ where: { id: row.id }, data: { archivedAt: aside ? (deps.now?.() ?? new Date()) : null } });
  await audit(deps.db, who.actor, { storeId: S, action: aside ? 'website.look.archive' : 'website.look.unarchive', entityType: 'LayoutSnapshot', entityId: row.id, before: { archived: !aside }, after: { archived: aside } }, who.ctx);
}

export const LOOK_ACTIONS = ['save', 'restore', 'undo', 'rename', 'archive', 'unarchive'] as const;
export type LookAction = (typeof LOOK_ACTIONS)[number];

/** One step; answers the page as it is after it (and what a restore did). */
export async function lookAction(deps: LookDeps, who: LookWho, raw: unknown): Promise<{ view: LookView; done?: RestoreDone; id?: string }> {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const action = o.action as LookAction;
  if (!(LOOK_ACTIONS as readonly string[]).includes(String(o.action))) throw new LookError('INVALID_INPUT', 400, ['action']);
  if (action === 'save') {
    const id = await saveLook(deps, who, o);
    return { view: await lookView(deps), id };
  }
  if (action === 'restore' || action === 'undo') {
    const done = action === 'restore' ? await restoreLook(deps, who, o) : await undoRestore(deps, who, o);
    return { view: await lookView(deps), done };
  }
  if (action === 'rename') await renameLook(deps, who, o);
  else await setAside(deps, who, o, action === 'archive');
  return { view: await lookView(deps) };
}

/** /api/admin/website/launch-default — GET the page (`website.read`); POST one step (`website.layout.write`). */
export async function launchDefaultHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST') return fail(405, 'method-not-allowed');
  const b = method === 'GET' ? {} : await body(request).catch(() => ({}) as Record<string, unknown>);
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'website.read' : 'website.layout.write', storeId: S });
  if (g instanceof Response) return g;
  const d: LookDeps = { db: deps!.db, resolver: deps!.resolver };
  const who: LookWho = { actor: g.actor, ctx: g.ctx, can: (p) => g.permissions?.has(p as never) ?? false };
  try {
    if (method === 'GET') return json({ ok: true, ...(await lookView(d)) });
    const r = await lookAction(d, who, b);
    return json({ ok: true, ...r.view, done: r.done, id: r.id });
  } catch (e) {
    return e instanceof LookError ? json({ ok: false, error: e.code, details: e.details }, { status: e.status }) : errorResponse(e);
  }
}

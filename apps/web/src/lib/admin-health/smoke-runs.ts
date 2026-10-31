// S21 · PR 418 (§5 REP-07e, CN-016) — Reports › Site health › Smoke runs: the newest smoke test after a deploy and the
// newest other run (nightly, first week), page by page on a phone and a desktop, with each page's picture. Read from
// what the server kept (infra/deploy/smoke.sh → state/smoke-runs/<deploy|scheduled>/: result.json, rows.json, *.jpg;
// the app's read-only /state mount). Seeing needs `health.read`. The pictures of admin pages can show customers' names
// (the Orders list), so they are shown only with `health.smoke.shots`; the shop's own pages are public anyway.
// Read-only: nothing here starts a run or changes the shop.
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';

export const SMOKE_SLOTS = ['deploy', 'scheduled'] as const;
export type SmokeSlot = (typeof SMOKE_SLOTS)[number];
export const isSmokeSlot = (x: unknown): x is SmokeSlot => typeof x === 'string' && (SMOKE_SLOTS as readonly string[]).includes(x);
export const SMOKE_SHOWS = ['failed', 'all'] as const;
export type SmokeShow = (typeof SMOKE_SHOWS)[number];

export interface SmokeDeps {
  db: PrismaClient;
  /** The server's state folder; default EXTAS_STATE_DIR. */
  stateDir?: string | null;
}
export interface SmokeWho {
  actor: Actor;
  ctx: RequestContext;
}

/** One page × screen as the run saw it. */
export interface SmokeRow {
  path: string;
  screen: string;
  status: number;
  landed: string;
  ok: boolean;
  problems: string[];
  /** The picture's file name; null when there is none or the viewer may not see it. */
  shot: string | null;
  /** An admin page (its picture needs `health.smoke.shots`). */
  admin: boolean;
}
/** One page with its screens (phone, desktop), failed pages first. */
export interface SmokePage {
  path: string;
  ok: boolean;
  admin: boolean;
  screens: SmokeRow[];
}
export interface SmokeRun {
  slot: SmokeSlot;
  at: string;
  kind: string;
  sha: string;
  ok: boolean;
  pages: number;
  failed: number;
  rolledBack: boolean;
  problems: string[];
  database: { appendOnly: string; appRole: string } | null;
  /** Written by the server (file time), for "how long ago". */
  writtenAt: string;
  /** False for a run from before PR 418 (no rows.json): the summary only. */
  hasRows: boolean;
}
export interface SmokeView {
  slot: SmokeSlot;
  show: SmokeShow;
  /** Which slots have a kept run. */
  slots: Record<SmokeSlot, { at: string; ok: boolean } | null>;
  run: SmokeRun | null;
  pages: SmokePage[];
  /** Pages in the run (all screens counted once per page) and how many failed on any screen. */
  pageCount: number;
  failedPages: number;
  canSeeAdminShots: boolean;
}

export class SmokePageError extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'INVALID_INPUT' | 'FORBIDDEN',
    readonly status: number,
  ) {
    super(code);
  }
}
export const isSmokePageError = (e: unknown): e is SmokePageError => e instanceof SmokePageError;

const S = MOTHER_STORE_ID;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.slice(0, max) : '');
const int = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : 0);
const strs = (v: unknown, n = 20) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, n).map((x) => x.slice(0, 300)) : []);
/** A picture's file name as tools/smoke.mjs makes it (no folder, no dot-dot). */
export const SHOT_NAME = /^[A-Za-z0-9][A-Za-z0-9-]{0,200}\.jpg$/;
const stateDirOf = (deps: SmokeDeps) => (deps.stateDir === undefined ? process.env.EXTAS_STATE_DIR || null : deps.stateDir);
const slotDir = (dir: string, slot: SmokeSlot) => join(dir, 'smoke-runs', slot);

async function readJson(p: string): Promise<{ data: Record<string, unknown>; at: Date } | null> {
  try {
    const [text, st] = await Promise.all([readFile(p, 'utf8'), stat(p)]);
    const data = JSON.parse(text) as unknown;
    return isObj(data) ? { data, at: st.mtime } : null;
  } catch {
    return null;
  }
}

/** The rows of a kept run, checked field by field (anything else in the file is ignored). */
export function rowsOf(file: unknown): Omit<SmokeRow, 'admin'>[] {
  if (!isObj(file) || !Array.isArray(file.rows)) return [];
  return file.rows.filter(isObj).flatMap((r) => {
    const path = str(r.path, 500);
    if (!path.startsWith('/')) return [];
    const shot = str(r.screenshot, 260);
    return [{ path, screen: str(r.screen, 20) || 'phone', status: int(r.status), landed: str(r.landed, 500), ok: r.ok === true, problems: strs(r.problems, 10), shot: SHOT_NAME.test(shot) ? shot : null }];
  });
}

/** Pages with their screens: failed first, then by path; `failed` keeps only pages that failed on some screen. */
export function pagesOf(rows: Omit<SmokeRow, 'admin'>[], show: SmokeShow, canSeeAdminShots: boolean): SmokePage[] {
  const by = new Map<string, SmokePage>();
  for (const r of rows) {
    const admin = r.path.startsWith('/admin');
    const page = by.get(r.path) ?? { path: r.path, ok: true, admin, screens: [] };
    page.screens.push({ ...r, admin, shot: admin && !canSeeAdminShots ? null : r.shot });
    page.ok &&= r.ok;
    by.set(r.path, page);
  }
  const all = [...by.values()].sort((a, b) => Number(a.ok) - Number(b.ok) || a.path.localeCompare(b.path));
  return show === 'failed' ? all.filter((p) => !p.ok) : all;
}

async function runOf(dir: string, slot: SmokeSlot): Promise<{ run: SmokeRun; rows: Omit<SmokeRow, 'admin'>[] } | null> {
  const [result, rowsFile] = await Promise.all([readJson(join(slotDir(dir, slot), 'result.json')), readJson(join(slotDir(dir, slot), 'rows.json'))]);
  if (!result) return null;
  const d = result.data;
  const db = isObj(d.database) ? { appendOnly: str(d.database.appendOnly), appRole: str(d.database.appRole, 100) } : null;
  const rows = rowsOf(rowsFile?.data);
  return {
    run: { slot, at: str(d.at, 80), kind: str(d.kind, 40), sha: str(d.sha, 40), ok: d.ok === true, pages: int(d.pages), failed: int(d.failed), rolledBack: d.rolledBack === true, problems: strs(d.problems), database: db, writtenAt: result.at.toISOString(), hasRows: !!rowsFile },
    rows,
  };
}

/** The page's data (`health.read`). Without `slot`, the newer kept run is shown; without `show`, failed pages first. */
export async function smokeRunsView(deps: SmokeDeps, who: SmokeWho, opts: { slot?: string | null; show?: string | null } = {}): Promise<SmokeView> {
  const held = await requirePermission(deps.db, who.actor, 'health.read', { storeId: S });
  const canSeeAdminShots = held.has('health.smoke.shots');
  const dir = stateDirOf(deps);
  const kept = dir ? await Promise.all(SMOKE_SLOTS.map((s) => runOf(dir, s))) : SMOKE_SLOTS.map(() => null);
  const slots = Object.fromEntries(SMOKE_SLOTS.map((s, i) => [s, kept[i] ? { at: kept[i]!.run.at, ok: kept[i]!.run.ok } : null])) as SmokeView['slots'];
  const newest = kept.filter((k) => !!k).sort((a, b) => b.run.writtenAt.localeCompare(a.run.writtenAt))[0]?.run.slot ?? 'deploy';
  const slot = isSmokeSlot(opts.slot) ? opts.slot : newest;
  const chosen = kept[SMOKE_SLOTS.indexOf(slot)] ?? null;
  const allPages = chosen ? pagesOf(chosen.rows, 'all', canSeeAdminShots) : [];
  const failedPages = allPages.filter((p) => !p.ok).length;
  const show: SmokeShow = opts.show === 'all' || opts.show === 'failed' ? opts.show : failedPages ? 'failed' : 'all';
  return { slot, show, slots, run: chosen?.run ?? null, pages: show === 'failed' ? allPages.filter((p) => !p.ok) : allPages, pageCount: allPages.length, failedPages, canSeeAdminShots };
}

/**
 * One picture of a kept run (`health.read`; an admin page's picture also `health.smoke.shots`). Only a file the run's
 * rows name is served, so nothing else in the state folder can be read through here.
 */
export async function smokeShot(deps: SmokeDeps, who: SmokeWho, slot: unknown, file: unknown): Promise<Buffer> {
  const held = await requirePermission(deps.db, who.actor, 'health.read', { storeId: S });
  if (!isSmokeSlot(slot) || typeof file !== 'string' || !SHOT_NAME.test(file)) throw new SmokePageError('INVALID_INPUT', 400);
  const dir = stateDirOf(deps);
  if (!dir) throw new SmokePageError('NOT_FOUND', 404);
  const row = rowsOf((await readJson(join(slotDir(dir, slot), 'rows.json')))?.data).find((r) => r.shot === file);
  if (!row) throw new SmokePageError('NOT_FOUND', 404);
  if (row.path.startsWith('/admin') && !held.has('health.smoke.shots')) throw new SmokePageError('FORBIDDEN', 403);
  try {
    return await readFile(join(slotDir(dir, slot), file));
  } catch {
    throw new SmokePageError('NOT_FOUND', 404);
  }
}

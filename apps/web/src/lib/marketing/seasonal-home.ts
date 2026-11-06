// S13 · PR 280 (register "Seasonal homepage switching, scheduled"; Blueprint CN-012 (1) "scheduled campaigns switch by
// date, with the launch default as fallback", D10.3 named snapshots) — Marketing › Seasonal home. Off as it ships
// (`marketing.seasonalHome`).
// - Looks: "Save the home page as it is now" keeps the home page's own settings (lib/shop/seasonal-home-model
//   SEASONAL_HOME_KEYS) under a name ("Eid 2027") as a LayoutSnapshot; the owner then changes the look for the season:
//   which sections show and in what order, the hero's three lines in both languages (empty = the usual words), and the
//   collection whose products slide in the hero. Nothing on the live home page changes while he edits.
// - Windows: a look is scheduled from a start until an end (empty = until stopped), typed on the shop's clock
//   (`store.timeZone`). Two windows may not overlap (checked and saved under one lock, follow-up 651). Inside a window the home page shows the look (lib/shop/
//   seasonal-home); after it, the home page is the owner's own home settings again by itself, because nothing is ever
//   written to those settings. "Stop" ends a live or upcoming window at once; stopped windows are kept, never deleted.
// - Stopping a window and setting a look aside work even while the switch is off; everything else needs it on. A look
//   with a live or upcoming window cannot be set aside. Looks are set aside and brought back, never deleted.
// Seeing needs `marketing.campaigns.read`; changing needs `marketing.campaigns.write`, the settings card too. Every
// change is audited. No price, offer, discount or checkout ever changes; no money moves.
import { createHash } from 'node:crypto';
import { audit } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { HOME_SECTIONS, homeSectionsSchema, registry, seasonalHomeSettingsSchema, storeTarget, type HomeSectionId, type SeasonalHomeSettings, type ShopLabel, type Value } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { HOME_LOOK_SCOPE, lookOf, lookPayload, overlaps, SEASONAL_HOME_KEYS, utcToWall, wallToUtc, windowState, type HomeLook, type WindowState } from '../shop/seasonal-home-model';
import type { AdPlatformsWho } from './ad-platforms';

const S = MOTHER_STORE_ID;
/** Looks and windows shown on the page (page-length guards, not business numbers). */
const LOOKS_SHOWN = 100; // hardcode-ok: a page-length guard
const WINDOWS_SHOWN = 200; // hardcode-ok: a page-length guard
const COLLECTIONS_SHOWN = 300; // hardcode-ok: a picker-length guard
const NAME_MAX = 80; // hardcode-ok: a text-length guard
const LINE_MAX = 160; // hardcode-ok: the hero line's own limit (shopLabelSchema)
/** The hero lines the look editor changes. */
export const HERO_LINES = ['eyebrow', 'title', 'sub'] as const;
type HeroLine = (typeof HERO_LINES)[number];

export class SeasonalHomeError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: string[],
  ) {
    super(code);
  }
}

export interface SeasonalHomeDeps {
  db: PrismaClient;
  resolver: AdminDeps['resolver'];
  now?: () => Date;
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const wordsOf = (l: ShopLabel | undefined): { en: string; bn: string } | null => (l && 'en' in l ? { en: l.en, bn: l.bn } : null);

export interface LookRow {
  id: string;
  name: string;
  archived: boolean;
  sections: { id: HomeSectionId; on: boolean }[];
  /** The hero's lines in the owner's own words, or null = the usual words. */
  hero: Record<HeroLine, { en: string; bn: string } | null>;
  /** The collection whose products slide in the hero, or null = the categories in turns. */
  collection: string | null;
  /** A live or upcoming window shows this look. */
  inUse: boolean;
}

export interface WindowRow {
  id: string;
  lookId: string;
  lookName: string;
  /** On the shop's clock (`YYYY-MM-DDTHH:mm`). */
  starts: string;
  ends: string | null;
  state: WindowState;
  stoppedAt: string | null;
}

export interface SeasonalHomeOverview {
  settings: SeasonalHomeSettings;
  card: { key: 'seasonalHome'; value: SeasonalHomeSettings; version: string };
  timeZone: string;
  /** The window the home page shows now, if any. */
  live: WindowRow | null;
  looks: LookRow[];
  windows: WindowRow[];
  collections: { slug: string; nameEn: string; nameBn: string | null }[];
}

const settingsOf = async (deps: SeasonalHomeDeps): Promise<SeasonalHomeSettings> => (await deps.resolver.value('marketing.seasonalHome', { storeId: S })) as SeasonalHomeSettings;
const zoneOf = async (deps: SeasonalHomeDeps): Promise<string> => (await deps.resolver.value('store.timeZone', { storeId: S })) as string;

/** The look's home settings, every key filled: the look's own value, else the owner's own setting. */
async function filledLook(deps: SeasonalHomeDeps, payload: unknown): Promise<Required<HomeLook>> {
  const look = lookOf(payload);
  const own = await Promise.all(SEASONAL_HOME_KEYS.map((k) => (k in look ? look[k] : deps.resolver.value(k, { storeId: S }))));
  return Object.fromEntries(SEASONAL_HOME_KEYS.map((k, i) => [k, own[i]])) as Required<HomeLook>;
}

function lookRow(r: { id: string; name: string; archivedAt: Date | null; payload: unknown }, inUse: boolean): LookRow {
  const look = lookOf(r.payload);
  const sections = look['home.sections'] ?? (registry['home.sections'].default as Value<'home.sections'>);
  const hero = look['home.hero'];
  return {
    id: r.id,
    name: r.name,
    archived: r.archivedAt !== null,
    sections: [...sections, ...HOME_SECTIONS.filter((id) => !sections.some((x) => x.id === id)).map((id) => ({ id, on: false }))],
    hero: Object.fromEntries(HERO_LINES.map((l) => [l, wordsOf(hero?.[l])])) as LookRow['hero'],
    collection: look['home.heroSlides']?.collection ?? null,
    inUse,
  };
}

/** Marketing › Seasonal home: the switch, the look on the home page now, the looks and the windows. */
export async function seasonalHomeOverview(deps: SeasonalHomeDeps): Promise<SeasonalHomeOverview> {
  const [settings, timeZone] = await Promise.all([settingsOf(deps), zoneOf(deps)]);
  const now = deps.now?.() ?? new Date();
  const [snaps, wins, cols] = await Promise.all([
    deps.db.layoutSnapshot.findMany({ where: { storeId: S, isLaunchDefault: false, payload: { path: ['scope'], equals: HOME_LOOK_SCOPE } }, orderBy: [{ archivedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }], take: LOOKS_SHOWN }),
    deps.db.scheduledLayoutSwitch.findMany({ where: { storeId: S }, orderBy: { applyAt: 'desc' }, take: WINDOWS_SHOWN, include: { snapshot: { select: { name: true } } } }),
    deps.db.collection.findMany({ where: { storeId: S, archivedAt: null }, orderBy: { nameEn: 'asc' }, take: COLLECTIONS_SHOWN, select: { slug: true, nameEn: true, nameBn: true } }),
  ]);
  const windows: WindowRow[] = wins.map((w) => ({
    id: w.id,
    lookId: w.snapshotId,
    lookName: w.snapshot.name,
    starts: utcToWall(w.applyAt, timeZone),
    ends: w.revertAt ? utcToWall(w.revertAt, timeZone) : null,
    state: windowState(w, now),
    stoppedAt: w.stoppedAt ? w.stoppedAt.toISOString() : null,
  }));
  const busy = new Set(windows.filter((w) => w.state === 'LIVE' || w.state === 'UPCOMING').map((w) => w.lookId));
  const looks = snaps.map((r) => lookRow(r, busy.has(r.id)));
  const liveLooks = new Set(looks.filter((l) => !l.archived).map((l) => l.id));
  return {
    settings,
    card: { key: 'seasonalHome', value: settings, version: versionOf(settings) },
    timeZone,
    live: settings.enabled ? (windows.find((w) => w.state === 'LIVE' && liveLooks.has(w.lookId)) ?? null) : null,
    looks,
    windows,
    collections: cols,
  };
}

/** PUT: the settings card ({key: 'seasonalHome', value, version}). Audited. */
export async function saveSeasonalHomeCard(deps: SeasonalHomeDeps, who: AdPlatformsWho, input: unknown): Promise<SeasonalHomeOverview['card']> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (o.key !== 'seasonalHome') throw new SeasonalHomeError('INVALID_INPUT', 400, ['key']);
  const before = await settingsOf(deps);
  if (o.version !== versionOf(before)) throw new SeasonalHomeError('STALE', 409);
  const ok = seasonalHomeSettingsSchema.safeParse(o.value);
  if (!ok.success) throw new SeasonalHomeError('INVALID_INPUT', 400, [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  if (versionOf(ok.data) !== versionOf(before)) {
    await deps.resolver.set('marketing.seasonalHome', ok.data, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Marketing › Seasonal home' });
    await audit(deps.db, who.actor, { storeId: S, action: 'seasonalHome.settings', entityType: 'Setting', entityId: 'marketing.seasonalHome', before: { ...before }, after: { ...ok.data } }, who.ctx);
  }
  return { key: 'seasonalHome', value: ok.data, version: versionOf(ok.data) };
}

type Db = Pick<PrismaClient, 'layoutSnapshot' | 'scheduledLayoutSwitch'>;

/**
 * The seasonal windows' one lock (follow-up 651): adding a window (the overlap check and the save) and setting a look
 * aside run inside one transaction holding a per-store advisory lock, so two saves at the same moment are taken one
 * after the other and the second sees the first.
 */
async function underWindowLock<T>(db: PrismaClient, fn: (tx: Db) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`seasonal-home:${S}`}, 0))`;
    return fn(tx);
  });
}

/** A hero line from the editor: both languages (the owner's words), both empty (the usual words), else undefined. */
function lineOf(v: unknown): { en: string; bn: string } | null | undefined {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  const en = str(o.en, LINE_MAX + 1);
  const bn = str(o.bn, LINE_MAX + 1);
  if (!en && !bn) return null;
  return en && bn && en.length <= LINE_MAX && bn.length <= LINE_MAX ? { en, bn } : undefined;
}

/**
 * POST {action}: `look.save` {name} · `look.update` {id, name, sections, hero: {eyebrow, title, sub}, collection} ·
 * `look.archive` / `look.restore` {id} · `window.add` {lookId, starts, ends} · `window.stop` {id}. Only while the switch
 * is on (stopping a window and setting a look aside work when off). Audited.
 */
export async function seasonalHomeAction(deps: SeasonalHomeDeps, who: AdPlatformsWho, b: Record<string, unknown>): Promise<{ id: string }> {
  const action = typeof b.action === 'string' ? b.action : '';
  const settings = await settingsOf(deps);
  if (!settings.enabled && action !== 'window.stop' && action !== 'look.archive') throw new SeasonalHomeError('SWITCHED_OFF', 409, ['marketing.seasonalHome']);
  const now = deps.now?.() ?? new Date();
  const id = typeof b.id === 'string' && UUID_RE.test(b.id) ? b.id : null;
  const log = (entityType: string, entityId: string, after: Record<string, unknown>, before?: Record<string, unknown>) => audit(deps.db, who.actor, { storeId: S, action: `seasonalHome.${action}`, entityType, entityId, ...(before ? { before } : {}), after }, who.ctx);
  const findLook = async (lookId: string | null) => {
    const row = lookId ? await deps.db.layoutSnapshot.findFirst({ where: { id: lookId, storeId: S, isLaunchDefault: false, payload: { path: ['scope'], equals: HOME_LOOK_SCOPE } } }) : null;
    if (!row) throw new SeasonalHomeError('NOT_FOUND', 404, [action.startsWith('window') ? 'lookId' : 'id']);
    return row;
  };
  const busy = async (db: Db, lookId: string) => (await db.scheduledLayoutSwitch.findMany({ where: { storeId: S, snapshotId: lookId, status: 'SCHEDULED' } })).some((w) => windowState(w, now) !== 'ENDED');

  if (action === 'look.save') {
    const name = str(b.name, NAME_MAX + 1);
    if (!name || name.length > NAME_MAX) throw new SeasonalHomeError('INVALID_INPUT', 400, ['name']);
    const look = await filledLook(deps, null);
    const row = await deps.db.layoutSnapshot.create({ data: { storeId: S, name, payload: lookPayload(look) as object, createdById: who.actor.staffUserId ?? null } });
    await log('LayoutSnapshot', row.id, { name, keys: [...SEASONAL_HOME_KEYS] });
    return { id: row.id };
  }
  if (action === 'look.update') {
    const row = await findLook(id);
    if (row.archivedAt) throw new SeasonalHomeError('NOT_FOUND', 404, ['id']);
    const name = str(b.name, NAME_MAX + 1);
    const sections = homeSectionsSchema.safeParse(b.sections);
    const heroIn = b.hero && typeof b.hero === 'object' ? (b.hero as Record<string, unknown>) : {};
    const lines = Object.fromEntries(HERO_LINES.map((l) => [l, lineOf(heroIn[l])])) as Record<HeroLine, { en: string; bn: string } | null | undefined>;
    const collection = b.collection === null || b.collection === '' || b.collection === undefined ? null : str(b.collection, 120);
    const known = collection ? await deps.db.collection.findFirst({ where: { storeId: S, slug: collection, archivedAt: null }, select: { id: true } }) : null;
    const bad = [!name || name.length > NAME_MAX ? 'name' : '', sections.success ? '' : 'sections', ...HERO_LINES.filter((l) => lines[l] === undefined), collection && !known ? 'collection' : ''].filter(Boolean);
    if (bad.length) throw new SeasonalHomeError('INVALID_INPUT', 400, [...new Set(bad)]);
    const look = await filledLook(deps, row.payload);
    const heroDefault = registry['home.hero'].default as Value<'home.hero'>;
    const hero = { ...look['home.hero'] };
    for (const l of HERO_LINES) {
      const w = lines[l];
      // the owner's words, or — both boxes empty — the look's usual words (a word key), else the shop's usual words
      hero[l] = w ?? ('key' in look['home.hero'][l] ? look['home.hero'][l] : heroDefault[l]);
    }
    const next: Required<HomeLook> = { ...look, 'home.sections': sections.data!, 'home.hero': hero, 'home.heroSlides': { ...look['home.heroSlides'], collection } };
    const checked = lookOf(lookPayload(next));
    const broken = SEASONAL_HOME_KEYS.filter((k) => !(k in checked));
    if (broken.length) throw new SeasonalHomeError('INVALID_INPUT', 400, broken);
    await deps.db.layoutSnapshot.update({ where: { id: row.id }, data: { name, payload: lookPayload(next) as object } });
    await log('LayoutSnapshot', row.id, { name, sections: next['home.sections'], hero: { eyebrow: hero.eyebrow, title: hero.title, sub: hero.sub }, collection }, { name: row.name, payload: row.payload as object });
    return { id: row.id };
  }
  if (action === 'look.archive' || action === 'look.restore') {
    const row = await findLook(id);
    // under the windows' lock (follow-up 651): a window can never be added to a look being set aside at the same moment
    await underWindowLock(deps.db, async (tx) => {
      if (action === 'look.archive' && !row.archivedAt && (await busy(tx, row.id))) throw new SeasonalHomeError('IN_USE', 409, ['id']);
      await tx.layoutSnapshot.update({ where: { id: row.id }, data: { archivedAt: action === 'look.archive' ? (row.archivedAt ?? now) : null } });
    });
    await log('LayoutSnapshot', row.id, { archived: action === 'look.archive' });
    return { id: row.id };
  }
  if (action === 'window.add') {
    const lookId = typeof b.lookId === 'string' && UUID_RE.test(b.lookId) ? b.lookId : null;
    const look = await findLook(lookId);
    if (look.archivedAt) throw new SeasonalHomeError('NOT_FOUND', 404, ['lookId']);
    const tz = await zoneOf(deps);
    const applyAt = wallToUtc(b.starts, tz);
    const revertAt = wallToUtc(b.ends, tz);
    const bad = [!applyAt ? 'starts' : '', revertAt === undefined || (revertAt && applyAt && revertAt.getTime() <= applyAt.getTime()) || (revertAt && revertAt.getTime() <= now.getTime()) ? 'ends' : ''].filter(Boolean);
    if (bad.length) throw new SeasonalHomeError('INVALID_INPUT', 400, bad);
    const w = { applyAt: applyAt!, revertAt: revertAt ?? null };
    // the overlap check and the save run under one lock (follow-up 651): two saves at the same moment cannot both pass
    const row = await underWindowLock(deps.db, async (tx) => {
      const still = await tx.layoutSnapshot.findFirst({ where: { id: look.id, archivedAt: null }, select: { id: true } });
      if (!still) throw new SeasonalHomeError('NOT_FOUND', 404, ['lookId']);
      const others = await tx.scheduledLayoutSwitch.findMany({ where: { storeId: S, status: 'SCHEDULED' }, select: { id: true, applyAt: true, revertAt: true, status: true } });
      if (others.some((o) => windowState(o, now) !== 'ENDED' && overlaps(o, w))) throw new SeasonalHomeError('OVERLAP', 409, ['starts', 'ends']);
      return tx.scheduledLayoutSwitch.create({ data: { storeId: S, snapshotId: look.id, applyAt: w.applyAt, revertAt: w.revertAt, status: 'SCHEDULED' } });
    });
    await log('ScheduledLayoutSwitch', row.id, { lookId: look.id, lookName: look.name, applyAt: w.applyAt.toISOString(), revertAt: w.revertAt?.toISOString() ?? null });
    return { id: row.id };
  }
  if (action === 'window.stop') {
    const row = id ? await deps.db.scheduledLayoutSwitch.findFirst({ where: { id, storeId: S } }) : null;
    if (!row) throw new SeasonalHomeError('NOT_FOUND', 404, ['id']);
    const state = windowState(row, now);
    if (state === 'STOPPED' || state === 'ENDED') throw new SeasonalHomeError('ENDED', 409, ['id']);
    await deps.db.scheduledLayoutSwitch.update({ where: { id: row.id }, data: { status: 'STOPPED', stoppedAt: now } });
    await log('ScheduledLayoutSwitch', row.id, { status: 'STOPPED', was: state }, { status: row.status });
    return { id: row.id };
  }
  throw new SeasonalHomeError('INVALID_INPUT', 400, ['action']);
}

const answer = (e: unknown): Response => (e instanceof SeasonalHomeError ? json({ ok: false, error: e.code, details: e.details }, { status: e.status }) : errorResponse(e));

/** /api/admin/marketing/seasonal — GET the page (`marketing.campaigns.read`); PUT the card and POST an action (`marketing.campaigns.write`). */
export async function seasonalHomeHandler(request: Request, deps: AdminDeps | null, now?: () => Date): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const b = method === 'GET' ? {} : await body(request).catch(() => ({}) as Record<string, unknown>);
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'marketing.campaigns.read' : 'marketing.campaigns.write', storeId: S });
  if (g instanceof Response) return g;
  const d: SeasonalHomeDeps = { db: deps!.db, resolver: deps!.resolver, ...(now ? { now } : {}) };
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    if (method === 'GET') return json({ ok: true, ...(await seasonalHomeOverview(d)) });
    if (method === 'PUT') return json({ ok: true, cards: { seasonalHome: await saveSeasonalHomeCard(d, who, b) } });
    return json({ ok: true, ...(await seasonalHomeAction(d, who, b as Record<string, unknown>)) });
  } catch (e) {
    return answer(e);
  }
}

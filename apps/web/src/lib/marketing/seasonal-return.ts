// S12 · PR 530 (register "Seasonal page lifecycle — archived and live are states, never deletion. A seasonal page
// returns on its own when the occasion comes round"; ADMIN-ARCHITECTURE "Landing pages … PR 254–255, 246, 530") —
// Marketing › Landing pages › Seasonal pages › Each year: the yearly return of the permanent seasonal pages (PR 246).
//
// - The screen: every seasonal page not put away, with its occasion, whether "comes back each year" is ticked, and where
//   it stands (seasonal-return-model.ts `returnStatus`: back now until a day, coming back on a day, no dates, …); the
//   counts; the switch card `marketing.seasonalReturn` (off as it ships) and the occasions' dates (the owner's own).
// - The return writes nothing on the page's state: the shop shows a ticked, taken-down page live while today is inside
//   its window (seasonal.ts `servedSeasonal`), so turning the switch off or unticking takes it back at once. A page
//   never live and a page put away never come back by themselves (archived and live are states; nothing is deleted).
// - Seeing needs `marketing.landing.read`; the tick, the card and the dates `marketing.landing.write`, each saved with
//   what it was before (the dates with their version: STALE) and audited (marketing.seasonal.returns / .returnSettings).
import { createHash } from 'node:crypto';
import { audit } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { seasonalReturnSchema, storeTarget, type SeasonalReturnSettings, type SeasonalSettings } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { dayOf } from '../journal/schedule-model';
import { occasionOf, publishIssues, seasonalSectionsOf, stateOf, type PageState } from './seasonal-model';
import { returnStatus, returnsOf, type ReturnStatus, type SeasonSpan } from './seasonal-return-model';
import { SeasonalError, type SeasonalWho } from './seasonal';

const S = MOTHER_STORE_ID;
type Db = PrismaClient;
type Resolver = AdminDeps['resolver'];
const KEY = 'marketing.seasonalReturn';
/** The card of one page is saved as {key: 'page:<id>', on}. */
const PAGE_KEY = /^page:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

export interface ReturnRow {
  id: string;
  slug: string;
  title: string;
  occasion: string | null;
  returns: boolean;
  state: PageState;
  status: ReturnStatus;
  span: SeasonSpan | null;
  /** Where it would stand were "comes back each year" ticked (what its card says beside the tick). */
  ticked: { status: ReturnStatus; span: SeasonSpan | null };
}

export interface ReturnScreen {
  today: string;
  timeZone: string;
  rows: ReturnRow[];
  counts: { back: number; waiting: number; noDates: number };
  card: { key: typeof KEY; value: SeasonalReturnSettings; version: string };
  occasions: SeasonalSettings['occasions'];
  /** The seasonal pages' own switch (`marketing.seasonal.enabled`): while off the shop shows none of them. */
  pagesOn: boolean;
}

/** Every seasonal page not put away with where it stands, the counts, the card and the occasions. */
export async function returnScreen(db: Db, resolver: Resolver, now: Date = new Date(), storeId: number = S): Promise<ReturnScreen> {
  const [pages, value, seasonal, timeZone] = await Promise.all([
    db.page.findMany({
      where: { storeId, kind: 'SEASONAL', archivedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, slug: true, titleEn: true, recurrence: true, status: true, publishedAt: true, archivedAt: true, sections: { select: { type: true, isVisible: true, config: true, archivedAt: true } } },
    }),
    resolver.value(KEY, { storeId }),
    resolver.value('marketing.seasonal', { storeId }),
    resolver.value('store.timeZone', { storeId }),
  ]);
  const today = dayOf(now, timeZone);
  const rows: ReturnRow[] = pages.map((p) => {
    const occasion = occasionOf(p.recurrence);
    const returns = returnsOf(p.recurrence);
    const rp = { ...p, occasion, returns, ready: publishIssues(seasonalSectionsOf(p.sections)).length === 0 };
    const r = returnStatus(rp, value, today);
    return { id: p.id, slug: p.slug, title: p.titleEn, occasion, returns, state: stateOf(p), status: r.status, span: r.span, ticked: returnStatus({ ...rp, returns: true }, value, today) };
  });
  const n = (st: ReturnStatus) => rows.filter((r) => r.status === st).length;
  return { today, timeZone, rows, counts: { back: n('back'), waiting: n('waiting'), noDates: n('noDates') }, card: { key: KEY, value, version: versionOf(value) }, occasions: seasonal.occasions, pagesOn: seasonal.enabled };
}

/** Tick or untick "comes back each year" on one page (not put away), audited. */
export async function setReturns(db: Db, who: SeasonalWho, id: string, on: boolean, storeId: number = S): Promise<void> {
  const p = await db.page.findFirst({ where: { id, storeId, kind: 'SEASONAL' }, select: { id: true, recurrence: true, archivedAt: true } });
  if (!p) throw new SeasonalError('NOT_FOUND', 404);
  if (p.archivedAt) throw new SeasonalError('ARCHIVED', 409);
  const was = returnsOf(p.recurrence);
  if (was === on) return;
  const rec = p.recurrence && typeof p.recurrence === 'object' && !Array.isArray(p.recurrence) ? (p.recurrence as Record<string, unknown>) : {};
  await db.page.update({ where: { id }, data: { recurrence: { ...rec, returns: on } } });
  await audit(db, who.actor, { storeId, action: 'marketing.seasonal.returns', entityType: 'Page', entityId: id, before: { returns: was }, after: { returns: on } }, who.ctx);
}

/**
 * PUT: the switch card ({key, on, values: {leadDays, afterDays}}), a page's tick ({key: 'page:<id>', on}) or the dates
 * ({key, dates, version}). Each one audited.
 */
export async function saveReturn(db: Db, resolver: Resolver, who: SeasonalWho, input: unknown, storeId: number = S): Promise<void> {
  const o = (input && typeof input === 'object' ? input : {}) as { key?: unknown; on?: unknown; values?: unknown; dates?: unknown; version?: unknown };
  const page = typeof o.key === 'string' ? PAGE_KEY.exec(o.key) : null;
  if (page) {
    if (typeof o.on !== 'boolean') throw new SeasonalError('INVALID_INPUT', 400, ['on']);
    return setReturns(db, who, page[1]!, o.on, storeId);
  }
  if (o.key !== KEY) throw new SeasonalError('INVALID_INPUT', 400, ['key']);
  const before = await resolver.value(KEY, { storeId });
  let next: unknown;
  if (o.dates !== undefined) {
    if (o.version !== versionOf(before)) throw new SeasonalError('STALE', 409);
    next = { ...before, dates: o.dates };
  } else if (typeof o.on === 'boolean') {
    const v = o.values && typeof o.values === 'object' ? (o.values as Record<string, unknown>) : {};
    next = { ...before, on: o.on, ...('leadDays' in v ? { leadDays: v.leadDays } : {}), ...('afterDays' in v ? { afterDays: v.afterDays } : {}) };
  } else throw new SeasonalError('INVALID_INPUT', 400, ['on']);
  const ok = seasonalReturnSchema.safeParse(next);
  if (!ok.success) throw new SeasonalError('INVALID_INPUT', 400, [...new Set(ok.error.issues.map((i) => i.path.map(String).join('.') || 'value'))]);
  if (o.dates !== undefined) {
    const seasonal = await resolver.value('marketing.seasonal', { storeId });
    const known = new Set([...seasonal.occasions.map((x) => x.key), ...before.dates.map((d) => d.occasion)]);
    const unknown = ok.data.dates.filter((d) => !known.has(d.occasion));
    if (unknown.length) throw new SeasonalError('INVALID_INPUT', 400, ['occasion']);
  }
  if (versionOf(ok.data) === versionOf(before)) return;
  await resolver.set(KEY, ok.data, storeTarget(storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Marketing › Landing pages › Seasonal pages › Each year' });
  await audit(db, who.actor, { storeId, action: 'marketing.seasonal.returnSettings', entityType: 'Setting', entityId: KEY, before: { ...before }, after: { ...ok.data } }, who.ctx);
}

const answer = (e: unknown): Response => (e instanceof SeasonalError ? json({ ok: false, error: e.code, ...(e.details ? { details: e.details } : {}) }, { status: e.status }) : errorResponse(e));

/** /api/admin/marketing/seasonal-return — GET the screen (`marketing.landing.read`); PUT a card, a tick or the dates (`marketing.landing.write`). */
export async function seasonalReturnHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'marketing.landing.read' : 'marketing.landing.write', storeId: S });
  if (g instanceof Response) return g;
  try {
    if (method === 'PUT') await saveReturn(deps!.db, deps!.resolver, { actor: g.actor, ctx: g.ctx }, await body(request));
    const screen = await returnScreen(deps!.db, deps!.resolver);
    return json({ ok: true, screen, cards: { [KEY]: screen.card } });
  } catch (e) {
    return answer(e);
  }
}

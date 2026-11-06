// S12 · PR 246 (Blueprint answer 15, C12 URL map "seasonal /collections/<slug>"; ADMIN-ARCHITECTURE "Landing pages:
// campaign and seasonal landing pages … PR 254–255, 246, 530") — Marketing › Landing pages › Seasonal pages: the
// permanent pages for Eid, winter, Puja and any occasion the owner adds, and the shop's read of one.
//
// - A seasonal page is a Page row of kind SEASONAL with its parts as PageSection rows (seasonal-model.ts), saved the
//   way a landing page is (landing.ts, PR 254): every field and part with the version it was read at (STALE when
//   someone else changed it in between). Its link is /collections/<slug>, so a link that is a category's (live or
//   retired, PR 527) or the "New in" page's is refused (SLUG_TAKEN). Its occasion is one of the owner's
//   (`marketing.seasonal`), kept in Page.recurrence; PR 530 adds the yearly return there ({occasion, returns}, kept
//   when the page is saved; seasonal-return.ts).
// - Kept for good and used again each year: publish (its collection and journal category must be set while those
//   parts are on; Page.publishedAt keeps the last time it went live), take down, archive and restore change its state
//   only — nothing is ever deleted.
// - Seeing needs `marketing.landing.read`; every change needs `marketing.landing.write` and is audited
//   (marketing.seasonal.*). Nothing here writes a price, a discount or an order.
import { createHash } from 'node:crypto';
import { audit, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, Prisma, type PrismaClient } from '@extas/db/client';
import { seasonalSettingsSchema, storeTarget, type SeasonalReturnSettings, type SeasonalSettings } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { dayOf } from '../journal/schedule-model';
import { ROUTES } from '../shop/routes';
import { isBack, nextSpan, returnsOf, spanNow } from './seasonal-return-model';
import {
  SEASONAL_ACTIONS,
  SEASONAL_SECTIONS,
  occasionOf,
  publishIssues,
  seasonalInputSchema,
  seasonalSectionsOf,
  seasonalServe,
  seasonalType,
  stateOf,
  type PageState,
  type SeasonalAction,
  type SeasonalSection,
  type SeasonalServe,
} from './seasonal-model';

const S = MOTHER_STORE_ID;
/** The collections and journal categories the editor offers. */
export const PICK_MAX = 300; // hardcode-ok: a list length, not a business number

export class SeasonalError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: string[],
  ) {
    super(code);
  }
}

type Db = PrismaClient;
type Resolver = AdminDeps['resolver'];
export interface SeasonalWho {
  actor: Actor;
  ctx: RequestContext;
}

export interface SeasonalRow {
  id: string;
  slug: string;
  title: string;
  occasion: string | null;
  collectionName: string | null;
  state: PageState;
  /** When it last went live (ISO), null when never. */
  lastLive: string | null;
  updatedAt: string;
}

export interface SeasonalList {
  rows: SeasonalRow[];
  kpis: { live: number; resting: number; pages: number };
  card: { key: 'seasonal'; value: SeasonalSettings; version: string };
}

export interface SeasonalPageView {
  id: string;
  slug: string;
  titleEn: string;
  titleBn: string | null;
  introEn: string | null;
  introBn: string | null;
  occasion: string | null;
  /** PR 530: "comes back each year" ticked (Page.recurrence.returns). */
  returns: boolean;
  state: PageState;
  lastLive: string | null;
  sections: SeasonalSection[];
  version: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const pageVersion = (updatedAt: Date) => updatedAt.toISOString();
const SECTIONS_SELECT = { select: { type: true, isVisible: true, config: true, archivedAt: true } } as const;
const PAGE_SELECT = { id: true, slug: true, titleEn: true, titleBn: true, bodyEn: true, bodyBn: true, recurrence: true, status: true, publishedAt: true, archivedAt: true, updatedAt: true, sections: SECTIONS_SELECT } as const;

type PageRow = Prisma.PageGetPayload<{ select: typeof PAGE_SELECT }>;
const viewOf = (p: PageRow): SeasonalPageView => ({
  id: p.id,
  slug: p.slug,
  titleEn: p.titleEn,
  titleBn: p.titleBn,
  introEn: p.bodyEn,
  introBn: p.bodyBn,
  occasion: occasionOf(p.recurrence),
  returns: returnsOf(p.recurrence),
  state: stateOf(p),
  lastLive: p.publishedAt?.toISOString() ?? null,
  sections: seasonalSectionsOf(p.sections),
  version: pageVersion(p.updatedAt),
});

/** Every seasonal page with its occasion, collection, state and when it last went live; the counts; the switch's card. */
export async function seasonalList(db: Db, resolver: Resolver, storeId: number = S): Promise<SeasonalList> {
  const [pages, value] = await Promise.all([
    db.page.findMany({ where: { storeId, kind: 'SEASONAL' }, orderBy: { createdAt: 'desc' }, select: PAGE_SELECT }),
    resolver.value('marketing.seasonal', { storeId }),
  ]);
  const views = pages.map(viewOf);
  const cids = [...new Set(views.map((v) => v.sections.find((s) => s.key === 'products')?.config.collectionId).filter((x): x is string => !!x))];
  const cols = cids.length ? await db.collection.findMany({ where: { storeId, id: { in: cids } }, select: { id: true, nameEn: true } }) : [];
  const cn = new Map(cols.map((c) => [c.id, c.nameEn]));
  const rows: SeasonalRow[] = views.map((v, i) => {
    const cid = v.sections.find((s) => s.key === 'products')?.config.collectionId;
    return { id: v.id, slug: v.slug, title: v.titleEn, occasion: v.occasion, collectionName: cid ? (cn.get(cid) ?? null) : null, state: v.state, lastLive: v.lastLive, updatedAt: pages[i]!.updatedAt.toISOString() };
  });
  return {
    rows,
    kpis: { live: rows.filter((r) => r.state === 'live').length, resting: rows.filter((r) => r.state !== 'live' && r.lastLive).length, pages: rows.filter((r) => r.state !== 'archived').length },
    card: { key: 'seasonal', value, version: versionOf(value) },
  };
}

/** One page for the editor (null = not one of this store's seasonal pages). */
export async function seasonalOne(db: Db, id: string, storeId: number = S): Promise<SeasonalPageView | null> {
  if (!UUID.test(id)) return null;
  const p = await db.page.findFirst({ where: { id, storeId, kind: 'SEASONAL' }, select: PAGE_SELECT });
  return p ? viewOf(p) : null;
}

/** What the editor offers: the collections (seasonal ones first) and the journal categories, none archived. */
export async function seasonalChoices(db: Db, storeId: number = S) {
  const [collections, categories] = await Promise.all([
    db.collection.findMany({ where: { storeId, archivedAt: null }, orderBy: [{ kind: 'desc' }, { nameEn: 'asc' }], take: PICK_MAX, select: { id: true, nameEn: true, kind: true } }),
    db.blogCategory.findMany({ where: { storeId, archivedAt: null }, orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }], take: PICK_MAX, select: { id: true, nameEn: true } }),
  ]);
  return { collections: collections.map((c) => ({ id: c.id, name: c.nameEn, seasonal: c.kind === 'SEASONAL' })), categories: categories.map((c) => ({ id: c.id, name: c.nameEn })) };
}

const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/** A link the shop already answers at /collections/<slug>: a category's (live or retired) or the "New in" page's. */
async function linkTaken(db: Db, storeId: number, slug: string): Promise<boolean> {
  if (slug === ROUTES.newIn.split('/').pop()) return true;
  return !!(await db.category.findFirst({ where: { storeId, slug }, select: { id: true } }));
}

/** Create (id null) or save a page: its fields and every part, with the version it was read at. */
export async function saveSeasonal(db: Db, resolver: Resolver, who: SeasonalWho, id: string | null, input: unknown, storeId: number = S): Promise<SeasonalPageView> {
  const ok = seasonalInputSchema.safeParse(input);
  if (!ok.success) throw new SeasonalError('INVALID_INPUT', 400, [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  const d = ok.data;
  const colId = d.sections.products?.config?.collectionId ?? null;
  const catId = d.sections.articles?.config?.categoryId ?? null;
  const [set, col, cat, taken] = await Promise.all([
    resolver.value('marketing.seasonal', { storeId }),
    colId ? db.collection.findFirst({ where: { id: colId, storeId, archivedAt: null }, select: { id: true } }) : Promise.resolve(true),
    catId ? db.blogCategory.findFirst({ where: { id: catId, storeId, archivedAt: null }, select: { id: true } }) : Promise.resolve(true),
    linkTaken(db, storeId, d.slug),
  ]);
  const before = id ? await seasonalOne(db, id, storeId) : null;
  if (id && !before) throw new SeasonalError('NOT_FOUND', 404);
  // an occasion since removed from the owner's list stays on the page that had it
  if (!set.occasions.some((o) => o.key === d.occasion) && before?.occasion !== d.occasion) throw new SeasonalError('INVALID_INPUT', 400, ['occasion']);
  if (!col) throw new SeasonalError('INVALID_INPUT', 400, ['collectionId']);
  if (!cat) throw new SeasonalError('INVALID_INPUT', 400, ['categoryId']);
  if (taken) throw new SeasonalError('SLUG_TAKEN', 409, ['slug']);
  if (before && before.version !== d.version) throw new SeasonalError('STALE', 409);
  if (before?.state === 'archived') throw new SeasonalError('ARCHIVED', 409);
  const fields = { slug: d.slug, titleEn: d.titleEn, titleBn: d.titleBn, bodyEn: d.introEn, bodyBn: d.introBn, recurrence: { occasion: d.occasion, ...(before?.returns ? { returns: true } : {}) } };
  let pageId: string;
  try {
    pageId = await db.$transaction(async (tx) => {
      const page = before ? await tx.page.update({ where: { id: before.id }, data: fields, select: { id: true } }) : await tx.page.create({ data: { storeId, kind: 'SEASONAL', status: 'DRAFT', ...fields }, select: { id: true } });
      const rows = await tx.pageSection.findMany({ where: { pageId: page.id, archivedAt: null }, select: { id: true, type: true } });
      for (const [position, key] of SEASONAL_SECTIONS.entries()) {
        const s = d.sections[key];
        if (!s) continue;
        const row = rows.find((r) => r.type === seasonalType(key));
        const data = { isVisible: s.on, position, config: (s.config ?? {}) as Prisma.InputJsonValue };
        if (row) await tx.pageSection.update({ where: { id: row.id }, data });
        else await tx.pageSection.create({ data: { storeId, pageId: page.id, layoutScope: 'PAGE', type: seasonalType(key), ...data } });
      }
      return page.id;
    });
  } catch (e) {
    if (isUnique(e)) throw new SeasonalError('SLUG_TAKEN', 409, ['slug']);
    throw e;
  }
  const after = (await seasonalOne(db, pageId, storeId))!;
  await audit(db, who.actor, { storeId, action: before ? 'marketing.seasonal.save' : 'marketing.seasonal.create', entityType: 'Page', entityId: pageId, before: before ? { ...before } : undefined, after: { ...after } }, who.ctx);
  return after;
}

const NEXT: Record<SeasonalAction, (s: PageState) => boolean> = {
  publish: (s) => s === 'draft' || s === 'off',
  unpublish: (s) => s === 'live',
  archive: (s) => s !== 'archived',
  restore: (s) => s === 'archived',
};

/** Make live (its collection and journal category set while those parts are on), take down, archive or restore. */
export async function seasonalAction(db: Db, who: SeasonalWho, id: string, input: unknown, now: Date = new Date(), storeId: number = S): Promise<SeasonalPageView> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const action = (SEASONAL_ACTIONS as readonly string[]).includes(String(o.action)) ? (o.action as SeasonalAction) : null;
  if (!action) throw new SeasonalError('INVALID_INPUT', 400, ['action']);
  const before = await seasonalOne(db, id, storeId);
  if (!before) throw new SeasonalError('NOT_FOUND', 404);
  if (before.version !== o.version) throw new SeasonalError('STALE', 409);
  if (!NEXT[action](before.state)) throw new SeasonalError('WRONG_STATE', 409);
  if (action === 'publish') {
    const missing = publishIssues(before.sections);
    if (missing.length) throw new SeasonalError('NOT_READY', 409, missing);
  }
  // a restored page comes back taken down (it keeps its link while it was live once), never live by itself
  const data: Prisma.PageUpdateInput =
    action === 'publish'
      ? { status: 'PUBLISHED', publishedAt: now }
      : action === 'unpublish'
        ? { status: 'UNPUBLISHED' }
        : action === 'archive'
          ? { status: 'ARCHIVED', archivedAt: now }
          : { status: before.lastLive ? 'UNPUBLISHED' : 'DRAFT', archivedAt: null };
  await db.page.update({ where: { id }, data });
  const after = (await seasonalOne(db, id, storeId))!;
  await audit(db, who.actor, { storeId, action: `marketing.seasonal.${action}`, entityType: 'Page', entityId: id, before: { state: before.state }, after: { state: after.state } }, who.ctx);
  return after;
}

/** PUT {key: 'seasonal', value, version}: the seasonal pages' card (audited). */
export async function saveSeasonalSettings(db: Db, resolver: Resolver, who: SeasonalWho, input: unknown, storeId: number = S): Promise<SeasonalList> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (o.key !== 'seasonal') throw new SeasonalError('INVALID_INPUT', 400, ['key']);
  const before = await resolver.value('marketing.seasonal', { storeId });
  if (o.version !== versionOf(before)) throw new SeasonalError('STALE', 409);
  const ok = seasonalSettingsSchema.safeParse(o.value);
  if (!ok.success) throw new SeasonalError('INVALID_INPUT', 400, [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  if (versionOf(ok.data) !== versionOf(before)) {
    await resolver.set('marketing.seasonal', ok.data, storeTarget(storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Marketing › Landing pages › Seasonal pages' });
    await audit(db, who.actor, { storeId, action: 'marketing.seasonal.settings', entityType: 'Setting', entityId: 'marketing.seasonal', before: { ...before }, after: { ...ok.data } }, who.ctx);
  }
  return seasonalList(db, resolver, storeId);
}

export interface ServedSeasonal {
  serve: SeasonalServe;
  page: SeasonalPageView;
  /** PR 530: the first shop day of its next return (a resting page with its yearly return on), else null. */
  returnsOn?: string | null;
}

/** PR 530: what the shop needs to know of the yearly return (absent = no return). */
export interface ServeReturn {
  set: SeasonalReturnSettings;
  timeZone: string;
  now?: Date;
}

/**
 * The shop's read at /collections/<slug>: the page (live, or back for its occasion by its yearly return) or its resting
 * page (live once, now down, with the day it comes back when known), else null.
 */
export async function servedSeasonal(db: Db, storeId: number, slug: string, set: Pick<SeasonalSettings, 'enabled' | 'offSeason'>, ret?: ServeReturn): Promise<ServedSeasonal | null> {
  if (!set.enabled) return null;
  const p = await db.page.findFirst({ where: { storeId, kind: 'SEASONAL', slug }, select: PAGE_SELECT });
  if (!p) return null;
  const page = viewOf(p);
  const today = ret ? dayOf(ret.now ?? new Date(), ret.timeZone) : null;
  const rp = { ...p, occasion: page.occasion, returns: page.returns, ready: publishIssues(page.sections).length === 0 };
  const back = !!ret && !!today && isBack(rp, ret.set, today);
  const serve = seasonalServe(p, set, back);
  if (!serve) return null;
  const returnsOn = serve === 'resting' && ret?.set.on && today && page.returns && !p.archivedAt && rp.ready && !spanNow(page.occasion, ret.set, today) ? (nextSpan(page.occasion, ret.set, today)?.from ?? null) : null;
  return { serve, page, returnsOn };
}

const answer = (e: unknown): Response => (e instanceof SeasonalError ? json({ ok: false, error: e.code, ...(e.details ? { details: e.details } : {}) }, { status: e.status }) : errorResponse(e));

/**
 * /api/admin/marketing/seasonal-pages[/<id>] — GET the list (`marketing.landing.read`) or one page; POST a new page;
 * PUT the card (no id) or a page; POST {action, version} on a page (all `marketing.landing.write`).
 */
export async function seasonalHandler(request: Request, deps: AdminDeps | null, id: string | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'marketing.landing.read' : 'marketing.landing.write', storeId: S });
  if (g instanceof Response) return g;
  const db = deps!.db;
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    if (!id) {
      if (method === 'GET') {
        const list = await seasonalList(db, deps!.resolver);
        return json({ ok: true, list, cards: { seasonal: list.card } });
      }
      if (method === 'PUT') {
        const list = await saveSeasonalSettings(db, deps!.resolver, who, await body(request));
        return json({ ok: true, list, cards: { seasonal: list.card } });
      }
      return json({ ok: true, page: await saveSeasonal(db, deps!.resolver, who, null, await body(request)) }, { status: 201 });
    }
    if (method === 'GET') {
      const page = await seasonalOne(db, id);
      return page ? json({ ok: true, page }) : fail(404, 'NOT_FOUND');
    }
    if (method === 'PUT') return json({ ok: true, page: await saveSeasonal(db, deps!.resolver, who, id, await body(request)) });
    return json({ ok: true, page: await seasonalAction(db, who, id, await body(request)) });
  } catch (e) {
    return answer(e);
  }
}

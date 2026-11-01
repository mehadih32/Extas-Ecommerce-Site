// S13 · PR 254 (Blueprint MKT-05, demo 97x-adm2-marketing.js) — Marketing › Landing pages: the pages, the builder and
// the shop's read of a published page.
//
// - A landing page is a Page row of kind LANDING with its parts as PageSection rows (landing-model.ts). Saving writes the
//   headline, the link, the product, the campaign and every part's switch and words, with the version it was read at
//   (a page changed by someone else in between is refused STALE). Publish asks the page's product to be on sale; take
//   down, archive and restore change its state only — nothing is ever deleted.
// - The list counts the orders each page brought (Order.landingPageId, written at checkout from the bag line, PR 254)
//   and how many of them were delivered.
// - The master switch `marketing.landing` (off as shipped) decides whether the shop serves any page at all.
// - Seeing needs `marketing.landing.read`; every change needs `marketing.landing.write` and is audited. A page shows the
//   product's own live prices: nothing here writes a price, a discount or an order.
import { createHash } from 'node:crypto';
import { audit, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, Prisma, type PrismaClient } from '@extas/db/client';
import { landingSettingsSchema, storeTarget, type LandingSettings } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { templateUsable } from './landing-templates';
import { LANDING_ACTIONS, LANDING_SECTIONS, landingInputSchema, sectionsOf, sectionType, stateOf, type LandingAction, type LandingSection, type PageState } from './landing-model';

const S = MOTHER_STORE_ID;
/** The products and campaigns the builder offers (newest first). */
export const PICK_MAX = 300; // hardcode-ok: a list length, not a business number

export class LandingError extends Error {
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
export interface LandingWho {
  actor: Actor;
  ctx: RequestContext;
}

export interface LandingRow {
  id: string;
  slug: string;
  title: string;
  productName: string | null;
  campaignName: string | null;
  state: PageState;
  orders: number;
  delivered: number;
  updatedAt: string;
}

export interface LandingList {
  rows: LandingRow[];
  kpis: { live: number; orders: number; delivered: number };
  card: { key: 'landing'; value: LandingSettings; version: string };
}

export interface LandingPageView {
  id: string;
  slug: string;
  titleEn: string;
  titleBn: string | null;
  productId: string | null;
  campaignId: string | null;
  /** PR 255: the template the page started from (null = none). */
  templateKey: string | null;
  state: PageState;
  sections: LandingSection[];
  version: string;
  orders: number;
  delivered: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const pageVersion = (updatedAt: Date) => updatedAt.toISOString();

async function orderCounts(db: Db, storeId: number, ids: string[]) {
  if (!ids.length) return { all: new Map<string, number>(), delivered: new Map<string, number>() };
  const where = { storeId, landingPageId: { in: ids } };
  const [all, done] = await Promise.all([
    db.order.groupBy({ by: ['landingPageId'], where, _count: { _all: true } }),
    db.order.groupBy({ by: ['landingPageId'], where: { ...where, deliveredAt: { not: null } }, _count: { _all: true } }),
  ]);
  const map = (rows: { landingPageId: string | null; _count: { _all: number } }[]) => new Map(rows.map((r) => [r.landingPageId ?? '', r._count._all]));
  return { all: map(all), delivered: map(done) };
}

/** Every landing page with its product, campaign, state and orders; the KPIs; the master switch's card. */
export async function landingList(db: Db, resolver: Resolver, storeId: number = S): Promise<LandingList> {
  const pages = await db.page.findMany({
    where: { storeId, kind: 'LANDING' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, slug: true, titleEn: true, productId: true, campaignId: true, status: true, archivedAt: true, updatedAt: true },
  });
  const pids = [...new Set(pages.map((p) => p.productId).filter((x): x is string => !!x))];
  const cids = [...new Set(pages.map((p) => p.campaignId).filter((x): x is string => !!x))];
  const [products, campaigns, counts, value] = await Promise.all([
    pids.length ? db.product.findMany({ where: { storeId, id: { in: pids } }, select: { id: true, nameEn: true } }) : [],
    cids.length ? db.campaign.findMany({ where: { storeId, id: { in: cids } }, select: { id: true, name: true } }) : [],
    orderCounts(
      db,
      storeId,
      pages.map((p) => p.id),
    ),
    resolver.value('marketing.landing', { storeId }),
  ]);
  const pn = new Map(products.map((p) => [p.id, p.nameEn]));
  const cn = new Map(campaigns.map((c) => [c.id, c.name]));
  const rows: LandingRow[] = pages.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.titleEn,
    productName: p.productId ? (pn.get(p.productId) ?? null) : null,
    campaignName: p.campaignId ? (cn.get(p.campaignId) ?? null) : null,
    state: stateOf(p),
    orders: counts.all.get(p.id) ?? 0,
    delivered: counts.delivered.get(p.id) ?? 0,
    updatedAt: p.updatedAt.toISOString(),
  }));
  const shown = rows.filter((r) => r.state !== 'archived');
  return {
    rows,
    kpis: { live: rows.filter((r) => r.state === 'live').length, orders: shown.reduce((s, r) => s + r.orders, 0), delivered: shown.reduce((s, r) => s + r.delivered, 0) },
    card: { key: 'landing', value, version: versionOf(value) },
  };
}

/** One page for the builder (null = not one of this store's landing pages). */
export async function landingOne(db: Db, id: string, storeId: number = S): Promise<LandingPageView | null> {
  if (!UUID.test(id)) return null;
  const p = await db.page.findFirst({
    where: { id, storeId, kind: 'LANDING' },
    select: { id: true, slug: true, titleEn: true, titleBn: true, productId: true, campaignId: true, templateKey: true, status: true, archivedAt: true, updatedAt: true, sections: { select: { type: true, isVisible: true, config: true, archivedAt: true } } },
  });
  if (!p) return null;
  const counts = await orderCounts(db, storeId, [p.id]);
  return {
    id: p.id,
    slug: p.slug,
    titleEn: p.titleEn,
    titleBn: p.titleBn,
    productId: p.productId,
    campaignId: p.campaignId,
    templateKey: p.templateKey,
    state: stateOf(p),
    sections: sectionsOf(p.sections),
    version: pageVersion(p.updatedAt),
    orders: counts.all.get(p.id) ?? 0,
    delivered: counts.delivered.get(p.id) ?? 0,
  };
}

/** What the builder's choices offer: the products that are not archived and the campaigns that are not archived. */
export async function landingChoices(db: Db, storeId: number = S) {
  const [products, campaigns] = await Promise.all([
    db.product.findMany({ where: { storeId, archivedAt: null }, orderBy: { createdAt: 'desc' }, take: PICK_MAX, select: { id: true, nameEn: true, status: true } }),
    db.campaign.findMany({ where: { storeId, archivedAt: null }, orderBy: { createdAt: 'desc' }, take: PICK_MAX, select: { id: true, name: true } }),
  ]);
  return { products: products.map((p) => ({ id: p.id, name: p.nameEn, onSale: p.status === 'PUBLISHED' })), campaigns };
}

const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/** Create (id null) or save a page: its fields and every part, with the version it was read at. */
export async function saveLanding(db: Db, who: LandingWho, id: string | null, input: unknown, storeId: number = S): Promise<LandingPageView> {
  const ok = landingInputSchema.safeParse(input);
  if (!ok.success) throw new LandingError('INVALID_INPUT', 400, [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  const d = ok.data;
  const [product, campaign, template] = await Promise.all([
    db.product.findFirst({ where: { id: d.productId, storeId, archivedAt: null }, select: { id: true } }),
    d.campaignId ? db.campaign.findFirst({ where: { id: d.campaignId, storeId }, select: { id: true } }) : Promise.resolve(null),
    !id && d.templateKey ? templateUsable(db, d.templateKey, storeId) : Promise.resolve(true),
  ]);
  if (!product) throw new LandingError('INVALID_INPUT', 400, ['productId']);
  if (d.campaignId && !campaign) throw new LandingError('INVALID_INPUT', 400, ['campaignId']);
  if (!template) throw new LandingError('INVALID_INPUT', 400, ['templateKey']);
  const before = id ? await landingOne(db, id, storeId) : null;
  if (id && !before) throw new LandingError('NOT_FOUND', 404);
  if (before && before.version !== d.version) throw new LandingError('STALE', 409);
  if (before?.state === 'archived') throw new LandingError('ARCHIVED', 409);
  const fields = { slug: d.slug, titleEn: d.titleEn, titleBn: d.titleBn, productId: d.productId, campaignId: d.campaignId };
  let pageId: string;
  try {
    pageId = await db.$transaction(async (tx) => {
      const page = before ? await tx.page.update({ where: { id: before.id }, data: fields, select: { id: true } }) : await tx.page.create({ data: { storeId, kind: 'LANDING', status: 'DRAFT', templateKey: d.templateKey, ...fields }, select: { id: true } });
      const rows = await tx.pageSection.findMany({ where: { pageId: page.id, archivedAt: null }, select: { id: true, type: true } });
      for (const [position, key] of LANDING_SECTIONS.entries()) {
        const s = d.sections[key];
        if (!s) continue;
        const row = rows.find((r) => r.type === sectionType(key));
        const data = { isVisible: s.on, position, config: (s.config ?? {}) as Prisma.InputJsonValue };
        if (row) await tx.pageSection.update({ where: { id: row.id }, data });
        else await tx.pageSection.create({ data: { storeId, pageId: page.id, layoutScope: 'PAGE', type: sectionType(key), ...data } });
      }
      return page.id;
    });
  } catch (e) {
    if (isUnique(e)) throw new LandingError('SLUG_TAKEN', 409, ['slug']);
    throw e;
  }
  const after = (await landingOne(db, pageId, storeId))!;
  await audit(db, who.actor, { storeId, action: before ? 'marketing.landing.save' : 'marketing.landing.create', entityType: 'Page', entityId: pageId, before: before ? { ...before } : undefined, after: { ...after } }, who.ctx);
  return after;
}

const NEXT: Record<LandingAction, (s: PageState) => boolean> = {
  publish: (s) => s === 'draft' || s === 'off',
  unpublish: (s) => s === 'live',
  archive: (s) => s !== 'archived',
  restore: (s) => s === 'archived',
};

/** Publish (its product must be on sale), take down, archive or restore a page, at the version it was read at. */
export async function landingAction(db: Db, who: LandingWho, id: string, input: unknown, now: Date = new Date(), storeId: number = S): Promise<LandingPageView> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const action = (LANDING_ACTIONS as readonly string[]).includes(String(o.action)) ? (o.action as LandingAction) : null;
  if (!action) throw new LandingError('INVALID_INPUT', 400, ['action']);
  const before = await landingOne(db, id, storeId);
  if (!before) throw new LandingError('NOT_FOUND', 404);
  if (before.version !== o.version) throw new LandingError('STALE', 409);
  if (!NEXT[action](before.state)) throw new LandingError('WRONG_STATE', 409);
  if (action === 'publish') {
    const p = before.productId ? await db.product.findFirst({ where: { id: before.productId, storeId, status: 'PUBLISHED', archivedAt: null }, select: { id: true } }) : null;
    if (!p) throw new LandingError('PRODUCT_OFF', 409);
  }
  const data: Prisma.PageUpdateInput =
    action === 'publish'
      ? { status: 'PUBLISHED', publishedAt: now }
      : action === 'unpublish'
        ? { status: 'UNPUBLISHED' }
        : action === 'archive'
          ? { status: 'ARCHIVED', archivedAt: now }
          : { status: 'DRAFT', archivedAt: null };
  await db.page.update({ where: { id }, data });
  const after = (await landingOne(db, id, storeId))!;
  await audit(db, who.actor, { storeId, action: `marketing.landing.${action}`, entityType: 'Page', entityId: id, before: { state: before.state }, after: { state: after.state } }, who.ctx);
  return after;
}

/** PUT {key: 'landing', value, version}: the master switch (audited). */
export async function saveLandingSettings(db: Db, resolver: Resolver, who: LandingWho, input: unknown, storeId: number = S): Promise<LandingList> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (o.key !== 'landing') throw new LandingError('INVALID_INPUT', 400, ['key']);
  const before = await resolver.value('marketing.landing', { storeId });
  if (o.version !== versionOf(before)) throw new LandingError('STALE', 409);
  const ok = landingSettingsSchema.safeParse(o.value);
  if (!ok.success) throw new LandingError('INVALID_INPUT', 400, ['value']);
  if (versionOf(ok.data) !== versionOf(before)) {
    await resolver.set('marketing.landing', ok.data, storeTarget(storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Marketing › Landing pages' });
    await audit(db, who.actor, { storeId, action: 'marketing.landing.settings', entityType: 'Setting', entityId: 'marketing.landing', before: { ...before }, after: { ...ok.data } }, who.ctx);
  }
  return landingList(db, resolver, storeId);
}

/** The shop's read: a published, not archived landing page of this store at its link, with its parts (or null). */
export async function publishedLanding(db: Db, storeId: number, slug: string) {
  const p = await db.page.findFirst({
    where: { storeId, kind: 'LANDING', slug, status: 'PUBLISHED', archivedAt: null },
    select: { id: true, slug: true, titleEn: true, titleBn: true, productId: true, sections: { select: { type: true, isVisible: true, config: true, archivedAt: true } } },
  });
  if (!p?.productId) return null;
  return { id: p.id, slug: p.slug, titleEn: p.titleEn, titleBn: p.titleBn, productId: p.productId, sections: sectionsOf(p.sections) };
}

const answer = (e: unknown): Response => (e instanceof LandingError ? json({ ok: false, error: e.code, ...(e.details ? { details: e.details } : {}) }, { status: e.status }) : errorResponse(e));

/**
 * /api/admin/marketing/landing-pages[/<id>] — GET the list (`marketing.landing.read`) or one page; POST a new page;
 * PUT the master switch's card (no id) or a page; POST {action, version} on a page (all `marketing.landing.write`).
 */
export async function landingHandler(request: Request, deps: AdminDeps | null, id: string | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'marketing.landing.read' : 'marketing.landing.write', storeId: S });
  if (g instanceof Response) return g;
  const db = deps!.db;
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    if (!id) {
      if (method === 'GET') {
        const list = await landingList(db, deps!.resolver);
        return json({ ok: true, list, cards: { landing: list.card } });
      }
      if (method === 'PUT') {
        const list = await saveLandingSettings(db, deps!.resolver, who, await body(request));
        return json({ ok: true, list, cards: { landing: list.card } });
      }
      return json({ ok: true, page: await saveLanding(db, who, null, await body(request)) }, { status: 201 });
    }
    if (method === 'GET') {
      const page = await landingOne(db, id);
      return page ? json({ ok: true, page }) : fail(404, 'NOT_FOUND');
    }
    if (method === 'PUT') return json({ ok: true, page: await saveLanding(db, who, id, await body(request)) });
    return json({ ok: true, page: await landingAction(db, who, id, await body(request)) });
  } catch (e) {
    return answer(e);
  }
}

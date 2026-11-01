// S13 · PR 256 (Blueprint C6.2, demo 93-admin-ads.js) — Marketing › Campaigns: the list, one campaign and its steps.
//
// - A campaign keeps its audience, offer, creative, window and planned budget (campaign-model.ts). Saving sends the
//   version it was read at (STALE when someone changed it meanwhile). Steps: schedule (needs a start), start, pause,
//   resume, end, archive and restore — nothing is ever deleted.
// - The budget is a plan in the shop's currency (`store.currency`). Once the campaign has started the budget is locked
//   here (BUDGET_LOCKED): nothing in this file changes an ad platform's budget, a price, a discount or an order, and no
//   budget is ever raised by itself. A live budget change goes through PR 268's change request and the owner's OK.
// - The list counts the orders the campaign's landing pages brought (Page.campaignId → Order.landingPageId) and how
//   many were delivered: delivered is the sale.
// - Seeing needs `marketing.campaigns.read`; every change needs `marketing.campaigns.write` and is audited
//   (marketing.campaign.create / .save / .<step>).
import { audit, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, Prisma, type PrismaClient } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import {
  CAMPAIGN_ACTIONS,
  STATUS_AFTER,
  budgetLocked,
  campaignInputSchema,
  canStep,
  channelsOf,
  creativeOf,
  offerOf,
  stateOfCampaign,
  type CampaignAction,
  type CampaignChannel,
  type CampaignCreative,
  type CampaignOffer,
  type CampaignState,
} from './campaign-model';

const S = MOTHER_STORE_ID;
/** The campaigns, audiences, coupons and pages the screens list (newest first). */
export const CAMPAIGN_LIST_MAX = 300; // hardcode-ok: a list length, not a business number

export class CampaignError extends Error {
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
export interface CampaignWho {
  actor: Actor;
  ctx: RequestContext;
}

export interface CampaignRow {
  id: string;
  name: string;
  state: CampaignState;
  objective: string | null;
  channels: CampaignChannel[];
  audienceName: string | null;
  startsAt: string | null;
  endsAt: string | null;
  budgetMinor: number | null;
  budgetKind: string | null;
  pages: number;
  orders: number;
  delivered: number;
}

export interface CampaignView extends CampaignRow {
  audienceId: string | null;
  couponId: string | null;
  offer: CampaignOffer;
  creative: CampaignCreative;
  budgetCurrency: string | null;
  landingPages: { id: string; title: string; slug: string; status: string }[];
  version: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const iso = (d: Date | null) => (d ? d.toISOString() : null);

const SELECT = {
  id: true,
  name: true,
  objective: true,
  channels: true,
  audienceId: true,
  offer: true,
  couponId: true,
  creative: true,
  budgetMinor: true,
  budgetKind: true,
  budgetCurrency: true,
  status: true,
  startsAt: true,
  endsAt: true,
  archivedAt: true,
  updatedAt: true,
} as const;
type Raw = Prisma.CampaignGetPayload<{ select: typeof SELECT }>;

/** Per campaign: its landing pages, the orders they brought and how many were delivered. */
async function countsFor(db: Db, storeId: number, ids: string[]) {
  const pages = ids.length ? await db.page.findMany({ where: { storeId, kind: 'LANDING', campaignId: { in: ids } }, select: { id: true, campaignId: true, titleEn: true, slug: true, status: true, archivedAt: true } }) : [];
  const byPage = new Map(pages.map((p) => [p.id, p.campaignId ?? '']));
  const pids = pages.map((p) => p.id);
  const where = { storeId, landingPageId: { in: pids } };
  const [all, done] = pids.length
    ? await Promise.all([
        db.order.groupBy({ by: ['landingPageId'], where, _count: { _all: true } }),
        db.order.groupBy({ by: ['landingPageId'], where: { ...where, deliveredAt: { not: null } }, _count: { _all: true } }),
      ])
    : [[], []];
  const sum = (rows: { landingPageId: string | null; _count: { _all: number } }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const c = byPage.get(r.landingPageId ?? '') ?? '';
      m.set(c, (m.get(c) ?? 0) + r._count._all);
    }
    return m;
  };
  return { pages, orders: sum(all), delivered: sum(done) };
}

function rowOf(c: Raw, names: Map<string, string>, k: Awaited<ReturnType<typeof countsFor>>): CampaignRow {
  return {
    id: c.id,
    name: c.name,
    state: stateOfCampaign(c),
    objective: c.objective,
    channels: channelsOf(c.channels),
    audienceName: c.audienceId ? (names.get(c.audienceId) ?? null) : null,
    startsAt: iso(c.startsAt),
    endsAt: iso(c.endsAt),
    budgetMinor: c.budgetMinor,
    budgetKind: c.budgetKind,
    pages: k.pages.filter((p) => p.campaignId === c.id && !p.archivedAt).length,
    orders: k.orders.get(c.id) ?? 0,
    delivered: k.delivered.get(c.id) ?? 0,
  };
}

async function audienceNames(db: Db, storeId: number, ids: (string | null)[]) {
  const want = [...new Set(ids.filter((x): x is string => !!x))];
  const rows = want.length ? await db.audience.findMany({ where: { storeId, id: { in: want } }, select: { id: true, name: true } }) : [];
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Every campaign (archived too, marked) with its numbers; the KPIs. */
export async function campaignList(db: Db, storeId: number = S) {
  const rows = await db.campaign.findMany({ where: { storeId }, orderBy: { createdAt: 'desc' }, take: CAMPAIGN_LIST_MAX, select: SELECT });
  const [names, k] = await Promise.all([
    audienceNames(
      db,
      storeId,
      rows.map((r) => r.audienceId),
    ),
    countsFor(
      db,
      storeId,
      rows.map((r) => r.id),
    ),
  ]);
  const list = rows.map((r) => rowOf(r, names, k));
  const shown = list.filter((r) => r.state !== 'ARCHIVED');
  return {
    rows: list,
    kpis: { running: shown.filter((r) => r.state === 'RUNNING').length, planned: shown.filter((r) => r.state === 'DRAFT' || r.state === 'SCHEDULED').length, orders: shown.reduce((s, r) => s + r.orders, 0), delivered: shown.reduce((s, r) => s + r.delivered, 0) },
  };
}

/** One campaign for its page (null = not one of this store's). */
export async function campaignOne(db: Db, id: string, storeId: number = S): Promise<CampaignView | null> {
  if (!UUID.test(id)) return null;
  const c = await db.campaign.findFirst({ where: { id, storeId }, select: SELECT });
  if (!c) return null;
  const [names, k] = await Promise.all([audienceNames(db, storeId, [c.audienceId]), countsFor(db, storeId, [c.id])]);
  return {
    ...rowOf(c, names, k),
    audienceId: c.audienceId,
    couponId: c.couponId,
    offer: offerOf(c.offer),
    creative: creativeOf(c.creative),
    budgetCurrency: c.budgetCurrency,
    landingPages: k.pages.filter((p) => !p.archivedAt).map((p) => ({ id: p.id, title: p.titleEn, slug: p.slug, status: p.status })),
    version: c.updatedAt.toISOString(),
  };
}

/** What the form offers: the audiences and coupons that are not archived. */
export async function campaignChoices(db: Db, storeId: number = S) {
  const [audiences, coupons] = await Promise.all([
    db.audience.findMany({ where: { storeId, archivedAt: null }, orderBy: { createdAt: 'desc' }, take: CAMPAIGN_LIST_MAX, select: { id: true, name: true, size: true } }),
    db.coupon.findMany({ where: { storeId, archivedAt: null }, orderBy: { createdAt: 'desc' }, take: CAMPAIGN_LIST_MAX, select: { id: true, code: true, enabled: true } }),
  ]);
  return { audiences, coupons };
}

const issueFields = (issues: { path: PropertyKey[] }[]) => [...new Set(issues.map((i) => String(i.path[0] ?? 'value')))];

/** Create (id null) or save a campaign at the version it was read at. */
export async function saveCampaign(db: Db, resolver: Resolver, who: CampaignWho, id: string | null, input: unknown, storeId: number = S): Promise<CampaignView> {
  const ok = campaignInputSchema.safeParse(input);
  if (!ok.success) throw new CampaignError('INVALID_INPUT', 400, issueFields(ok.error.issues));
  const d = ok.data;
  const [audience, coupon] = await Promise.all([
    d.audienceId ? db.audience.findFirst({ where: { id: d.audienceId, storeId }, select: { id: true } }) : Promise.resolve(true),
    d.couponId ? db.coupon.findFirst({ where: { id: d.couponId, storeId }, select: { id: true } }) : Promise.resolve(true),
  ]);
  if (!audience) throw new CampaignError('INVALID_INPUT', 400, ['audienceId']);
  if (!coupon) throw new CampaignError('INVALID_INPUT', 400, ['couponId']);
  const before = id ? await campaignOne(db, id, storeId) : null;
  if (id && !before) throw new CampaignError('NOT_FOUND', 404);
  if (before && before.version !== d.version) throw new CampaignError('STALE', 409);
  if (before?.state === 'ARCHIVED') throw new CampaignError('ARCHIVED', 409);
  if (before && budgetLocked(before.state) && (before.budgetMinor !== d.budgetMinor || before.budgetKind !== d.budgetKind)) throw new CampaignError('BUDGET_LOCKED', 409, ['budgetMinor']);
  const currency = before?.budgetCurrency ?? (await resolver.value('store.currency', { storeId }));
  const data = {
    name: d.name,
    objective: d.objective,
    channels: [...new Set(d.channels)],
    audienceId: d.audienceId,
    offer: d.offer as Prisma.InputJsonValue,
    couponId: d.offer.kind === 'coupon' ? d.couponId : null,
    creative: d.creative as Prisma.InputJsonValue,
    startsAt: d.startsAt ? new Date(d.startsAt) : null,
    endsAt: d.endsAt ? new Date(d.endsAt) : null,
    budgetMinor: d.budgetMinor,
    budgetKind: d.budgetMinor == null ? null : d.budgetKind,
    budgetCurrency: d.budgetMinor == null ? null : currency,
  };
  const row = before ? await db.campaign.update({ where: { id: before.id }, data, select: { id: true } }) : await db.campaign.create({ data: { storeId, status: 'DRAFT', ...data }, select: { id: true } });
  const after = (await campaignOne(db, row.id, storeId))!;
  const { version: _v1, ...a } = after;
  const b = before ? (({ version: _v2, ...x }) => x)(before) : undefined;
  await audit(db, who.actor, { storeId, action: before ? 'marketing.campaign.save' : 'marketing.campaign.create', entityType: 'Campaign', entityId: row.id, before: b ? { ...b } : undefined, after: { ...a } }, who.ctx);
  return after;
}

/** One step (schedule, start, pause, resume, end, archive, restore) at the version it was read at. */
export async function campaignStep(db: Db, who: CampaignWho, id: string, input: unknown, now: Date = new Date(), storeId: number = S): Promise<CampaignView> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const action = (CAMPAIGN_ACTIONS as readonly string[]).includes(String(o.action)) ? (o.action as CampaignAction) : null;
  if (!action) throw new CampaignError('INVALID_INPUT', 400, ['action']);
  const before = await campaignOne(db, id, storeId);
  if (!before) throw new CampaignError('NOT_FOUND', 404);
  if (before.version !== o.version) throw new CampaignError('STALE', 409);
  if (!canStep(action, before.state)) throw new CampaignError('WRONG_STATE', 409);
  if (action === 'schedule' && (!before.startsAt || new Date(before.startsAt) <= now)) throw new CampaignError('NEEDS_START', 409, ['startsAt']);
  const status = STATUS_AFTER[action];
  const data: Prisma.CampaignUpdateInput = action === 'archive' ? { archivedAt: now } : action === 'restore' ? { archivedAt: null } : { status };
  await db.campaign.update({ where: { id }, data });
  const after = (await campaignOne(db, id, storeId))!;
  await audit(db, who.actor, { storeId, action: `marketing.campaign.${action}`, entityType: 'Campaign', entityId: id, before: { state: before.state }, after: { state: after.state } }, who.ctx);
  return after;
}

const answer = (e: unknown): Response => (e instanceof CampaignError ? json({ ok: false, error: e.code, ...(e.details ? { details: e.details } : {}) }, { status: e.status }) : errorResponse(e));

/**
 * /api/admin/marketing/campaigns[/<id>] — GET the list or one (`marketing.campaigns.read`); POST a new campaign; PUT one
 * (save); POST {action, version} on one (`marketing.campaigns.write`).
 */
export async function campaignsHandler(request: Request, deps: AdminDeps | null, id: string | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST' && method !== 'PUT') return fail(405, 'method-not-allowed');
  if (!id && method === 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'marketing.campaigns.read' : 'marketing.campaigns.write', storeId: S });
  if (g instanceof Response) return g;
  const db = deps!.db;
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    if (!id) {
      if (method === 'GET') return json({ ok: true, list: await campaignList(db) });
      return json({ ok: true, campaign: await saveCampaign(db, deps!.resolver, who, null, await body(request)) }, { status: 201 });
    }
    if (method === 'GET') {
      const c = await campaignOne(db, id);
      return c ? json({ ok: true, campaign: c }) : fail(404, 'NOT_FOUND');
    }
    if (method === 'PUT') return json({ ok: true, campaign: await saveCampaign(db, deps!.resolver, who, id, await body(request)) });
    return json({ ok: true, campaign: await campaignStep(db, who, id, await body(request)) });
  } catch (e) {
    return answer(e);
  }
}

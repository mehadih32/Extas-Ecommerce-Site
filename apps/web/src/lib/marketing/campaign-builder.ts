// S13 · PR 531 (register "Full campaign control from the dashboard — create, run, duplicate, schedule and re-budget a
// campaign, not only pause it"; Blueprint C6 V2 block, §59 answer 18; demo 93-admin-ads.js; CLAUDE.md rule 6) —
// Marketing › Ad platforms › New campaigns: new platform campaigns written in the shop as drafts, duplicates of a
// platform campaign (or of a draft), and their launch.
//
// - Off as it ships (`ads.campaignBuilder`, registry v219): nothing can be written, duplicated or launched; drafts can
//   still be set aside. Launching also needs the campaign controls of PR 268 on (`ads.campaignControl`).
// - A draft: the ad account, the shop's own campaign (optional), a name, what it is for (sales, traffic, awareness,
//   leads), a daily budget in the account's currency, and a schedule typed on the shop's clock (empty = from the
//   launch / until stopped). A duplicate copies a platform campaign's account, campaign, objective and daily budget
//   ("… copy"), and remembers it, so the platform copies its ad sets and ads where it can (Meta).
// - "Launch" (after a confirm) never starts anything: it asks — an AdChangeRequest `create` waits with an approval in
//   the owner's queue (lib/marketing/campaign-control.ts askLaunch), the draft is locked while it waits, and only a
//   person with "Approve ad budget increases" approves it (Ad platforms' waiting list or this page). Rejected or run
//   out, nothing is created and the draft can be changed and launched again. Until a platform is connected for
//   changes the practice writer gets it: nothing reaches the platform and the shop keeps no campaign.
// - Writing needs `marketing.ads.control`; seeing `marketing.campaigns.read`; the switch `marketing.ads.approve`.
//   Every write is audited (marketing.adBuilder.*); drafts are set aside and brought back, never deleted.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { CAMPAIGN_OBJECTIVES, objectiveOf, type AdsPlatform, type CampaignObjective } from '@extas/adapters';
import { audit } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { adsCampaignBuilderSchema, storeTarget, type AdsCampaignBuilderSettings } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { t, type Dict } from '../i18n';
import { utcToWall } from '../shop/seasonal-home-model';
import { AdPlatformsError, type AdPlatformsWho } from './ad-platforms';
import { askLaunch, scheduleOf, type ControlDeps } from './campaign-control';
import en from '../../../messages/admin-ad-platforms.en.json';

const S = MOTHER_STORE_ID;
const INT_MAX = 2_147_483_647; // hardcode-ok: the largest whole number the database column holds
export const DRAFT_NAME_MAX = 120; // hardcode-ok: a text-length guard
/** The newest drafts the page lists (and the set-aside ones). */
const LIST_MAX = 100; // hardcode-ok: a list length on the page, not a business number
const PLATFORM: Record<string, AdsPlatform> = { META: 'meta', GOOGLE: 'google', TIKTOK: 'tiktok' };
/** A draft can be changed, launched or set aside in these states (not while it waits, not once created). */
const OPEN = ['DRAFT', 'PRACTICE', 'FAILED', 'REJECTED', 'EXPIRED'];

const uuid = z.string().uuid();
const wall = z.string().max(40).nullable().optional(); // hardcode-ok: the longest date-and-time text the form sends
const draftSchema = z
  .object({
    action: z.literal('draft.save'),
    id: uuid.optional(),
    version: z.string().optional(),
    adAccountId: uuid,
    campaignId: uuid.nullable().optional(),
    name: z.string().trim().min(1).max(DRAFT_NAME_MAX),
    objective: z.enum(CAMPAIGN_OBJECTIVES),
    dailyBudgetMinor: z.number().int().min(1).max(INT_MAX).nullable().optional(),
    startAt: wall,
    endAt: wall,
  })
  .strict();
const dupSchema = z.object({ action: z.literal('duplicate'), adCampaignId: uuid.optional(), draftId: uuid.optional() }).strict();
const idSchema = z.object({ action: z.enum(['archive', 'restore']), id: uuid }).strict();
const launchSchema = z.object({ action: z.literal('launch'), id: uuid, confirm: z.literal(true) }).strict();

export type DraftStatus = 'DRAFT' | 'WAITING' | 'PRACTICE' | 'CREATED' | 'FAILED' | 'REJECTED' | 'EXPIRED';
export interface DraftRow {
  id: string;
  version: string;
  name: string;
  platform: AdsPlatform | null;
  adAccountId: string;
  accountName: string;
  campaignId: string | null;
  campaignName: string | null;
  copyOf: string | null;
  objective: CampaignObjective;
  dailyBudgetMinor: number | null;
  currency: string;
  /** On the shop's clock (YYYY-MM-DDTHH:mm), for the form. */
  startWall: string | null;
  endWall: string | null;
  startAt: string | null;
  endAt: string | null;
  status: DraftStatus;
  /** The launch request while it waits (the owner decides it), and when it runs out. */
  requestId: string | null;
  expiresAt: string | null;
  /** The launch request ran out without an answer (it is let go at the next change or launch). */
  ranOut: boolean;
  archivedAt: string | null;
  createdAt: string;
}
export interface BuilderOverview {
  card: { key: 'builder'; value: AdsCampaignBuilderSettings; version: string };
  controlOn: boolean;
  timeZone: string;
  accounts: { id: string; name: string; platform: AdsPlatform; currency: string }[];
  campaigns: { id: string; name: string }[];
  drafts: DraftRow[];
  setAside: DraftRow[];
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const issues = (e: z.ZodError) => [...new Set(e.issues.map((i) => String(i.path[0] ?? 'value')))];
const zoneOf = async (deps: Pick<ControlDeps, 'resolver'>) => (await deps.resolver.value('store.timeZone', { storeId: S })) as string;
const nowOf = (deps: Pick<ControlDeps, 'now'>) => (deps.now ? deps.now() : new Date());

/** The page: the switch, whether the campaign controls are on, the accounts and campaigns to pick, and the drafts. */
export async function builderOverview(deps: Pick<ControlDeps, 'db' | 'resolver' | 'now'>): Promise<BuilderOverview> {
  const now = nowOf(deps);
  const [value, control, timeZone] = await Promise.all([deps.resolver.value('ads.campaignBuilder', { storeId: S }), deps.resolver.value('ads.campaignControl', { storeId: S }), zoneOf(deps)]);
  const [accounts, campaigns, rows] = await Promise.all([
    deps.db.adAccount.findMany({ where: { storeId: S, archivedAt: null }, orderBy: [{ platform: 'asc' }, { name: 'asc' }], select: { id: true, name: true, platform: true, currency: true } }),
    deps.db.campaign.findMany({ where: { storeId: S, archivedAt: null }, orderBy: { createdAt: 'desc' }, take: LIST_MAX, select: { id: true, name: true } }),
    deps.db.adCampaignDraft.findMany({ where: { storeId: S }, orderBy: [{ archivedAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }], take: LIST_MAX * 2, include: { adAccount: { select: { name: true, platform: true } } } }),
  ]);
  const names = new Map(campaigns.map((c) => [c.id, c.name]));
  const missing = [...new Set(rows.flatMap((r) => (r.campaignId && !names.has(r.campaignId) ? [r.campaignId] : [])))];
  if (missing.length) for (const c of await deps.db.campaign.findMany({ where: { id: { in: missing } }, select: { id: true, name: true } })) names.set(c.id, c.name);
  const copies = [...new Set(rows.flatMap((r) => (r.copyOfId ? [r.copyOfId] : [])))];
  const copyNames = new Map((copies.length ? await deps.db.adCampaign.findMany({ where: { id: { in: copies } }, select: { id: true, name: true } }) : []).map((c) => [c.id, c.name]));
  const reqIds = rows.flatMap((r) => (r.status === 'WAITING' && r.changeRequestId ? [r.changeRequestId] : []));
  const reqs = reqIds.length ? await deps.db.adChangeRequest.findMany({ where: { id: { in: reqIds } }, select: { id: true, approvalRequestId: true } }) : [];
  const asks = reqs.flatMap((r) => (r.approvalRequestId ? [r.approvalRequestId] : []));
  const expiry = new Map((asks.length ? await deps.db.aiApprovalRequest.findMany({ where: { id: { in: asks } }, select: { id: true, expiresAt: true } }) : []).map((a) => [a.id, a.expiresAt]));
  const expOf = new Map(reqs.map((r) => [r.id, r.approvalRequestId ? (expiry.get(r.approvalRequestId) ?? null) : null]));
  const view = (r: (typeof rows)[number]): DraftRow => {
    const exp = r.changeRequestId ? expOf.get(r.changeRequestId) : null;
    return {
      id: r.id,
      version: r.updatedAt.toISOString(),
      name: r.name,
      platform: PLATFORM[r.adAccount.platform] ?? null,
      adAccountId: r.adAccountId,
      accountName: r.adAccount.name,
      campaignId: r.campaignId,
      campaignName: r.campaignId ? (names.get(r.campaignId) ?? null) : null,
      copyOf: r.copyOfId ? (copyNames.get(r.copyOfId) ?? null) : null,
      objective: (CAMPAIGN_OBJECTIVES as readonly string[]).includes(r.objective) ? (r.objective as CampaignObjective) : 'sales',
      dailyBudgetMinor: r.dailyBudgetMinor,
      currency: r.currency,
      startWall: r.startAt ? utcToWall(r.startAt, timeZone) : null,
      endWall: r.endAt ? utcToWall(r.endAt, timeZone) : null,
      startAt: r.startAt?.toISOString() ?? null,
      endAt: r.endAt?.toISOString() ?? null,
      status: r.status as DraftStatus,
      requestId: r.status === 'WAITING' ? r.changeRequestId : null,
      expiresAt: exp ? exp.toISOString() : null,
      ranOut: r.status === 'WAITING' && !!exp && exp <= now,
      archivedAt: r.archivedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  };
  return {
    card: { key: 'builder', value, version: versionOf(value) },
    controlOn: control.on,
    timeZone,
    accounts: accounts.flatMap((a) => (PLATFORM[a.platform] ? [{ id: a.id, name: a.name, platform: PLATFORM[a.platform]!, currency: a.currency }] : [])),
    campaigns: [...campaigns],
    drafts: rows.filter((r) => !r.archivedAt).slice(0, LIST_MAX).map(view),
    setAside: rows.filter((r) => r.archivedAt).slice(0, LIST_MAX).map(view),
  };
}

async function mustBeOn(deps: Pick<ControlDeps, 'resolver'>): Promise<void> {
  if (!(await deps.resolver.value('ads.campaignBuilder', { storeId: S })).enabled) throw new AdPlatformsError('BUILDER_OFF', 409);
}
const findDraft = (deps: Pick<ControlDeps, 'db'>, id: string) => deps.db.adCampaignDraft.findFirst({ where: { id, storeId: S }, include: { adAccount: { select: { platform: true, archivedAt: true } } } });

/** A draft; one whose launch request ran out without an answer is let go first (the request and the draft: EXPIRED). */
async function draftOf(deps: Pick<ControlDeps, 'db' | 'now'>, id: string) {
  const row = await findDraft(deps, id);
  if (!row || row.status !== 'WAITING' || !row.changeRequestId) return row;
  const req = await deps.db.adChangeRequest.findFirst({ where: { id: row.changeRequestId, storeId: S, status: 'WAITING' }, select: { id: true, approvalRequestId: true } });
  const ask = req?.approvalRequestId ? await deps.db.aiApprovalRequest.findUnique({ where: { id: req.approvalRequestId }, select: { status: true, expiresAt: true } }) : null;
  if (!req || !ask?.expiresAt || ask.expiresAt > nowOf(deps)) return row;
  await deps.db.$transaction(async (tx) => {
    await tx.aiApprovalRequest.updateMany({ where: { id: req.approvalRequestId!, status: 'PENDING' }, data: { status: 'EXPIRED', decidedAt: nowOf(deps) } });
    await tx.adChangeRequest.updateMany({ where: { id: req.id, status: 'WAITING' }, data: { status: 'EXPIRED' } });
    // its version stays: the form the person has open is still the draft they see
    await tx.adCampaignDraft.updateMany({ where: { id: row.id, status: 'WAITING' }, data: { status: 'EXPIRED', updatedAt: row.updatedAt } });
  });
  return findDraft(deps, id);
}

/** draft.save: a new draft, or a change to an open one (with its version). */
async function saveDraft(deps: ControlDeps, who: AdPlatformsWho, input: unknown): Promise<{ id: string }> {
  await mustBeOn(deps);
  const ok = draftSchema.safeParse(input);
  if (!ok.success) throw new AdPlatformsError('INVALID_INPUT', 400, issues(ok.error));
  const v = ok.data;
  const acc = await deps.db.adAccount.findFirst({ where: { id: v.adAccountId, storeId: S, archivedAt: null }, select: { id: true, currency: true, platform: true } });
  if (!acc || !PLATFORM[acc.platform]) throw new AdPlatformsError('INVALID_INPUT', 400, ['adAccountId']);
  if (v.campaignId && !(await deps.db.campaign.findFirst({ where: { id: v.campaignId, storeId: S, archivedAt: null }, select: { id: true } }))) throw new AdPlatformsError('INVALID_INPUT', 400, ['campaignId']);
  const sch = scheduleOf(v.startAt, v.endAt, await zoneOf(deps), nowOf(deps));
  const data = { adAccountId: acc.id, currency: acc.currency, campaignId: v.campaignId ?? null, name: v.name, objective: v.objective, dailyBudgetMinor: v.dailyBudgetMinor ?? null, startAt: sch.startAt ? new Date(sch.startAt) : null, endAt: sch.endAt ? new Date(sch.endAt) : null };
  let id: string;
  if (v.id) {
    const row = await draftOf(deps, v.id);
    if (!row || row.archivedAt) throw new AdPlatformsError('NOT_FOUND', 404);
    if (!OPEN.includes(row.status)) throw new AdPlatformsError('LOCKED', 409);
    if (v.version !== row.updatedAt.toISOString()) throw new AdPlatformsError('STALE', 409);
    // a draft that changes account keeps no copy of another account's campaign
    const claimed = await deps.db.adCampaignDraft.updateMany({ where: { id: row.id, updatedAt: row.updatedAt, status: { in: OPEN } }, data: { ...data, copyOfId: acc.id === row.adAccountId ? row.copyOfId : null, status: 'DRAFT' } });
    if (claimed.count !== 1) throw new AdPlatformsError('STALE', 409);
    id = row.id;
  } else id = (await deps.db.adCampaignDraft.create({ data: { storeId: S, ...data, createdById: who.actor.staffUserId ?? null } })).id;
  await audit(deps.db, who.actor, { storeId: S, action: 'marketing.adBuilder.save', entityType: 'AdCampaignDraft', entityId: id, after: { ...data, startAt: sch.startAt, endAt: sch.endAt } }, who.ctx);
  return { id };
}

/** duplicate: a draft copied from a platform campaign (remembered, so the platform can copy its ad sets) or a draft. */
async function duplicate(deps: ControlDeps, who: AdPlatformsWho, input: unknown): Promise<{ id: string }> {
  await mustBeOn(deps);
  const ok = dupSchema.safeParse(input);
  if (!ok.success || !!ok.data.adCampaignId === !!ok.data.draftId) throw new AdPlatformsError('INVALID_INPUT', 400, ok.success ? ['adCampaignId'] : issues(ok.error));
  const d = en as unknown as Dict;
  const copyName = (name: string) => t(d, 'adp.build.copyName', { name }).slice(0, DRAFT_NAME_MAX);
  let data;
  if (ok.data.adCampaignId) {
    const c = await deps.db.adCampaign.findFirst({ where: { id: ok.data.adCampaignId, storeId: S, archivedAt: null }, select: { id: true, adAccountId: true, campaignId: true, name: true, objective: true, dailyBudgetMinor: true, currency: true, adAccount: { select: { platform: true, archivedAt: true } } } });
    const platform = c ? PLATFORM[c.adAccount.platform] : undefined;
    if (!c || !platform || c.adAccount.archivedAt) throw new AdPlatformsError('NOT_FOUND', 404);
    data = { adAccountId: c.adAccountId, campaignId: c.campaignId, copyOfId: c.id, name: copyName(c.name), objective: objectiveOf(platform, c.objective), dailyBudgetMinor: c.dailyBudgetMinor, currency: c.currency };
  } else {
    const r = await draftOf(deps, ok.data.draftId!);
    if (!r || r.adAccount.archivedAt) throw new AdPlatformsError('NOT_FOUND', 404);
    data = { adAccountId: r.adAccountId, campaignId: r.campaignId, copyOfId: r.copyOfId, name: copyName(r.name), objective: r.objective, dailyBudgetMinor: r.dailyBudgetMinor, currency: r.currency };
  }
  // the schedule is not copied: a copy starts as an open draft and gets its own dates
  const id = (await deps.db.adCampaignDraft.create({ data: { storeId: S, ...data, createdById: who.actor.staffUserId ?? null } })).id;
  await audit(deps.db, who.actor, { storeId: S, action: 'marketing.adBuilder.duplicate', entityType: 'AdCampaignDraft', entityId: id, after: { ...data, from: ok.data } }, who.ctx);
  return { id };
}

/** archive (works while off) / restore (needs the switch): never deleted; not while it waits. */
async function setAside(deps: ControlDeps, who: AdPlatformsWho, input: unknown): Promise<{ id: string }> {
  const ok = idSchema.safeParse(input);
  if (!ok.success) throw new AdPlatformsError('INVALID_INPUT', 400, issues(ok.error));
  if (ok.data.action === 'restore') await mustBeOn(deps);
  const row = await draftOf(deps, ok.data.id);
  if (!row) throw new AdPlatformsError('NOT_FOUND', 404);
  if (row.status === 'WAITING') throw new AdPlatformsError('LOCKED', 409);
  const archive = ok.data.action === 'archive';
  if (archive === !!row.archivedAt) return { id: row.id };
  await deps.db.adCampaignDraft.update({ where: { id: row.id }, data: { archivedAt: archive ? nowOf(deps) : null } });
  await audit(deps.db, who.actor, { storeId: S, action: `marketing.adBuilder.${ok.data.action}`, entityType: 'AdCampaignDraft', entityId: row.id }, who.ctx);
  return { id: row.id };
}

/** launch {id, confirm: true}: never starts anything — the owner's approval is asked, and the draft locked while it waits. */
async function launch(deps: ControlDeps, who: AdPlatformsWho, input: unknown): Promise<{ id: string; requestId: string; status: 'WAITING' }> {
  await mustBeOn(deps);
  if (!(await deps.resolver.value('ads.campaignControl', { storeId: S })).on) throw new AdPlatformsError('CONTROL_OFF', 409);
  const ok = launchSchema.safeParse(input);
  if (!ok.success) throw new AdPlatformsError('INVALID_INPUT', 400, issues(ok.error));
  const row = await draftOf(deps, ok.data.id);
  const platform = row ? PLATFORM[row.adAccount.platform] : undefined;
  if (!row || row.archivedAt || !platform || row.adAccount.archivedAt) throw new AdPlatformsError('NOT_FOUND', 404);
  if (!OPEN.includes(row.status)) throw new AdPlatformsError(row.status === 'WAITING' ? 'WAITING' : 'LOCKED', 409);
  if (row.dailyBudgetMinor === null) throw new AdPlatformsError('INVALID_INPUT', 400, ['dailyBudgetMinor']);
  const now = nowOf(deps);
  // the dates must still be ahead when it is asked
  if (row.startAt && row.startAt <= now) throw new AdPlatformsError('INVALID_INPUT', 400, ['startAt']);
  if (row.endAt && row.endAt <= now) throw new AdPlatformsError('INVALID_INPUT', 400, ['endAt']);
  const copy = row.copyOfId ? await deps.db.adCampaign.findFirst({ where: { id: row.copyOfId, storeId: S, adAccountId: row.adAccountId, archivedAt: null }, select: { externalId: true } }) : null;
  const timeZone = await zoneOf(deps);
  const by = who.actor.staffUserId ?? null;
  const requestId = await deps.db.$transaction(async (tx) => {
    const claimed = await tx.adCampaignDraft.updateMany({ where: { id: row.id, updatedAt: row.updatedAt, status: { in: OPEN }, archivedAt: null }, data: { status: 'WAITING' } });
    if (claimed.count !== 1) throw new AdPlatformsError('STALE', 409);
    const rid = await askLaunch(tx, deps, by, { kind: 'create', draftId: row.id, name: row.name, platform, objective: row.objective as CampaignObjective, dailyBudgetMinor: row.dailyBudgetMinor!, startAt: row.startAt?.toISOString() ?? null, endAt: row.endAt?.toISOString() ?? null, copyOfExternalId: copy?.externalId ?? null }, row.currency, timeZone);
    await tx.adCampaignDraft.update({ where: { id: row.id }, data: { changeRequestId: rid } });
    return rid;
  });
  await audit(deps.db, who.actor, { storeId: S, action: 'marketing.adBuilder.launch', entityType: 'AdCampaignDraft', entityId: row.id, after: { requestId, dailyBudgetMinor: row.dailyBudgetMinor, currency: row.currency } }, who.ctx);
  return { id: row.id, requestId, status: 'WAITING' };
}

/** PUT {key: 'builder', value, version}: the owner's switch (audited when it changes). */
async function saveCard(deps: ControlDeps, who: AdPlatformsWho, input: unknown): Promise<BuilderOverview['card']> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (o.key !== 'builder') throw new AdPlatformsError('INVALID_INPUT', 400, ['key']);
  const before = await deps.resolver.value('ads.campaignBuilder', { storeId: S });
  if (o.version !== versionOf(before)) throw new AdPlatformsError('STALE', 409);
  const ok = adsCampaignBuilderSchema.safeParse(o.value);
  if (!ok.success) throw new AdPlatformsError('INVALID_INPUT', 400, issues(ok.error));
  if (versionOf(ok.data) !== versionOf(before)) {
    await deps.resolver.set('ads.campaignBuilder', ok.data, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Marketing › Ad platforms › New campaigns' });
    await audit(deps.db, who.actor, { storeId: S, action: 'marketing.adBuilder.settings', entityType: 'Setting', entityId: 'ads.campaignBuilder', before: { ...before }, after: { ...ok.data } }, who.ctx);
  }
  return { key: 'builder', value: ok.data, version: versionOf(ok.data) };
}

/**
 * /api/admin/marketing/ad-platforms/campaigns — GET the page (`marketing.campaigns.read`); POST draft.save, duplicate,
 * archive, restore, launch (`marketing.ads.control`); PUT the switch (`marketing.ads.approve`). The owner decides a
 * launch through the campaign controls' API (`/control`, action decide).
 */
export async function campaignBuilderHandler(request: Request, deps: AdminDeps | null, extra: Partial<ControlDeps> = {}): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const b = method === 'GET' ? {} : await body(request).catch(() => ({}) as Record<string, unknown>);
  const permission = method === 'GET' ? 'marketing.campaigns.read' : method === 'PUT' ? 'marketing.ads.approve' : 'marketing.ads.control';
  const g = await guardAdmin(request, deps, { permission, storeId: S });
  if (g instanceof Response) return g;
  const d: ControlDeps = { db: deps!.db, resolver: deps!.resolver, vault: deps!.vault, ...extra };
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    if (method === 'GET') return json({ ok: true, ...(await builderOverview(d)) });
    if (method === 'PUT') return json({ ok: true, cards: { builder: await saveCard(d, who, b) } });
    if (b.action === 'draft.save') return json({ ok: true, ...(await saveDraft(d, who, b)) });
    if (b.action === 'duplicate') return json({ ok: true, ...(await duplicate(d, who, b)) });
    if (b.action === 'archive' || b.action === 'restore') return json({ ok: true, ...(await setAside(d, who, b)) });
    if (b.action === 'launch') return json({ ok: true, ...(await launch(d, who, b)) });
    return json({ ok: false, error: 'INVALID_INPUT', details: ['action'] }, { status: 400 });
  } catch (e) {
    return e instanceof AdPlatformsError ? json({ ok: false, error: e.code, details: e.details }, { status: e.status }) : errorResponse(e);
  }
}

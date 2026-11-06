// S13 · PR 268 (register "Pause and budget change from the dashboard, with a confirm step — extended by PR 531 to full
// campaign control"; demo 93-admin-ads.js "Raise budget — needs your approval"; CLAUDE.md rule 6) — a platform
// campaign paused, started again, or given a new daily budget from Marketing › Ad platforms.
//
// - Off as it ships (`ads.campaignControl`, registry v174): the controls are hidden and the API refuses a change.
// - Every change needs `confirm: true` (the page's confirm step) and `marketing.ads.control`. A pause or a lower daily
//   budget (less spend) is sent at once. Starting a campaign again or raising its budget (more spend, or a daily budget
//   where there was none) only asks: an AdChangeRequest waits with an approval in the owner's queue
//   (AiApprovalRequest, kind `ads.campaign.change`) and nothing changes until a person with `marketing.ads.approve`
//   approves it; rejected or run out (`approvalHours`), it changes nothing. One waiting request per campaign.
// - The change goes through the platform's CampaignWriter (@extas/adapters). Only practice writers exist now: they send
//   nothing and the request is kept as PRACTICE, so no real budget or campaign changes. A live writer's success updates
//   the campaign's own row (status or daily budget). Every request, decision and outcome is kept and audited
//   (marketing.adControl.*); nothing is deleted.
// - PR 531 (full campaign control): a campaign's schedule (start and end on the shop's clock) and the launch of a new
//   campaign written on Marketing › Ad platforms › New campaigns (AdCampaignDraft, lib/marketing/campaign-builder.ts)
//   go through the same request and approval: both are always more spend, so they always wait for the owner, and both
//   need the campaign builder switched on (`ads.campaignBuilder`). Approved, a launch is created through the platform's
//   writer (practice: nothing reaches the platform and the shop keeps no campaign); a live create keeps the new
//   campaign's row and the draft remembers it.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { OBJECTIVE_WORDS, practiceCampaignWriter, type AdsPlatform, type AdsRead, type CampaignChange, type CampaignObjective, type CampaignWriter } from '@extas/adapters';
import { audit } from '@extas/auth';
import { MOTHER_STORE_ID, type Prisma } from '@extas/db/client';
import { adsCampaignControlSchema, storeTarget, type AdsCampaignControlSettings } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { t, type Dict } from '../i18n';
import { formatMoney, moneyOf } from '@/components/admin/products/model';
import { utcToWall, wallToUtc } from '../shop/seasonal-home-model';
import { AdPlatformsError, type AdPlatformsDeps, type AdPlatformsWho } from './ad-platforms';
import en from '../../../messages/admin-ad-platforms.en.json';

const S = MOTHER_STORE_ID;
export const CONTROL_KIND = 'ads.campaign.change';
const INT_MAX = 2_147_483_647; // hardcode-ok: the largest whole number the database column holds
const HOUR_MS = 3_600_000; // hardcode-ok: milliseconds in an hour
/** The newest requests the page lists. */
const RECENT = 20; // hardcode-ok: a list length on the page, not a business number
const PLATFORM: Record<string, AdsPlatform> = { META: 'meta', GOOGLE: 'google', TIKTOK: 'tiktok' };

export type ControlStatus = 'WAITING' | 'APPLIED' | 'PRACTICE' | 'FAILED' | 'REJECTED' | 'EXPIRED';
export interface ControlDeps extends AdPlatformsDeps {
  /** Tests pass a stand-in writer; otherwise each platform's practice writer. */
  writers?: Partial<Record<AdsPlatform, CampaignWriter>>;
}

/** PR 531: a new campaign's launch, as the owner approves it (the draft is locked while it waits). */
export interface CreateChange {
  kind: 'create';
  draftId: string;
  name: string;
  platform: AdsPlatform;
  objective: CampaignObjective;
  dailyBudgetMinor: number;
  startAt: string | null;
  endAt: string | null;
  copyOfExternalId: string | null;
}
export type ControlChange = CampaignChange | CreateChange;

const WALL_MAX = 40; // hardcode-ok: the longest date-and-time text the form sends
const changeSchema = z
  .object({
    action: z.literal('change'),
    adCampaignId: z.string().uuid(),
    change: z.enum(['pause', 'resume', 'budget', 'schedule']),
    dailyBudgetMinor: z.number().int().min(1).max(INT_MAX).optional(),
    /** PR 531: the schedule, typed on the shop's clock (YYYY-MM-DDTHH:mm); empty = from now / until stopped. */
    startAt: z.string().max(WALL_MAX).nullable().optional(),
    endAt: z.string().max(WALL_MAX).nullable().optional(),
    /** The page's confirm step. */
    confirm: z.literal(true),
  })
  .strict();
const decideSchema = z.object({ action: z.literal('decide'), id: z.string().uuid(), decision: z.enum(['approve', 'reject']), confirm: z.literal(true) }).strict();

/** Whether a platform status word means paused (Meta PAUSED, TikTok CAMPAIGN_STATUS_DISABLE, Google PAUSED). */
export const isPaused = (status: string) => /PAUSE|DISABLE/i.test(status);

/** More spend: starting again, or a daily budget above the one now (or where there was none); PR 531: every schedule and
 * every new campaign (a schedule can start a campaign or make it run longer). */
export function isIncrease(change: ControlChange, nowDailyMinor: number | null): boolean {
  if (change.kind === 'resume' || change.kind === 'schedule' || change.kind === 'create') return true;
  if (change.kind === 'pause') return false;
  return nowDailyMinor === null || change.dailyBudgetMinor > nowDailyMinor;
}

interface Payload {
  change: ControlChange;
  fromDailyMinor: number | null;
  fromStatus: string;
  currency: string;
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const issues = (e: z.ZodError) => [...new Set(e.issues.map((i) => String(i.path[0] ?? 'value')))];
const campaignOf = (db: ControlDeps['db'], id: string) =>
  db.adCampaign.findFirst({ where: { id, storeId: S, archivedAt: null }, select: { id: true, externalId: true, name: true, status: true, dailyBudgetMinor: true, currency: true, adAccount: { select: { platform: true, externalId: true } } } });
type Campaign = NonNullable<Awaited<ReturnType<typeof campaignOf>>>;

const wallText = (iso: string | null, timeZone: string, none: string) => (iso ? utcToWall(new Date(iso), timeZone).replace('T', ' ') : none);

/** The words of the request for the owner's queue (English: the queue page will show them in his language). */
function describe(c: { name: string; platform: AdsPlatform }, p: Payload, timeZone: string): string {
  const d = en as unknown as Dict;
  const m = moneyOf(p.currency, 'en-GB');
  const ch = p.change;
  const what =
    ch.kind === 'create'
      ? t(d, 'adp.control.ask.create', { budget: formatMoney(ch.dailyBudgetMinor, m), from: wallText(ch.startAt, timeZone, t(d, 'adp.control.now')), to: wallText(ch.endAt, timeZone, t(d, 'adp.control.noEnd')) })
      : ch.kind === 'schedule'
        ? t(d, 'adp.control.ask.schedule', { from: wallText(ch.startAt, timeZone, t(d, 'adp.control.now')), to: wallText(ch.endAt, timeZone, t(d, 'adp.control.noEnd')) })
        : describeChange(ch, p, d, m);
  return `${t(d, `adp.platform.${c.platform}`)} · ${c.name}: ${what}`;
}
function describeChange(ch: CampaignChange, p: Payload, d: Dict, m: ReturnType<typeof moneyOf>): string {
  const what = ch.kind === 'budget' ? t(d, 'adp.control.ask.budget', { from: p.fromDailyMinor === null ? t(d, 'adp.none') : formatMoney(p.fromDailyMinor, m), to: formatMoney(ch.dailyBudgetMinor, m) }) : t(d, `adp.control.ask.${ch.kind}`);
  return what;
}

/** PR 531: an approved launch, created through the platform's writer; a live create keeps the new campaign's row. */
async function applyCreate(deps: ControlDeps, who: AdPlatformsWho, requestId: string, ch: CreateChange, currency: string): Promise<ControlStatus> {
  const now = deps.now ? deps.now() : new Date();
  const draft = await deps.db.adCampaignDraft.findFirst({ where: { id: ch.draftId, storeId: S }, select: { id: true, adAccountId: true, campaignId: true, archivedAt: true, adAccount: { select: { externalId: true, archivedAt: true } } } });
  let practice = true;
  let r: AdsRead<{ externalId: string }>;
  if (!draft || draft.archivedAt || draft.adAccount.archivedAt) r = { ok: false, error: 'draft gone' };
  else if (ch.endAt && new Date(ch.endAt) <= now) r = { ok: false, error: 'schedule passed' };
  else {
    const writer = deps.writers?.[ch.platform] ?? practiceCampaignWriter(ch.platform);
    practice = writer.practice;
    r = writer.create
      ? await writer.create({ accountExternalId: draft.adAccount.externalId, currency, name: ch.name, objective: ch.objective, dailyBudgetMinor: ch.dailyBudgetMinor, startAt: ch.startAt, endAt: ch.endAt, copyOfExternalId: ch.copyOfExternalId })
      : { ok: false, error: 'cannot create' };
  }
  const status: ControlStatus = !r.ok ? 'FAILED' : practice ? 'PRACTICE' : 'APPLIED';
  await deps.db.$transaction(async (tx) => {
    await tx.adChangeRequest.update({ where: { id: requestId }, data: { status, appliedAt: r.ok ? now : null, error: r.ok ? null : r.error.slice(0, 500) } }); // hardcode-ok: the kept error's length
    let made: string | null = null;
    if (r.ok && status === 'APPLIED' && draft) {
      made = (await tx.adCampaign.create({ data: { storeId: S, adAccountId: draft.adAccountId, campaignId: draft.campaignId, externalId: r.value.externalId, name: ch.name, status: 'ACTIVE', objective: OBJECTIVE_WORDS[ch.platform][ch.objective], dailyBudgetMinor: ch.dailyBudgetMinor, currency, startAt: ch.startAt ? new Date(ch.startAt) : null, endAt: ch.endAt ? new Date(ch.endAt) : null } })).id;
    }
    if (draft) await tx.adCampaignDraft.update({ where: { id: draft.id }, data: { status: status === 'APPLIED' ? 'CREATED' : status, adCampaignId: made } });
  });
  await audit(deps.db, who.actor, { storeId: S, action: 'marketing.adControl.apply', entityType: 'AdChangeRequest', entityId: requestId, after: { status, change: ch, practice } }, who.ctx);
  return status;
}

/** Sends the change through the platform's writer and keeps the outcome (the campaign's row only after a live send). */
async function apply(deps: ControlDeps, who: AdPlatformsWho, requestId: string, c: Campaign | null, p: Payload): Promise<ControlStatus> {
  if (p.change.kind === 'create') return applyCreate(deps, who, requestId, p.change, p.currency);
  if (!c) {
    await deps.db.adChangeRequest.update({ where: { id: requestId }, data: { status: 'FAILED', error: 'campaign gone' } });
    return 'FAILED';
  }
  const platform = PLATFORM[c.adAccount.platform];
  if (!platform) throw new AdPlatformsError('INVALID_INPUT', 400, ['platform']);
  const writer = deps.writers?.[platform] ?? practiceCampaignWriter(platform);
  const change = p.change;
  const r = await writer.change({ campaignExternalId: c.externalId, accountExternalId: c.adAccount.externalId, currency: c.currency, change });
  const status: ControlStatus = !r.ok ? 'FAILED' : writer.practice ? 'PRACTICE' : 'APPLIED';
  const now = deps.now ? deps.now() : new Date();
  await deps.db.$transaction(async (tx) => {
    await tx.adChangeRequest.update({ where: { id: requestId }, data: { status, appliedAt: r.ok ? now : null, error: r.ok ? null : r.error.slice(0, 500) } }); // hardcode-ok: the kept error's length
    if (status === 'APPLIED') await tx.adCampaign.update({ where: { id: c.id }, data: change.kind === 'budget' ? { dailyBudgetMinor: change.dailyBudgetMinor } : change.kind === 'schedule' ? { startAt: change.startAt ? new Date(change.startAt) : null, endAt: change.endAt ? new Date(change.endAt) : null } : { status: change.kind === 'pause' ? 'PAUSED' : 'ACTIVE' } });
  });
  await audit(deps.db, who.actor, { storeId: S, action: 'marketing.adControl.apply', entityType: 'AdChangeRequest', entityId: requestId, after: { status, change, practice: writer.practice } }, who.ctx);
  return status;
}

/**
 * PR 531: a schedule typed on the shop's clock → two instants. Empty = from now / until stopped. A start must still be
 * ahead, an end ahead and after the start (else INVALID_INPUT naming the field).
 */
export function scheduleOf(startWall: unknown, endWall: unknown, timeZone: string, now: Date): { startAt: string | null; endAt: string | null } {
  const start = wallToUtc(startWall, timeZone);
  const end = wallToUtc(endWall, timeZone);
  if (start === undefined || (start && start <= now)) throw new AdPlatformsError('INVALID_INPUT', 400, ['startAt']);
  if (end === undefined || (end && (end <= now || (start && end <= start)))) throw new AdPlatformsError('INVALID_INPUT', 400, ['endAt']);
  return { startAt: start ? start.toISOString() : null, endAt: end ? end.toISOString() : null };
}

/** PR 531: the launch request of a draft (always waits for the owner; the builder checks the draft first). */
export async function askLaunch(tx: Prisma.TransactionClient, deps: Pick<ControlDeps, 'resolver' | 'now'>, by: string | null, ch: CreateChange, currency: string, timeZone: string): Promise<string> {
  const settings = await deps.resolver.value('ads.campaignControl', { storeId: S });
  const now = deps.now ? deps.now() : new Date();
  const p: Payload = { change: ch, fromDailyMinor: null, fromStatus: 'NEW', currency };
  const row = await tx.adChangeRequest.create({ data: { storeId: S, adCampaignId: null, action: 'create', payload: p as unknown as Prisma.InputJsonValue, requestedById: by, status: 'WAITING' } });
  const ask = await tx.aiApprovalRequest.create({
    data: { storeId: S, kind: CONTROL_KIND, title: describe(ch, p, timeZone), payload: { adChangeRequestId: row.id, ...p } as unknown as Prisma.InputJsonValue, refType: 'AdChangeRequest', refId: row.id, channel: 'admin', expiresAt: new Date(now.getTime() + settings.approvalHours * HOUR_MS) },
  });
  await tx.adChangeRequest.update({ where: { id: row.id }, data: { approvalRequestId: ask.id } });
  return row.id;
}

/** POST {action: 'change', adCampaignId, change, dailyBudgetMinor?, startAt?, endAt?, confirm: true}. */
export async function requestCampaignChange(deps: ControlDeps, who: AdPlatformsWho, input: unknown): Promise<{ id: string; status: ControlStatus }> {
  const settings = await deps.resolver.value('ads.campaignControl', { storeId: S });
  if (!settings.on) throw new AdPlatformsError('OFF', 409);
  const ok = changeSchema.safeParse(input);
  if (!ok.success) throw new AdPlatformsError('INVALID_INPUT', 400, issues(ok.error));
  const c = await campaignOf(deps.db, ok.data.adCampaignId);
  if (!c) throw new AdPlatformsError('NOT_FOUND', 404);
  if (ok.data.change === 'budget' && (ok.data.dailyBudgetMinor === undefined || ok.data.dailyBudgetMinor === c.dailyBudgetMinor)) throw new AdPlatformsError('INVALID_INPUT', 400, ['dailyBudgetMinor']);
  const now = deps.now ? deps.now() : new Date();
  const timeZone = (await deps.resolver.value('store.timeZone', { storeId: S })) as string;
  let change: CampaignChange;
  if (ok.data.change === 'schedule') {
    if (!(await deps.resolver.value('ads.campaignBuilder', { storeId: S })).enabled) throw new AdPlatformsError('BUILDER_OFF', 409);
    change = { kind: 'schedule', ...scheduleOf(ok.data.startAt, ok.data.endAt, timeZone, now) };
  } else change = ok.data.change === 'budget' ? { kind: 'budget', dailyBudgetMinor: ok.data.dailyBudgetMinor! } : { kind: ok.data.change };
  if (await deps.db.adChangeRequest.findFirst({ where: { storeId: S, adCampaignId: c.id, status: 'WAITING' }, select: { id: true } })) throw new AdPlatformsError('WAITING', 409);
  const p: Payload = { change, fromDailyMinor: c.dailyBudgetMinor, fromStatus: c.status, currency: c.currency };
  const increase = isIncrease(change, c.dailyBudgetMinor);
  const by = who.actor.staffUserId ?? null;
  const id = await deps.db.$transaction(async (tx) => {
    const row = await tx.adChangeRequest.create({ data: { storeId: S, adCampaignId: c.id, action: change.kind, payload: p as unknown as Prisma.InputJsonValue, requestedById: by, status: increase ? 'WAITING' : 'SENDING' } });
    if (increase) {
      const ask = await tx.aiApprovalRequest.create({
        data: { storeId: S, kind: CONTROL_KIND, title: describe({ name: c.name, platform: PLATFORM[c.adAccount.platform] ?? 'meta' }, p, timeZone), payload: { adChangeRequestId: row.id, ...p } as unknown as Prisma.InputJsonValue, refType: 'AdChangeRequest', refId: row.id, channel: 'admin', expiresAt: new Date(now.getTime() + settings.approvalHours * HOUR_MS) },
      });
      await tx.adChangeRequest.update({ where: { id: row.id }, data: { approvalRequestId: ask.id } });
    }
    return row.id;
  });
  await audit(deps.db, who.actor, { storeId: S, action: 'marketing.adControl.request', entityType: 'AdChangeRequest', entityId: id, after: { adCampaignId: c.id, change, increase } }, who.ctx);
  if (increase) return { id, status: 'WAITING' };
  return { id, status: await apply(deps, who, id, c, p) };
}

/**
 * PR 269: a change a person already approved elsewhere (the AI growth agent's proposal, approved by someone with
 * `marketing.ads.approve` after a confirm) is sent now through the same writer, kept as an AdChangeRequest that names the
 * agent, the reason and the approval. The campaign's own row must still be as the proposal saw it (`fromDailyMinor`),
 * and no other request may be waiting for it. Needs the campaign controls switched on.
 */
export async function applyApprovedChange(deps: ControlDeps, who: AdPlatformsWho, input: { adCampaignId: string; change: CampaignChange; fromDailyMinor: number | null; approvalRequestId: string; agent: string; reason: string }): Promise<{ id: string; status: ControlStatus }> {
  if (!(await deps.resolver.value('ads.campaignControl', { storeId: S })).on) throw new AdPlatformsError('CONTROL_OFF', 409);
  const c = await campaignOf(deps.db, input.adCampaignId);
  if (!c) throw new AdPlatformsError('NOT_FOUND', 404);
  if (input.change.kind === 'budget' && c.dailyBudgetMinor !== input.fromDailyMinor) throw new AdPlatformsError('CHANGED', 409);
  if (input.change.kind === 'pause' && isPaused(c.status)) throw new AdPlatformsError('CHANGED', 409);
  if (await deps.db.adChangeRequest.findFirst({ where: { storeId: S, adCampaignId: c.id, status: 'WAITING' }, select: { id: true } })) throw new AdPlatformsError('WAITING', 409);
  const p: Payload = { change: input.change, fromDailyMinor: c.dailyBudgetMinor, fromStatus: c.status, currency: c.currency };
  const row = await deps.db.adChangeRequest.create({
    data: { storeId: S, adCampaignId: c.id, action: input.change.kind, payload: p as unknown as Prisma.InputJsonValue, reason: input.reason.slice(0, 500), requestedByAgent: input.agent, requestedById: who.actor.staffUserId ?? null, status: 'SENDING', approvalRequestId: input.approvalRequestId }, // hardcode-ok: the kept reason's length
  });
  await audit(deps.db, who.actor, { storeId: S, action: 'marketing.adControl.request', entityType: 'AdChangeRequest', entityId: row.id, after: { adCampaignId: c.id, change: input.change, agent: input.agent, approvalRequestId: input.approvalRequestId } }, who.ctx);
  return { id: row.id, status: await apply(deps, who, row.id, c, p) };
}

/** POST {action: 'decide', id, decision, confirm: true}: the owner approves (sent now) or rejects a waiting increase. */
export async function decideCampaignChange(deps: ControlDeps, who: AdPlatformsWho, input: unknown): Promise<{ id: string; status: ControlStatus }> {
  if (!(await deps.resolver.value('ads.campaignControl', { storeId: S })).on) throw new AdPlatformsError('OFF', 409);
  const ok = decideSchema.safeParse(input);
  if (!ok.success) throw new AdPlatformsError('INVALID_INPUT', 400, issues(ok.error));
  const row = await deps.db.adChangeRequest.findFirst({ where: { id: ok.data.id, storeId: S } });
  if (!row) throw new AdPlatformsError('NOT_FOUND', 404);
  if (row.status !== 'WAITING' || !row.approvalRequestId) throw new AdPlatformsError('DECIDED', 409);
  const p = row.payload as unknown as Payload;
  // PR 531: a launch or a schedule is only approved while the builder is on
  if ((p.change.kind === 'create' || p.change.kind === 'schedule') && ok.data.decision === 'approve' && !(await deps.resolver.value('ads.campaignBuilder', { storeId: S })).enabled) throw new AdPlatformsError('BUILDER_OFF', 409);
  const now = deps.now ? deps.now() : new Date();
  const ask = await deps.db.aiApprovalRequest.findUnique({ where: { id: row.approvalRequestId }, select: { expiresAt: true } });
  const expired = !!ask?.expiresAt && ask.expiresAt <= now;
  const status: ApprovalOutcome = expired ? 'EXPIRED' : ok.data.decision === 'approve' ? 'APPROVED' : 'REJECTED';
  await deps.db.$transaction(async (tx) => {
    // a decision is taken once: a second press (or a second person) finds it decided
    const claimed = await tx.aiApprovalRequest.updateMany({ where: { id: row.approvalRequestId!, status: 'PENDING' }, data: { status, decidedById: expired ? null : (who.actor.staffUserId ?? null), decidedAt: now } });
    if (claimed.count !== 1) throw new AdPlatformsError('DECIDED', 409);
    await tx.adChangeRequest.update({ where: { id: row.id }, data: { status: status === 'APPROVED' ? 'SENDING' : status } });
    if (p.change.kind === 'create' && status !== 'APPROVED') await tx.adCampaignDraft.updateMany({ where: { id: p.change.draftId, storeId: S }, data: { status } });
  });
  await audit(deps.db, who.actor, { storeId: S, action: 'marketing.adControl.decide', entityType: 'AdChangeRequest', entityId: row.id, after: { decision: status } }, who.ctx);
  if (status === 'EXPIRED') throw new AdPlatformsError('EXPIRED', 409);
  if (status === 'REJECTED') return { id: row.id, status: 'REJECTED' };
  const c = row.adCampaignId ? await campaignOf(deps.db, row.adCampaignId) : null;
  return { id: row.id, status: await apply(deps, who, row.id, c, p) };
}
type ApprovalOutcome = 'APPROVED' | 'REJECTED' | 'EXPIRED';

export interface ControlRow {
  id: string;
  adCampaignId: string | null;
  campaignName: string | null;
  platform: AdsPlatform | null;
  change: ControlChange;
  fromDailyMinor: number | null;
  currency: string;
  status: ControlStatus | 'SENDING';
  createdAt: string;
  expiresAt: string | null;
  error: string | null;
}

export interface ControlOverview {
  card: { key: 'control'; value: AdsCampaignControlSettings; version: string };
  waiting: ControlRow[];
  recent: ControlRow[];
}

/** The card, the requests waiting for the owner, and the newest requests. */
export async function controlOverview(deps: Pick<ControlDeps, 'db' | 'resolver'>): Promise<ControlOverview> {
  const value = await deps.resolver.value('ads.campaignControl', { storeId: S });
  const rows = await deps.db.adChangeRequest.findMany({ where: { storeId: S, action: { in: ['pause', 'resume', 'budget', 'schedule', 'create'] } }, orderBy: { createdAt: 'desc' }, take: RECENT });
  const waitingRows = await deps.db.adChangeRequest.findMany({ where: { storeId: S, status: 'WAITING' }, orderBy: { createdAt: 'asc' } });
  const ids = [...new Set([...rows, ...waitingRows].map((r) => r.adCampaignId).filter((x): x is string => !!x))];
  const camps = new Map((ids.length ? await deps.db.adCampaign.findMany({ where: { storeId: S, id: { in: ids } }, select: { id: true, name: true, adAccount: { select: { platform: true } } } }) : []).map((c) => [c.id, c]));
  const asks = waitingRows.flatMap((r) => (r.approvalRequestId ? [r.approvalRequestId] : []));
  const expiry = new Map((asks.length ? await deps.db.aiApprovalRequest.findMany({ where: { id: { in: asks } }, select: { id: true, expiresAt: true } }) : []).map((a) => [a.id, a.expiresAt]));
  const view = (r: (typeof rows)[number]): ControlRow => {
    const p = r.payload as unknown as Payload;
    const c = r.adCampaignId ? camps.get(r.adCampaignId) : undefined;
    const exp = r.approvalRequestId ? expiry.get(r.approvalRequestId) : null;
    const made = p.change.kind === 'create' ? p.change : null;
    return { id: r.id, adCampaignId: r.adCampaignId, campaignName: made ? made.name : (c?.name ?? null), platform: made ? made.platform : c ? (PLATFORM[c.adAccount.platform] ?? null) : null, change: p.change, fromDailyMinor: p.fromDailyMinor, currency: p.currency, status: r.status as ControlRow['status'], createdAt: r.createdAt.toISOString(), expiresAt: exp ? exp.toISOString() : null, error: r.error };
  };
  return { card: { key: 'control', value, version: versionOf(value) }, waiting: waitingRows.map(view), recent: rows.map(view) };
}

/** PUT {key: 'control', value, version}: the owner's switch (audited when it changes). */
export async function saveControlCard(deps: Pick<ControlDeps, 'db' | 'resolver'>, who: AdPlatformsWho, input: unknown): Promise<ControlOverview['card']> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (o.key !== 'control') throw new AdPlatformsError('INVALID_INPUT', 400, ['key']);
  const before = await deps.resolver.value('ads.campaignControl', { storeId: S });
  if (o.version !== versionOf(before)) throw new AdPlatformsError('STALE', 409);
  const ok = adsCampaignControlSchema.safeParse(o.value);
  if (!ok.success) throw new AdPlatformsError('INVALID_INPUT', 400, issues(ok.error));
  if (versionOf(ok.data) !== versionOf(before)) {
    await deps.resolver.set('ads.campaignControl', ok.data, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Marketing › Ad platforms' });
    await audit(deps.db, who.actor, { storeId: S, action: 'marketing.adControl.settings', entityType: 'Setting', entityId: 'ads.campaignControl', before: { ...before }, after: { ...ok.data } }, who.ctx);
  }
  return { key: 'control', value: ok.data, version: versionOf(ok.data) };
}

const answer = (e: unknown): Response => (e instanceof AdPlatformsError ? json({ ok: false, error: e.code, details: e.details }, { status: e.status }) : errorResponse(e));

/**
 * /api/admin/marketing/ad-platforms/control — GET the card and the requests (`marketing.campaigns.read`); POST
 * {action: 'change'} (`marketing.ads.control`) or {action: 'decide'} (`marketing.ads.approve`); PUT the card
 * (`marketing.ads.approve`: only the owner turns the controls on).
 */
export async function campaignControlHandler(request: Request, deps: AdminDeps | null, extra: Partial<ControlDeps> = {}): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const b = method === 'GET' ? {} : await body(request).catch(() => ({}) as Record<string, unknown>);
  const permission = method === 'GET' ? 'marketing.campaigns.read' : method === 'PUT' || b.action === 'decide' ? 'marketing.ads.approve' : 'marketing.ads.control';
  const g = await guardAdmin(request, deps, { permission, storeId: S });
  if (g instanceof Response) return g;
  const d: ControlDeps = { db: deps!.db, resolver: deps!.resolver, vault: deps!.vault, ...extra };
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    if (method === 'GET') return json({ ok: true, ...(await controlOverview(d)) });
    if (method === 'PUT') return json({ ok: true, cards: { control: await saveControlCard(d, who, b) } });
    if (b.action === 'decide') return json({ ok: true, ...(await decideCampaignChange(d, who, b)) });
    return json({ ok: true, ...(await requestCampaignChange(d, who, b)) });
  } catch (e) {
    return answer(e);
  }
}

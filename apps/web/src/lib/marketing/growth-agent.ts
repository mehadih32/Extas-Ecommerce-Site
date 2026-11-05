// S13 · PR 269 (register "AI growth agent — reads performance, proposes changes, waits for approval"; Blueprint C3.1 row
// 8: "Executes only what the owner approves"; demo 93-admin-ads.js Tirondaj's suggestions; CLAUDE.md rule 6) — Marketing ›
// Ad platforms › Growth agent.
//
// - Reads: delivered ROAS by campaign, product and district over the owner's last `days` days and the days before
//   (@extas/metrics `adDeliveredReturn`), and flags every campaign that spent with no delivered order.
// - Proposes: growth-model.ts turns the owner's limits (`ads.growthAgent`, registry v175, every kind off at 0) into
//   proposals. Each one waits in the owner's approval list (AiApprovalRequest, kind `ads.growth.proposal`, agent
//   `tirondaj`), once per kind and target, until `approvalHours` runs out; one he decided is not proposed again within
//   his `days`. "Run now" works with the switch off; the
//   switch adds a run right after the daily spend import (ad-spend.ts).
// - Waits for approval: nothing changes until a person with `marketing.ads.approve` approves after a confirm; a decision
//   is taken once. An approved pause or budget change goes through the campaign controls (campaign-control.ts
//   `applyApprovedChange`: the controls switched on, the campaign still as the proposal saw it, practice writers only for
//   now — no real budget or campaign changes). An approved creative refresh or audience is the owner's go-ahead, kept;
//   the brief (PR 270) and the audience (Marketing › Audiences) are made from it. Rejected or run out, nothing happens.
//   Every run and decision is audited (marketing.growth.*); nothing is deleted.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { adDeliveredReturn, lastDays, type AdReturn, type AdReturnRow } from '@extas/metrics';
import { adsGrowthAgentSchema, storeTarget, type AdsGrowthAgentSettings } from '@extas/settings';
import type { CampaignChange } from '@extas/adapters';
import { audit, SYSTEM } from '@extas/auth';
import { MOTHER_STORE_ID, type Prisma } from '@extas/db/client';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { moneyOf } from '@/components/admin/products/model';
import { AdPlatformsError, type AdPlatformsDeps, type AdPlatformsWho } from './ad-platforms';
import { applyApprovedChange, isPaused, type ControlDeps } from './campaign-control';
import { flagged, growthProposals, proposalKey, PROPOSAL_TYPES, type Proposal, type ProposalType } from './growth-model';

const S = MOTHER_STORE_ID;
export const GROWTH_KIND = 'ads.growth.proposal';
/** The agent's key (Blueprint C10: Tirondaj, the ads specialist). */
export const GROWTH_AGENT = 'tirondaj';
const HOUR_MS = 3_600_000; // hardcode-ok: milliseconds in an hour
const DAY_MS = 86_400_000; // hardcode-ok: milliseconds in a day
/** The newest decided proposals the page lists. */
const RECENT = 20; // hardcode-ok: a list length on the page, not a business number
/** The most products and districts the page shows. */
export const TOP = 10; // hardcode-ok: a list length on the page, not a business number

const decideSchema = z.object({ action: z.literal('decide'), id: z.string().uuid(), decision: z.enum(['approve', 'reject']), confirm: z.literal(true) }).strict();
const issues = (e: z.ZodError) => [...new Set(e.issues.map((i) => String(i.path[0] ?? 'value')))];
const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const dayBefore = (ymd: string) => new Date(Date.parse(`${ymd}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);

export type GrowthDeps = ControlDeps;

export interface GrowthFigures {
  settings: AdsGrowthAgentSettings;
  now: AdReturn;
  before: AdReturn;
  currency: string;
}

/** The figures over the owner's last days and the same number of days before them. */
export async function growthFigures(deps: Pick<AdPlatformsDeps, 'db' | 'resolver' | 'now'>): Promise<GrowthFigures> {
  const at = { storeId: S };
  const [settings, tz, currency] = await Promise.all([deps.resolver.value('ads.growthAgent', at), deps.resolver.value('store.timeZone', at), deps.resolver.value('store.currency', at)]);
  const clock = deps.now ? deps.now() : new Date();
  const w = lastDays(settings.days, clock, tz);
  const prior = { from: lastDays(settings.days * 2, clock, tz).from, to: dayBefore(w.from) };
  const [now, before] = await Promise.all([adDeliveredReturn(deps.db, S, { from: w.from, to: w.to }, { currency, timeZone: tz }), adDeliveredReturn(deps.db, S, prior, { currency, timeZone: tz })]);
  return { settings, now, before, currency };
}

/** What a proposal keeps (its payload): the proposal and the figures' days. */
interface Stored extends Proposal {
  from: string;
  to: string;
  currency: string;
  /** Filled after the decision: the change request it became, and how it went. */
  outcome?: string;
  adChangeRequestId?: string;
}

/** Proposals past their hours run out (nothing happens). */
async function expireOld(deps: Pick<GrowthDeps, 'db' | 'now'>): Promise<number> {
  const now = deps.now ? deps.now() : new Date();
  const r = await deps.db.aiApprovalRequest.updateMany({ where: { storeId: S, kind: GROWTH_KIND, status: 'PENDING', expiresAt: { lte: now } }, data: { status: 'EXPIRED', decidedAt: now } });
  return r.count;
}

/** The English line of a proposal for the shared approval list (the page shows its own words in the owner's language). */
function titleOf(p: Proposal, name: string): string {
  const what: Record<ProposalType, string> = { pause: 'pause', lowerBudget: 'lower the daily budget', refreshCreative: 'refresh the creative', raiseBudget: 'raise the daily budget', buildAudience: 'build an audience' };
  return `Growth agent · ${name}: ${what[p.type]}`;
}

/** One run: read, propose (each kind and target once while it waits), audit. Works with the switch off. */
export async function runGrowthAgent(deps: Pick<GrowthDeps, 'db' | 'resolver' | 'now'>, who: AdPlatformsWho): Promise<{ made: number; waiting: number; expired: number }> {
  const expired = await expireOld(deps);
  const f = await growthFigures(deps);
  const ids = f.now.campaigns.map((r) => r.key);
  const rows = ids.length ? await deps.db.adCampaign.findMany({ where: { storeId: S, id: { in: ids }, archivedAt: null }, select: { id: true, name: true, status: true, dailyBudgetMinor: true } }) : [];
  const campaigns = new Map(rows.map((c) => [c.id, { id: c.id, paused: isPaused(c.status), dailyBudgetMinor: c.dailyBudgetMinor }]));
  const scale = 10 ** moneyOf(f.currency, 'en-GB').digits;
  const proposals = growthProposals({ settings: f.settings, now: f.now, before: f.before, campaigns, scale });
  const clock = deps.now ? deps.now() : new Date();
  // waiting now, or decided (approved or rejected) within the owner's days: not proposed again; a run-out one may be
  const pending = await deps.db.aiApprovalRequest.findMany({ where: { storeId: S, kind: GROWTH_KIND, OR: [{ status: 'PENDING' }, { status: { in: ['APPROVED', 'REJECTED'] }, decidedAt: { gte: new Date(clock.getTime() - f.settings.days * DAY_MS) } }] }, select: { payload: true, status: true } });
  const waiting = new Set(pending.map((r) => proposalKey(r.payload as unknown as Stored)));
  const names = await namesOf(deps.db, proposals);
  let made = 0;
  for (const p of proposals) {
    if (waiting.has(proposalKey(p))) continue;
    const payload: Stored = { ...p, from: f.now.from, to: f.now.to, currency: f.currency };
    await deps.db.aiApprovalRequest.create({
      data: { storeId: S, agentKey: GROWTH_AGENT, kind: GROWTH_KIND, title: titleOf(p, names.get(p.refId) ?? p.refId), payload: payload as unknown as Prisma.InputJsonValue, refType: p.refType, refId: p.refId, channel: 'admin', expiresAt: new Date(clock.getTime() + f.settings.approvalHours * HOUR_MS) },
    });
    waiting.add(proposalKey(p));
    made += 1;
  }
  const open = await deps.db.aiApprovalRequest.count({ where: { storeId: S, kind: GROWTH_KIND, status: 'PENDING' } });
  await audit(deps.db, who.actor, { storeId: S, action: 'marketing.growth.run', entityType: 'Setting', entityId: 'ads.growthAgent', after: { made, proposed: proposals.length, expired, from: f.now.from, to: f.now.to } }, who.ctx);
  return { made, waiting: open, expired };
}

/** Names for campaigns, products and districts (English; the page reads them again in the owner's language). */
async function namesOf(db: GrowthDeps['db'], items: readonly { refType: string; refId: string }[], bn = false): Promise<Map<string, string>> {
  const of = (t: string) => [...new Set(items.filter((i) => i.refType === t && i.refId).map((i) => i.refId))];
  const [c, p, g] = [of('AdCampaign'), of('Product'), of('GeoArea')];
  const [cs, ps, gs] = await Promise.all([
    c.length ? db.adCampaign.findMany({ where: { storeId: S, id: { in: c } }, select: { id: true, name: true } }) : [],
    p.length ? db.product.findMany({ where: { storeId: S, id: { in: p } }, select: { id: true, nameEn: true, nameBn: true } }) : [],
    g.length ? db.geoArea.findMany({ where: { id: { in: g } }, select: { id: true, nameEn: true, nameBn: true } }) : [],
  ]);
  return new Map<string, string>([...cs.map((x) => [x.id, x.name] as const), ...ps.map((x) => [x.id, (bn && x.nameBn) || x.nameEn] as const), ...gs.map((x) => [x.id, (bn && x.nameBn) || x.nameEn] as const)]);
}

export type GrowthOutcome = 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'PRACTICE' | 'APPLIED' | 'FAILED';

/** POST {action: 'decide', id, decision, confirm: true}: approve (a pause or budget change is sent now) or reject, once. */
export async function decideGrowthProposal(deps: GrowthDeps, who: AdPlatformsWho, input: unknown): Promise<{ id: string; status: GrowthOutcome }> {
  const ok = decideSchema.safeParse(input);
  if (!ok.success) throw new AdPlatformsError('INVALID_INPUT', 400, issues(ok.error));
  const row = await deps.db.aiApprovalRequest.findFirst({ where: { id: ok.data.id, storeId: S, kind: GROWTH_KIND } });
  if (!row) throw new AdPlatformsError('NOT_FOUND', 404);
  if (row.status !== 'PENDING') throw new AdPlatformsError('DECIDED', 409);
  const p = row.payload as unknown as Stored;
  const now = deps.now ? deps.now() : new Date();
  const expired = !!row.expiresAt && row.expiresAt <= now;
  const approve = ok.data.decision === 'approve' && !expired;
  const change: CampaignChange | null = !approve ? null : p.type === 'pause' ? { kind: 'pause' } : (p.type === 'lowerBudget' || p.type === 'raiseBudget') && p.toDailyMinor ? { kind: 'budget', dailyBudgetMinor: p.toDailyMinor } : null;
  // the controls must be on before anything is decided, so an approval never sits unsent
  if (change && !(await deps.resolver.value('ads.campaignControl', { storeId: S })).on) throw new AdPlatformsError('CONTROL_OFF', 409);
  const status = expired ? 'EXPIRED' : approve ? 'APPROVED' : 'REJECTED';
  const claimed = await deps.db.aiApprovalRequest.updateMany({ where: { id: row.id, status: 'PENDING' }, data: { status, decidedById: expired ? null : (who.actor.staffUserId ?? null), decidedAt: now } });
  if (claimed.count !== 1) throw new AdPlatformsError('DECIDED', 409);
  await audit(deps.db, who.actor, { storeId: S, action: 'marketing.growth.decide', entityType: 'AiApprovalRequest', entityId: row.id, after: { decision: status, type: p.type, refId: p.refId } }, who.ctx);
  if (expired) throw new AdPlatformsError('EXPIRED', 409);
  if (!change) return { id: row.id, status };
  let outcome: GrowthOutcome;
  let adChangeRequestId: string | undefined;
  try {
    const r = await applyApprovedChange(deps, who, { adCampaignId: p.refId, change, fromDailyMinor: p.fromDailyMinor, approvalRequestId: row.id, agent: GROWTH_AGENT, reason: row.title });
    outcome = r.status === 'PRACTICE' || r.status === 'APPLIED' ? r.status : 'FAILED';
    adChangeRequestId = r.id;
  } catch (e) {
    // the campaign moved on since the proposal (or another change waits for it): approved, but nothing is sent
    const code = e instanceof AdPlatformsError ? e.code : 'other';
    await deps.db.aiApprovalRequest.update({ where: { id: row.id }, data: { decisionNote: code.slice(0, 64), payload: { ...p, outcome: 'FAILED' } as unknown as Prisma.InputJsonValue } }); // hardcode-ok: the kept note's length
    throw e;
  }
  await deps.db.aiApprovalRequest.update({ where: { id: row.id }, data: { payload: { ...p, outcome, adChangeRequestId } as unknown as Prisma.InputJsonValue } });
  return { id: row.id, status: outcome };
}

export interface ProposalView extends Proposal {
  id: string;
  name: string | null;
  status: string;
  outcome: string | null;
  note: string | null;
  createdAt: string;
  expiresAt: string | null;
  from: string;
  to: string;
  currency: string;
}

export interface GrowthOverview {
  card: { key: 'growth'; value: AdsGrowthAgentSettings; version: string };
  now: AdReturn;
  currency: string;
  flagged: AdReturnRow[];
  /** Names of every campaign, product and district on the page, in the owner's language where kept. */
  names: Record<string, string>;
  /** The campaigns' own currency (a budget proposal is in it). */
  campaignCurrency: Record<string, string>;
  waiting: ProposalView[];
  recent: ProposalView[];
}

/** The page: the card, the figures, the flagged campaigns, the waiting proposals and the newest decided ones. */
export async function growthOverview(deps: Pick<GrowthDeps, 'db' | 'resolver' | 'now'>, lang: 'bn' | 'en' = 'en'): Promise<GrowthOverview> {
  await expireOld(deps);
  const f = await growthFigures(deps);
  const [waitingRows, recentRows] = await Promise.all([
    deps.db.aiApprovalRequest.findMany({ where: { storeId: S, kind: GROWTH_KIND, status: 'PENDING' }, orderBy: { createdAt: 'asc' } }),
    deps.db.aiApprovalRequest.findMany({ where: { storeId: S, kind: GROWTH_KIND, status: { not: 'PENDING' } }, orderBy: { updatedAt: 'desc' }, take: RECENT }),
  ]);
  const items = [
    ...f.now.campaigns.map((r) => ({ refType: 'AdCampaign', refId: r.key })),
    ...f.now.products.slice(0, TOP).map((r) => ({ refType: 'Product', refId: r.key })),
    ...f.now.districts.slice(0, TOP).map((r) => ({ refType: 'GeoArea', refId: r.key })),
    ...[...waitingRows, ...recentRows].map((r) => ({ refType: r.refType ?? '', refId: r.refId ?? '' })),
  ];
  const names = await namesOf(deps.db, items, lang === 'bn');
  const cids = [...new Set(items.filter((i) => i.refType === 'AdCampaign').map((i) => i.refId))];
  const cur = cids.length ? await deps.db.adCampaign.findMany({ where: { storeId: S, id: { in: cids } }, select: { id: true, currency: true } }) : [];
  const view = (r: (typeof waitingRows)[number]): ProposalView => {
    const p = r.payload as unknown as Stored;
    const type = PROPOSAL_TYPES.includes(p.type) ? p.type : 'pause';
    return { ...p, type, id: r.id, name: names.get(p.refId) ?? null, status: r.status, outcome: p.outcome ?? null, note: r.decisionNote, createdAt: r.createdAt.toISOString(), expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null };
  };
  return {
    card: { key: 'growth', value: f.settings, version: versionOf(f.settings) },
    now: f.now,
    currency: f.currency,
    flagged: flagged(f.now),
    names: Object.fromEntries(names),
    campaignCurrency: Object.fromEntries(cur.map((c) => [c.id, c.currency])),
    waiting: waitingRows.map(view),
    recent: recentRows.map(view),
  };
}

/** PUT {key: 'growth', value, version}: the owner's limits (audited when they change). */
export async function saveGrowthCard(deps: Pick<GrowthDeps, 'db' | 'resolver'>, who: AdPlatformsWho, input: unknown): Promise<GrowthOverview['card']> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (o.key !== 'growth') throw new AdPlatformsError('INVALID_INPUT', 400, ['key']);
  const before = await deps.resolver.value('ads.growthAgent', { storeId: S });
  if (o.version !== versionOf(before)) throw new AdPlatformsError('STALE', 409);
  const ok = adsGrowthAgentSchema.safeParse(o.value);
  if (!ok.success) throw new AdPlatformsError('INVALID_INPUT', 400, issues(ok.error));
  if (versionOf(ok.data) !== versionOf(before)) {
    await deps.resolver.set('ads.growthAgent', ok.data, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Marketing › Ad platforms › Growth agent' });
    await audit(deps.db, who.actor, { storeId: S, action: 'marketing.growth.settings', entityType: 'Setting', entityId: 'ads.growthAgent', before: { ...before }, after: { ...ok.data } }, who.ctx);
  }
  return { key: 'growth', value: ok.data, version: versionOf(ok.data) };
}

/** After the daily spend import (switch on): one run as the system. Never throws. */
export async function runGrowthDaily(deps: Pick<GrowthDeps, 'db' | 'resolver' | 'now'>): Promise<{ made: number } | null> {
  try {
    if (!(await deps.resolver.value('ads.growthAgent', { storeId: S })).on) return null;
    const r = await runGrowthAgent(deps, { actor: SYSTEM, ctx: { source: 'growth-agent' } });
    return { made: r.made };
  } catch (e) {
    console.warn(`growth agent: not run (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return null;
  }
}

const answer = (e: unknown): Response => (e instanceof AdPlatformsError ? json({ ok: false, error: e.code, details: e.details }, { status: e.status }) : errorResponse(e));

/**
 * /api/admin/marketing/ad-platforms/growth — GET the page's figures and proposals (`marketing.campaigns.read`); POST
 * {action: 'run'} (`marketing.ads.control`) or {action: 'decide'} (`marketing.ads.approve`); PUT the card
 * (`marketing.ads.approve`: only the owner sets the agent's limits).
 */
export async function growthAgentHandler(request: Request, deps: AdminDeps | null, extra: Partial<GrowthDeps> = {}): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const b = method === 'GET' ? {} : await body(request).catch(() => ({}) as Record<string, unknown>);
  const permission = method === 'GET' ? 'marketing.campaigns.read' : method === 'PUT' || b.action === 'decide' ? 'marketing.ads.approve' : 'marketing.ads.control';
  const g = await guardAdmin(request, deps, { permission, storeId: S });
  if (g instanceof Response) return g;
  const d: GrowthDeps = { db: deps!.db, resolver: deps!.resolver, vault: deps!.vault, ...extra };
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    if (method === 'GET') return json({ ok: true, ...(await growthOverview(d)) });
    if (method === 'PUT') return json({ ok: true, cards: { growth: await saveGrowthCard(d, who, b) } });
    if (b.action === 'decide') return json({ ok: true, ...(await decideGrowthProposal(d, who, b)) });
    if (b.action === 'run') return json({ ok: true, ...(await runGrowthAgent(d, who)) });
    throw new AdPlatformsError('INVALID_INPUT', 400, ['action']);
  } catch (e) {
    return answer(e);
  }
}

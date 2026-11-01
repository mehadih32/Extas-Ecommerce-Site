// S14 · PR 300 — win-back campaigns: Messages › Campaigns, the CN-019 control centre's campaign tab, with win-back as its
// ready-made type (BACKEND-ARCHITECTURE §5.7 MSG-02; ADMIN-ARCHITECTURE §4.6; SIM-F-032).
// - A campaign (Broadcast, kind `winback`, channel SMS or WHATSAPP) names its audience rule — the people whose last order
//   is older than `lapsedDays` (and, when set, not older than `maxLapsedDays`), with at least `minDelivered` delivered
//   orders, inside one saved segment (PR 287) or everyone — and one of the shop's own templates on that channel (each
//   customer gets it in the shop's message language, like every message). It is a draft until a person holding
//   `messages.campaigns.send` schedules it, now or at a time, after the page has shown who it reaches: the people, those
//   with a number, those who said yes to offers on that channel, those who had a win-back within `gapDays` (left out),
//   and the estimated cost (the channel's average cost per message over the last 30 days). Pause, resume and cancel;
//   nothing sent is taken back.
// - `runWinbacks` (the message job, before each send run) starts the campaigns whose time came and queues the next
//   `batchSize` people of each (the throttle) in the message log (step `crmCampaign`), once per person and campaign. The
//   Messages engine sends each only with his yes for offers on that channel, never after his stop, outside the quiet
//   hours, at most `perCustomerPerWeek` offers by phone in seven days (automations and campaigns together), never a
//   second win-back within `gapDays`, with the stop line on SMS; logged with its cost and delivery state.
// - The results: queued, sent, delivered (the provider's receipt), failed, waiting, left out by reason, the cost, and the
//   orders the receivers placed within `resultDays` (their value only once delivered).
// Off as shipped (`customers.winback`). Seeing needs `messages.journey.read`. Every change is audited. A campaign never
// makes or changes an offer, a price, COD or a discount (its words are a template the owner wrote) and blocks nobody;
// nobody gets an offer he did not say yes to. Nothing is deleted.
import { audit, requirePermission } from '@extas/auth';
import { Prisma } from '@extas/db/client';
import { CRM_CAMPAIGN_STEP, type WinbackSettings } from '@extas/settings';
import { z } from 'zod';
import { checkStoreId, nowOf, parse, setting, TX, UUID, type CustomersDeps, type Db, type Who } from './context';
import { emailResults } from './email-marketing';
import { CustomersError } from './errors';
import { baseOf, segmentFilterSql } from './segments';

export const CAMPAIGN_READ = 'messages.journey.read' as const;
export const CAMPAIGN_WRITE = 'messages.campaigns.write' as const;
export const CAMPAIGN_SEND = 'messages.campaigns.send' as const;
type CampaignPermission = typeof CAMPAIGN_READ | typeof CAMPAIGN_WRITE | typeof CAMPAIGN_SEND;

/** The ready-made campaign type this PR builds (Broadcast.kind). */
export const WINBACK_KIND = 'winback';
export const CAMPAIGN_CHANNELS = ['SMS', 'WHATSAPP'] as const;
export type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];
export const CAMPAIGN_STATUSES = ['DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'PAUSED', 'CANCELLED'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/**
 * The template keys a campaign never uses: the order journey's own texts (they need an order), the answers to a stop or
 * a reply, the gift notices, and the offer e-mails (Messages › E-mail). A campaign's text is one the owner added under
 * Messages › Templates for it (any other key).
 */
export const NOT_CAMPAIGN_KEY_PREFIXES = ['order.', 'consent.', 'gift.', 'reply.', 'account.', 'crmEmail.'] as const;
export const isCampaignKey = (key: string): boolean => !NOT_CAMPAIGN_KEY_PREFIXES.some((p) => key.startsWith(p));

/** A win-back message's message-log key: one per person and campaign. */
export const winbackKey = (broadcastId: string, customerId: string) => `winback:${broadcastId}:${customerId}`;

const DAY_MS = 86_400_000;
/** How far back the estimated cost reads the channel's real costs. */
const COST_DAYS = 30;

/** The audience rule as saved on the campaign. */
export const winbackRuleSchema = z
  .object({
    lapsedDays: z.int().min(7).max(730),
    maxLapsedDays: z.int().min(8).max(3650).nullable(),
    minDelivered: z.int().min(1).max(1000),
  })
  .strict()
  .refine((r) => r.maxLapsedDays === null || r.maxLapsedDays > r.lapsedDays, { message: 'longer than the first number', path: ['maxLapsedDays'] });
export type WinbackRule = z.output<typeof winbackRuleSchema>;

/** A saved rule read back (null when it cannot be read). */
export function readWinbackRule(v: unknown): WinbackRule | null {
  const r = winbackRuleSchema.safeParse(v);
  return r.success ? r.data : null;
}

interface Held {
  write: boolean;
  send: boolean;
}

async function gate(deps: CustomersDeps, who: Who, permission: CampaignPermission): Promise<Held> {
  checkStoreId(who.storeId);
  const held = await requirePermission(deps.db, who.actor, permission, { storeId: who.storeId });
  return { write: held.has(CAMPAIGN_WRITE), send: held.has(CAMPAIGN_SEND) };
}

async function switchedOn(deps: CustomersDeps, S: number): Promise<WinbackSettings> {
  const s = await setting(deps, S, 'customers.winback');
  if (!s.enabled) throw new CustomersError('SWITCHED_OFF', 'win-back campaigns are switched off', ['customers.winback']);
  return s;
}

const isStatus = (x: string): x is CampaignStatus => (CAMPAIGN_STATUSES as readonly string[]).includes(x);
const isChannel = (x: string): x is CampaignChannel => (CAMPAIGN_CHANNELS as readonly string[]).includes(x);

// ---- the audience --------------------------------------------------------------------------------------------------

/** Who a campaign reaches now: the steps from everyone the rule names down to those who will get it, and its cost. */
export interface WinbackAudience {
  /** The rule's people (lapsed, enough deliveries, in the segment). */
  people: number;
  withPhone: number;
  /** With a number and a yes for offers on the channel (no stop). */
  reachable: number;
  /** Of the reachable, those who had a win-back within `gapDays` (left out). */
  recent: number;
  /** reachable − recent. */
  willGet: number;
  /** willGet × the channel's average cost per message over the last 30 days; null when nothing was costed yet. */
  estimatedCostMinor: number | null;
}

const PHONE_OK = Prisma.sql`b."phone" IS NOT NULL AND btrim(b."phone") <> ''`;

/** His newest answer on this channel for this scope (by his profile or his number) as SQL on `b`. */
const answerSql = (S: number, channel: CampaignChannel, scope: 'ALL' | 'MARKETING') =>
  Prisma.sql`(SELECT cr."granted" FROM "ConsentRecord" cr WHERE cr."storeId" = ${S} AND cr."channel"::text = ${channel} AND cr."scope" = ${scope} AND (cr."customerId" = b."id" OR (b."phone" IS NOT NULL AND cr."phone" = b."phone")) ORDER BY cr."createdAt" DESC, cr."id" DESC LIMIT 1)`;
/** He may get an offer on this channel: a number, his yes for offers, no stop of every message (the engine's rule). */
const reachableSql = (S: number, channel: CampaignChannel) => Prisma.sql`${PHONE_OK} AND ${answerSql(S, channel, 'MARKETING')} IS TRUE AND ${answerSql(S, channel, 'ALL')} IS DISTINCT FROM FALSE`;
/** He had a win-back (any campaign, any channel) within the gap. */
const recentSql = (S: number, since: Date) =>
  Prisma.sql`EXISTS (SELECT 1 FROM "NotificationLog" l JOIN "Broadcast" bc ON bc."id" = l."broadcastId" AND bc."kind" = ${WINBACK_KIND} WHERE l."storeId" = ${S} AND l."customerId" = b."id" AND l."step" = ${CRM_CAMPAIGN_STEP} AND l."status"::text IN ('SENT', 'DELIVERED') AND l."sentAt" >= ${since})`;

/** The rule (and segment) as SQL on `b`; throws when the segment cannot be used. */
async function ruleSql(deps: CustomersDeps, S: number, rule: WinbackRule, segmentId: string | null, now: Date): Promise<Prisma.Sql> {
  const before = new Date(now.getTime() - rule.lapsedDays * DAY_MS);
  const after = rule.maxLapsedDays === null ? Prisma.empty : Prisma.sql`AND b.last_at >= ${new Date(now.getTime() - rule.maxLapsedDays * DAY_MS)}`;
  let seg: Prisma.Sql = Prisma.sql`TRUE`;
  if (segmentId !== null) {
    const sql = await segmentFilterSql(deps, S, segmentId);
    if (!sql) throw new CustomersError('INVALID_INPUT', 'the segment cannot be used (archived, unreadable, or segments are off)', ['segmentId']);
    seg = sql;
  }
  return Prisma.sql`b.delivered >= ${rule.minDelivered} AND b.last_at IS NOT NULL AND b.last_at < ${before} ${after} AND ${seg}`;
}

/** The channel's average cost of one message over the last 30 days (null: nothing costed yet). */
async function averageCost(deps: CustomersDeps, S: number, channel: CampaignChannel, now: Date): Promise<number | null> {
  const r = await deps.db.notificationLog.aggregate({ where: { storeId: S, channel, status: { in: ['SENT', 'DELIVERED'] }, costMinor: { not: null }, sentAt: { gte: new Date(now.getTime() - COST_DAYS * DAY_MS) } }, _avg: { costMinor: true } });
  return r._avg.costMinor === null ? null : r._avg.costMinor;
}

/** Counts a campaign's audience now (the builder's summary before anything goes). */
export async function winbackAudience(deps: CustomersDeps, S: number, c: { channel: CampaignChannel; rule: WinbackRule; segmentId: string | null }): Promise<WinbackAudience> {
  const now = nowOf(deps);
  const s = await setting(deps, S, 'customers.winback');
  const [base, rule, avg] = await Promise.all([baseOf(deps, S), ruleSql(deps, S, c.rule, c.segmentId, now), averageCost(deps, S, c.channel, now)]);
  const reach = reachableSql(S, c.channel);
  const recent = recentSql(S, new Date(now.getTime() - s.gapDays * DAY_MS));
  const r = await deps.db.$queryRaw<{ people: bigint; with_phone: bigint; reachable: bigint; recent: bigint }[]>`${base} SELECT count(*) AS people, count(*) FILTER (WHERE ${PHONE_OK}) AS with_phone, count(*) FILTER (WHERE ${reach}) AS reachable, count(*) FILTER (WHERE ${reach} AND ${recent}) AS recent FROM base b WHERE ${rule}`;
  const x = r[0];
  const reachable = Number(x?.reachable ?? 0);
  const recentN = Number(x?.recent ?? 0);
  const willGet = reachable - recentN;
  return { people: Number(x?.people ?? 0), withPhone: Number(x?.with_phone ?? 0), reachable, recent: recentN, willGet, estimatedCostMinor: avg === null ? null : Math.round(avg * willGet) };
}

// ---- campaigns -----------------------------------------------------------------------------------------------------

export interface CampaignTemplate {
  id: string;
  key: string;
  name: string;
  channel: CampaignChannel;
  /** The words in the shop's first language row (the preview). */
  body: string;
  /** A live WhatsApp goes only as a provider-approved template. */
  approved: boolean;
}

export interface CampaignRow {
  id: string;
  name: string;
  status: CampaignStatus;
  channel: CampaignChannel;
  segmentId: string | null;
  segmentName: string | null;
  rule: WinbackRule | null;
  scheduledAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  queued: number;
  sent: number;
  failed: number;
  costMinor: number;
  updatedAt: Date;
}

export interface CampaignResults {
  queued: number;
  sent: number;
  /** The provider's receipt said it reached the phone. */
  delivered: number;
  failed: number;
  waiting: number;
  skipped: { reason: string; count: number }[];
  costMinor: number;
  orders: number;
  ordersDelivered: number;
  deliveredValueMinor: number;
}

type CampaignDb = Prisma.BroadcastGetPayload<object>;

async function segmentNames(db: Db, S: number, ids: (string | null)[]): Promise<Map<string, string>> {
  const want = [...new Set(ids.filter((x): x is string => !!x))];
  if (!want.length) return new Map();
  return new Map((await db.segment.findMany({ where: { storeId: S, id: { in: want } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]));
}

const campaignRow = (r: CampaignDb, names: Map<string, string>): CampaignRow => ({
  id: r.id,
  name: r.name,
  status: isStatus(r.status) ? r.status : 'DRAFT',
  channel: isChannel(r.channel) ? r.channel : 'SMS',
  segmentId: r.segmentId,
  segmentName: r.segmentId ? (names.get(r.segmentId) ?? null) : null,
  rule: readWinbackRule(r.rule),
  scheduledAt: r.scheduledAt,
  startedAt: r.startedAt,
  finishedAt: r.finishedAt,
  queued: r.queuedCount,
  sent: r.sentCount,
  failed: r.failedCount,
  costMinor: r.costMinor ?? 0,
  updatedAt: r.updatedAt,
});

const campaignWhere = (S: number) => ({ storeId: S, kind: WINBACK_KIND });

/** One campaign's delivery log in numbers (PR 290's counts plus the receipts and the cost). */
export async function winbackResults(deps: CustomersDeps, S: number, broadcastId: string, resultDays: number): Promise<CampaignResults> {
  const [base, extra] = await Promise.all([
    emailResults(deps, S, broadcastId, resultDays),
    deps.db.notificationLog.aggregate({ where: { storeId: S, broadcastId, OR: [{ deliveredAt: { not: null } }, { status: 'DELIVERED' }] }, _count: { _all: true } }),
  ]);
  const cost = await deps.db.notificationLog.aggregate({ where: { storeId: S, broadcastId }, _sum: { costMinor: true } });
  return {
    queued: base.queued,
    sent: base.sent,
    delivered: extra._count._all,
    failed: base.failed,
    waiting: base.waiting,
    skipped: base.skipped,
    costMinor: cost._sum.costMinor ?? 0,
    orders: base.orders,
    ordersDelivered: base.delivered,
    deliveredValueMinor: base.deliveredValueMinor,
  };
}

async function templatesOf(deps: CustomersDeps, S: number): Promise<CampaignTemplate[]> {
  const rows = await deps.db.notificationTemplate.findMany({
    where: { storeId: S, archivedAt: null, channel: { in: [...CAMPAIGN_CHANNELS] } },
    orderBy: [{ name: 'asc' }, { key: 'asc' }, { channel: 'asc' }, { locale: 'asc' }],
    select: { id: true, key: true, name: true, channel: true, body: true, providerStatus: true, providerTemplateId: true },
    take: 2000,
  });
  const seen = new Set<string>();
  const out: CampaignTemplate[] = [];
  for (const r of rows) {
    const k = `${r.key}|${r.channel}`;
    if (seen.has(k) || !isChannel(r.channel) || !isCampaignKey(r.key)) continue;
    seen.add(k);
    out.push({ id: r.id, key: r.key, name: r.name, channel: r.channel, body: r.body, approved: r.providerStatus === 'APPROVED' && !!r.providerTemplateId });
  }
  return out;
}

export interface CampaignsScreen {
  enabled: boolean;
  settings: WinbackSettings;
  campaigns: CampaignRow[];
  canWrite: boolean;
  canSend: boolean;
}

/** Messages › Campaigns: the win-back campaigns, newest first. */
export async function campaignsScreen(deps: CustomersDeps, who: Who): Promise<CampaignsScreen> {
  const held = await gate(deps, who, CAMPAIGN_READ);
  const S = who.storeId;
  const [settings, rows] = await Promise.all([setting(deps, S, 'customers.winback'), deps.db.broadcast.findMany({ where: campaignWhere(S), orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 200 })]);
  const names = await segmentNames(deps.db, S, rows.map((x) => x.segmentId));
  return { enabled: settings.enabled, settings, campaigns: rows.map((r) => campaignRow(r, names)), canWrite: held.write, canSend: held.send };
}

export interface CampaignView extends CampaignRow {
  templateId: string | null;
  version: string;
}

export interface CampaignEditor {
  campaign: CampaignView | null;
  results: CampaignResults | null;
  audience: WinbackAudience | null;
  /** The audience could not be counted (the segment is archived, segments are off, or the rule cannot be read). */
  audienceProblem: boolean;
  templates: CampaignTemplate[];
  segments: { id: string; name: string }[];
  segmentsOn: boolean;
  settings: WinbackSettings;
  canWrite: boolean;
  canSend: boolean;
}

/** One campaign for its page (null id: a new draft): its rule, its audience now, and its results once it went. */
export async function campaignEditor(deps: CustomersDeps, who: Who, id: string | null): Promise<CampaignEditor | null> {
  const held = await gate(deps, who, CAMPAIGN_READ);
  if (id !== null && !UUID.test(id)) return null;
  const S = who.storeId;
  const [row, settings, segOn, templates, segments] = await Promise.all([
    id ? deps.db.broadcast.findFirst({ where: { id, ...campaignWhere(S) } }) : null,
    setting(deps, S, 'customers.winback'),
    setting(deps, S, 'customers.segments'),
    templatesOf(deps, S),
    deps.db.segment.findMany({ where: { storeId: S, archivedAt: null }, orderBy: [{ name: 'asc' }], select: { id: true, name: true }, take: 500 }),
  ]);
  if (id && !row) return null;
  const names = row ? await segmentNames(deps.db, S, [row.segmentId]) : new Map<string, string>();
  const campaign: CampaignView | null = row ? { ...campaignRow(row, names), templateId: row.templateId, version: row.updatedAt.toISOString() } : null;
  let audience: WinbackAudience | null = null;
  let audienceProblem = false;
  if (settings.enabled && campaign && (campaign.status === 'DRAFT' || campaign.status === 'SCHEDULED')) {
    if (!campaign.rule) audienceProblem = true;
    else
      try {
        audience = await winbackAudience(deps, S, { channel: campaign.channel, rule: campaign.rule, segmentId: campaign.segmentId });
      } catch (e) {
        if (!(e instanceof CustomersError)) throw e;
        audienceProblem = true;
      }
  }
  const results = campaign && campaign.status !== 'DRAFT' ? await winbackResults(deps, S, campaign.id, settings.resultDays) : null;
  return { campaign, results, audience, audienceProblem, templates, segments: segOn.enabled ? segments : [], segmentsOn: segOn.enabled, settings, canWrite: held.write, canSend: held.send };
}

const campaignInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    channel: z.enum(CAMPAIGN_CHANNELS),
    templateId: z.string().regex(UUID),
    segmentId: z.string().regex(UUID).nullable(),
    rule: z.unknown(),
    version: z.string().max(40).optional(),
  })
  .strict();

/** Saves a draft campaign (new or changed; only a draft changes). Its template must be this store's, on its channel. Audited. */
export async function saveCampaign(deps: CustomersDeps, who: Who, id: string | null, input: unknown): Promise<CampaignEditor> {
  await gate(deps, who, CAMPAIGN_WRITE);
  const S = who.storeId;
  await switchedOn(deps, S);
  const d = parse(campaignInput, input, 'campaign');
  const rule = winbackRuleSchema.safeParse(d.rule);
  if (!rule.success) throw new CustomersError('INVALID_INPUT', 'the audience rule is not valid', rule.error.issues.map((i) => ['rule', ...i.path].join('.')));
  if (id !== null && !UUID.test(id)) throw new CustomersError('NOT_FOUND', 'no such campaign', ['campaignId']);
  await ruleSql(deps, S, rule.data, d.segmentId, nowOf(deps));
  const tpl = await deps.db.notificationTemplate.findFirst({ where: { id: d.templateId, storeId: S, channel: d.channel, archivedAt: null }, select: { key: true } });
  if (!tpl || !isCampaignKey(tpl.key)) throw new CustomersError('INVALID_INPUT', 'no such campaign template on this channel', ['templateId']);
  const data = { name: d.name, channel: d.channel, templateId: d.templateId, segmentId: d.segmentId, rule: rule.data as unknown as Prisma.InputJsonValue };
  const saved = await deps.db.$transaction(async (tx) => {
    if (id === null) {
      const row = await tx.broadcast.create({ data: { storeId: S, kind: WINBACK_KIND, status: 'DRAFT', createdById: who.actor.staffUserId ?? null, ...data } });
      await audit(tx, who.actor, { action: 'campaign.create', entityType: 'Broadcast', entityId: row.id, storeId: S, after: data }, who.ctx);
      return row;
    }
    const before = await tx.broadcast.findFirst({ where: { id, ...campaignWhere(S) } });
    if (!before) throw new CustomersError('NOT_FOUND', 'no such campaign', ['campaignId']);
    if (before.status !== 'DRAFT') throw new CustomersError('NOT_ACTIVE', 'only a draft can be changed', ['status'], { status: before.status });
    if (d.version !== undefined && d.version !== before.updatedAt.toISOString()) throw new CustomersError('STALE', 'the campaign was changed by someone else; reload it', ['version'], { version: before.updatedAt.toISOString() });
    const row = await tx.broadcast.update({ where: { id: before.id }, data });
    await audit(tx, who.actor, { action: 'campaign.update', entityType: 'Broadcast', entityId: row.id, storeId: S, before: { name: before.name, channel: before.channel, templateId: before.templateId, segmentId: before.segmentId, rule: before.rule }, after: data }, who.ctx);
    return row;
  }, TX);
  return (await campaignEditor(deps, who, saved.id))!;
}

const stateInput = z
  .object({
    action: z.enum(['schedule', 'pause', 'resume', 'cancel']),
    /** schedule: when it goes (ISO time; null or absent: now). */
    at: z.iso.datetime({ offset: true }).nullable().optional(),
    version: z.string().max(40).optional(),
  })
  .strict();

const MOVES: Record<'schedule' | 'pause' | 'resume' | 'cancel', readonly CampaignStatus[]> = { schedule: ['DRAFT'], pause: ['SCHEDULED', 'SENDING'], resume: ['PAUSED'], cancel: ['SCHEDULED', 'SENDING', 'PAUSED'] };

/**
 * Schedules a draft (now or at a time; only while it reaches someone), pauses a campaign (its queued messages wait),
 * resumes it, or cancels it (whatever still waits is left out, CANCELLED; nothing sent is taken back).
 * `messages.campaigns.send`. Audited.
 */
export async function changeCampaign(deps: CustomersDeps, who: Who, id: string, input: unknown): Promise<CampaignEditor> {
  await gate(deps, who, CAMPAIGN_SEND);
  const S = who.storeId;
  const d = parse(stateInput, input, 'campaign state');
  if (d.action !== 'cancel' && d.action !== 'pause') await switchedOn(deps, S);
  const before = UUID.test(id) ? await deps.db.broadcast.findFirst({ where: { id, ...campaignWhere(S) } }) : null;
  if (!before) throw new CustomersError('NOT_FOUND', 'no such campaign', ['campaignId']);
  const status = isStatus(before.status) ? before.status : 'DRAFT';
  if (!MOVES[d.action].includes(status)) throw new CustomersError('NOT_ACTIVE', `a ${status.toLowerCase()} campaign cannot ${d.action}`, ['status'], { status });
  if (d.version !== undefined && d.version !== before.updatedAt.toISOString()) throw new CustomersError('STALE', 'the campaign was changed by someone else; reload it', ['version'], { version: before.updatedAt.toISOString() });
  const now = nowOf(deps);
  let next: Prisma.BroadcastUpdateInput;
  if (d.action === 'schedule') {
    const rule = readWinbackRule(before.rule);
    if (!rule || !before.templateId || !isChannel(before.channel)) throw new CustomersError('INVALID_INPUT', 'the campaign cannot be read; save it again first', ['rule']);
    const at = d.at ? new Date(d.at) : now;
    if (at.getTime() < now.getTime() - 60_000) throw new CustomersError('INVALID_INPUT', 'the time has passed', ['at']);
    const aud = await winbackAudience(deps, S, { channel: before.channel, rule, segmentId: before.segmentId });
    if (aud.willGet < 1) throw new CustomersError('LIMIT_REACHED', 'nobody this campaign names said yes to offers on this channel', ['rule'], { audience: aud });
    next = { status: 'SCHEDULED', scheduledAt: at };
  } else if (d.action === 'pause') next = { status: 'PAUSED' };
  else if (d.action === 'resume') next = { status: before.startedAt ? 'SENDING' : 'SCHEDULED' };
  else next = { status: 'CANCELLED', finishedAt: now };
  await deps.db.$transaction(async (tx) => {
    await tx.broadcast.update({ where: { id: before.id }, data: next });
    if (d.action === 'cancel') await tx.notificationLog.updateMany({ where: { storeId: S, broadcastId: before.id, status: 'QUEUED' }, data: { status: 'SKIPPED', reason: 'CANCELLED', sendAfter: null } });
    await audit(tx, who.actor, { action: `campaign.${d.action}`, entityType: 'Broadcast', entityId: before.id, storeId: S, before: { status: before.status, scheduledAt: before.scheduledAt }, after: { status: next.status, ...(d.action === 'schedule' ? { scheduledAt: next.scheduledAt } : {}) } }, who.ctx);
  }, TX);
  return (await campaignEditor(deps, who, before.id))!;
}

/** The page's settings card: `customers.winback` through its own schema (`messages.campaigns.write`). Audited. */
export async function saveCampaignSettings(deps: CustomersDeps, who: Who, input: unknown): Promise<CampaignsScreen> {
  await gate(deps, who, CAMPAIGN_WRITE);
  if (!deps.settings.set) throw new CustomersError('INVALID_INPUT', 'settings cannot be written here', ['settings']);
  const before = await setting(deps, who.storeId, 'customers.winback');
  const next = { ...before, ...(input && typeof input === 'object' ? input : {}) };
  if (JSON.stringify(next) !== JSON.stringify(before)) {
    try {
      await deps.settings.set('customers.winback', next as never, { level: 'store', storeId: who.storeId }, { actorId: who.actor.staffUserId ?? null, reason: 'Messages › Campaigns' });
    } catch (e) {
      throw new CustomersError('INVALID_INPUT', 'the campaign settings are not valid', (e as { details?: string[] }).details ?? ['customers.winback']);
    }
    await audit(deps.db, who.actor, { action: 'campaign.settings', entityType: 'Setting', entityId: 'customers.winback', storeId: who.storeId, before, after: next }, who.ctx);
  }
  return campaignsScreen(deps, who);
}

// ---- the run -------------------------------------------------------------------------------------------------------

export interface WinbackRunResult {
  started: number;
  queued: number;
  finished: number;
}

/**
 * One store's win-back run (the message job, before it sends): campaigns whose time came start; each sending one queues
 * its next people (at most `batchSize` in all per run: the throttle) — only those the rule names now, with a number and
 * a yes for offers on the channel, and no win-back within `gapDays`, once per person and campaign; a campaign with
 * nobody left to queue and nothing waiting is SENT. Safe to run twice. Nothing at all while `customers.winback` is off.
 */
export async function runWinbacks(deps: CustomersDeps, storeId: number): Promise<WinbackRunResult | null> {
  const s = await setting(deps, storeId, 'customers.winback');
  if (!s.enabled) return null;
  const now = nowOf(deps);
  const out: WinbackRunResult = { started: 0, queued: 0, finished: 0 };
  const started = await deps.db.broadcast.updateMany({ where: { ...campaignWhere(storeId), status: 'SCHEDULED', scheduledAt: { lte: now } }, data: { status: 'SENDING', startedAt: now } });
  out.started = started.count;
  const sending = await deps.db.broadcast.findMany({ where: { ...campaignWhere(storeId), status: 'SENDING' }, orderBy: [{ startedAt: 'asc' }, { id: 'asc' }], select: { id: true, channel: true, segmentId: true, templateId: true, rule: true } });
  const base = sending.length ? await baseOf(deps, storeId) : null;
  const recent = recentSql(storeId, new Date(now.getTime() - s.gapDays * DAY_MS));
  for (const b of sending) {
    const room = s.batchSize - out.queued;
    const rule = readWinbackRule(b.rule);
    let where: Prisma.Sql | null = null;
    if (rule && b.templateId && isChannel(b.channel))
      try {
        where = await ruleSql(deps, storeId, rule, b.segmentId, now);
      } catch (e) {
        if (!(e instanceof CustomersError)) throw e;
      }
    let picked = 0;
    if (where && room > 0) {
      const channel = b.channel as CampaignChannel;
      const people = await deps.db.$queryRaw<{ id: string; phone: string }[]>`${base!} SELECT b."id"::text AS id, btrim(b."phone") AS phone FROM base b WHERE ${where} AND ${reachableSql(storeId, channel)} AND NOT ${recent} AND NOT EXISTS (SELECT 1 FROM "NotificationLog" l WHERE l."storeId" = ${storeId} AND l."dedupeKey" = 'winback:' || ${b.id} || ':' || b."id"::text) ORDER BY b."id" LIMIT ${room}`;
      picked = people.length;
      if (people.length) {
        const made = await deps.db.notificationLog.createMany({
          data: people.map((p) => ({ storeId, customerId: p.id, broadcastId: b.id, channel, recipient: p.phone, status: 'QUEUED' as const, dedupeKey: winbackKey(b.id, p.id), step: CRM_CAMPAIGN_STEP, templateId: b.templateId, sendAfter: now })),
          skipDuplicates: true,
        });
        out.queued += made.count;
        if (made.count) await deps.db.broadcast.update({ where: { id: b.id }, data: { queuedCount: { increment: made.count } } });
      }
    }
    // nobody left to queue (or the rule or segment went away) and nothing waits: the campaign is done
    if ((picked < room || !where) && !(await deps.db.notificationLog.count({ where: { storeId, broadcastId: b.id, status: 'QUEUED' } }))) {
      const done = await deps.db.broadcast.updateMany({ where: { id: b.id, status: 'SENDING' }, data: { status: 'SENT', finishedAt: now } });
      out.finished += done.count;
    }
  }
  return out;
}

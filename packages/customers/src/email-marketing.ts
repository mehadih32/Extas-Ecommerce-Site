// S14 · PR 290 — e-mail marketing: the owner's e-mail templates, e-mail sends to a saved segment, and each send's
// delivery log (Messages › E-mail; Blueprint C6.1 item 2; demo MSG-02's builder for the e-mail channel).
// - A template (NotificationTemplate, channel EMAIL, key `crmEmail.…`, one language) holds a subject and words with
//   `{customerName}`, `{storeName}` and `{link}` (the shop's home); written by `messages.email.write`, archived and
//   restored, never deleted.
// - A send (Broadcast, channel EMAIL) is a draft until a person with `messages.email.send` schedules it: it copies its
//   words (a snapshot), goes to one saved segment (PR 287) or to everyone, and before it goes the page shows how many
//   people it reaches and why the rest are left out (no e-mail; no yes for offer e-mails). It can be paused, resumed and
//   cancelled; nothing already sent is taken back.
// - `runEmailSends` (the message job, before each send run) starts the sends whose time came and queues the next
//   `batchSize` people of each (the throttle) in the message log (step `crmEmail`), once per person and send; the
//   Messages engine sends each only with his yes for offer e-mails, outside the quiet hours, within the weekly cap, with
//   the unsubscribe line. A send is SENT when nobody is left to queue and nothing waits.
// - The results: queued, sent, failed, left out (by reason), opened and clicked (while the owner's tracking is on),
//   unsubscribed, and the orders the receivers placed within `resultDays` (their value only once delivered).
// Off as shipped (`customers.email`). Seeing needs `messages.journey.read`. Every change is audited. Nothing here moves
// money, changes a price, COD or a discount, or blocks anyone; nobody gets an offer he did not say yes to.
import { randomUUID } from 'node:crypto';
import { audit, requirePermission } from '@extas/auth';
import { Prisma } from '@extas/db/client';
import { CRM_EMAIL_STEP, CRM_EMAIL_TEMPLATE_PREFIX, type EmailMarketingSettings } from '@extas/settings';
import { z } from 'zod';
import { checkStoreId, nowOf, parse, setting, TX, UUID, type CustomersDeps, type Db, type Who } from './context';
import { CustomersError } from './errors';
import { baseOf, segmentFilterSql } from './segments';

export const EMAIL_READ = 'messages.journey.read' as const;
export const EMAIL_WRITE = 'messages.email.write' as const;
export const EMAIL_SEND = 'messages.email.send' as const;
type EmailPermission = typeof EMAIL_READ | typeof EMAIL_WRITE | typeof EMAIL_SEND;

/** The words an offer e-mail may use (each filled per person by the Messages engine). */
export const EMAIL_TOKENS = ['customerName', 'storeName', 'link'] as const;
export const EMAIL_LOCALES = ['bn', 'en'] as const;
export type EmailLocale = (typeof EMAIL_LOCALES)[number];

export const EMAIL_SEND_STATUSES = ['DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'PAUSED', 'CANCELLED'] as const;
export type EmailSendStatus = (typeof EMAIL_SEND_STATUSES)[number];

/** An e-mail's message-log key: one per person and send. */
export const emailSendKey = (broadcastId: string, customerId: string) => `email:${broadcastId}:${customerId}`;

/** The `{word}`s in a text that an offer e-mail cannot fill. */
export function unknownEmailTokens(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)) if (!(EMAIL_TOKENS as readonly string[]).includes(m[1]!) && !out.includes(m[1]!)) out.push(m[1]!);
  return out;
}

interface Held {
  write: boolean;
  send: boolean;
}

async function gate(deps: CustomersDeps, who: Who, permission: EmailPermission): Promise<Held> {
  checkStoreId(who.storeId);
  const held = await requirePermission(deps.db, who.actor, permission, { storeId: who.storeId });
  return { write: held.has(EMAIL_WRITE), send: held.has(EMAIL_SEND) };
}

async function switchedOn(deps: CustomersDeps, S: number): Promise<EmailMarketingSettings> {
  const s = await setting(deps, S, 'customers.email');
  if (!s.enabled) throw new CustomersError('SWITCHED_OFF', 'e-mail marketing is switched off', ['customers.email']);
  return s;
}

// ---- templates -----------------------------------------------------------------------------------------------------

export interface EmailTemplateRow {
  id: string;
  name: string;
  locale: EmailLocale;
  subject: string;
  body: string;
  version: string;
  archivedAt: Date | null;
}

const isLocale = (x: string): x is EmailLocale => (EMAIL_LOCALES as readonly string[]).includes(x);
type TemplateDb = { id: string; name: string; locale: string; subject: string | null; body: string; updatedAt: Date; archivedAt: Date | null };
const templateRow = (r: TemplateDb): EmailTemplateRow => ({ id: r.id, name: r.name, locale: isLocale(r.locale) ? r.locale : 'bn', subject: r.subject ?? '', body: r.body, version: r.updatedAt.toISOString(), archivedAt: r.archivedAt });
const TEMPLATE_SELECT = { id: true, name: true, locale: true, subject: true, body: true, updatedAt: true, archivedAt: true } as const;
const templateWhere = (S: number) => ({ storeId: S, channel: 'EMAIL' as const, key: { startsWith: CRM_EMAIL_TEMPLATE_PREFIX } });

const words = z.object({
  subject: z.string().trim().min(1).max(150),
  body: z.string().trim().min(1).max(10_000),
});
const templateInput = words.extend({ name: z.string().trim().min(1).max(80), locale: z.enum(EMAIL_LOCALES), version: z.string().max(40).optional() }).strict();

function checkWords(d: { subject: string; body: string }): void {
  const bad = [...unknownEmailTokens(d.subject).map(() => 'subject'), ...unknownEmailTokens(d.body).map(() => 'body')];
  if (bad.length) throw new CustomersError('INVALID_INPUT', 'the words use a {word} an offer e-mail cannot fill', [...new Set(bad)], { unknown: [...unknownEmailTokens(d.subject), ...unknownEmailTokens(d.body)], allowed: [...EMAIL_TOKENS] });
}

export interface EmailTemplateEditor {
  template: EmailTemplateRow | null;
  settings: EmailMarketingSettings;
  canWrite: boolean;
}

/** One template for its editor (null id: a new one). Null: no such template. */
export async function emailTemplateEditor(deps: CustomersDeps, who: Who, id: string | null): Promise<EmailTemplateEditor | null> {
  const held = await gate(deps, who, EMAIL_READ);
  if (id !== null && !UUID.test(id)) return null;
  const S = who.storeId;
  const [row, settings] = await Promise.all([id ? deps.db.notificationTemplate.findFirst({ where: { id, ...templateWhere(S) }, select: TEMPLATE_SELECT }) : null, setting(deps, S, 'customers.email')]);
  if (id && !row) return null;
  return { template: row ? templateRow(row) : null, settings, canWrite: held.write };
}

/** Saves a new template or changes one (STALE over a newer change; names unique among the live ones). Audited. */
export async function saveEmailTemplate(deps: CustomersDeps, who: Who, id: string | null, input: unknown): Promise<EmailTemplateEditor> {
  await gate(deps, who, EMAIL_WRITE);
  const S = who.storeId;
  const s = await switchedOn(deps, S);
  const d = parse(templateInput, input, 'e-mail template');
  checkWords(d);
  if (id !== null && !UUID.test(id)) throw new CustomersError('NOT_FOUND', 'no such template', ['templateId']);
  const saved = await deps.db.$transaction(async (tx) => {
    const live = await tx.notificationTemplate.findMany({ where: { ...templateWhere(S), archivedAt: null }, select: { id: true, name: true } });
    if (live.some((x) => x.id !== id && x.name.trim().toLocaleLowerCase() === d.name.toLocaleLowerCase())) throw new CustomersError('NAME_TAKEN', 'another e-mail template has this name', ['name']);
    if (id === null) {
      if (live.length >= s.maxTemplates) throw new CustomersError('LIMIT_REACHED', 'the store keeps its most e-mail templates already', ['customers.email.maxTemplates'], { max: s.maxTemplates });
      const row = await tx.notificationTemplate.create({ data: { storeId: S, key: `${CRM_EMAIL_TEMPLATE_PREFIX}${randomUUID().replaceAll('-', '').slice(0, 16)}`, channel: 'EMAIL', locale: d.locale, name: d.name, subject: d.subject, body: d.body, enabled: true }, select: TEMPLATE_SELECT });
      await audit(tx, who.actor, { action: 'email.template.create', entityType: 'NotificationTemplate', entityId: row.id, storeId: S, after: { name: d.name, locale: d.locale, subject: d.subject } }, who.ctx);
      return row;
    }
    const before = await tx.notificationTemplate.findFirst({ where: { id, ...templateWhere(S) }, select: TEMPLATE_SELECT });
    if (!before) throw new CustomersError('NOT_FOUND', 'no such template', ['templateId']);
    if (before.archivedAt) throw new CustomersError('NOT_ACTIVE', 'the template is archived; restore it first', ['templateId']);
    if (d.version !== undefined && d.version !== before.updatedAt.toISOString()) throw new CustomersError('STALE', 'the template was changed by someone else; reload it', ['version'], { version: before.updatedAt.toISOString() });
    const row = await tx.notificationTemplate.update({ where: { id: before.id }, data: { name: d.name, locale: d.locale, subject: d.subject, body: d.body }, select: TEMPLATE_SELECT });
    await audit(tx, who.actor, { action: 'email.template.update', entityType: 'NotificationTemplate', entityId: row.id, storeId: S, before: { name: before.name, locale: before.locale, subject: before.subject, body: before.body }, after: { name: d.name, locale: d.locale, subject: d.subject, body: d.body } }, who.ctx);
    return row;
  }, TX);
  return (await emailTemplateEditor(deps, who, saved.id))!;
}

const archiveInput = z.object({ archived: z.boolean() }).strict();

/** Archives a template (sends already made keep their own words) or restores one. Never deleted. Audited. */
export async function archiveEmailTemplate(deps: CustomersDeps, who: Who, id: string, input: unknown): Promise<{ id: string; archived: boolean }> {
  await gate(deps, who, EMAIL_WRITE);
  const d = parse(archiveInput, input, 'archive');
  const S = who.storeId;
  const before = UUID.test(id) ? await deps.db.notificationTemplate.findFirst({ where: { id, ...templateWhere(S) }, select: TEMPLATE_SELECT }) : null;
  if (!before) throw new CustomersError('NOT_FOUND', 'no such template', ['templateId']);
  if (!!before.archivedAt === d.archived) return { id: before.id, archived: d.archived };
  if (!d.archived) {
    const s = await switchedOn(deps, S);
    const live = await deps.db.notificationTemplate.findMany({ where: { ...templateWhere(S), archivedAt: null }, select: { name: true } });
    if (live.length >= s.maxTemplates) throw new CustomersError('LIMIT_REACHED', 'the store keeps its most e-mail templates already', ['customers.email.maxTemplates'], { max: s.maxTemplates });
    if (live.some((x) => x.name.trim().toLocaleLowerCase() === before.name.trim().toLocaleLowerCase())) throw new CustomersError('NAME_TAKEN', 'another e-mail template has this name', ['name']);
  }
  await deps.db.$transaction(async (tx) => {
    await tx.notificationTemplate.update({ where: { id: before.id }, data: { archivedAt: d.archived ? nowOf(deps) : null } });
    await audit(tx, who.actor, { action: d.archived ? 'email.template.archive' : 'email.template.restore', entityType: 'NotificationTemplate', entityId: before.id, storeId: S, before: { archivedAt: before.archivedAt }, after: { archived: d.archived } }, who.ctx);
  }, TX);
  return { id: before.id, archived: d.archived };
}

// ---- the audience --------------------------------------------------------------------------------------------------

/** Who a send reaches: the segment's people, those with an e-mail, and those of them with a yes for offer e-mails. */
export interface EmailAudience {
  people: number;
  withEmail: number;
  reachable: number;
}

const EMAIL_OK = Prisma.sql`b."email" ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'`;

/** His newest answer on e-mail for this scope (by his profile or his number) as SQL on `b`. */
const answerSql = (S: number, scope: 'ALL' | 'MARKETING') =>
  Prisma.sql`(SELECT cr."granted" FROM "ConsentRecord" cr WHERE cr."storeId" = ${S} AND cr."channel"::text = 'EMAIL' AND cr."scope" = ${scope} AND (cr."customerId" = b."id" OR (b."phone" IS NOT NULL AND cr."phone" = b."phone")) ORDER BY cr."createdAt" DESC, cr."id" DESC LIMIT 1)`;
/** He may get an offer e-mail: an address, his yes for offer e-mails, and no stop of every e-mail. */
const reachableSql = (S: number) => Prisma.sql`${EMAIL_OK} AND ${answerSql(S, 'MARKETING')} IS TRUE AND ${answerSql(S, 'ALL')} IS DISTINCT FROM FALSE`;

/** The SQL that keeps a send's people on `b` (null segment: everyone); throws when the segment cannot be used. */
async function audienceSql(deps: CustomersDeps, S: number, segmentId: string | null): Promise<Prisma.Sql> {
  if (segmentId === null) return Prisma.sql`TRUE`;
  const sql = await segmentFilterSql(deps, S, segmentId);
  if (!sql) throw new CustomersError('INVALID_INPUT', 'the segment cannot be used (archived, unreadable, or segments are off)', ['segmentId']);
  return sql;
}

/** Counts a send's people now (the builder's summary before anything goes). */
export async function emailAudience(deps: CustomersDeps, S: number, segmentId: string | null): Promise<EmailAudience> {
  const [base, seg] = await Promise.all([baseOf(deps, S), audienceSql(deps, S, segmentId)]);
  const r = await deps.db.$queryRaw<{ people: bigint; with_email: bigint; reachable: bigint }[]>`${base} SELECT count(*) AS people, count(*) FILTER (WHERE ${EMAIL_OK}) AS with_email, count(*) FILTER (WHERE ${reachableSql(S)}) AS reachable FROM base b WHERE ${seg}`;
  return { people: Number(r[0]?.people ?? 0), withEmail: Number(r[0]?.with_email ?? 0), reachable: Number(r[0]?.reachable ?? 0) };
}

// ---- sends ---------------------------------------------------------------------------------------------------------

export interface EmailResults {
  queued: number;
  sent: number;
  failed: number;
  waiting: number;
  /** Left out at the moment it went, by reason (NO_CONSENT, OPTED_OUT, CAP_WEEK, QUIET … as the log says). */
  skipped: { reason: string; count: number }[];
  opened: number;
  clicked: number;
  clicks: number;
  unsubscribed: number;
  /** Orders the receivers placed within `resultDays` of their e-mail; delivered ones and their value. */
  orders: number;
  delivered: number;
  deliveredValueMinor: number;
}

export interface EmailSendRow {
  id: string;
  name: string;
  status: EmailSendStatus;
  segmentId: string | null;
  segmentName: string | null;
  scheduledAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  queued: number;
  sent: number;
  failed: number;
  updatedAt: Date;
}

const isStatus = (x: string): x is EmailSendStatus => (EMAIL_SEND_STATUSES as readonly string[]).includes(x);
type SendDb = Prisma.BroadcastGetPayload<object>;

async function segmentNames(db: Db, S: number, ids: (string | null)[]): Promise<Map<string, string>> {
  const want = [...new Set(ids.filter((x): x is string => !!x))];
  if (!want.length) return new Map();
  return new Map((await db.segment.findMany({ where: { storeId: S, id: { in: want } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]));
}

const sendRow = (r: SendDb, names: Map<string, string>): EmailSendRow => ({
  id: r.id,
  name: r.name,
  status: isStatus(r.status) ? r.status : 'DRAFT',
  segmentId: r.segmentId,
  segmentName: r.segmentId ? (names.get(r.segmentId) ?? null) : null,
  scheduledAt: r.scheduledAt,
  startedAt: r.startedAt,
  finishedAt: r.finishedAt,
  queued: r.queuedCount,
  sent: r.sentCount,
  failed: r.failedCount,
  updatedAt: r.updatedAt,
});

/** One send's delivery log in numbers. */
export async function emailResults(deps: CustomersDeps, S: number, broadcastId: string, resultDays: number): Promise<EmailResults> {
  const [byStatus, reasons, marks, orders] = await Promise.all([
    deps.db.notificationLog.groupBy({ by: ['status'], where: { storeId: S, broadcastId }, _count: { _all: true } }),
    deps.db.notificationLog.groupBy({ by: ['reason'], where: { storeId: S, broadcastId, status: { in: ['SKIPPED', 'BLOCKED_BY_GUARD'] } }, _count: { _all: true } }),
    deps.db.$queryRaw<{ opened: bigint; clicked: bigint; clicks: bigint | null; unsub: bigint }[]>`SELECT count(*) FILTER (WHERE "openedAt" IS NOT NULL) AS opened, count(*) FILTER (WHERE "clickedAt" IS NOT NULL) AS clicked, sum("clicks") AS clicks, count(*) FILTER (WHERE "unsubscribedAt" IS NOT NULL) AS unsub FROM "NotificationLog" WHERE "storeId" = ${S} AND "broadcastId" = ${broadcastId}::uuid`,
    deps.db.$queryRaw<{ orders: bigint; delivered: bigint; value: bigint | null }[]>`
      WITH got AS (
        SELECT DISTINCT o."id", o."status"::text AS st, o."totalMinor" AS total
        FROM "NotificationLog" l JOIN "Order" o ON o."storeId" = l."storeId" AND o."customerId" = l."customerId" AND o."archivedAt" IS NULL AND o."placedAt" >= l."sentAt" AND o."placedAt" < l."sentAt" + make_interval(days => ${resultDays}::int)
        WHERE l."storeId" = ${S} AND l."broadcastId" = ${broadcastId}::uuid AND l."status"::text IN ('SENT', 'DELIVERED')
      )
      SELECT count(*) AS orders, count(*) FILTER (WHERE st = 'DELIVERED') AS delivered, sum(total) FILTER (WHERE st = 'DELIVERED') AS value FROM got`,
  ]);
  const by = (st: string) => byStatus.find((x) => x.status === st)?._count._all ?? 0;
  const m = marks[0];
  const o = orders[0];
  return {
    queued: byStatus.reduce((a, x) => a + x._count._all, 0),
    sent: by('SENT') + by('DELIVERED'),
    failed: by('FAILED'),
    waiting: by('QUEUED'),
    skipped: reasons.map((x) => ({ reason: x.reason ?? 'UNKNOWN', count: x._count._all })).sort((a, b) => b.count - a.count),
    opened: Number(m?.opened ?? 0),
    clicked: Number(m?.clicked ?? 0),
    clicks: Number(m?.clicks ?? 0),
    unsubscribed: Number(m?.unsub ?? 0),
    orders: Number(o?.orders ?? 0),
    delivered: Number(o?.delivered ?? 0),
    deliveredValueMinor: Number(o?.value ?? 0),
  };
}

export interface EmailScreen {
  enabled: boolean;
  settings: EmailMarketingSettings;
  sends: EmailSendRow[];
  templates: EmailTemplateRow[];
  archivedTemplates: EmailTemplateRow[];
  canWrite: boolean;
  canSend: boolean;
}

/** Messages › E-mail: the sends (newest first) and the templates. */
export async function emailScreen(deps: CustomersDeps, who: Who): Promise<EmailScreen> {
  const held = await gate(deps, who, EMAIL_READ);
  const S = who.storeId;
  const [settings, sends, templates] = await Promise.all([
    setting(deps, S, 'customers.email'),
    deps.db.broadcast.findMany({ where: { storeId: S, channel: 'EMAIL' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 200 }),
    deps.db.notificationTemplate.findMany({ where: templateWhere(S), orderBy: [{ name: 'asc' }, { id: 'asc' }], select: TEMPLATE_SELECT, take: 1000 }),
  ]);
  const names = await segmentNames(deps.db, S, sends.map((x) => x.segmentId));
  return {
    enabled: settings.enabled,
    settings,
    sends: sends.map((r) => sendRow(r, names)),
    templates: templates.filter((r) => !r.archivedAt).map(templateRow),
    archivedTemplates: templates.filter((r) => r.archivedAt).map(templateRow),
    canWrite: held.write,
    canSend: held.send,
  };
}

export interface EmailSendView extends EmailSendRow {
  templateId: string | null;
  subject: string;
  body: string;
  locale: EmailLocale;
  version: string;
}

export interface EmailSendEditor {
  send: EmailSendView | null;
  results: EmailResults | null;
  audience: EmailAudience | null;
  /** The audience could not be counted (the segment is archived or segments are off). */
  audienceProblem: boolean;
  templates: EmailTemplateRow[];
  segments: { id: string; name: string }[];
  segmentsOn: boolean;
  settings: EmailMarketingSettings;
  canWrite: boolean;
  canSend: boolean;
}

/** One send for its page (null id: a new draft): its words, its audience now, and its results once it went. */
export async function emailSendEditor(deps: CustomersDeps, who: Who, id: string | null): Promise<EmailSendEditor | null> {
  const held = await gate(deps, who, EMAIL_READ);
  if (id !== null && !UUID.test(id)) return null;
  const S = who.storeId;
  const [row, settings, segOn, templates, segments] = await Promise.all([
    id ? deps.db.broadcast.findFirst({ where: { id, storeId: S, channel: 'EMAIL' } }) : null,
    setting(deps, S, 'customers.email'),
    setting(deps, S, 'customers.segments'),
    deps.db.notificationTemplate.findMany({ where: { ...templateWhere(S), archivedAt: null }, orderBy: [{ name: 'asc' }], select: TEMPLATE_SELECT, take: 1000 }),
    deps.db.segment.findMany({ where: { storeId: S, archivedAt: null }, orderBy: [{ name: 'asc' }], select: { id: true, name: true }, take: 500 }),
  ]);
  if (id && !row) return null;
  const names = row ? await segmentNames(deps.db, S, [row.segmentId]) : new Map<string, string>();
  const send: EmailSendView | null = row ? { ...sendRow(row, names), templateId: row.templateId, subject: row.subject ?? '', body: row.body ?? '', locale: row.locale === 'en' ? 'en' : 'bn', version: row.updatedAt.toISOString() } : null;
  let audience: EmailAudience | null = null;
  let audienceProblem = false;
  if (settings.enabled && (!send || send.status === 'DRAFT' || send.status === 'SCHEDULED')) {
    try {
      audience = await emailAudience(deps, S, send?.segmentId ?? null);
    } catch (e) {
      if (!(e instanceof CustomersError)) throw e;
      audienceProblem = true;
    }
  }
  const results = send && send.status !== 'DRAFT' ? await emailResults(deps, S, send.id, settings.resultDays) : null;
  return { send, results, audience, audienceProblem, templates: templates.map(templateRow), segments: segOn.enabled ? segments : [], segmentsOn: segOn.enabled, settings, canWrite: held.write, canSend: held.send };
}

const sendInput = words
  .extend({
    name: z.string().trim().min(1).max(80),
    segmentId: z.string().regex(UUID).nullable(),
    templateId: z.string().regex(UUID).nullable(),
    locale: z.enum(EMAIL_LOCALES),
    version: z.string().max(40).optional(),
  })
  .strict();

/** Saves a draft send (new or changed; only a draft changes). The segment and template must be this store's. Audited. */
export async function saveEmailSend(deps: CustomersDeps, who: Who, id: string | null, input: unknown): Promise<EmailSendEditor> {
  await gate(deps, who, EMAIL_WRITE);
  const S = who.storeId;
  await switchedOn(deps, S);
  const d = parse(sendInput, input, 'e-mail send');
  checkWords(d);
  if (id !== null && !UUID.test(id)) throw new CustomersError('NOT_FOUND', 'no such send', ['sendId']);
  await audienceSql(deps, S, d.segmentId);
  if (d.templateId && !(await deps.db.notificationTemplate.findFirst({ where: { id: d.templateId, ...templateWhere(S) }, select: { id: true } }))) throw new CustomersError('INVALID_INPUT', 'no such e-mail template', ['templateId']);
  const data = { name: d.name, segmentId: d.segmentId, templateId: d.templateId, subject: d.subject, body: d.body, locale: d.locale };
  const saved = await deps.db.$transaction(async (tx) => {
    if (id === null) {
      const row = await tx.broadcast.create({ data: { storeId: S, channel: 'EMAIL', status: 'DRAFT', createdById: who.actor.staffUserId ?? null, ...data } });
      await audit(tx, who.actor, { action: 'email.send.create', entityType: 'Broadcast', entityId: row.id, storeId: S, after: data }, who.ctx);
      return row;
    }
    const before = await tx.broadcast.findFirst({ where: { id, storeId: S, channel: 'EMAIL' } });
    if (!before) throw new CustomersError('NOT_FOUND', 'no such send', ['sendId']);
    if (before.status !== 'DRAFT') throw new CustomersError('NOT_ACTIVE', 'only a draft can be changed', ['status'], { status: before.status });
    if (d.version !== undefined && d.version !== before.updatedAt.toISOString()) throw new CustomersError('STALE', 'the send was changed by someone else; reload it', ['version'], { version: before.updatedAt.toISOString() });
    const row = await tx.broadcast.update({ where: { id: before.id }, data });
    await audit(tx, who.actor, { action: 'email.send.update', entityType: 'Broadcast', entityId: row.id, storeId: S, before: { name: before.name, segmentId: before.segmentId, templateId: before.templateId, subject: before.subject, body: before.body, locale: before.locale }, after: data }, who.ctx);
    return row;
  }, TX);
  return (await emailSendEditor(deps, who, saved.id))!;
}

const stateInput = z
  .object({
    action: z.enum(['schedule', 'pause', 'resume', 'cancel']),
    /** schedule: when it goes (ISO time; null or absent: now). */
    at: z.iso.datetime({ offset: true }).nullable().optional(),
    version: z.string().max(40).optional(),
  })
  .strict();

/** The allowed moves of a send (anything else is NOT_ACTIVE). */
const MOVES: Record<'schedule' | 'pause' | 'resume' | 'cancel', readonly EmailSendStatus[]> = { schedule: ['DRAFT'], pause: ['SCHEDULED', 'SENDING'], resume: ['PAUSED'], cancel: ['SCHEDULED', 'SENDING', 'PAUSED'] };

/**
 * Schedules a draft (now or at a time; only while it reaches someone), pauses a send (its queued e-mails wait), resumes
 * it, or cancels it (whatever still waits is left out, CANCELLED; nothing sent is taken back). `messages.email.send`.
 * Audited.
 */
export async function changeEmailSend(deps: CustomersDeps, who: Who, id: string, input: unknown): Promise<EmailSendEditor> {
  await gate(deps, who, EMAIL_SEND);
  const S = who.storeId;
  const d = parse(stateInput, input, 'send state');
  if (d.action !== 'cancel' && d.action !== 'pause') await switchedOn(deps, S);
  const before = UUID.test(id) ? await deps.db.broadcast.findFirst({ where: { id, storeId: S, channel: 'EMAIL' } }) : null;
  if (!before) throw new CustomersError('NOT_FOUND', 'no such send', ['sendId']);
  const status = isStatus(before.status) ? before.status : 'DRAFT';
  if (!MOVES[d.action].includes(status)) throw new CustomersError('NOT_ACTIVE', `a ${status.toLowerCase()} send cannot ${d.action}`, ['status'], { status });
  if (d.version !== undefined && d.version !== before.updatedAt.toISOString()) throw new CustomersError('STALE', 'the send was changed by someone else; reload it', ['version'], { version: before.updatedAt.toISOString() });
  const now = nowOf(deps);
  let next: Prisma.BroadcastUpdateInput;
  if (d.action === 'schedule') {
    if (!before.subject?.trim() || !before.body?.trim()) throw new CustomersError('INVALID_INPUT', 'the send has no words yet', ['subject', 'body']);
    const at = d.at ? new Date(d.at) : now;
    if (at.getTime() < now.getTime() - 60_000) throw new CustomersError('INVALID_INPUT', 'the time has passed', ['at']);
    const aud = await emailAudience(deps, S, before.segmentId);
    if (aud.reachable < 1) throw new CustomersError('LIMIT_REACHED', 'nobody in this audience said yes to offer e-mails', ['segmentId'], { audience: aud });
    next = { status: 'SCHEDULED', scheduledAt: at };
  } else if (d.action === 'pause') next = { status: 'PAUSED' };
  else if (d.action === 'resume') next = { status: before.startedAt ? 'SENDING' : 'SCHEDULED' };
  else next = { status: 'CANCELLED', finishedAt: now };
  await deps.db.$transaction(async (tx) => {
    await tx.broadcast.update({ where: { id: before.id }, data: next });
    if (d.action === 'cancel') await tx.notificationLog.updateMany({ where: { storeId: S, broadcastId: before.id, status: 'QUEUED' }, data: { status: 'SKIPPED', reason: 'CANCELLED', sendAfter: null } });
    await audit(tx, who.actor, { action: `email.send.${d.action}`, entityType: 'Broadcast', entityId: before.id, storeId: S, before: { status: before.status, scheduledAt: before.scheduledAt }, after: { status: next.status, ...(d.action === 'schedule' ? { scheduledAt: next.scheduledAt } : {}) } }, who.ctx);
  }, TX);
  return (await emailSendEditor(deps, who, before.id))!;
}

/** The page's settings card: `customers.email` through its own schema (`messages.email.write`). Audited. */
export async function saveEmailSettings(deps: CustomersDeps, who: Who, input: unknown): Promise<EmailScreen> {
  await gate(deps, who, EMAIL_WRITE);
  if (!deps.settings.set) throw new CustomersError('INVALID_INPUT', 'settings cannot be written here', ['settings']);
  const before = await setting(deps, who.storeId, 'customers.email');
  const next = { ...before, ...(input && typeof input === 'object' ? input : {}) };
  if (JSON.stringify(next) !== JSON.stringify(before)) {
    try {
      await deps.settings.set('customers.email', next as never, { level: 'store', storeId: who.storeId }, { actorId: who.actor.staffUserId ?? null, reason: 'Messages › E-mail' });
    } catch (e) {
      throw new CustomersError('INVALID_INPUT', 'the e-mail settings are not valid', (e as { details?: string[] }).details ?? ['customers.email']);
    }
    await audit(deps.db, who.actor, { action: 'email.settings', entityType: 'Setting', entityId: 'customers.email', storeId: who.storeId, before, after: next }, who.ctx);
  }
  return emailScreen(deps, who);
}

// ---- the run -------------------------------------------------------------------------------------------------------

export interface EmailRunResult {
  started: number;
  queued: number;
  finished: number;
}

/**
 * One store's e-mail run (the message job, before it sends): sends whose time came start; each sending one queues its
 * next people (at most `batchSize` in all per run: the throttle) — only those with an address and a yes for offer
 * e-mails, once per person and send; a send with nobody left to queue and nothing waiting is SENT. Safe to run twice.
 * Nothing at all while `customers.email` is off.
 */
export async function runEmailSends(deps: CustomersDeps, storeId: number): Promise<EmailRunResult | null> {
  const s = await setting(deps, storeId, 'customers.email');
  if (!s.enabled) return null;
  const now = nowOf(deps);
  const out: EmailRunResult = { started: 0, queued: 0, finished: 0 };
  const started = await deps.db.broadcast.updateMany({ where: { storeId, channel: 'EMAIL', status: 'SCHEDULED', scheduledAt: { lte: now } }, data: { status: 'SENDING', startedAt: now } });
  out.started = started.count;
  const sending = await deps.db.broadcast.findMany({ where: { storeId, channel: 'EMAIL', status: 'SENDING' }, orderBy: [{ startedAt: 'asc' }, { id: 'asc' }], select: { id: true, segmentId: true, locale: true } });
  const base = sending.length ? await baseOf(deps, storeId) : null;
  for (const b of sending) {
    const room = s.batchSize - out.queued;
    let seg: Prisma.Sql | null = null;
    try {
      seg = await audienceSql(deps, storeId, b.segmentId);
    } catch (e) {
      if (!(e instanceof CustomersError)) throw e;
    }
    let picked = 0;
    if (seg && room > 0) {
      const people = await deps.db.$queryRaw<{ id: string; email: string }[]>`${base!} SELECT b."id"::text AS id, trim(b."email") AS email FROM base b WHERE ${seg} AND ${reachableSql(storeId)} AND NOT EXISTS (SELECT 1 FROM "NotificationLog" l WHERE l."storeId" = ${storeId} AND l."dedupeKey" = 'email:' || ${b.id} || ':' || b."id"::text) ORDER BY b."id" LIMIT ${room}`;
      picked = people.length;
      if (people.length) {
        const made = await deps.db.notificationLog.createMany({
          data: people.map((p) => ({ storeId, customerId: p.id, broadcastId: b.id, channel: 'EMAIL' as const, recipient: p.email, status: 'QUEUED' as const, dedupeKey: emailSendKey(b.id, p.id), step: CRM_EMAIL_STEP, locale: b.locale ?? null, sendAfter: now })),
          skipDuplicates: true,
        });
        out.queued += made.count;
        if (made.count) await deps.db.broadcast.update({ where: { id: b.id }, data: { queuedCount: { increment: made.count } } });
      }
    }
    // nobody left to queue (or the segment went away) and nothing waits: the send is done
    if ((picked < room || !seg) && !(await deps.db.notificationLog.count({ where: { storeId, broadcastId: b.id, status: 'QUEUED' } }))) {
      const done = await deps.db.broadcast.updateMany({ where: { id: b.id, status: 'SENDING' }, data: { status: 'SENT', finishedAt: now } });
      out.finished += done.count;
    }
  }
  return out;
}

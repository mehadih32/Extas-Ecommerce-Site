// S12 · PR 591 (register "Blog content pipeline"; BLOG-CONTENT-PLAN "3/day for 2 weeks, then 5/day only while quality and
// indexing stay healthy — automatic drop to 3/day otherwise; an empty slot is never filled with a weak post") — Website ›
// Blog & journal › Pipeline on the database: the non-AI half of the pipeline, on the existing journal, plan and calendar.
//
// - The pace (`blog.pipeline`, off as it ships): `pacer` gives each shop day its number of articles from the first live
//   article's day, the ramp and the journal's health (pipeline-model.ts). The calendar (schedule.ts) fills its free
//   times only up to the pace while the pipeline is on, and never with an unfinished article (as before).
// - The health: the review answers of the last `healthDays` days (BlogPostReview: 'pass' or 'back'), and Google's
//   indexing — unknown until Search Console's numbers arrive (its own PR), so with `waitForIndexing` the pace stays at
//   the start.
// - The queue: how many topics and articles sit in each step (topics waiting for a yes, approved topics not started,
//   writing, the three review steps, finished, scheduled ahead); the buffer in days at today's pace and what to write
//   next (approved topics by priority); the articles waiting for a review step, with their writer (who may not pass his
//   own while `blog.journal.reviewByAnother`), flagged after `stuckDays`; the live articles due a refresh.
// - Nothing here writes an article or passes a review: each row opens its own page (the editor, the plan), where the
//   existing permissions and the four-eyes rule stay. The AI writer and proofreader wait for S15 (closed, PR 652).
// - Seeing needs `blog.read`; the card `blog.publish` (audited).
import { audit, can } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { blogPipelineSchema, storeTarget, type BlogPipelineSettings, type BlogScheduleSettings } from '@extas/settings';
import { body as readBody, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { JournalError, answer, versionOf, type JournalWho } from './journal';
import { issuesOf } from './model';
import { addDay, healthOf, isStuck, nextStep, paceFor, refreshDue, supplyOf, type FlowKey, type Health, type Pace, type ReviewStep } from './pipeline-model';
import { dayOf } from './schedule-model';

const S = MOTHER_STORE_ID;
type Db = PrismaClient;
type Resolver = AdminDeps['resolver'];
const KEY = 'blog.pipeline';
const EDITOR = '/admin/website/blog';
const DAY_MS = 86_400_000;
/** How many rows each list of the page shows (the board and the plan hold the rest). */
export const PIPELINE_ROWS = 20; // hardcode-ok: a list length, not a business number

/** The first shop day an article went live (null while none has). */
async function firstLiveDay(db: Db, now: Date, timeZone: string, storeId: number): Promise<string | null> {
  const r = await db.blogPost.aggregate({ where: { storeId, status: { in: ['PUBLISHED', 'SCHEDULED', 'UNPUBLISHED'] }, publishedAt: { lte: now } }, _min: { publishedAt: true } });
  return r._min.publishedAt ? dayOf(r._min.publishedAt, timeZone) : null;
}

/** The journal's health over the last `healthDays` days. Google's indexing is unknown until Search Console's PR. */
async function healthNow(db: Db, p: BlogPipelineSettings, now: Date, storeId: number): Promise<Health> {
  const since = new Date(now.getTime() - p.healthDays * DAY_MS);
  const rows = await db.blogPostReview.groupBy({ by: ['verdict'], where: { storeId, createdAt: { gte: since } }, _count: { _all: true } });
  const n = (v: string) => rows.find((r) => r.verdict === v)?._count._all ?? 0;
  return healthOf({ passes: n('pass'), backs: n('back'), indexedPct: null }, p);
}

export interface Pacer {
  on: boolean;
  health: Health;
  firstLive: string | null;
  /** The pace of a shop day. */
  of: (day: string) => Pace;
}

/** The pace of every day ahead, worked out once (shared by the calendar's fill and this page). */
export async function pacer(db: Db, resolver: Resolver, sch: BlogScheduleSettings, timeZone: string, now: Date, storeId: number = S): Promise<Pacer> {
  const p = await resolver.value(KEY, { storeId });
  // worked out even while off, so the page shows what the pace would be before it is switched on
  const [firstLive, health] = await Promise.all([firstLiveDay(db, now, timeZone, storeId), healthNow(db, p, now, storeId)]);
  return { on: p.on, health, firstLive, of: (day) => paceFor(day, firstLive, health, p, sch) };
}

export interface QueueRow {
  id: string;
  title: string;
  locale: string;
  href: string;
  /** The step it waits for. */
  step: 'writing' | ReviewStep;
  writer: string | null;
  author: string | null;
  waitingDays: number;
  stuck: boolean;
}

export interface TopicRow {
  id: string;
  title: string;
  locale: string;
  priority: number;
  pillar: boolean;
}

export interface RefreshRow {
  id: string;
  title: string;
  locale: string;
  href: string;
  ageDays: number;
}

export interface PipelineScreen {
  timeZone: string;
  today: string;
  pace: Pace;
  /** The pace from tomorrow while it changes (the ramp's end), or null. */
  paceNext: { day: string; perDay: number } | null;
  health: Health;
  firstLive: string | null;
  flow: Record<FlowKey, number>;
  supply: ReturnType<typeof supplyOf>;
  writeNext: TopicRow[];
  review: QueueRow[];
  stuck: number;
  refresh: RefreshRow[];
  reviewByAnother: boolean;
  card: { key: string; value: BlogPipelineSettings; version: string };
}

/** Website › Blog & journal › Pipeline: the pace, the health and the queue. */
export async function pipelineScreen(db: Db, resolver: Resolver, now: Date = new Date(), storeId: number = S): Promise<PipelineScreen> {
  const [p, sch, timeZone, journal] = await Promise.all([resolver.value(KEY, { storeId }), resolver.value('blog.schedule', { storeId }), resolver.value('store.timeZone', { storeId }), resolver.value('blog.journal', { storeId })]);
  const today = dayOf(now, timeZone);
  const pc = await pacer(db, resolver, sch, timeZone, now, storeId);
  const pace = pc.of(today);
  // the first day ahead whose pace differs from today's (the ramp's end), within the buffer's reach
  let paceNext: PipelineScreen['paceNext'] = null;
  for (let i = 1; i <= Math.max(p.bufferDays, p.rampDays) && !paceNext; i += 1) {
    const d = addDay(today, i);
    const q = pc.of(d);
    if (q.perDay !== pace.perDay) paceNext = { day: d, perDay: q.perDay };
  }

  const live = { storeId, archivedAt: null };
  const [byStatus, proposed, approvedOpen, scheduledAhead, nextTopics, waiting, due] = await Promise.all([
    db.blogPost.groupBy({ by: ['status'], where: live, _count: { _all: true } }),
    db.blogTopic.count({ where: { ...live, status: 'proposed' } }),
    db.blogTopic.count({ where: { ...live, status: 'approved', postId: null } }),
    db.blogPost.count({ where: { ...live, status: 'SCHEDULED', scheduledAt: { gt: now } } }),
    db.blogTopic.findMany({ where: { ...live, status: 'approved', postId: null }, orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }], take: PIPELINE_ROWS, select: { id: true, title: true, locale: true, priority: true, isPillar: true } }),
    db.blogPost.findMany({
      where: { ...live, status: { in: ['DRAFT', 'PROOFREAD', 'FACT_CHECKED'] } },
      orderBy: { updatedAt: 'asc' },
      take: PIPELINE_ROWS * 5,
      select: { id: true, title: true, locale: true, status: true, updatedAt: true, writerStaffId: true, author: { select: { displayName: true } } },
    }),
    db.blogPost.findMany({
      where: { ...live, status: 'PUBLISHED', OR: [{ contentUpdatedAt: { lt: new Date(now.getTime() - p.refreshDays * DAY_MS) } }, { contentUpdatedAt: null, publishedAt: { lt: new Date(now.getTime() - p.refreshDays * DAY_MS) } }] },
      orderBy: { publishedAt: 'asc' },
      take: PIPELINE_ROWS,
      select: { id: true, title: true, locale: true, publishedAt: true, contentUpdatedAt: true },
    }),
  ]);
  const count = (...st: string[]) => byStatus.filter((r) => st.includes(r.status)).reduce((a, r) => a + r._count._all, 0);
  const flow: Record<FlowKey, number> = {
    topics: proposed,
    approved: approvedOpen,
    writing: count('IDEA', 'BRIEFED', 'DRAFT'),
    proofread: count('PROOFREAD'),
    factChecked: count('FACT_CHECKED'),
    finished: count('SEO_CHECKED'),
    scheduled: scheduledAhead,
  };

  // when each waiting article entered its step: its last review answer, else its last change
  const ids = waiting.map((w) => w.id);
  const lastAnswers = ids.length ? await db.blogPostReview.groupBy({ by: ['postId'], where: { storeId, postId: { in: ids } }, _max: { createdAt: true } }) : [];
  const since = new Map(lastAnswers.map((r) => [r.postId, r._max.createdAt]));
  const writerIds = [...new Set(waiting.map((w) => w.writerStaffId).filter((x): x is string => !!x))];
  const names = writerIds.length ? new Map((await db.staffUser.findMany({ where: { id: { in: writerIds } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName])) : new Map<string, string>();
  const rows = waiting
    .map((w): QueueRow => {
      const at = since.get(w.id) ?? w.updatedAt;
      const waitingDays = Math.max(0, Math.floor((now.getTime() - at.getTime()) / DAY_MS));
      return { id: w.id, title: w.title, locale: w.locale, href: `${EDITOR}/${w.id}`, step: nextStep(w.status) ?? 'proofread', writer: w.writerStaffId ? (names.get(w.writerStaffId) ?? null) : null, author: w.author?.displayName ?? null, waitingDays, stuck: isStuck(at, now, p.stuckDays) };
    })
    .sort((a, b) => b.waitingDays - a.waitingDays);

  return {
    timeZone,
    today,
    pace,
    paceNext,
    health: pc.health,
    firstLive: pc.firstLive,
    flow,
    supply: supplyOf(flow.finished, scheduledAhead, pace.perDay, p.bufferDays),
    writeNext: nextTopics.map((t) => ({ id: t.id, title: t.title, locale: t.locale, priority: t.priority, pillar: t.isPillar })),
    review: rows.slice(0, PIPELINE_ROWS),
    stuck: rows.filter((r) => r.stuck).length,
    refresh: due.map((r) => ({ id: r.id, title: r.title, locale: r.locale, href: `${EDITOR}/${r.id}`, ageDays: refreshDue(r, now, p.refreshDays) ?? p.refreshDays })),
    reviewByAnother: journal.reviewByAnother,
    card: { key: KEY, value: p, version: versionOf(p) },
  };
}

/** The card (`blog.publish`; audited): the Lumen card's {key, on, values}, or {value, version}. */
export async function savePipelineSettings(db: Db, resolver: Resolver, who: JournalWho, input: unknown, storeId: number = S): Promise<void> {
  if (!(await can(db, who.actor, 'blog.publish', { storeId }))) throw new JournalError('FORBIDDEN', 403, ['blog.publish']);
  const before = await resolver.value(KEY, { storeId });
  const o = (input ?? {}) as { key?: unknown; on?: unknown; values?: unknown; value?: unknown; version?: unknown };
  let next: unknown;
  if (o.key === KEY && typeof o.on === 'boolean') {
    const values = { ...((o.values && typeof o.values === 'object' ? o.values : {}) as Record<string, unknown>) };
    // the card's choice "wait / don't wait" for Google's indexing arrives as its option's value
    if (values.waitForIndexing === 'on' || values.waitForIndexing === 'off') values.waitForIndexing = values.waitForIndexing === 'on';
    next = { ...before, ...values, on: o.on };
  } else {
    if (typeof o.version !== 'string' || o.version !== versionOf(before)) throw new JournalError('STALE', 409);
    next = o.value;
  }
  const ok = blogPipelineSchema.safeParse(next);
  if (!ok.success) throw new JournalError('INVALID_INPUT', 400, issuesOf(ok.error));
  if (versionOf(ok.data) === versionOf(before)) return;
  await resolver.set(KEY, ok.data, storeTarget(storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Website › Blog & journal › Pipeline' });
  await audit(db, who.actor, { storeId, action: 'blog.pipeline.settings', entityType: 'Setting', entityId: KEY, before: { ...before }, after: { ...ok.data } }, who.ctx);
}

/** /api/admin/blog/pipeline — GET the page (`blog.read`); PUT the card (`blog.publish`). Every answer carries the page. */
export async function pipelineHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'blog.read' : 'blog.publish', storeId: S });
  if (g instanceof Response) return g;
  const now = deps!.now?.() ?? new Date();
  try {
    if (method === 'PUT') await savePipelineSettings(deps!.db, deps!.resolver, { actor: g.actor, ctx: g.ctx }, await readBody(request));
    const screen = await pipelineScreen(deps!.db, deps!.resolver, now);
    return json({ ok: true, screen, cards: { [screen.card.key]: screen.card } });
  } catch (e) {
    return answer(e);
  }
}

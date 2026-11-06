// S12 · PR 245 (Blueprint C11.1, C11.2 "ready → scheduled → published"; demo 94-admin-blog.js schedule tab) — the
// publish calendar on the database: Website › Blog & journal › Calendar.
//
// - The days ahead (`blog.schedule.daysAhead`, shop time zone): each publishing time with its article (scheduled, or
//   live) or free, the day's count against its target, a day under its least flagged. The month view counts each day's
//   articles; a day opens its list.
// - The finished articles (all three review steps passed: SEO_CHECKED) wait for a time, with what still blocks them
//   (their words, their required links while `blog.clusters.requireLinks` is on). "Fill the free times" places each
//   finished article with nothing missing in the next free time, the topic's priority first (`blog.publish`); an
//   empty time is never filled with an unfinished article (C11.1). Audited as blog.post.schedule with by 'calendar'.
// - Scheduling by hand in the editor is refused on a day already at `perDayMax` (DAY_FULL); publishing now is the
//   publisher's own call and is not counted against it.
// - With `autoFill` (off as it ships) an article is placed by itself when its last review step passes (journal.ts).
// - Seeing needs `blog.read`; filling and the card `blog.publish`. The card is saved with its version (STALE).
import { audit, can } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { blogScheduleSchema, storeTarget, type BlogScheduleSettings } from '@extas/settings';
import { body, fail, guardAdmin, isUuid, json, type AdminDeps } from '../admin-auth';
import { JournalError, LIST_MAX, answer, linkGapsFor, versionOf, type JournalWho } from './journal';
import { isLive, issuesOf, publishGaps, type BlogState } from './model';
import { DAY_RE, MONTH_RE, addDays, dayOf, daysAhead, fillPlan, freeTimes, monthGrid, shiftMonth, slotAt, slotsOf, timeOf, type Ready } from './schedule-model';

const S = MOTHER_STORE_ID;
type Db = PrismaClient;
type Resolver = AdminDeps['resolver'];
const EDITOR = '/admin/website/blog';

export interface CalendarPost {
  id: string;
  title: string;
  locale: string;
  time: string;
  live: boolean;
  href: string;
}
export interface CalendarDay {
  day: string;
  rows: { time: string; post: CalendarPost | null }[];
  count: number;
  low: boolean;
}
export interface ReadyPost {
  id: string;
  title: string;
  locale: string;
  href: string;
  /** What still stops it: `title`/`body`/`slug` (its words) or the shop paths it must link to. */
  gaps: string[];
}
export interface CalendarScreen {
  timeZone: string;
  today: string;
  slots: string[];
  days: CalendarDay[];
  free: number;
  ready: ReadyPost[];
  month: { key: string; prev: string; next: string; weeks: (string | null)[][]; counts: Record<string, { live: number; scheduled: number }> };
  day: { key: string; posts: CalendarPost[] } | null;
  card: { key: string; value: BlogScheduleSettings; version: string };
}

interface Row {
  id: string;
  title: string;
  locale: string;
  status: string;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  archivedAt: Date | null;
}
const PLACED_SELECT = { id: true, title: true, locale: true, status: true, scheduledAt: true, publishedAt: true, archivedAt: true } as const;
const atOf = (r: Row): Date => (r.status === 'SCHEDULED' ? r.scheduledAt : r.publishedAt) ?? new Date(0);

/** The articles on the calendar (scheduled, or published) between two moments, never the ones put away. */
async function placedBetween(db: Db, from: Date, to: Date, storeId: number): Promise<Row[]> {
  return db.blogPost.findMany({
    where: {
      storeId,
      archivedAt: null,
      OR: [
        { status: 'SCHEDULED', scheduledAt: { gte: from, lt: to } },
        { status: 'PUBLISHED', publishedAt: { gte: from, lt: to } },
      ],
    },
    select: PLACED_SELECT,
    orderBy: [{ scheduledAt: 'asc' }, { publishedAt: 'asc' }],
    take: LIST_MAX,
  });
}

function view(r: Row, now: Date, timeZone: string): CalendarPost {
  return { id: r.id, title: r.title, locale: r.locale, time: timeOf(atOf(r), timeZone), live: isLive({ status: r.status as BlogState, scheduledAt: r.scheduledAt, archivedAt: r.archivedAt }, now), href: `${EDITOR}/${r.id}` };
}

async function settingsOf(resolver: Resolver, storeId: number) {
  const [s, timeZone] = await Promise.all([resolver.value('blog.schedule', { storeId }), resolver.value('store.timeZone', { storeId })]);
  return { s, timeZone };
}

/** The days ahead with their articles and free times (shared by the screen and the fill). */
async function upcoming(db: Db, s: BlogScheduleSettings, timeZone: string, now: Date, storeId: number) {
  const today = dayOf(now, timeZone);
  const placed = await placedBetween(db, slotAt(today, '00:00', timeZone), slotAt(addDays(today, s.daysAhead), '00:00', timeZone), storeId);
  const plans = daysAhead(
    placed.map((r) => ({ at: atOf(r) })),
    s,
    now,
    timeZone,
  );
  return { today, placed, plans };
}

/** The finished articles waiting for a time, in the order they get one, with what still blocks each. */
async function readyPosts(db: Db, resolver: Resolver, now: Date, storeId: number) {
  const rows = await db.blogPost.findMany({
    where: { storeId, status: 'SEO_CHECKED', archivedAt: null },
    select: { id: true, title: true, locale: true, slug: true, body: true, updatedAt: true, topicId: true },
    take: LIST_MAX,
  });
  const topicIds = [...new Set(rows.map((r) => r.topicId).filter((x): x is string => !!x))];
  const topics = topicIds.length ? await db.blogTopic.findMany({ where: { storeId, id: { in: topicIds } }, select: { id: true, priority: true } }) : [];
  const priority = new Map(topics.map((t) => [t.id, t.priority]));
  const out: (Ready & ReadyPost)[] = [];
  for (const r of rows) {
    const gaps = [...publishGaps(r), ...(await linkGapsFor(db, resolver, r.id, now, storeId))];
    // An article with no topic waits after every planned one.
    out.push({ id: r.id, title: r.title, locale: r.locale, href: `${EDITOR}/${r.id}`, gaps, priority: (r.topicId && priority.get(r.topicId)) || Number.MAX_SAFE_INTEGER, updatedAt: r.updatedAt });
  }
  return out;
}

/** Website › Blog & journal › Calendar: the days ahead, the month, the finished articles and the card. */
export async function publishCalendar(db: Db, resolver: Resolver, now: Date = new Date(), opts: { month?: string | null; day?: string | null } = {}, storeId: number = S): Promise<CalendarScreen> {
  const { s, timeZone } = await settingsOf(resolver, storeId);
  const { today, placed, plans } = await upcoming(db, s, timeZone, now, storeId);
  const ready = await readyPosts(db, resolver, now, storeId);
  const pickedDay = opts.day && DAY_RE.test(opts.day) ? opts.day : null;
  const month = opts.month && MONTH_RE.test(opts.month) ? opts.month : (pickedDay ?? today).slice(0, 7);

  const days: CalendarDay[] = plans.map((p) => {
    const mine = placed.filter((r) => dayOf(atOf(r), timeZone) === p.day).map((r) => view(r, now, timeZone));
    const rows = [...mine.map((post) => ({ time: post.time, post })), ...p.free.map((at) => ({ time: timeOf(at, timeZone), post: null }))];
    // A publishing time that has passed, or is too close, shows only when an article holds it.
    rows.sort((a, b) => a.time.localeCompare(b.time));
    return { day: p.day, rows, count: p.count, low: p.low };
  });

  const monthStart = slotAt(`${month}-01`, '00:00', timeZone);
  const monthEnd = slotAt(`${shiftMonth(month, 1)}-01`, '00:00', timeZone);
  const inMonth = await placedBetween(db, monthStart, monthEnd, storeId);
  const counts: CalendarScreen['month']['counts'] = {};
  for (const r of inMonth) {
    const k = dayOf(atOf(r), timeZone);
    const c = (counts[k] ??= { live: 0, scheduled: 0 });
    if (view(r, now, timeZone).live) c.live += 1;
    else c.scheduled += 1;
  }
  let day: CalendarScreen['day'] = null;
  if (pickedDay) {
    const list = pickedDay.slice(0, 7) === month ? inMonth : await placedBetween(db, slotAt(pickedDay, '00:00', timeZone), slotAt(addDays(pickedDay, 1), '00:00', timeZone), storeId);
    day = { key: pickedDay, posts: list.filter((r) => dayOf(atOf(r), timeZone) === pickedDay).map((r) => view(r, now, timeZone)).sort((a, b) => a.time.localeCompare(b.time)) };
  }
  return {
    timeZone,
    today,
    slots: slotsOf(s),
    days,
    free: freeTimes(plans).length,
    ready: ready.map(({ id, title, locale, href, gaps }) => ({ id, title, locale, href, gaps })),
    month: { key: month, prev: shiftMonth(month, -1), next: shiftMonth(month, 1), weeks: monthGrid(month, s.weekStart), counts },
    day,
    card: { key: 'blog.schedule', value: s, version: versionOf(s) },
  };
}

/**
 * Place finished articles with nothing missing in the free times of the days ahead, one each (`blog.publish`, unless
 * `byItself`). `onlyId` places just that article. Answers how many were placed, skipped (something missing) and the
 * free times left.
 */
export async function fillCalendar(db: Db, resolver: Resolver, who: JournalWho, input: { onlyId?: string | null; byItself?: boolean }, now: Date = new Date(), storeId: number = S): Promise<{ placed: number; skipped: number; free: number }> {
  if (!input.byItself && !(await can(db, who.actor, 'blog.publish', { storeId }))) throw new JournalError('FORBIDDEN', 403, ['blog.publish']);
  const { s, timeZone } = await settingsOf(resolver, storeId);
  const { plans } = await upcoming(db, s, timeZone, now, storeId);
  const free = freeTimes(plans);
  const all = (await readyPosts(db, resolver, now, storeId)).filter((r) => !input.onlyId || r.id === input.onlyId);
  const fit = all.filter((r) => !r.gaps.length);
  let placed = 0;
  for (const { post, at } of fillPlan(fit, free)) {
    const before = await db.blogPost.findFirst({ where: { id: post.id, storeId }, select: { publishedAt: true } });
    const moved = await db.blogPost.updateMany({ where: { id: post.id, storeId, status: 'SEO_CHECKED', archivedAt: null }, data: { status: 'SCHEDULED', scheduledAt: at, publishedAt: before?.publishedAt ?? at } });
    if (!moved.count) continue;
    placed += 1;
    await audit(db, who.actor, { storeId, action: input.byItself ? 'blog.post.autoSchedule' : 'blog.post.schedule', entityType: 'BlogPost', entityId: post.id, before: { status: 'SEO_CHECKED' }, after: { status: 'SCHEDULED', scheduledAt: at.toISOString(), by: 'calendar', title: post.title } }, who.ctx);
  }
  return { placed, skipped: all.length - fit.length, free: free.length - placed };
}

/** PR 245: with `blog.schedule.autoFill` on, an article whose last review step just passed takes the next free time. */
export async function autoPlace(db: Db, resolver: Resolver, who: JournalWho, id: string, now: Date, storeId: number = S): Promise<void> {
  const s = await resolver.value('blog.schedule', { storeId });
  if (!s.autoFill) return;
  await fillCalendar(db, resolver, who, { onlyId: id, byItself: true }, now, storeId);
}

/** Scheduling by hand: refused when that shop-time day already holds `perDayMax` articles (not counting this one). */
export async function dayFull(db: Db, resolver: Resolver, at: Date, exceptId: string, storeId: number = S): Promise<boolean> {
  const { s, timeZone } = await settingsOf(resolver, storeId);
  const day = dayOf(at, timeZone);
  const list = await placedBetween(db, slotAt(day, '00:00', timeZone), slotAt(addDays(day, 1), '00:00', timeZone), storeId);
  return list.filter((r) => r.id !== exceptId).length >= s.perDayMax;
}

/** The calendar's card (`blog.publish`; audited). */
export async function saveScheduleSettings(db: Db, resolver: Resolver, who: JournalWho, input: unknown, storeId: number = S): Promise<void> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (o.key !== 'blog.schedule') throw new JournalError('INVALID_INPUT', 400, ['key']);
  if (!(await can(db, who.actor, 'blog.publish', { storeId }))) throw new JournalError('FORBIDDEN', 403, ['blog.publish']);
  const before = await resolver.value('blog.schedule', { storeId });
  if (o.version !== versionOf(before)) throw new JournalError('STALE', 409);
  const ok = blogScheduleSchema.safeParse(o.value);
  if (!ok.success) throw new JournalError('INVALID_INPUT', 400, issuesOf(ok.error));
  const value = { ...ok.data, slots: slotsOf(ok.data).join(', ') };
  if (versionOf(value) === versionOf(before)) return;
  await resolver.set('blog.schedule', value, storeTarget(storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Website › Blog & journal › Calendar' });
  await audit(db, who.actor, { storeId, action: 'blog.schedule.settings', entityType: 'Setting', entityId: 'blog.schedule', before: { ...before }, after: { ...value } }, who.ctx);
}

/**
 * /api/admin/blog/calendar — GET the calendar (`blog.read`; ?month=YYYY-MM&day=YYYY-MM-DD); POST {action: 'fill',
 * postId?} (`blog.publish`); PUT the card (`blog.publish`). Every answer carries the calendar.
 */
export async function calendarHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'blog.read' : 'blog.write', storeId: S });
  if (g instanceof Response) return g;
  const db = deps!.db;
  const resolver = deps!.resolver;
  const now = deps!.now?.() ?? new Date();
  const who = { actor: g.actor, ctx: g.ctx };
  const q = new URL(request.url).searchParams;
  try {
    let extra: Record<string, unknown> = {};
    if (method === 'POST') {
      const o = (await body(request)) as Record<string, unknown> | null;
      if (!o || o.action !== 'fill') throw new JournalError('INVALID_INPUT', 400, ['action']);
      const onlyId = typeof o.postId === 'string' ? o.postId : null;
      if (onlyId && !isUuid(onlyId)) throw new JournalError('INVALID_INPUT', 400, ['postId']);
      extra = await fillCalendar(db, resolver, who, { onlyId }, now);
    } else if (method === 'PUT') {
      await saveScheduleSettings(db, resolver, who, await body(request));
    }
    const calendar = await publishCalendar(db, resolver, now, { month: q.get('month'), day: q.get('day') });
    return json({ ok: true, calendar, cards: { [calendar.card.key]: calendar.card }, ...extra });
  } catch (e) {
    return answer(e);
  }
}

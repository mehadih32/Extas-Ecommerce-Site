// S12 · PR 528 (S12 answer 11; BLOG-CONTENT-PLAN §5.1; demo 97x-adm2-website.js "Topics & briefs") — the blog brief on
// the database: every article starts from one (BlogBrief, one per topic).
//
// - The topic, its language, the word count and the keywords are chosen before a single word is written; the rest
//   (search phrase, intent, outline, facts to carry, links to make, photos, note) helps the writer. A brief names one of
//   the plan's topics, or makes a new topic from the title typed in it (the plan's own rules: a writer's topic waits for
//   the owner's yes, a very close one needs a second press).
// - "Start writing" on the topic (lib/journal/clusters.ts) takes the brief's language and keyword, and with
//   `blog.brief.requireForStart` on it waits for the brief. Nothing is deleted: a brief is changed, never removed.
// - Seeing needs `blog.read`, writing a brief `blog.write`, the brief card (`blog.brief`) `blog.publish`. Audited.
import { audit, can } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { blogBriefSchema, storeTarget, type BlogBriefSettings } from '@extas/settings';
import { body, fail, guardAdmin, isUuid, json, type AdminDeps } from '../admin-auth';
import { issuesOf } from './model';
import { JournalError, LIST_MAX, answer, versionOf, type JournalWho } from './journal';
import { saveTopic } from './clusters';
import { briefInputSchema, briefGaps, type ImagePolicy, type Intent } from './briefs-model';

const S = MOTHER_STORE_ID;
type Db = PrismaClient;
type Resolver = AdminDeps['resolver'];

export interface BriefView {
  id: string | null;
  topicId: string | null;
  topicTitle: string | null;
  topicStatus: string | null;
  postId: string | null;
  language: 'en' | 'bn';
  wordCount: number;
  keywords: string[];
  query: string | null;
  intent: Intent;
  outline: string[];
  mustInclude: string | null;
  links: string[];
  shotList: string[];
  imagePolicy: ImagePolicy;
  notes: string | null;
  /** What is still missing before it can be written from (an AI draft needs none). */
  gaps: string[];
  version: string | null;
}

export interface BriefTopicChoice {
  id: string;
  title: string;
  locale: string;
  query: string | null;
  status: string;
}

export interface BriefScreen {
  brief: BriefView;
  topics: BriefTopicChoice[];
  card: { key: 'brief'; value: BlogBriefSettings; version: string };
}

type Row = NonNullable<Awaited<ReturnType<Db['blogBrief']['findFirst']>>>;
const toView = (b: Row, topic: { title: string; status: string } | null): BriefView => ({
  id: b.id,
  topicId: b.topicId,
  topicTitle: topic?.title ?? null,
  topicStatus: topic?.status ?? null,
  postId: b.postId,
  language: b.language === 'bn' ? 'bn' : 'en',
  wordCount: b.wordCount,
  keywords: b.keywords,
  query: b.query,
  intent: (b.intent as Intent) ?? 'info',
  outline: b.outline,
  mustInclude: b.mustInclude,
  links: b.links,
  shotList: b.shotList,
  imagePolicy: (b.imagePolicy as ImagePolicy | null) ?? 'own',
  notes: b.notes,
  gaps: briefGaps(b),
  version: b.updatedAt.toISOString(),
});

/**
 * The brief screen: one brief (id) or a new one (null; `topicId` picks the topic it starts from), the topics a brief
 * can be for (open, without a brief of their own) and the card.
 */
export async function briefScreen(db: Db, resolver: Resolver, id: string | null, topicId: string | null = null, storeId: number = S): Promise<BriefScreen | null> {
  const [set, row, taken] = await Promise.all([
    resolver.value('blog.brief', { storeId }),
    id ? db.blogBrief.findFirst({ where: { id, storeId } }) : null,
    db.blogBrief.findMany({ where: { storeId, topicId: { not: null } }, take: LIST_MAX, select: { topicId: true } }),
  ]);
  if (id && !row) return null;
  const own = row?.topicId ?? null;
  const busy = new Set(taken.map((x) => x.topicId).filter((x) => x && x !== own));
  const open = await db.blogTopic.findMany({ where: { storeId, archivedAt: null, status: { not: 'rejected' } }, orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }], take: LIST_MAX, select: { id: true, title: true, locale: true, query: true, status: true } });
  const topics = open.filter((x) => !busy.has(x.id));
  const own2 = own ? (topics.find((x) => x.id === own) ?? (await db.blogTopic.findFirst({ where: { id: own, storeId }, select: { id: true, title: true, locale: true, query: true, status: true } }))) : null;
  const start = !row ? (topics.find((x) => x.id === topicId) ?? null) : null;
  const brief: BriefView = row
    ? toView(row, own2)
    : {
        id: null,
        topicId: start?.id ?? null,
        topicTitle: start?.title ?? null,
        topicStatus: start?.status ?? null,
        postId: null,
        language: start?.locale === 'bn' ? 'bn' : 'en',
        wordCount: set.wordsDefault,
        keywords: start?.query ? [start.query] : [],
        query: start?.query ?? null,
        intent: 'info',
        outline: [],
        mustInclude: null,
        links: [],
        shotList: [],
        imagePolicy: 'own',
        notes: null,
        gaps: [],
        version: null,
      };
  return { brief, topics, card: { key: 'brief', value: set, version: versionOf(set) } };
}

/** Create (id null) or save a brief. Answers its id. */
export async function saveBrief(db: Db, resolver: Resolver, who: JournalWho, id: string | null, input: unknown, now: Date = new Date(), storeId: number = S): Promise<string> {
  const set = await resolver.value('blog.brief', { storeId });
  const ok = briefInputSchema(set).safeParse(input);
  if (!ok.success) throw new JournalError('INVALID_INPUT', 400, issuesOf(ok.error));
  const d = ok.data;
  const before = id ? await db.blogBrief.findFirst({ where: { id, storeId } }) : null;
  if (id && !before) throw new JournalError('NOT_FOUND', 404);
  if (before && before.updatedAt.toISOString() !== d.version) throw new JournalError('STALE', 409);
  // The topic stays once the article is started from it.
  if (before?.postId && d.topicId !== before.topicId) throw new JournalError('WRONG_STATE', 409, ['topicId']);

  let topicId = d.topicId;
  if (topicId) {
    const topic = await db.blogTopic.findFirst({ where: { id: topicId, storeId, archivedAt: null, status: { not: 'rejected' } }, select: { id: true } });
    if (!topic) throw new JournalError('INVALID_INPUT', 400, ['topicId']);
    const other = await db.blogBrief.findFirst({ where: { storeId, topicId, ...(before ? { id: { not: before.id } } : {}) }, select: { id: true } });
    if (other) throw new JournalError('BRIEF_TAKEN', 409, [other.id]);
  } else {
    // A new topic typed in the brief joins the plan by the plan's own rules.
    topicId = await saveTopic(db, resolver, who, null, { title: d.title, query: d.query, locale: d.language, force: d.force }, now, storeId);
  }
  const fields = {
    topicId,
    language: d.language,
    wordCount: d.wordCount,
    keywords: d.keywords,
    query: d.query,
    intent: d.intent,
    outline: d.outline,
    mustInclude: d.mustInclude,
    links: d.links,
    shotList: d.shotList,
    imagePolicy: d.imagePolicy,
    notes: d.notes,
    updatedById: who.actor.staffUserId ?? null,
  };
  const saved = before
    ? await db.blogBrief.update({ where: { id: before.id }, data: fields })
    : await db.blogBrief.create({ data: { storeId, ...fields, createdById: who.actor.staffUserId ?? null } });
  // The topic not yet started is written in the brief's language.
  await db.blogTopic.updateMany({ where: { id: topicId, storeId, postId: null }, data: { locale: d.language } });
  await audit(
    db,
    who.actor,
    { storeId, action: before ? 'blog.brief.save' : 'blog.brief.create', entityType: 'BlogBrief', entityId: saved.id, after: { topicId, language: d.language, wordCount: d.wordCount, keywords: d.keywords } },
    who.ctx,
  );
  return saved.id;
}

/** PUT {key: 'brief', value, version}: the brief card (`blog.publish`; audited). */
export async function saveBriefSettings(db: Db, resolver: Resolver, who: JournalWho, input: unknown, storeId: number = S): Promise<void> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (o.key !== 'brief') throw new JournalError('INVALID_INPUT', 400, ['key']);
  if (!(await can(db, who.actor, 'blog.publish', { storeId }))) throw new JournalError('FORBIDDEN', 403, ['blog.publish']);
  const before = await resolver.value('blog.brief', { storeId });
  if (o.version !== versionOf(before)) throw new JournalError('STALE', 409);
  const ok = blogBriefSchema.safeParse(o.value);
  if (!ok.success) throw new JournalError('INVALID_INPUT', 400, issuesOf(ok.error));
  if (versionOf(ok.data) === versionOf(before)) return;
  await resolver.set('blog.brief', ok.data, storeTarget(storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Website › Blog & journal › Brief' });
  await audit(db, who.actor, { storeId, action: 'blog.brief.settings', entityType: 'Setting', entityId: 'blog.brief', before: { ...before }, after: { ...ok.data } }, who.ctx);
}

/**
 * /api/admin/blog/briefs[/<id>] — GET a brief screen (`blog.read`; `?topic=` for a new one); POST a new brief; PUT one
 * (with its version), or (no id) the brief card. Every answer carries the screen.
 */
export async function briefHandler(request: Request, deps: AdminDeps | null, id: string | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST' && method !== 'PUT') return fail(405, 'method-not-allowed');
  if (id && !isUuid(id)) return fail(404, 'NOT_FOUND');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'blog.read' : 'blog.write', storeId: S });
  if (g instanceof Response) return g;
  const db = deps!.db;
  const resolver = deps!.resolver;
  const now = deps!.now?.() ?? new Date();
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    let at = id;
    if (method === 'POST') {
      if (id) return fail(405, 'method-not-allowed');
      at = await saveBrief(db, resolver, who, null, await body(request), now);
    } else if (method === 'PUT' && !id) {
      await saveBriefSettings(db, resolver, who, await body(request));
    } else if (method === 'PUT') {
      await saveBrief(db, resolver, who, id, await body(request), now);
    }
    const topic = new URL(request.url).searchParams.get('topic');
    const screen = await briefScreen(db, resolver, at, topic && isUuid(topic) ? topic : null);
    if (!screen) return fail(404, 'NOT_FOUND');
    return json({ ok: true, id: at, screen, cards: { brief: screen.card } }, { status: method === 'POST' ? 201 : 200 });
  } catch (e) {
    return answer(e);
  }
}

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
// PR 243 (S12 answer 11): "Write the first draft with AI" — from a saved brief with nothing missing, whose topic is
// approved and not started, in the brief's language, while AI is on for the shop (`ai.enabled`) and here
// (`blog.aiDraft`, off as shipped), at most `dailyMax` in the last 24 hours. The topic is started as by hand (the brief
// points at the article) and the draft's words fill it, marked AI-assisted; the practice writer's draft opens with a
// box saying it is practice text. A person still edits it and it passes the three review steps. Audited
// (blog.brief.aiDraft, with the provider and whether it was practice).
import { aiWriterAdapters, createConnections, type AiWriter } from '@extas/adapters';
import { audit, can } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { blogAiDraftSchema, blogBriefSchema, storeTarget, type BlogAiDraftSettings, type BlogBriefSettings } from '@extas/settings';
import { body, fail, guardAdmin, isUuid, json, type AdminDeps } from '../admin-auth';
import { BODY_MAX, EXCERPT_MAX, issuesOf, readingMinutes, wordCount } from './model';
import { JournalError, LIST_MAX, answer, versionOf, type JournalWho } from './journal';
import { saveTopic, topicAction } from './clusters';
import bnWords from '../../../messages/admin-blog.bn.json';
import enWords from '../../../messages/admin-blog.en.json';
import { briefInputSchema, briefGaps, type ImagePolicy, type Intent } from './briefs-model';

const S = MOTHER_STORE_ID;
const DAY_MS = 86_400_000; // hardcode-ok: the length of a day
type Db = PrismaClient;
type Resolver = AdminDeps['resolver'];
/** PR 243: the shop's AI connection (the practice writer while no AI provider is switched on). */
export type ArticleWriter = () => Promise<{ api: Pick<AiWriter, 'draftArticle'>; provider: string; mode: string }>;
/** Why "Write the first draft with AI" is not open (null: it is). */
export type AiDraftBlock = 'aiOff' | 'off' | 'notSaved' | 'missing' | 'notApproved' | 'started' | 'limit';

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
  /** PR 243: AI drafting from this brief — whether it is open, and the drafts made in the last 24 hours. */
  ai: { block: AiDraftBlock | null; used: number; dailyMax: number };
  aiCard: { key: 'aiDraft'; value: BlogAiDraftSettings; version: string };
}

/** PR 243: why an AI draft cannot be written from a brief now (null: it can). */
export function aiDraftBlock(s: { aiOn: boolean; enabled: boolean; used: number; dailyMax: number }, b: Pick<BriefView, 'id' | 'gaps' | 'topicStatus' | 'postId'> & { topicStarted: boolean }): AiDraftBlock | null {
  if (!s.aiOn) return 'aiOff';
  if (!s.enabled) return 'off';
  if (!b.id) return 'notSaved';
  if (b.gaps.length) return 'missing';
  if (b.postId || b.topicStarted) return 'started';
  if (b.topicStatus !== 'approved') return 'notApproved';
  if (s.used >= s.dailyMax) return 'limit';
  return null;
}

const aiUsed = (db: Db, now: Date, storeId: number) => db.auditLog.count({ where: { storeId, action: 'blog.brief.aiDraft', createdAt: { gte: new Date(now.getTime() - DAY_MS) } } });

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
export async function briefScreen(db: Db, resolver: Resolver, id: string | null, topicId: string | null = null, storeId: number = S, now: Date = new Date()): Promise<BriefScreen | null> {
  const [set, row, taken, aiOn, aiSet, used] = await Promise.all([
    resolver.value('blog.brief', { storeId }),
    id ? db.blogBrief.findFirst({ where: { id, storeId } }) : null,
    db.blogBrief.findMany({ where: { storeId, topicId: { not: null } }, take: LIST_MAX, select: { topicId: true } }),
    resolver.value('ai.enabled', { storeId }),
    resolver.value('blog.aiDraft', { storeId }),
    aiUsed(db, now, storeId),
  ]);
  if (id && !row) return null;
  const own = row?.topicId ?? null;
  const busy = new Set(taken.map((x) => x.topicId).filter((x) => x && x !== own));
  const open = await db.blogTopic.findMany({ where: { storeId, archivedAt: null, status: { not: 'rejected' } }, orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }], take: LIST_MAX, select: { id: true, title: true, locale: true, query: true, status: true } });
  const topics = open.filter((x) => !busy.has(x.id));
  const own2 = own ? await db.blogTopic.findFirst({ where: { id: own, storeId }, select: { id: true, title: true, locale: true, query: true, status: true, postId: true, archivedAt: true } }) : null;
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
  const block = aiDraftBlock({ aiOn, enabled: aiSet.enabled, used, dailyMax: aiSet.dailyMax }, { ...brief, topicStarted: !!own2?.postId || !!own2?.archivedAt });
  return {
    brief,
    topics,
    card: { key: 'brief', value: set, version: versionOf(set) },
    ai: { block, used, dailyMax: aiSet.dailyMax },
    aiCard: { key: 'aiDraft', value: aiSet, version: versionOf(aiSet) },
  };
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

/** PUT {key: 'brief' | 'aiDraft', value, version}: the brief card, or (PR 243) the AI draft card (`blog.publish`; audited). */
export async function saveBriefSettings(db: Db, resolver: Resolver, who: JournalWho, input: unknown, storeId: number = S): Promise<void> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (o.key !== 'brief' && o.key !== 'aiDraft') throw new JournalError('INVALID_INPUT', 400, ['key']);
  if (!(await can(db, who.actor, 'blog.publish', { storeId }))) throw new JournalError('FORBIDDEN', 403, ['blog.publish']);
  const key = o.key === 'brief' ? 'blog.brief' : 'blog.aiDraft';
  const before = await resolver.value(key, { storeId });
  if (o.version !== versionOf(before)) throw new JournalError('STALE', 409);
  const ok = (key === 'blog.brief' ? blogBriefSchema : blogAiDraftSchema).safeParse(o.value);
  if (!ok.success) throw new JournalError('INVALID_INPUT', 400, issuesOf(ok.error));
  if (versionOf(ok.data) === versionOf(before)) return;
  await resolver.set(key, ok.data as never, storeTarget(storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Website › Blog & journal › Brief' });
  await audit(db, who.actor, { storeId, action: `${key}.settings`, entityType: 'Setting', entityId: key, before: { ...before }, after: { ...(ok.data as object) } }, who.ctx);
}

/** PR 243: the shop's AI connection; falls back to the practice writer while no AI provider is switched on. */
export function articleWriter(deps: Pick<AdminDeps, 'db' | 'resolver' | 'vault'>, storeId: number = S): ArticleWriter {
  return async () => {
    const [testS, cacheS] = await Promise.all([deps.resolver.value('system.integrationTestTimeoutSeconds'), deps.resolver.value('system.integrationKeyCacheSeconds')]);
    const c = createConnections({ db: deps.db, vault: deps.vault ?? { get: async () => null }, adapters: aiWriterAdapters, secretCacheMs: cacheS * 1000, testTimeoutMs: testS * 1000 });
    const link = await c.use<AiWriter>('AI_PROVIDER', { storeId });
    return { api: link.api, provider: link.provider, mode: link.mode };
  };
}

/**
 * PR 243: POST {action: 'draft', version} — the AI's first draft from a brief (see the head of this file). Answers the
 * new article's id and whether the draft is practice text.
 */
export async function draftFromBrief(db: Db, resolver: Resolver, who: JournalWho, id: string, input: unknown, writer: ArticleWriter, now: Date = new Date(), storeId: number = S): Promise<{ postId: string; practice: boolean }> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (o.action !== 'draft') throw new JournalError('INVALID_INPUT', 400, ['action']);
  const [aiOn, set, journalSet, used, b] = await Promise.all([resolver.value('ai.enabled', { storeId }), resolver.value('blog.aiDraft', { storeId }), resolver.value('blog.journal', { storeId }), aiUsed(db, now, storeId), db.blogBrief.findFirst({ where: { id, storeId } })]);
  if (!b) throw new JournalError('NOT_FOUND', 404);
  if (b.updatedAt.toISOString() !== o.version) throw new JournalError('STALE', 409);
  const topic = b.topicId ? await db.blogTopic.findFirst({ where: { id: b.topicId, storeId } }) : null;
  const view = toView(b, topic);
  const block = aiDraftBlock({ aiOn, enabled: set.enabled, used, dailyMax: set.dailyMax }, { ...view, topicStarted: !!topic?.postId || !!topic?.archivedAt });
  if (block === 'aiOff' || block === 'off') throw new JournalError('AI_OFF', 409);
  if (block === 'limit') throw new JournalError('DAILY_LIMIT', 409, [String(set.dailyMax)]);
  if (block === 'missing') throw new JournalError('NOT_READY', 409, view.gaps);
  if (block || !topic) throw new JournalError('WRONG_STATE', 409);

  let draft;
  let link;
  try {
    link = await writer();
    draft = await link.api.draftArticle({ locale: view.language, title: topic.title, query: b.query, keywords: b.keywords, intent: b.intent, wordCount: b.wordCount, outline: b.outline, mustInclude: b.mustInclude, links: b.links, notes: b.notes });
  } catch {
    throw new JournalError('AI_UNAVAILABLE', 503);
  }
  // The topic is started as by hand (language, keyword, cluster, writer), then the draft's words fill the article.
  const { postId } = await topicAction(db, who, topic.id, { action: 'start', version: topic.updatedAt.toISOString() }, now, storeId, resolver);
  if (!postId) throw new JournalError('WRONG_STATE', 409);
  const words = (view.language === 'bn' ? bnWords : enWords).jr.br.ai;
  const body = (draft.practice ? `> note: ${words.practiceBox}\n\n${draft.body}` : draft.body).slice(0, BODY_MAX);
  const count = wordCount(body);
  await db.blogPost.update({ where: { id: postId }, data: { body, excerpt: draft.excerpt.slice(0, EXCERPT_MAX) || null, aiAssisted: true, wordCount: count, readingMinutes: readingMinutes(count, view.language, journalSet) } });
  await audit(db, who.actor, { storeId, action: 'blog.brief.aiDraft', entityType: 'BlogBrief', entityId: b.id, after: { postId, provider: link.provider, mode: link.mode, practice: draft.practice, language: view.language } }, who.ctx);
  return { postId, practice: draft.practice };
}

/**
 * /api/admin/blog/briefs[/<id>] — GET a brief screen (`blog.read`; `?topic=` for a new one); POST a new brief, or (PR 243)
 * {action: 'draft', version} on one; PUT one (with its version), or (no id) the brief and AI draft cards. Every answer
 * carries the screen.
 */
export async function briefHandler(request: Request, deps: AdminDeps | null, id: string | null, writer?: ArticleWriter): Promise<Response> {
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
    let extra: Record<string, unknown> = {};
    if (method === 'POST' && id) {
      extra = await draftFromBrief(db, resolver, who, id, await body(request), writer ?? articleWriter(deps!), now);
    } else if (method === 'POST') {
      at = await saveBrief(db, resolver, who, null, await body(request), now);
    } else if (method === 'PUT' && !id) {
      await saveBriefSettings(db, resolver, who, await body(request));
    } else if (method === 'PUT') {
      await saveBrief(db, resolver, who, id, await body(request), now);
    }
    const topic = new URL(request.url).searchParams.get('topic');
    const screen = await briefScreen(db, resolver, at, topic && isUuid(topic) ? topic : null, S, now);
    if (!screen) return fail(404, 'NOT_FOUND');
    return json({ ok: true, id: at, screen, cards: { brief: screen.card, aiDraft: screen.aiCard }, ...extra }, { status: method === 'POST' && !id ? 201 : 200 });
  } catch (e) {
    return answer(e);
  }
}

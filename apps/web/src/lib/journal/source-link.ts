// S12 · PR 529 (answer 12, 18 Oct; Blueprint §59 answers 11–14) — the source-link research writer: give it a link to
// an article anywhere in the world; it reads the page through the page reader connection (PR 33, shared with
// "Import from a link"), researches the topic from the page's own words and writes an original piece, in the chosen
// language, straight onto the board as an article in writing (DRAFT), marked AI-assisted with its source link kept
// (`BlogPost.sourceUrls`). A person still edits it and it passes the three review steps before anyone can publish it.
//
// - Off as it ships (`blog.sourceWriter.enabled`) and needs AI for the whole shop (`ai.enabled`); until an AI
//   provider's key is entered the practice writer serves, honestly marked — PR 243's own pattern, reused here as
//   `articleWriter`/`draftArticle`. At most `dailyMax` drafts in a day (the last 24 hours), its own counter, kept
//   separate from the brief's own AI-draft limit (PR 243's `blog.aiDraft.dailyMax`).
// - The link's host must be on `blog.sourceWriter.allowedHosts` (empty = any host); the page is read within
//   `catalogue.linkImport`'s own size/time/redirect limits, through the SAME page reader connection PR 33's
//   "Import from a link" already uses — never a second reader.
// - Never copied: the writer's prompt (PR 243's `articlePrompt`, unchanged) is told what the source said as the
//   outline and the facts to carry, with a note naming the source link and asking for an ORIGINAL piece in the
//   writer's own words — the source's readable text is research material, never pasted into the article body.
// - One action, no separate preview step (unlike the catalogue's two-phase link import): the same single-action
//   shape PR 243's "AI first draft" already has from an already-prepared brief — here the "brief" is read straight
//   from the page instead of typed by hand.
import { audit, can } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { blogSourceWriterSchema, storeTarget, type BlogSourceWriterSettings } from '@extas/settings';
import { body, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { pageReaderFor } from '../catalogue-tools-api';
import { articleWriter, type ArticleWriter } from './briefs';
import { answer, JournalError, saveJournalPost, versionOf, type JournalWho } from './journal';
import { BODY_MAX, EXCERPT_MAX, TITLE_MAX, readingMinutes, wordCount } from './model';
import { parseSourcePage, sourceLinkInput } from './source-link-model';

const S = MOTHER_STORE_ID;
const DAY_MS = 86_400_000; // hardcode-ok: the length of a day
type Db = PrismaClient;
type Resolver = AdminDeps['resolver'];

/** Why "Write from a link" is not open (null: it is). */
export type SourceWriterBlock = 'aiOff' | 'off' | 'limit';

export interface SourceWriterView {
  card: { key: 'sourceWriter'; value: BlogSourceWriterSettings; version: string };
  block: SourceWriterBlock | null;
  used: number;
  dailyMax: number;
}

const draftsUsed = (db: Db, now: Date, storeId: number) => db.auditLog.count({ where: { storeId, action: 'blog.sourceWriter.draft', createdAt: { gte: new Date(now.getTime() - DAY_MS) } } });

export function sourceWriterBlock(s: { aiOn: boolean; enabled: boolean; used: number; dailyMax: number }): SourceWriterBlock | null {
  if (!s.aiOn) return 'aiOff';
  if (!s.enabled) return 'off';
  if (s.used >= s.dailyMax) return 'limit';
  return null;
}

/** The "Write from a link" screen: whether it is open, today's count, and its settings card. */
export async function sourceWriterView(db: Db, resolver: Resolver, now: Date = new Date(), storeId: number = S): Promise<SourceWriterView> {
  const [aiOn, set, used] = await Promise.all([resolver.value('ai.enabled', { storeId }), resolver.value('blog.sourceWriter', { storeId }), draftsUsed(db, now, storeId)]);
  return { card: { key: 'sourceWriter', value: set, version: versionOf(set) }, block: sourceWriterBlock({ aiOn, enabled: set.enabled, used, dailyMax: set.dailyMax }), used, dailyMax: set.dailyMax };
}

/** PUT {value, version}: the "Write from a link" card (`blog.publish`; audited — the same gate as the brief/AI-draft cards). */
export async function saveSourceWriterSettings(db: Db, resolver: Resolver, who: JournalWho, input: unknown, storeId: number = S): Promise<void> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (!(await can(db, who.actor, 'blog.publish', { storeId }))) throw new JournalError('FORBIDDEN', 403, ['blog.publish']);
  const before = await resolver.value('blog.sourceWriter', { storeId });
  if (o.version !== versionOf(before)) throw new JournalError('STALE', 409);
  const ok = blogSourceWriterSchema.safeParse(o.value);
  if (!ok.success) throw new JournalError('INVALID_INPUT', 400, ['value']);
  if (versionOf(ok.data) === versionOf(before)) return;
  await resolver.set('blog.sourceWriter', ok.data as never, storeTarget(storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Website › Blog & journal › Write from a link' });
  await audit(db, who.actor, { storeId, action: 'blog.sourceWriter.settings', entityType: 'Setting', entityId: 'blog.sourceWriter', before: { ...before }, after: { ...(ok.data as object) } }, who.ctx);
}

/** An http(s) address with no user name or password whose host is allowed (an empty list allows any host); else HOST_NOT_ALLOWED. */
export function allowedSourceUrl(raw: string, allowedHosts: readonly string[]): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new JournalError('HOST_NOT_ALLOWED', 400, ['url']);
  }
  if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.username || u.password) throw new JournalError('HOST_NOT_ALLOWED', 400, ['url']);
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (allowedHosts.length && !allowedHosts.some((h) => host === h || host.endsWith(`.${h}`))) throw new JournalError('HOST_NOT_ALLOWED', 400, [`host:${host}`]);
  u.hash = '';
  return u;
}

/**
 * POST {url, locale, wordCount?} — reads the link, researches it and writes an original first draft straight onto
 * the board as a new article (DRAFT), marked AI-assisted with its source kept. Needs `blog.write`. Refuses up front:
 * AI off for the shop or this feature (`AI_OFF`), today's limit used (`DAILY_LIMIT`), the link's host not allowed or
 * not a web address (`HOST_NOT_ALLOWED`), the page unreadable or without an article on it (`PAGE_UNREADABLE`), the
 * writer unavailable (`AI_UNAVAILABLE`).
 */
export async function draftFromSourceLink(deps: Pick<AdminDeps, 'db' | 'resolver' | 'vault'>, who: JournalWho, input: unknown, writer: ArticleWriter, now: Date = new Date(), storeId: number = S): Promise<{ postId: string; practice: boolean }> {
  const db = deps.db;
  const resolver = deps.resolver;
  const ok = sourceLinkInput.safeParse(input);
  if (!ok.success) throw new JournalError('INVALID_INPUT', 400, ['url']);
  const d = ok.data;
  const [aiOn, set, briefSet, journalSet, used] = await Promise.all([
    resolver.value('ai.enabled', { storeId }),
    resolver.value('blog.sourceWriter', { storeId }),
    resolver.value('blog.brief', { storeId }),
    resolver.value('blog.journal', { storeId }),
    draftsUsed(db, now, storeId),
  ]);
  const block = sourceWriterBlock({ aiOn, enabled: set.enabled, used, dailyMax: set.dailyMax });
  if (block === 'aiOff' || block === 'off') throw new JournalError('AI_OFF', 409);
  if (block === 'limit') throw new JournalError('DAILY_LIMIT', 409, [String(set.dailyMax)]);

  const url = allowedSourceUrl(d.url, set.allowedHosts).toString();
  const [maxKb, timeoutSeconds, maxRedirects] = await Promise.all([resolver.value('catalogue.linkImport.maxPageKb'), resolver.value('catalogue.linkImport.timeoutSeconds'), resolver.value('catalogue.linkImport.maxRedirects')]);
  const reader = await pageReaderFor(deps as AdminDeps, storeId);
  let page: { html: string; finalUrl: string };
  try {
    page = await reader.api.read(url, { maxBytes: maxKb * 1024, timeoutMs: timeoutSeconds * 1000, maxRedirects });
  } catch {
    throw new JournalError('PAGE_UNREADABLE', 502, ['read']);
  }
  const facts = parseSourcePage(page.html, page.finalUrl);
  if (!facts.title && !facts.bodyText) throw new JournalError('PAGE_UNREADABLE', 502, ['empty']);

  let draft;
  let link;
  try {
    link = await writer();
    draft = await link.api.draftArticle({
      locale: d.locale,
      title: facts.title ?? url,
      query: facts.title,
      keywords: facts.title ? [facts.title] : [],
      intent: 'info',
      wordCount: d.wordCount ?? briefSet.wordsDefault,
      outline: facts.headings,
      mustInclude: [facts.description, facts.bodyText.slice(0, 1500)].filter(Boolean).join('\n'),
      links: [],
      notes: `Researched from ${url} — write an ORIGINAL piece in your own words; never copy the source's wording.`,
    });
  } catch {
    throw new JournalError('AI_UNAVAILABLE', 503);
  }

  const title = (facts.title ?? url).slice(0, TITLE_MAX);
  const created = await saveJournalPost(db, resolver, who, null, { locale: d.locale, title, excerpt: '', body: '' }, now, storeId);
  const words = wordCount(draft.body);
  const bodyText = (draft.practice ? `> note: practice text from the practice writer — no AI key is entered yet. Rewrite it before the review.\n\n${draft.body}` : draft.body).slice(0, BODY_MAX);
  await db.blogPost.update({
    where: { id: created.id },
    data: { body: bodyText, excerpt: draft.excerpt.slice(0, EXCERPT_MAX) || null, aiAssisted: true, sourceUrls: [url], wordCount: words, readingMinutes: readingMinutes(words, d.locale, journalSet) },
  });
  await audit(db, who.actor, { storeId, action: 'blog.sourceWriter.draft', entityType: 'BlogPost', entityId: created.id, after: { postId: created.id, provider: link.provider, mode: link.mode, practice: draft.practice, locale: d.locale, sourceUrl: url } }, who.ctx);
  return { postId: created.id, practice: draft.practice };
}

/** /api/admin/blog/source-link — GET the screen; PUT the card; POST {url, locale, wordCount?} to write a draft. */
export async function sourceLinkHandler(request: Request, deps: AdminDeps | null, writer?: ArticleWriter): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'blog.read' : 'blog.write', storeId: S });
  if (g instanceof Response) return g;
  const db = deps!.db;
  const resolver = deps!.resolver;
  const now = deps!.now?.() ?? new Date();
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    if (method === 'PUT') {
      await saveSourceWriterSettings(db, resolver, who, await body(request));
    } else if (method === 'POST') {
      const result = await draftFromSourceLink(deps!, who, await body(request), writer ?? articleWriter(deps!), now);
      return json({ ok: true, ...result, screen: await sourceWriterView(db, resolver, now) });
    }
    return json({ ok: true, screen: await sourceWriterView(db, resolver, now) });
  } catch (e) {
    return answer(e);
  }
}

// S11 · PR 221 — AI drafts of search titles and descriptions (Website › SEO › AI drafts). Off twice over until the
// owner turns it on: AI for the whole shop (`ai.enabled`, CN-026) and the drafts themselves (`seo.aiDrafts.enabled`).
//
// - "Draft" writes, for up to `seo.aiDrafts.batchMax` pages, a title and description for each published product and
//   visible category that lacks its own text in a language (English; Bengali too while Bengali is on), from the page's
//   own facts only (the AI writer, @extas/adapters ai-writer: the practice writer until a provider is connected). A page
//   that already has a draft waiting is skipped.
// - A draft waits in the shop's one approvals queue (AiApprovalRequest, kind `seo.draft`) and is never shown on a page
//   until a person accepts it. Accepting fills only the page's empty fields (SeoMeta, marked aiDrafted, with who
//   approved it) and never replaces text someone typed; a category's own SEO fields (`category.seo`) still come first.
//   Discarding keeps the row (REJECTED): nothing is deleted.
// - Every press and decision is in the audit log. Nothing here moves money, changes a price or touches an order.
import type { Prisma } from '@extas/db/client';
import { aiWriterAdapters, createConnections, type AiDraftSubject, type AiWriter } from '@extas/adapters';
import { audit, type Actor, type RequestContext } from '@extas/auth';
import { namingInclude, namingSettings, sourceOf, tokenValues } from '@extas/catalogue';
import type { AdminDeps } from '../admin-auth';
import { CATEGORY_SEO_ENTITY } from './page-texts';

/** The approvals-queue kind of a search-text draft. */
export const SEO_DRAFT_KIND = 'seo.draft';
/** The SeoMeta entity of a product (the naming table's, PR 590). */
export const PRODUCT_SEO_ENTITY = 'product';
/** How many waiting drafts the page lists at once. */
export const DRAFTS_SHOWN = 100;

type Lang = 'en' | 'bn';
type Subject = AiDraftSubject;

export interface DraftPayload {
  locale: Lang;
  title: string;
  description: string;
  provider: string;
  mode: string;
  practice: boolean;
  /** The page's name when the draft was made (for the list). */
  name: string;
}

export interface DraftRow extends DraftPayload {
  id: string;
  subject: Subject;
  entityId: string;
  createdAt: string;
}

export interface DraftState {
  /** AI for the whole shop (`ai.enabled`). */
  aiOn: boolean;
  /** `seo.aiDrafts.enabled`. */
  enabled: boolean;
  waiting: DraftRow[];
  waitingTotal: number;
  /** Pages × languages without their own title or description and without a waiting draft. */
  missing: Record<Subject, number>;
}

export class SeoDraftError extends Error {
  constructor(
    readonly code: 'AI_OFF' | 'NOT_FOUND' | 'DECIDED' | 'AI_UNAVAILABLE',
    readonly status: number,
  ) {
    super(code);
  }
}

type Db = AdminDeps['db'];
type Deps = Pick<AdminDeps, 'db' | 'resolver' | 'vault' | 'now'> & { writer?: () => Promise<{ api: AiWriter; provider: string; mode: string }> };

interface Candidate {
  subject: Subject;
  entityId: string;
  locale: Lang;
}

const filled = (v: string | null | undefined) => Boolean(v && v.trim());

async function langsOf(deps: Deps, storeId: number): Promise<Lang[]> {
  return (await deps.resolver.value('language.bengali.enabled', { storeId })) ? ['en', 'bn'] : ['en'];
}

/** Every page × language that lacks its own text and has no waiting draft, products first. */
async function candidates(db: Db, deps: Deps, storeId: number): Promise<Candidate[]> {
  const [langs, subjects, catSeo, products, cats, metas, waiting] = await Promise.all([
    langsOf(deps, storeId),
    deps.resolver.value('seo.aiDrafts', { storeId }).then((v) => v.subjects),
    deps.resolver.value('category.seo', { storeId }),
    db.product.findMany({ where: { storeId, status: 'PUBLISHED', archivedAt: null }, select: { id: true }, orderBy: [{ nameEn: 'asc' }, { id: 'asc' }] }),
    db.category.findMany({ where: { storeId, isVisible: true, archivedAt: null }, select: { id: true, slug: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
    db.seoMeta.findMany({ where: { storeId, entityType: { in: [PRODUCT_SEO_ENTITY, CATEGORY_SEO_ENTITY] } }, select: { entityType: true, entityId: true, locale: true, title: true, description: true } }),
    db.aiApprovalRequest.findMany({ where: { storeId, kind: SEO_DRAFT_KIND, status: 'PENDING' }, select: { refType: true, refId: true, payload: true } }),
  ]);
  const own = new Set(metas.filter((m) => filled(m.title) && filled(m.description)).map((m) => `${m.entityType}:${m.entityId}:${m.locale}`));
  const busy = new Set(waiting.map((w) => `${w.refType}:${w.refId}:${(w.payload as { locale?: string } | null)?.locale ?? ''}`));
  const out: Candidate[] = [];
  const add = (subject: Subject, entityId: string, locale: Lang, ownText: boolean) => {
    const k = `${subject}:${entityId}:${locale}`;
    if (!ownText && !own.has(k) && !busy.has(k)) out.push({ subject, entityId, locale });
  };
  if (subjects.product) for (const p of products) for (const l of langs) add('product', p.id, l, false);
  if (subjects.category)
    for (const c of cats) {
      const o = catSeo?.[c.slug];
      for (const l of langs) add('category', c.id, l, Boolean(o?.title?.[l]?.trim() && o?.meta?.[l]?.trim()));
    }
  return out;
}

const toRow = (r: { id: string; refType: string | null; refId: string | null; payload: Prisma.JsonValue; createdAt: Date }): DraftRow => ({
  ...(r.payload as unknown as DraftPayload),
  id: r.id,
  subject: (r.refType ?? 'product') as Subject,
  entityId: r.refId ?? '',
  createdAt: r.createdAt.toISOString(),
});

/** What the AI drafts card draws. */
export async function draftState(deps: Deps, storeId: number): Promise<DraftState> {
  const db = deps.db;
  const where = { storeId, kind: SEO_DRAFT_KIND, status: 'PENDING' as const };
  const [aiOn, set, rows, total, cands] = await Promise.all([
    deps.resolver.value('ai.enabled', { storeId }),
    deps.resolver.value('seo.aiDrafts', { storeId }),
    db.aiApprovalRequest.findMany({ where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: DRAFTS_SHOWN }),
    db.aiApprovalRequest.count({ where }),
    candidates(db, deps, storeId),
  ]);
  return {
    aiOn,
    enabled: set.enabled,
    waiting: rows.map(toRow),
    waitingTotal: total,
    missing: { product: cands.filter((c) => c.subject === 'product').length, category: cands.filter((c) => c.subject === 'category').length },
  };
}

async function defaultWriter(deps: Deps, storeId: number) {
  const [testS, cacheS] = await Promise.all([deps.resolver.value('system.integrationTestTimeoutSeconds'), deps.resolver.value('system.integrationKeyCacheSeconds')]);
  const c = createConnections({ db: deps.db, vault: deps.vault ?? { get: async () => null }, adapters: aiWriterAdapters, secretCacheMs: cacheS * 1000, testTimeoutMs: testS * 1000 });
  const link = await c.use<AiWriter>('AI_PROVIDER', { storeId });
  return { api: link.api, provider: link.provider, mode: link.mode };
}

/** "Draft": drafts for up to `batchMax` pages without their own text. Needs AI on and drafts on. */
export async function makeDrafts(deps: Deps, actor: Actor, storeId: number, ctx: RequestContext = {}): Promise<{ made: number }> {
  const db = deps.db;
  const [aiOn, set, maxT, maxD] = await Promise.all([
    deps.resolver.value('ai.enabled', { storeId }),
    deps.resolver.value('seo.aiDrafts', { storeId }),
    deps.resolver.value('naming.seoTitleMaxChars', { storeId }),
    deps.resolver.value('naming.metaDescriptionMaxChars', { storeId }),
  ]);
  if (!aiOn || !set.enabled) throw new SeoDraftError('AI_OFF', 409);
  const todo = (await candidates(db, deps, storeId)).slice(0, set.batchMax);
  if (!todo.length) return { made: 0 };
  let writer: { api: AiWriter; provider: string; mode: string };
  try {
    writer = await (deps.writer ? deps.writer() : defaultWriter(deps, storeId));
  } catch {
    throw new SeoDraftError('AI_UNAVAILABLE', 503);
  }

  const ns = await namingSettings({ db, settings: deps.resolver }, { storeId });
  const productIds = [...new Set(todo.filter((t) => t.subject === 'product').map((t) => t.entityId))];
  const categoryIds = [...new Set(todo.filter((t) => t.subject === 'category').map((t) => t.entityId))];
  const [products, cats] = await Promise.all([
    productIds.length ? db.product.findMany({ where: { storeId, id: { in: productIds } }, include: namingInclude }) : [],
    categoryIds.length ? db.category.findMany({ where: { storeId, id: { in: categoryIds } }, select: { id: true, nameEn: true, nameBn: true, parent: { select: { nameEn: true, nameBn: true } } } }) : [],
  ]);
  const pById = new Map(products.map((p) => [p.id, p]));
  const cById = new Map(cats.map((c) => [c.id, c]));
  const shop = ns.storeName ?? '';
  const max = { title: maxT, description: maxD };

  let made = 0;
  for (const t of todo) {
    let facts: Parameters<AiWriter['draftSeo']>[0]['facts'] | null = null;
    if (t.subject === 'product') {
      const p = pById.get(t.entityId);
      if (p) {
        const v = tokenValues(sourceOf(p), ns, null, t.locale);
        facts = { name: v.name ?? '', brand: v.brand, category: v.cat, colours: v.colours ? [v.colours] : [], fit: v.fit, shop };
      }
    } else {
      const c = cById.get(t.entityId);
      if (c) {
        const nm = (x: { nameEn: string; nameBn: string | null }) => (t.locale === 'bn' && x.nameBn?.trim()) || x.nameEn;
        facts = { name: nm(c), category: c.parent ? nm(c.parent) : undefined, shop };
      }
    }
    if (!facts?.name.trim()) continue;
    const d = await writer.api.draftSeo({ subject: t.subject, locale: t.locale, facts, max });
    const payload: DraftPayload = { locale: t.locale, title: d.title, description: d.description, provider: writer.provider, mode: writer.mode, practice: d.practice, name: facts.name };
    await db.aiApprovalRequest.create({
      data: { storeId, kind: SEO_DRAFT_KIND, title: d.title || facts.name, summary: d.description || null, payload: payload as unknown as Prisma.InputJsonValue, refType: t.subject, refId: t.entityId, channel: 'admin' },
    });
    made += 1;
  }
  await audit(db, actor, { storeId, action: 'seo.drafts.create', entityType: 'AiApprovalRequest', entityId: SEO_DRAFT_KIND, after: { made, provider: writer.provider, mode: writer.mode } }, { source: 'admin-api', ...ctx });
  return { made };
}

/** Accept (fill the page's empty fields) or discard (keep the row, REJECTED) one waiting draft. */
export async function decideDraft(deps: Deps, actor: Actor, storeId: number, id: string, decision: 'accept' | 'discard', ctx: RequestContext = {}): Promise<{ filled: ('title' | 'description')[] }> {
  const db = deps.db;
  const now = deps.now?.() ?? new Date();
  const row = await db.aiApprovalRequest.findFirst({ where: { id, storeId, kind: SEO_DRAFT_KIND } });
  if (!row) throw new SeoDraftError('NOT_FOUND', 404);
  if (row.status !== 'PENDING') throw new SeoDraftError('DECIDED', 409);
  const d = toRow(row);
  const by = actor.staffUserId ?? null;
  const done: ('title' | 'description')[] = [];
  await db.$transaction(async (tx) => {
    // a decision is taken once: a second press (or a second person) finds it decided
    const claimed = await tx.aiApprovalRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: decision === 'accept' ? 'APPROVED' : 'REJECTED', decidedById: by, decidedAt: now },
    });
    if (claimed.count !== 1) throw new SeoDraftError('DECIDED', 409);
    if (decision === 'discard') return;
    const entityType = d.subject === 'category' ? CATEGORY_SEO_ENTITY : PRODUCT_SEO_ENTITY;
    const key = { storeId_entityType_entityId_locale: { storeId, entityType, entityId: d.entityId, locale: d.locale } };
    const cur = await tx.seoMeta.findUnique({ where: key, select: { title: true, description: true } });
    const data: { title?: string; description?: string } = {};
    if (!filled(cur?.title) && d.title.trim()) {
      data.title = d.title.trim();
      done.push('title');
    }
    if (!filled(cur?.description) && d.description.trim()) {
      data.description = d.description.trim();
      done.push('description');
    }
    if (!done.length) return;
    await tx.seoMeta.upsert({
      where: key,
      create: { storeId, entityType, entityId: d.entityId, locale: d.locale, ...data, aiDrafted: true, approvedById: by },
      update: { ...data, aiDrafted: true, approvedById: by },
    });
  });
  await audit(db, actor, { storeId, action: decision === 'accept' ? 'seo.drafts.accept' : 'seo.drafts.discard', entityType: 'AiApprovalRequest', entityId: id, after: { subject: d.subject, entityId: d.entityId, locale: d.locale, filled: done } }, { source: 'admin-api', ...ctx });
  return { filled: done };
}

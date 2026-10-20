// PR 33 — import a product from a link: paste a supplier's or brand's product page, look at what was read, then make a
// draft to finish in the product editor.
//
// - The page is read through the page reader connection (Keys & connections, PR 500; the app passes it in as
//   `pageReader`). Until that connection is switched on it runs on its mock (a sample page built from the link), and
//   the screen says so (A1.3). Limits (size, time, forwarding, photo links) and the allowed sites are settings.
// - The draft is made by plain rules: the page's name and description, and matches to the shop's own brand, category,
//   colour and fabric dictionaries. When AI is switched on and connected (`ai.enabled`, `catalogue.linkImport.useAi`)
//   it may tidy the name and description; until then the rules draft is used and the answer says why (`notes`).
// - Never copied: the price (the owner's decision, CLAUDE.md rule 6), the supplier's SKU (the ERP SKU is the key,
//   PR 19), sizes and photos — they are shown for information only. Variants come from the ERP, photos are uploaded.
// - The import only ever makes a DRAFT; publishing stays behind the publish checklist (PR 35). One draft per read.
// - Every read is a CatalogImportJob (kind IMPORT_FROM_LINK) with what was read and what was drafted; nothing is
//   deleted. The audit log has the link and the draft, never the page.
import { z } from 'zod';
import { requirePermission } from '@extas/auth';
import type { Prisma } from '@extas/db/client';
import { allow, found, logChange, parse, setting, type CatalogueDeps, type Who } from './context';
import { CatalogueError, isCatalogueError } from './errors';
import { parseProductPage, wordsOf, type PageFacts } from './page-facts';
import { createProduct, setProductColours } from './products';
import { checkProduct } from './publish';
import { normalizeName } from './text';

// --- the page reader the app hands in ------------------------------------------------------------------------

export interface PageLimits {
  maxBytes: number;
  timeoutMs: number;
  maxRedirects: number;
}
export interface PageReadResult {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  html: string;
  bytes: number;
}
/** The page reader connection (the adapters package's `pageReader`, looked up for the store). */
export interface PageReaderConnection {
  api: { read(url: string, limits: PageLimits): Promise<PageReadResult> };
  mode: string;
  provider: string;
}

/** An AI tidy-up of the rules draft (an AI provider adapter, later). Absent = not connected. */
export type AiDraftFn = (input: { facts: PageFacts; draft: DraftFields }) => Promise<Partial<Pick<DraftFields, 'nameEn' | 'descriptionEn'>>>;

export interface LinkImportDeps extends CatalogueDeps {
  pageReader(storeId: number): Promise<PageReaderConnection>;
  aiDraft?: AiDraftFn;
}

// --- the draft -----------------------------------------------------------------------------------------------

export interface DraftFields {
  nameEn: string;
  descriptionEn: string | null;
  brandId: string | null;
  categoryId: string | null;
  fabricId: string | null;
  colourIds: string[];
}

export interface Match {
  id: string;
  name: string;
  /** The words of the page it was matched on. */
  from: string;
}

export interface LinkDraft extends DraftFields {
  brand: Match | null;
  category: Match | null;
  fabric: Match | null;
  colours: Match[];
  /** Sizes on the page with the shop's own size, when it has one (information only: variants come from the ERP). */
  sizes: { label: string; sizeId: string | null }[];
  /** What the page said that was not matched to the shop's dictionaries (brand, colour or fabric names). */
  unmatched: string[];
}

export type DraftMethod = 'rules' | 'ai';
/** Why the draft was made by rules: AI switched off, not connected, or not wanted for imports. */
export type DraftNote = 'ai-off' | 'ai-not-connected' | 'ai-not-used' | 'ai-failed';

export interface LinkImportPreview {
  jobId: string;
  sourceUrl: string;
  finalUrl: string;
  reader: { mode: string; provider: string };
  facts: PageFacts;
  draft: LinkDraft;
  method: DraftMethod;
  notes: DraftNote[];
  /** Earlier reads of the same link, newest first, with the draft each one made. */
  earlier: { jobId: string; at: string; productId: string | null }[];
}

interface JobResult {
  stage: 'preview' | 'drafted' | 'failed';
  reader?: { mode: string; provider: string };
  finalUrl?: string;
  facts?: PageFacts;
  draft?: LinkDraft;
  method?: DraftMethod;
  notes?: DraftNote[];
  error?: string;
  detail?: string | null;
  productId?: string;
  draftedAt?: string;
}

const readResult = (v: Prisma.JsonValue | null): JobResult => (v && typeof v === 'object' && !Array.isArray(v) ? (v as unknown as JobResult) : { stage: 'failed' });
const toJson = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

const URL_MAX = 2000;
export const linkImportInput = z.object({ url: z.string().trim().min(1).max(URL_MAX) }).strict();
export type LinkImportInput = z.input<typeof linkImportInput>;

/** An http(s) address with no user name or password whose site is allowed; else HOST_NOT_ALLOWED. */
export function allowedLink(raw: string, allowedHosts: readonly string[]): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new CatalogueError('HOST_NOT_ALLOWED', 'not a web address', ['url']);
  }
  if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.username || u.password) throw new CatalogueError('HOST_NOT_ALLOWED', 'only plain http and https links', ['url']);
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (allowedHosts.length && !allowedHosts.some((h) => host === h || host.endsWith(`.${h}`))) throw new CatalogueError('HOST_NOT_ALLOWED', 'this site is not on the allowed list', [`host:${host}`]);
  u.hash = '';
  return u;
}

/** The best category for a name: every word of the category's name is in the page's name (the longest such name wins). */
export function bestCategory<T extends { id: string; nameEn: string; nameBn: string | null }>(rows: readonly T[], name: string): { row: T; from: string } | null {
  const words = new Set(wordsOf(name));
  let best: { row: T; from: string; score: number } | null = null;
  for (const r of rows) {
    for (const label of [r.nameEn, r.nameBn ?? '']) {
      const w = wordsOf(label);
      if (!w.length || !w.every((x) => words.has(x))) continue;
      const score = w.join(' ').length;
      if (!best || score > best.score) best = { row: r, from: label, score };
    }
  }
  return best ? { row: best.row, from: best.from } : null;
}

/** Rows whose name (or one of its names) is the text, or appears in it as whole words. */
function byName<T extends { id: string }>(rows: readonly T[], namesOf: (r: T) => string[], text: string, whole = false): T | null {
  const n = normalizeName(text);
  if (!n) return null;
  const exact = rows.find((r) => namesOf(r).map(normalizeName).includes(n));
  if (exact || !whole) return exact ?? null;
  const hay = ` ${wordsOf(text).join(' ')} `;
  let best: { r: T; len: number } | null = null;
  for (const r of rows) {
    for (const name of namesOf(r)) {
      const w = wordsOf(name).join(' ');
      if (w && hay.includes(` ${w} `) && (!best || w.length > best.len)) best = { r, len: w.length };
    }
  }
  return best?.r ?? null;
}

async function rulesDraft(deps: CatalogueDeps, who: Who, facts: PageFacts): Promise<LinkDraft> {
  const db = deps.db;
  const live = { storeId: who.storeId, archivedAt: null };
  const [brands, categories, fabrics, colours, sizes] = await Promise.all([
    db.brand.findMany({ where: live, select: { id: true, name: true } }),
    db.category.findMany({ where: live, select: { id: true, nameEn: true, nameBn: true } }),
    db.fabric.findMany({ where: live, select: { id: true, nameEn: true, nameBn: true } }),
    db.colour.findMany({ where: live, select: { id: true, key: true, nameEn: true, nameBn: true, synonyms: true } }),
    db.size.findMany({ where: live, select: { id: true, key: true, label: true } }),
  ]);
  const unmatched: string[] = [];
  const name = facts.name ?? facts.title ?? '';

  const b = facts.brand ? byName(brands, (r) => [r.name], facts.brand) : null;
  if (facts.brand && !b) unmatched.push(`brand:${facts.brand}`);
  const c = bestCategory(categories, name);
  const f = facts.material ? byName(fabrics, (r) => [r.nameEn, r.nameBn ?? ''], facts.material, true) : null;
  if (facts.material && !f) unmatched.push(`fabric:${facts.material}`);

  const colourNames = (r: (typeof colours)[number]) => [r.key, r.nameEn, r.nameBn ?? '', ...r.synonyms];
  const picked: Match[] = [];
  const pageColours = facts.colours.length ? facts.colours : [];
  for (const text of pageColours) {
    const hit = byName(colours, colourNames, text, true);
    if (hit && !picked.some((p) => p.id === hit.id)) picked.push({ id: hit.id, name: hit.nameEn, from: text });
    else if (!hit) unmatched.push(`colour:${text}`);
  }
  // No colour field on the page: a colour named in the product name ("Navy Pique Polo") counts.
  if (!pageColours.length && name) {
    const hit = byName(colours, colourNames, name, true);
    if (hit) picked.push({ id: hit.id, name: hit.nameEn, from: name });
  }

  const sizeOf = (label: string) => sizes.find((s) => normalizeName(s.label) === normalizeName(label) || normalizeName(s.key) === normalizeName(label))?.id ?? null;
  return {
    nameEn: name.slice(0, 200),
    descriptionEn: facts.description ? facts.description.slice(0, 10_000) : null,
    brandId: b?.id ?? null,
    categoryId: c?.row.id ?? null,
    fabricId: f?.id ?? null,
    colourIds: picked.map((p) => p.id),
    brand: b ? { id: b.id, name: b.name, from: facts.brand! } : null,
    category: c ? { id: c.row.id, name: c.row.nameEn, from: c.from } : null,
    fabric: f ? { id: f.id, name: f.nameEn, from: facts.material! } : null,
    colours: picked,
    sizes: facts.sizes.map((label) => ({ label, sizeId: sizeOf(label) })),
    unmatched,
  };
}

/** Is a failure the page reader's (its errors carry a stable `code`)? */
function readerCode(e: unknown): { code: string; detail: string | null } | null {
  if (!e || typeof e !== 'object' || isCatalogueError(e)) return null;
  const o = e as { name?: unknown; code?: unknown; detail?: unknown };
  if (o.name === 'PageReadError' && typeof o.code === 'string') return { code: o.code, detail: typeof o.detail === 'string' ? o.detail : null };
  return null;
}

async function allowImport(deps: CatalogueDeps, who: Who): Promise<void> {
  await allow(deps, who, 'catalogue.import');
  if (!(await setting(deps, who, 'catalogue.linkImport.enabled'))) throw new CatalogueError('LINK_IMPORT_OFF', 'import from a link is switched off');
}

/**
 * Reads the page and shows what a draft would be (nothing is made yet). Needs `catalogue.import`. A page that cannot
 * be read is recorded as a failed job and refused with PAGE_UNREADABLE (details: the reader's reason).
 */
export async function previewLinkImport(deps: LinkImportDeps, who: Who, input: LinkImportInput): Promise<LinkImportPreview> {
  await allowImport(deps, who);
  const d = parse(linkImportInput, input, 'link');
  const [hosts, maxKb, timeoutSeconds, maxRedirects, maxImages, aiOn, useAi] = await Promise.all([
    setting(deps, who, 'catalogue.linkImport.allowedHosts'),
    setting(deps, who, 'catalogue.linkImport.maxPageKb'),
    setting(deps, who, 'catalogue.linkImport.timeoutSeconds'),
    setting(deps, who, 'catalogue.linkImport.maxRedirects'),
    setting(deps, who, 'catalogue.linkImport.maxImages'),
    setting(deps, who, 'ai.enabled'),
    setting(deps, who, 'catalogue.linkImport.useAi'),
  ]);
  const url = allowedLink(d.url, hosts).toString();
  const reader = await deps.pageReader(who.storeId);
  const readerInfo = { mode: reader.mode, provider: reader.provider };
  const now = deps.now?.() ?? new Date();
  const job = (result: JobResult, ok: boolean) =>
    deps.db.$transaction(async (tx) => {
      const row = await tx.catalogImportJob.create({
        data: { storeId: who.storeId, kind: 'IMPORT_FROM_LINK', sourceUrl: url, status: ok ? 'SUCCEEDED' : 'FAILED', rowsTotal: 1, rowsOk: ok ? 1 : 0, rowsFailed: ok ? 0 : 1, result: toJson(result), createdById: who.actor.staffUserId ?? null, finishedAt: now },
      });
      await logChange(tx, who, ok ? 'catalogImport.linkRead' : 'catalogImport.linkFailed', 'CatalogImportJob', row.id, null, { sourceUrl: url, reader: readerInfo, ...(ok ? { name: result.draft?.nameEn } : { error: result.error }) });
      return row.id;
    });

  let page: PageReadResult;
  try {
    page = await reader.api.read(url, { maxBytes: maxKb * 1024, timeoutMs: timeoutSeconds * 1000, maxRedirects });
  } catch (e) {
    const r = readerCode(e);
    if (!r) throw e;
    await job({ stage: 'failed', reader: readerInfo, error: r.code, detail: r.detail }, false);
    throw new CatalogueError('PAGE_UNREADABLE', 'the page could not be read', [r.code, ...(r.detail ? [r.detail] : [])]);
  }
  // A link may forward to another site: that site must be allowed too.
  allowedLink(page.finalUrl, hosts);
  const facts = parseProductPage(page.html, page.finalUrl, maxImages);
  if (!facts.name && !facts.title) {
    await job({ stage: 'failed', reader: readerInfo, finalUrl: page.finalUrl, error: 'NO_PRODUCT' }, false);
    throw new CatalogueError('PAGE_UNREADABLE', 'no product found on the page', ['NO_PRODUCT']);
  }
  const draft = await rulesDraft(deps, who, facts);
  let method: DraftMethod = 'rules';
  const notes: DraftNote[] = [];
  if (!useAi) notes.push('ai-not-used');
  else if (!aiOn) notes.push('ai-off');
  else if (!deps.aiDraft) notes.push('ai-not-connected');
  else {
    try {
      const tidy = await deps.aiDraft({ facts, draft });
      if (tidy.nameEn?.trim()) draft.nameEn = tidy.nameEn.trim().slice(0, 200);
      if (tidy.descriptionEn?.trim()) draft.descriptionEn = tidy.descriptionEn.trim().slice(0, 10_000);
      method = 'ai';
    } catch {
      notes.push('ai-failed');
    }
  }
  const earlierRows = await deps.db.catalogImportJob.findMany({
    where: { storeId: who.storeId, kind: 'IMPORT_FROM_LINK', sourceUrl: url, status: { not: 'FAILED' } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, createdAt: true, result: true },
  });
  const jobId = await job({ stage: 'preview', reader: readerInfo, finalUrl: page.finalUrl, facts, draft, method, notes }, true);
  return {
    jobId,
    sourceUrl: url,
    finalUrl: page.finalUrl,
    reader: readerInfo,
    facts,
    draft,
    method,
    notes,
    earlier: earlierRows.map((r) => ({ jobId: r.id, at: r.createdAt.toISOString(), productId: readResult(r.result).productId ?? null })),
  };
}

export const linkDraftInput = z
  .object({
    nameEn: z.string().trim().min(1).max(200).optional(),
    nameBn: z.string().trim().min(1).max(200).nullable().optional(),
    descriptionEn: z.string().trim().min(1).max(10_000).nullable().optional(),
    brandId: z.uuid().nullable().optional(),
    categoryId: z.uuid().nullable().optional(),
    fabricId: z.uuid().nullable().optional(),
    colourIds: z.array(z.uuid()).max(40).optional(),
  })
  .strict();
export type LinkDraftInput = z.input<typeof linkDraftInput>;

export interface LinkDraftResult {
  jobId: string;
  productId: string;
  status: string;
}

/**
 * Makes the draft product from a read (with the person's changes). Needs `catalogue.import` and `catalogue.write`.
 * The product starts as a DRAFT and is checked (publish checklist); it is never published from here. A read makes at
 * most one draft: a second try is CONFLICT with the first draft's id.
 */
export async function createDraftFromImport(deps: CatalogueDeps, who: Who, jobId: string, input: LinkDraftInput = {}): Promise<LinkDraftResult> {
  await allowImport(deps, who);
  await requirePermission(deps.db, who.actor, 'catalogue.write', { storeId: who.storeId });
  const edits = parse(linkDraftInput, input, 'draft');
  if (!z.uuid().safeParse(jobId).success) throw new CatalogueError('INVALID_INPUT', 'not a job id', ['jobId']);
  const job = found(await deps.db.catalogImportJob.findFirst({ where: { id: jobId, storeId: who.storeId, kind: 'IMPORT_FROM_LINK' } }), 'import');
  const result = readResult(job.result);
  if (result.productId) throw new CatalogueError('CONFLICT', 'this read already made a draft', [`productId:${result.productId}`]);
  if (job.status !== 'SUCCEEDED' || result.stage !== 'preview' || !result.draft) throw new CatalogueError('CONFLICT', 'this read has no draft to make', [`status:${job.status}`]);
  // Claim the read, so a double click makes one draft.
  const claimed = await deps.db.catalogImportJob.updateMany({ where: { id: job.id, status: 'SUCCEEDED' }, data: { status: 'RUNNING' } });
  if (claimed.count !== 1) throw new CatalogueError('CONFLICT', 'this read is being drafted already', ['status:RUNNING']);
  const d = result.draft;
  try {
    const product = await createProduct(deps, who, {
      nameEn: edits.nameEn ?? d.nameEn,
      nameBn: edits.nameBn ?? null,
      descriptionEn: edits.descriptionEn === undefined ? d.descriptionEn : edits.descriptionEn,
      brandId: edits.brandId === undefined ? d.brandId : edits.brandId,
      categoryId: edits.categoryId === undefined ? d.categoryId : edits.categoryId,
      fabricId: edits.fabricId === undefined ? d.fabricId : edits.fabricId,
    });
    const colourIds = edits.colourIds ?? d.colourIds;
    if (colourIds.length) await setProductColours(deps, who, product.id, { colours: colourIds.map((colourId) => ({ colourId })) });
    const checked = await checkProduct(deps, who, product.id, { reason: 'new' });
    const now = deps.now?.() ?? new Date();
    await deps.db.$transaction(async (tx) => {
      await tx.catalogImportJob.update({ where: { id: job.id }, data: { status: 'SUCCEEDED', result: toJson({ ...result, stage: 'drafted', productId: product.id, draftedAt: now.toISOString() }) } });
      await logChange(tx, who, 'catalogImport.linkDraft', 'CatalogImportJob', job.id, null, { productId: product.id, sourceUrl: job.sourceUrl, status: checked.status });
    });
    return { jobId: job.id, productId: product.id, status: checked.status };
  } catch (e) {
    await deps.db.catalogImportJob.update({ where: { id: job.id }, data: { status: 'SUCCEEDED' } });
    throw e;
  }
}

export interface LinkImportJob {
  id: string;
  sourceUrl: string;
  at: string;
  status: string;
  stage: JobResult['stage'];
  name: string | null;
  productId: string | null;
  mode: string | null;
  error: string | null;
}

export interface LinkImportView {
  enabled: boolean;
  reader: { mode: string; provider: string };
  ai: { on: boolean; wanted: boolean; connected: boolean };
  jobs: LinkImportJob[];
  total: number;
  page: number;
  pageSize: number;
}

/** The import screen: switched on or not, the reader's mode, and the latest reads. Needs `catalogue.import`. */
export async function linkImportView(deps: LinkImportDeps, who: Who, query: { page?: number } = {}): Promise<LinkImportView> {
  await allow(deps, who, 'catalogue.import');
  const page = parse(z.object({ page: z.int().min(1).optional() }).strict(), query, 'page').page ?? 1;
  const [enabled, pageSize, aiOn, useAi] = await Promise.all([
    setting(deps, who, 'catalogue.linkImport.enabled'),
    setting(deps, who, 'catalogue.admin.pageSize'),
    setting(deps, who, 'ai.enabled'),
    setting(deps, who, 'catalogue.linkImport.useAi'),
  ]);
  const reader = await deps.pageReader(who.storeId);
  const where = { storeId: who.storeId, kind: 'IMPORT_FROM_LINK' as const };
  const [rows, total] = await Promise.all([
    deps.db.catalogImportJob.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
    deps.db.catalogImportJob.count({ where }),
  ]);
  return {
    enabled,
    reader: { mode: reader.mode, provider: reader.provider },
    ai: { on: aiOn, wanted: useAi, connected: !!deps.aiDraft },
    jobs: rows.map((r) => {
      const res = readResult(r.result);
      return {
        id: r.id,
        sourceUrl: r.sourceUrl ?? '',
        at: r.createdAt.toISOString(),
        status: r.status,
        stage: res.stage,
        name: res.draft?.nameEn ?? null,
        productId: res.productId ?? null,
        mode: res.reader?.mode ?? null,
        error: res.error ?? null,
      };
    }),
    total,
    page,
    pageSize,
  };
}

// PR 590 — naming and link control (owner decisions 19 Oct 12:07 and 12:16, demo screen "Names & links",
// docs/demo/src/95-admin-naming.js).
// - Brand names stay. Every product has a real brand (brands.ts); the brand line shows it when the name does not.
// - Per product: the name on the site, the link (slug), the SEO title and meta description (SeoMeta, en and bn) and
//   the feed/ad title. An empty SEO title, description or feed title follows the shop-wide template; the templates are
//   settings (`naming.*Template`) with tokens such as {brand}, {name}, {style}, {colour}, {price}, {shop}.
// - A changed link never breaks: the old one forwards (301) to the product, with no chains (redirects.ts); every
//   rename is kept in ProductRename (append-only) for the before/after report.
// - The "other brand's name" note is optional and off by default (`naming.otherBrandWarning`): it never blocks.
// - Bulk rename and template apply are previewed first; applying needs the preview's hash, so what is saved is exactly
//   what was seen.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Prisma } from '@extas/db/client';
import { linesBoth, sumLines } from '@extas/metrics';
import { allow, found, logChange, parse, setting, TX, type CatalogueDeps, type Db, type Tx, type Who } from './context';
import { effectiveGarmentTypeOf } from './categories';
import type { Lang } from './dictionaries';
import { CatalogueError } from './errors';
import { msg } from './messages';
import { forwardingElsewhere, moveLink, type MovedLink } from './redirects';
import { charCount, fillTemplate, hasWord, isSlug, normalizePath, otherBrandHits, productPath, slugFromPath, slugify, stripBrand, type SlugOptions, type TokenValues } from './text';

export const LANGS: readonly Lang[] = ['en', 'bn'];
export const SEO_ENTITY = 'product';

// ---------------------------------------------------------------------------------------------------------------
// Settings snapshot
// ---------------------------------------------------------------------------------------------------------------

export interface NamingSettings {
  slug: SlugOptions;
  slugFallback: string;
  prefix: string;
  statusCode: number;
  templates: { slug: string; seoTitle: Record<Lang, string>; metaDescription: Record<Lang, string>; feedTitle: string };
  coloursIn: number;
  max: { seoTitle: number; metaDescription: number; feedTitle: number };
  storeName: string | null;
  locale: string;
  currency: string;
  warn: boolean;
  brands: string[];
  showBrandLine: boolean;
  showOwnLabel: boolean;
  ownLabel: { id: string; name: string } | null;
  bulkMax: number;
}

export async function namingSettings(deps: CatalogueDeps, who: Who, db: Db = deps.db): Promise<NamingSettings> {
  const s = <K extends Parameters<typeof setting>[2]>(k: K) => setting(deps, who, k);
  const [maxLength, ampersand, slugFallback, prefix, statusCode, tSlug, tSeo, tMeta, tFeed, coloursIn, mSeo, mMeta, mFeed, storeName, locale, currency, warn, brands, showBrandLine, showOwnLabel, bulkMax] =
    await Promise.all([
      s('naming.slugMaxLength'),
      s('naming.slugAmpersand'),
      s('naming.slugFallback'),
      s('naming.productPathPrefix'),
      s('naming.redirectStatusCode'),
      s('naming.slugTemplate'),
      s('naming.seoTitleTemplate'),
      s('naming.metaDescriptionTemplate'),
      s('naming.feedTitleTemplate'),
      s('naming.coloursInTemplate'),
      s('naming.seoTitleMaxChars'),
      s('naming.metaDescriptionMaxChars'),
      s('naming.feedTitleMaxChars'),
      s('store.name'),
      s('store.locale'),
      s('store.currency'),
      s('naming.otherBrandWarning'),
      s('naming.otherBrandNames'),
      s('naming.showBrandLine'),
      s('naming.showOwnLabelBrand'),
      s('naming.bulkMaxChanges'),
    ]);
  const own = await db.brand.findFirst({ where: { storeId: who.storeId, isOwnLabel: true, archivedAt: null }, select: { id: true, name: true } });
  return {
    slug: { maxLength, ampersand },
    slugFallback,
    prefix,
    statusCode,
    templates: { slug: tSlug, seoTitle: tSeo, metaDescription: tMeta, feedTitle: tFeed },
    coloursIn,
    max: { seoTitle: mSeo, metaDescription: mMeta, feedTitle: mFeed },
    storeName,
    locale,
    currency,
    warn,
    brands,
    showBrandLine,
    showOwnLabel,
    ownLabel: own,
    bulkMax,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// What a name is made from
// ---------------------------------------------------------------------------------------------------------------

export const namingInclude = {
  brand: { select: { id: true, name: true, isOwnLabel: true } },
  category: { select: { id: true, nameEn: true, nameBn: true } },
  colours: {
    where: { archivedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { colour: { select: { nameEn: true, nameBn: true } } },
  },
} satisfies Prisma.ProductInclude;
export type NamingRow = Prisma.ProductGetPayload<{ include: typeof namingInclude }>;

/** A product as the naming rules see it (a saved row, or a draft that is not saved yet). */
export interface NameSource {
  id: string | null;
  status: string | null;
  nameEn: string;
  nameBn: string | null;
  slug: string;
  feedTitle: string | null;
  categoryId: string | null;
  pdpBlocks: Prisma.JsonValue | null;
  minPriceMinor: number | null;
  brand: { id: string; name: string; isOwnLabel: boolean } | null;
  category: { id: string; nameEn: string; nameBn: string | null } | null;
  colours: { nameEn: string; nameBn: string | null }[];
}

export const sourceOf = (r: NamingRow): NameSource => ({
  id: r.id,
  status: r.status,
  nameEn: r.nameEn,
  nameBn: r.nameBn,
  slug: r.slug,
  feedTitle: r.feedTitle,
  categoryId: r.categoryId,
  pdpBlocks: r.pdpBlocks,
  minPriceMinor: r.minPriceMinor,
  brand: r.brand,
  category: r.category,
  colours: r.colours.map((c) => c.colour),
});

export type BrandSource = 'product' | 'ownLabel' | 'storeName';
export interface NamingBrand {
  id: string | null;
  name: string;
  isOwnLabel: boolean;
  source: BrandSource;
}

export function brandOf(p: NameSource, ns: NamingSettings): NamingBrand {
  if (p.brand) return { id: p.brand.id, name: p.brand.name, isOwnLabel: p.brand.isOwnLabel, source: 'product' };
  if (ns.ownLabel) return { id: ns.ownLabel.id, name: ns.ownLabel.name, isOwnLabel: true, source: 'ownLabel' };
  return { id: null, name: ns.storeName ?? '', isOwnLabel: true, source: 'storeName' };
}

/** The demo's nm_single: "Polos" → "Polo", "Accessories" → "Accessory" (English only; Bengali keeps the name). */
export function singular(n: string): string {
  if (/ies$/i.test(n)) return `${n.slice(0, -3)}y`;
  if (/[^s]s$/i.test(n)) return n.slice(0, -1);
  return n;
}

/** Minor units in the store's currency as the shop writes money ("৳1,450" in bn-BD). */
export function formatMoney(minor: number | null, currency: string, locale: string): string {
  if (minor == null) return '';
  const digits = new Intl.NumberFormat(locale, { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 0;
  const value = minor / 10 ** digits;
  const fraction = Number.isInteger(value) ? 0 : digits;
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: fraction, maximumFractionDigits: digits }).format(value);
}

/** The locale a language is written in for this store ("bn-BD" → en: "en-BD", bn: "bn-BD"). */
export function localeFor(storeLocale: string, lang: Lang): string {
  let region: string | undefined;
  try {
    region = new Intl.Locale(storeLocale).region;
  } catch {
    region = undefined;
  }
  return region ? `${lang}-${region}` : lang;
}

export type GarmentTypeName = { nameEn: string; nameBn: string } | null;

/** The values of every template token for one product in one language. */
export function tokenValues(p: NameSource, ns: NamingSettings, garmentType: GarmentTypeName, lang: Lang): TokenValues {
  const brand = brandOf(p, ns).name;
  const name = lang === 'bn' ? (p.nameBn ?? p.nameEn) : p.nameEn;
  const cat = p.category ? (lang === 'bn' ? (p.category.nameBn ?? p.category.nameEn) : p.category.nameEn) : '';
  const type = garmentType ? (lang === 'bn' ? garmentType.nameBn : garmentType.nameEn) : lang === 'en' ? singular(cat) : cat;
  const cols = p.colours.map((c) => (lang === 'bn' ? (c.nameBn ?? c.nameEn) : c.nameEn));
  const sep = msg(lang, 'naming.listSeparator');
  const shown = cols.slice(0, ns.coloursIn).join(sep);
  const more = cols.length - ns.coloursIn;
  const locale = localeFor(ns.locale, lang);
  const blocks = p.pdpBlocks && typeof p.pdpBlocks === 'object' && !Array.isArray(p.pdpBlocks) ? (p.pdpBlocks as Record<string, unknown>) : {};
  return {
    brand,
    name,
    style: stripBrand(name, brand),
    type,
    cat,
    colour: cols[0] ?? '',
    colours: more > 0 ? `${shown} ${msg(lang, 'naming.coloursMore', { n: new Intl.NumberFormat(locale).format(more) })}` : shown,
    price: formatMoney(p.minPriceMinor, ns.currency, locale),
    fit: typeof blocks.fit === 'string' ? blocks.fit : '',
    shop: ns.storeName ?? '',
  };
}

/** The link the slug template gives (or the name's link, or the fallback word). */
export function templateSlug(p: NameSource, ns: NamingSettings, garmentType: GarmentTypeName): string {
  return fillTemplate(ns.templates.slug, tokenValues(p, ns, garmentType, 'en'), ns.slug) || slugify(p.nameEn, ns.slug) || ns.slugFallback;
}

// ---------------------------------------------------------------------------------------------------------------
// The naming view
// ---------------------------------------------------------------------------------------------------------------

export type FieldSource = 'own' | 'template';
export interface NamingField {
  value: string;
  source: FieldSource;
  chars: number;
  max: number;
  /** Longer than the store's limit for this field: a note, never a block (search engines cut it). */
  over: boolean;
}

export type WarnField = 'name' | 'slug' | 'seoTitle' | 'feedTitle';
export interface OtherBrandWarning {
  field: WarnField;
  brands: string[];
}

export interface NamingView {
  productId: string | null;
  status: string | null;
  nameEn: string;
  nameBn: string | null;
  slug: string;
  path: string;
  /** What the link template would give now (for "use the template link"). */
  templateSlug: string;
  brand: NamingBrand;
  /** The brand line on cards and the product page ('' when hidden or when the name already says it). */
  brandLine: string;
  seoTitle: Record<Lang, NamingField>;
  metaDescription: Record<Lang, NamingField>;
  feedTitle: NamingField;
  warnings: OtherBrandWarning[];
}

export interface SeoTexts {
  title: Partial<Record<Lang, string | null>>;
  description: Partial<Record<Lang, string | null>>;
}

const field = (own: string | null | undefined, template: string, max: number): NamingField => {
  const value = own && own.trim() ? own : template;
  const chars = charCount(value);
  return { value, source: own && own.trim() ? 'own' : 'template', chars, max, over: chars > max };
};

export function brandLine(p: NameSource, ns: NamingSettings): string {
  if (!ns.showBrandLine) return '';
  const b = brandOf(p, ns);
  if (!b.name || (b.isOwnLabel && !ns.showOwnLabel)) return '';
  return hasWord(p.nameEn, b.name) ? '' : b.name;
}

export function otherBrandWarnings(p: NameSource, ns: NamingSettings, seoTitleEn: string, feedTitle: string): OtherBrandWarning[] {
  if (!ns.warn) return [];
  const own = brandOf(p, ns).name;
  const out: OtherBrandWarning[] = [];
  const check = (f: WarnField, text: string, isLink: boolean) => {
    const hits = otherBrandHits(text, own, ns.brands, isLink, ns.slug);
    if (hits.length) out.push({ field: f, brands: hits });
  };
  check('name', p.nameEn, false);
  check('slug', p.slug, true);
  check('seoTitle', seoTitleEn, false);
  check('feedTitle', feedTitle, false);
  return out;
}

export function namingViewOf(p: NameSource, seo: SeoTexts, ns: NamingSettings, garmentType: GarmentTypeName): NamingView {
  const tokens = { en: tokenValues(p, ns, garmentType, 'en'), bn: tokenValues(p, ns, garmentType, 'bn') };
  const seoTitle = { en: field(seo.title.en, fillTemplate(ns.templates.seoTitle.en, tokens.en), ns.max.seoTitle), bn: field(seo.title.bn, fillTemplate(ns.templates.seoTitle.bn, tokens.bn), ns.max.seoTitle) };
  const metaDescription = {
    en: field(seo.description.en, fillTemplate(ns.templates.metaDescription.en, tokens.en), ns.max.metaDescription),
    bn: field(seo.description.bn, fillTemplate(ns.templates.metaDescription.bn, tokens.bn), ns.max.metaDescription),
  };
  const feedTitle = field(p.feedTitle, fillTemplate(ns.templates.feedTitle, tokens.en), ns.max.feedTitle);
  return {
    productId: p.id,
    status: p.status,
    nameEn: p.nameEn,
    nameBn: p.nameBn,
    slug: p.slug,
    path: productPath(ns.prefix, p.slug),
    templateSlug: templateSlug(p, ns, garmentType),
    brand: brandOf(p, ns),
    brandLine: brandLine(p, ns),
    seoTitle,
    metaDescription,
    feedTitle,
    warnings: otherBrandWarnings(p, ns, seoTitle.en.value, feedTitle.value),
  };
}

async function seoOf(db: Db, storeId: number, ids: string[]): Promise<Map<string, SeoTexts>> {
  const out = new Map<string, SeoTexts>();
  if (!ids.length) return out;
  const rows = await db.seoMeta.findMany({ where: { storeId, entityType: SEO_ENTITY, entityId: { in: ids }, locale: { in: [...LANGS] } } });
  for (const r of rows) {
    const t = out.get(r.entityId) ?? { title: {}, description: {} };
    const lang = r.locale as Lang;
    t.title[lang] = r.title;
    t.description[lang] = r.description;
    out.set(r.entityId, t);
  }
  return out;
}

/** Garment types by category, looked up once per category. */
class TypeCache {
  private readonly m = new Map<string, Promise<GarmentTypeName>>();
  constructor(
    private readonly db: Db,
    private readonly storeId: number,
  ) {}
  get(categoryId: string | null): Promise<GarmentTypeName> {
    if (!categoryId) return Promise.resolve(null);
    let v = this.m.get(categoryId);
    if (!v) {
      v = effectiveGarmentTypeOf(this.db, this.storeId, categoryId).then((g) => (g ? { nameEn: g.nameEn, nameBn: g.nameBn } : null));
      this.m.set(categoryId, v);
    }
    return v;
  }
}

async function loadRow(db: Db, storeId: number, id: string): Promise<NamingRow> {
  return found(await db.product.findFirst({ where: { id, storeId }, include: namingInclude }), 'product');
}

export async function namingView(deps: CatalogueDeps, who: Who, productId: string): Promise<NamingView> {
  await allow(deps, who, 'catalogue.read');
  const ns = await namingSettings(deps, who);
  const row = await loadRow(deps.db, who.storeId, productId);
  const seo = (await seoOf(deps.db, who.storeId, [row.id])).get(row.id) ?? { title: {}, description: {} };
  return namingViewOf(sourceOf(row), seo, ns, await new TypeCache(deps.db, who.storeId).get(row.categoryId));
}

export interface NamingListFilter {
  q?: string;
  categoryId?: string;
  brandId?: string;
  includeArchived?: boolean;
}

/** The naming table: every product's name, link and titles with where each one comes from. */
export async function listNaming(deps: CatalogueDeps, who: Who, filter: NamingListFilter = {}): Promise<NamingView[]> {
  await allow(deps, who, 'catalogue.read');
  const ns = await namingSettings(deps, who);
  const rows = await deps.db.product.findMany({ where: scopeWhere(who.storeId, filter), include: namingInclude, orderBy: [{ nameEn: 'asc' }, { id: 'asc' }] });
  const seo = await seoOf(deps.db, who.storeId, rows.map((r) => r.id));
  const types = new TypeCache(deps.db, who.storeId);
  const out: NamingView[] = [];
  for (const r of rows) out.push(namingViewOf(sourceOf(r), seo.get(r.id) ?? { title: {}, description: {} }, ns, await types.get(r.categoryId)));
  return out;
}

function scopeWhere(storeId: number, f: NamingListFilter): Prisma.ProductWhereInput {
  const q = f.q?.trim();
  return {
    storeId,
    ...(f.includeArchived ? {} : { archivedAt: null }),
    ...(f.categoryId ? { categoryId: f.categoryId } : {}),
    ...(f.brandId ? { brandId: f.brandId } : {}),
    ...(q
      ? { OR: [{ nameEn: { contains: q, mode: 'insensitive' } }, { nameBn: { contains: q, mode: 'insensitive' } }, { slug: { contains: q, mode: 'insensitive' } }] }
      : {}),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Saving a product's names
// ---------------------------------------------------------------------------------------------------------------

const optText = (max: number) => z.string().trim().min(1).max(max).nullable().optional();
export const namingPatch = z
  .object({
    nameEn: z.string().trim().min(1).max(200).optional(),
    nameBn: optText(200),
    slug: z.string().trim().max(200).optional(),
    brandId: z.uuid().nullable().optional(),
    feedTitle: optText(300),
    seoTitleEn: optText(300),
    seoTitleBn: optText(300),
    metaDescriptionEn: optText(1000),
    metaDescriptionBn: optText(1000),
  })
  .strict();
export type NamingPatch = z.input<typeof namingPatch>;
type NamingData = z.output<typeof namingPatch>;

/** Why a link cannot be used for this product, or null. */
export async function slugProblem(db: Db, storeId: number, ns: NamingSettings, slug: string, productId: string | null, ownSlug: string | null): Promise<{ code: 'INVALID_INPUT' | 'SLUG_TAKEN'; detail: string } | null> {
  if (!isSlug(slug) || slug.length > ns.slug.maxLength) return { code: 'INVALID_INPUT', detail: `slug: letters, digits and hyphens, at most ${ns.slug.maxLength}` };
  const other = await db.product.findUnique({ where: { storeId_slug: { storeId, slug } }, select: { id: true } });
  if (other && other.id !== productId) return { code: 'SLUG_TAKEN', detail: 'slug: another product has this link (archived ones keep theirs)' };
  const elsewhere = await forwardingElsewhere(db as Tx, storeId, productPath(ns.prefix, slug), ownSlug ? productPath(ns.prefix, ownSlug) : null);
  if (elsewhere) return { code: 'SLUG_TAKEN', detail: `slug: an old link that forwards to ${elsewhere}` };
  return null;
}

/** `base`, or `base-2`, `base-3` … — the first link no other product has and no old link forwards from elsewhere. */
export async function uniqueSlug(db: Db, storeId: number, ns: NamingSettings, base: string, productId: string | null, ownSlug: string | null, taken: Set<string> = new Set()): Promise<string> {
  const root = base || ns.slugFallback;
  for (let i = 1; ; i++) {
    const suffix = i === 1 ? '' : `-${i}`;
    const s = `${root.slice(0, ns.slug.maxLength - suffix.length).replace(/-+$/, '')}${suffix}`;
    if (!taken.has(s) && !(await slugProblem(db, storeId, ns, s, productId, ownSlug))) return s;
  }
}

export interface NamingResult {
  view: NamingView;
  /** The old link that now forwards, when the link changed. */
  moved: MovedLink | null;
  renameId: string | null;
}

/** Applies a naming change inside a transaction (also used by product edits, bulk rename and template apply). */
export async function applyNaming(tx: Tx, who: Who, ns: NamingSettings, productId: string, d: NamingData, now: Date): Promise<{ moved: MovedLink | null; renameId: string | null; changed: boolean }> {
  const cur = await loadRow(tx, who.storeId, productId);
  if (d.brandId) {
    const b = await tx.brand.findFirst({ where: { id: d.brandId, storeId: who.storeId }, select: { archivedAt: true } });
    if (!b) throw new CatalogueError('NOT_FOUND', 'no such brand', ['brandId']);
    if (b.archivedAt && d.brandId !== cur.brandId) throw new CatalogueError('PARENT_ARCHIVED', 'the brand is archived', ['brandId']);
  }
  const slug = d.slug !== undefined && d.slug !== cur.slug ? d.slug : cur.slug;
  if (slug !== cur.slug) {
    const problem = await slugProblem(tx, who.storeId, ns, slug, cur.id, cur.slug);
    if (problem) throw new CatalogueError(problem.code, 'this link cannot be used', [problem.detail]);
  }
  const before = { nameEn: cur.nameEn, nameBn: cur.nameBn, slug: cur.slug, brandId: cur.brandId, feedTitle: cur.feedTitle };
  const next = {
    nameEn: d.nameEn ?? cur.nameEn,
    nameBn: d.nameBn === undefined ? cur.nameBn : d.nameBn,
    slug,
    brandId: d.brandId === undefined ? cur.brandId : d.brandId,
    feedTitle: d.feedTitle === undefined ? cur.feedTitle : d.feedTitle,
  };
  const diffKeys = (Object.keys(next) as (keyof typeof next)[]).filter((k) => next[k] !== before[k]);
  if (diffKeys.length) await tx.product.update({ where: { id: cur.id }, data: next });

  const seoChanges: { lang: Lang; title?: string | null; description?: string | null }[] = [];
  for (const lang of LANGS) {
    const title = lang === 'en' ? d.seoTitleEn : d.seoTitleBn;
    const description = lang === 'en' ? d.metaDescriptionEn : d.metaDescriptionBn;
    if (title !== undefined || description !== undefined) seoChanges.push({ lang, ...(title !== undefined ? { title } : {}), ...(description !== undefined ? { description } : {}) });
  }
  const seoBefore: Record<string, unknown> = {};
  const seoAfter: Record<string, unknown> = {};
  for (const c of seoChanges) {
    const key = { storeId_entityType_entityId_locale: { storeId: who.storeId, entityType: SEO_ENTITY, entityId: cur.id, locale: c.lang } };
    const old = await tx.seoMeta.findUnique({ where: key });
    const data = { ...(c.title !== undefined ? { title: c.title } : {}), ...(c.description !== undefined ? { description: c.description } : {}) };
    const same = (c.title === undefined || (old?.title ?? null) === c.title) && (c.description === undefined || (old?.description ?? null) === c.description);
    if (same) continue;
    if (old) await tx.seoMeta.update({ where: { id: old.id }, data });
    else await tx.seoMeta.create({ data: { storeId: who.storeId, entityType: SEO_ENTITY, entityId: cur.id, locale: c.lang, ...data } });
    seoBefore[c.lang] = { title: old?.title ?? null, description: old?.description ?? null };
    seoAfter[c.lang] = { title: c.title === undefined ? (old?.title ?? null) : c.title, description: c.description === undefined ? (old?.description ?? null) : c.description };
  }

  let moved: MovedLink | null = null;
  if (slug !== cur.slug) moved = await moveLink(tx, who, productPath(ns.prefix, cur.slug), productPath(ns.prefix, slug), 'product-slug', ns.statusCode, now);

  let renameId: string | null = null;
  if (next.nameEn !== cur.nameEn || slug !== cur.slug) {
    const r = await tx.productRename.create({
      data: { storeId: who.storeId, productId: cur.id, oldName: cur.nameEn, newName: next.nameEn, oldSlug: cur.slug, newSlug: slug, actorId: who.actor.staffUserId, createdAt: now },
    });
    renameId = r.id;
  }

  const changedAny = diffKeys.length > 0 || Object.keys(seoAfter).length > 0;
  if (changedAny) {
    const b: Record<string, unknown> = Object.fromEntries(diffKeys.map((k) => [k, before[k]]));
    const a: Record<string, unknown> = Object.fromEntries(diffKeys.map((k) => [k, next[k]]));
    if (Object.keys(seoAfter).length) {
      b.seo = seoBefore;
      a.seo = seoAfter;
    }
    await logChange(tx, who, renameId ? 'product.rename' : 'product.naming', 'Product', cur.id, b, a);
  }
  return { moved, renameId, changed: changedAny };
}

export async function saveNaming(deps: CatalogueDeps, who: Who, productId: string, patch: NamingPatch): Promise<NamingResult> {
  await allow(deps, who, 'catalogue.write');
  const d = parse(namingPatch, patch, 'naming');
  const now = deps.now?.() ?? new Date();
  const ns = await namingSettings(deps, who);
  const r = await deps.db.$transaction((tx) => applyNaming(tx, who, ns, productId, d, now), TX);
  return { view: await namingView(deps, who, productId), moved: r.moved, renameId: r.renameId };
}

// ---------------------------------------------------------------------------------------------------------------
// Draft preview (the edit form's Google and feed previews, before anything is saved)
// ---------------------------------------------------------------------------------------------------------------

export const namingDraft = namingPatch.extend({ productId: z.uuid().optional(), categoryId: z.uuid().nullable().optional() }).strict();
export type NamingDraft = z.input<typeof namingDraft>;

export interface NamingPreview {
  view: NamingView;
  /** Why the typed link cannot be used ('' link means: the template link will be used). */
  slugProblem: { code: string; detail: string } | null;
  /** The old link that would forward to the new one. */
  redirect: { from: string; to: string } | null;
  google: { path: string; title: string; description: string };
  feed: { title: string };
}

export async function previewNaming(deps: CatalogueDeps, who: Who, draft: NamingDraft): Promise<NamingPreview> {
  await allow(deps, who, 'catalogue.read');
  const d = parse(namingDraft, draft, 'naming draft');
  const ns = await namingSettings(deps, who);
  const cur = d.productId ? sourceOf(await loadRow(deps.db, who.storeId, d.productId)) : null;
  const brandId = d.brandId === undefined ? (cur?.brand?.id ?? null) : d.brandId;
  const categoryId = d.categoryId === undefined ? (cur?.categoryId ?? null) : d.categoryId;
  const brand = brandId ? await deps.db.brand.findFirst({ where: { id: brandId, storeId: who.storeId }, select: { id: true, name: true, isOwnLabel: true } }) : null;
  const category = categoryId ? await deps.db.category.findFirst({ where: { id: categoryId, storeId: who.storeId }, select: { id: true, nameEn: true, nameBn: true } }) : null;
  const src: NameSource = {
    id: cur?.id ?? null,
    status: cur?.status ?? null,
    nameEn: d.nameEn ?? cur?.nameEn ?? '',
    nameBn: d.nameBn === undefined ? (cur?.nameBn ?? null) : d.nameBn,
    slug: '',
    feedTitle: d.feedTitle === undefined ? (cur?.feedTitle ?? null) : d.feedTitle,
    categoryId: category?.id ?? null,
    pdpBlocks: cur?.pdpBlocks ?? null,
    minPriceMinor: cur?.minPriceMinor ?? null,
    brand,
    category,
    colours: cur?.colours ?? [],
  };
  const gt = await new TypeCache(deps.db, who.storeId).get(src.categoryId);
  const typed = d.slug?.trim();
  let problem: NamingPreview['slugProblem'] = null;
  if (typed) {
    src.slug = typed;
    if (typed !== cur?.slug) problem = await slugProblem(deps.db, who.storeId, ns, typed, src.id, cur?.slug ?? null);
  } else {
    src.slug = cur?.slug ?? (await uniqueSlug(deps.db, who.storeId, ns, templateSlug(src, ns, gt), null, null));
  }
  const saved = cur?.id ? ((await seoOf(deps.db, who.storeId, [cur.id])).get(cur.id) ?? { title: {}, description: {} }) : { title: {}, description: {} };
  const pick = (v: string | null | undefined, old: string | null | undefined) => (v === undefined ? old : v);
  const seo: SeoTexts = {
    title: { en: pick(d.seoTitleEn, saved.title.en), bn: pick(d.seoTitleBn, saved.title.bn) },
    description: { en: pick(d.metaDescriptionEn, saved.description.en), bn: pick(d.metaDescriptionBn, saved.description.bn) },
  };
  const view = namingViewOf(src, seo, ns, gt);
  const redirect = cur && src.slug !== cur.slug && !problem ? { from: productPath(ns.prefix, cur.slug), to: view.path } : null;
  return { view, slugProblem: problem, redirect, google: { path: view.path, title: view.seoTitle.en.value, description: view.metaDescription.en.value }, feed: { title: view.feedTitle.value } };
}

// ---------------------------------------------------------------------------------------------------------------
// Template apply and bulk rename (preview → apply with the preview's hash)
// ---------------------------------------------------------------------------------------------------------------

export const TEMPLATE_FIELDS = ['slug', 'seoTitle', 'metaDescription', 'feedTitle'] as const;
export type TemplateField = (typeof TEMPLATE_FIELDS)[number];

const scopeSchema = z.union([
  z.object({ kind: z.literal('all') }).strict(),
  z.object({ kind: z.literal('category'), categoryId: z.uuid() }).strict(),
  z.object({ kind: z.literal('brand'), brandId: z.uuid().nullable() }).strict(),
]);
const localized = z.object({ en: z.string().trim().min(1).max(500), bn: z.string().trim().min(1).max(500) }).strict();

export const templateApplyInput = z
  .object({
    /** Draft templates; a missing one is the saved setting. */
    templates: z
      .object({ slug: z.string().trim().min(1).max(200).optional(), seoTitle: localized.optional(), metaDescription: localized.optional(), feedTitle: z.string().trim().min(1).max(300).optional() })
      .strict()
      .optional(),
    fields: z.array(z.enum(TEMPLATE_FIELDS)).min(1),
    mode: z.enum(['empty', 'all']),
    scope: scopeSchema.optional(),
  })
  .strict();
export type TemplateApplyInput = z.input<typeof templateApplyInput>;

export const bulkRenameInput = z
  .object({
    find: z.string().min(1).max(200),
    replace: z.string().max(200),
    scope: scopeSchema.optional(),
    /** New links from the link template (the old ones forward). */
    relink: z.boolean().optional(),
  })
  .strict();
export type BulkRenameInput = z.input<typeof bulkRenameInput>;

export interface NamingChange {
  productId: string;
  productName: string;
  /** "slug", "nameEn", "feedTitle", "seoTitle.en", "metaDescription.bn" … */
  field: string;
  from: string;
  to: string;
}

export interface ChangePreview {
  changes: NamingChange[];
  /** Products touched. */
  products: number;
  /** Over `naming.bulkMaxChanges`: apply will refuse; narrow the scope. */
  tooMany: boolean;
  max: number;
  /** Send this back to apply exactly what was previewed. */
  hash: string;
}

const hashOf = (changes: NamingChange[]) => createHash('sha256').update(JSON.stringify(changes)).digest('hex');

function previewOf(changes: NamingChange[], ns: NamingSettings): ChangePreview {
  return { changes, products: new Set(changes.map((c) => c.productId)).size, tooMany: changes.length > ns.bulkMax, max: ns.bulkMax, hash: hashOf(changes) };
}

async function scopeRows(db: Db, storeId: number, scope: z.output<typeof scopeSchema> | undefined) {
  const where: Prisma.ProductWhereInput = { storeId, archivedAt: null };
  if (scope?.kind === 'category') where.categoryId = scope.categoryId;
  if (scope?.kind === 'brand') where.brandId = scope.brandId;
  return db.product.findMany({ where, include: namingInclude, orderBy: [{ nameEn: 'asc' }, { id: 'asc' }] });
}

async function templateChangesIn(db: Db, who: Who, ns: NamingSettings, d: z.output<typeof templateApplyInput>): Promise<NamingChange[]> {
  const t = {
    slug: d.templates?.slug ?? ns.templates.slug,
    seoTitle: d.templates?.seoTitle ?? ns.templates.seoTitle,
    metaDescription: d.templates?.metaDescription ?? ns.templates.metaDescription,
    feedTitle: d.templates?.feedTitle ?? ns.templates.feedTitle,
  };
  const draft: NamingSettings = { ...ns, templates: t };
  const rows = await scopeRows(db, who.storeId, d.scope);
  const seo = await seoOf(db, who.storeId, rows.map((r) => r.id));
  const types = new TypeCache(db, who.storeId);
  const out: NamingChange[] = [];
  const taken = new Set<string>();
  const fields = new Set(d.fields);
  for (const r of rows) {
    const p = sourceOf(r);
    const gt = await types.get(r.categoryId);
    const tokens = { en: tokenValues(p, draft, gt, 'en'), bn: tokenValues(p, draft, gt, 'bn') };
    const s = seo.get(r.id) ?? { title: {}, description: {} };
    const push = (f: string, from: string | null | undefined, to: string) => {
      const ov = from ?? '';
      if (d.mode === 'empty' && ov.trim()) return;
      if (!to || to === ov) return;
      out.push({ productId: r.id, productName: r.nameEn, field: f, from: ov, to });
    };
    // A link always has a value, so "empty fields only" never changes links.
    if (fields.has('slug') && d.mode === 'all') {
      const base = templateSlug(p, draft, gt);
      if (base !== r.slug) {
        const to = await uniqueSlug(db, who.storeId, ns, base, r.id, r.slug, taken);
        if (to !== r.slug) {
          taken.add(to);
          out.push({ productId: r.id, productName: r.nameEn, field: 'slug', from: r.slug, to });
        }
      }
    }
    for (const lang of LANGS) {
      if (fields.has('seoTitle')) push(`seoTitle.${lang}`, s.title[lang], fillTemplate(t.seoTitle[lang], tokens[lang]));
      if (fields.has('metaDescription')) push(`metaDescription.${lang}`, s.description[lang], fillTemplate(t.metaDescription[lang], tokens[lang]));
    }
    if (fields.has('feedTitle')) push('feedTitle', r.feedTitle, fillTemplate(t.feedTitle, tokens.en));
  }
  return out;
}

export async function previewTemplateApply(deps: CatalogueDeps, who: Who, input: TemplateApplyInput): Promise<ChangePreview> {
  await allow(deps, who, 'catalogue.read');
  const d = parse(templateApplyInput, input, 'template apply');
  const ns = await namingSettings(deps, who);
  return previewOf(await templateChangesIn(deps.db, who, ns, d), ns);
}

async function bulkChangesIn(db: Db, who: Who, ns: NamingSettings, d: z.output<typeof bulkRenameInput>): Promise<NamingChange[]> {
  const rows = await scopeRows(db, who.storeId, d.scope);
  const types = new TypeCache(db, who.storeId);
  const re = new RegExp(d.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const out: NamingChange[] = [];
  const taken = new Set<string>();
  for (const r of rows) {
    if (!r.nameEn.match(re)) continue;
    const to = r.nameEn.replace(re, d.replace).replace(/\s{2,}/g, ' ').trim();
    if (!to || to === r.nameEn) continue;
    out.push({ productId: r.id, productName: r.nameEn, field: 'nameEn', from: r.nameEn, to });
    if (d.relink) {
      const p = { ...sourceOf(r), nameEn: to };
      const base = templateSlug(p, ns, await types.get(r.categoryId));
      const s = await uniqueSlug(db, who.storeId, ns, base, r.id, r.slug, taken);
      if (s && s !== r.slug) {
        taken.add(s);
        out.push({ productId: r.id, productName: r.nameEn, field: 'slug', from: r.slug, to: s });
      }
    }
  }
  return out;
}

export async function previewBulkRename(deps: CatalogueDeps, who: Who, input: BulkRenameInput): Promise<ChangePreview> {
  await allow(deps, who, 'catalogue.read');
  const d = parse(bulkRenameInput, input, 'bulk rename');
  const ns = await namingSettings(deps, who);
  return previewOf(await bulkChangesIn(deps.db, who, ns, d), ns);
}

export interface ApplyResult {
  applied: number;
  products: number;
  /** Old links that now forward. */
  redirects: number;
  renames: number;
}

async function applyChanges(deps: CatalogueDeps, who: Who, ns: NamingSettings, compute: (tx: Tx) => Promise<NamingChange[]>, hash: string): Promise<ApplyResult> {
  const now = deps.now?.() ?? new Date();
  return deps.db.$transaction(async (tx) => {
    const changes = await compute(tx);
    if (hashOf(changes) !== hash) throw new CatalogueError('PREVIEW_CHANGED', 'the products changed since the preview; preview again');
    if (changes.length > ns.bulkMax) throw new CatalogueError('TOO_MANY_CHANGES', 'too many changes in one go; narrow the scope', [`changes: ${changes.length}`, `max: ${ns.bulkMax}`]);
    const byProduct = new Map<string, NamingData>();
    for (const c of changes) {
      const d = byProduct.get(c.productId) ?? {};
      if (c.field === 'nameEn') d.nameEn = c.to;
      else if (c.field === 'slug') d.slug = c.to;
      else if (c.field === 'feedTitle') d.feedTitle = c.to;
      else if (c.field === 'seoTitle.en') d.seoTitleEn = c.to;
      else if (c.field === 'seoTitle.bn') d.seoTitleBn = c.to;
      else if (c.field === 'metaDescription.en') d.metaDescriptionEn = c.to;
      else if (c.field === 'metaDescription.bn') d.metaDescriptionBn = c.to;
      byProduct.set(c.productId, d);
    }
    let redirects = 0;
    let renames = 0;
    for (const [productId, d] of byProduct) {
      const r = await applyNaming(tx, who, ns, productId, d, now);
      if (r.moved) redirects++;
      if (r.renameId) renames++;
    }
    return { applied: changes.length, products: byProduct.size, redirects, renames };
  }, TX);
}

export async function applyTemplate(deps: CatalogueDeps, who: Who, input: TemplateApplyInput, hash: string): Promise<ApplyResult> {
  await allow(deps, who, 'catalogue.write');
  const d = parse(templateApplyInput, input, 'template apply');
  const ns = await namingSettings(deps, who);
  return applyChanges(deps, who, ns, (tx) => templateChangesIn(tx, who, ns, d), hash);
}

export async function applyBulkRename(deps: CatalogueDeps, who: Who, input: BulkRenameInput, hash: string): Promise<ApplyResult> {
  await allow(deps, who, 'catalogue.write');
  const d = parse(bulkRenameInput, input, 'bulk rename');
  const ns = await namingSettings(deps, who);
  return applyChanges(deps, who, ns, (tx) => bulkChangesIn(tx, who, ns, d), hash);
}

// ---------------------------------------------------------------------------------------------------------------
// Renames and the before/after report
// ---------------------------------------------------------------------------------------------------------------

/** The most rows one page of a history list returns (a technical page size, not a business number). */
export const PAGE_MAX = 200;
const pageSize = (take: number | undefined) => (take !== undefined && Number.isInteger(take) && take >= 1 ? Math.min(take, PAGE_MAX) : PAGE_MAX);

export interface RenameRow {
  id: string;
  productId: string;
  oldName: string | null;
  newName: string | null;
  oldSlug: string | null;
  newSlug: string | null;
  actorId: string | null;
  at: string;
}

export async function listRenames(deps: CatalogueDeps, who: Who, opts: { productId?: string; take?: number } = {}): Promise<RenameRow[]> {
  await allow(deps, who, 'catalogue.read');
  const rows = await deps.db.productRename.findMany({
    where: { storeId: who.storeId, ...(opts.productId ? { productId: opts.productId } : {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: pageSize(opts.take),
  });
  return rows.map((r) => ({ id: r.id, productId: r.productId, oldName: r.oldName, newName: r.newName, oldSlug: r.oldSlug, newSlug: r.newSlug, actorId: r.actorId, at: r.createdAt.toISOString() }));
}

/** One figure of a window: orders, pieces and their money (order lines of this product only). */
export interface WindowFigure {
  orders: number;
  units: number;
  valueMinor: number;
}

/**
 * The product's numbers in one window, by the shop's one KPI definition (PR 155, @extas/metrics): `sales` = delivered
 * orders only, on the day each was delivered; `ordered` = every placed order, on the day it was placed. Always both.
 */
export interface SalesWindow {
  from: string;
  to: string;
  days: number;
  ordered: WindowFigure;
  sales: WindowFigure;
  /** Page visits: null until analytics (S11) records them. */
  visits: number | null;
}

export interface RenameReport {
  rename: RenameRow;
  windowDays: number;
  before: SalesWindow;
  after: SalesWindow;
  /** Whole days since the rename, at most the window. */
  elapsedDays: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

async function salesIn(db: Db, storeId: number, productId: string, from: Date, to: Date, timeZone: string): Promise<SalesWindow> {
  const both = await linesBoth(db, storeId, { from, to }, timeZone, { productId });
  const fig = (basis: 'ordered' | 'sales'): WindowFigure => {
    const s = sumLines(both[basis]);
    return { orders: s.orders, units: s.units, valueMinor: s.valueMinor };
  };
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    days: Math.max(0, Math.round((to.getTime() - from.getTime()) / DAY_MS)),
    ordered: fig('ordered'),
    sales: fig('sales'),
    visits: null,
  };
}

/** Orders and sales in the N days before a rename and the N days after it (`naming.renameReportDays`). */
export async function renameReport(deps: CatalogueDeps, who: Who, renameId: string): Promise<RenameReport> {
  await allow(deps, who, 'catalogue.read');
  const r = found(await deps.db.productRename.findFirst({ where: { id: renameId, storeId: who.storeId } }), 'rename');
  const [days, timeZone] = await Promise.all([setting(deps, who, 'naming.renameReportDays'), setting(deps, who, 'store.timeZone')]);
  const now = deps.now?.() ?? new Date();
  const at = r.createdAt;
  const span = days * DAY_MS;
  const afterEnd = new Date(Math.min(at.getTime() + span, Math.max(now.getTime(), at.getTime())));
  const [before, after] = await Promise.all([
    salesIn(deps.db, who.storeId, r.productId, new Date(at.getTime() - span), at, timeZone),
    salesIn(deps.db, who.storeId, r.productId, at, afterEnd, timeZone),
  ]);
  return {
    rename: { id: r.id, productId: r.productId, oldName: r.oldName, newName: r.newName, oldSlug: r.oldSlug, newSlug: r.newSlug, actorId: r.actorId, at: at.toISOString() },
    windowDays: days,
    before,
    after,
    elapsedDays: Math.min(days, Math.floor((afterEnd.getTime() - at.getTime()) / DAY_MS)),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Redirects (the "Old links" tab) and what a path opens
// ---------------------------------------------------------------------------------------------------------------

export interface RedirectView {
  id: string;
  fromPath: string;
  toPath: string;
  statusCode: number;
  source: string;
  enabled: boolean;
  hits: number;
  lastHitAt: string | null;
  createdAt: string;
}

const redirectView = (r: { id: string; fromPath: string; toPath: string; statusCode: number; source: string; enabled: boolean; hits: number; lastHitAt: Date | null; createdAt: Date }): RedirectView => ({
  id: r.id,
  fromPath: r.fromPath,
  toPath: r.toPath,
  statusCode: r.statusCode,
  source: r.source,
  enabled: r.enabled,
  hits: r.hits,
  lastHitAt: r.lastHitAt?.toISOString() ?? null,
  createdAt: r.createdAt.toISOString(),
});

export async function listRedirects(deps: CatalogueDeps, who: Who, opts: { q?: string; includeDisabled?: boolean; take?: number } = {}): Promise<RedirectView[]> {
  await allow(deps, who, 'catalogue.read');
  const q = opts.q?.trim();
  const rows = await deps.db.redirect.findMany({
    where: {
      storeId: who.storeId,
      archivedAt: null,
      ...(opts.includeDisabled ? {} : { enabled: true }),
      ...(q ? { OR: [{ fromPath: { contains: q.toLowerCase() } }, { toPath: { contains: q.toLowerCase() } }] } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: pageSize(opts.take),
  });
  return rows.map(redirectView);
}

export const redirectInput = z.object({ fromPath: z.string().trim().min(1).max(500), toPath: z.string().trim().min(1).max(500) }).strict();
export const redirectPatch = z.object({ enabled: z.boolean().optional(), toPath: z.string().trim().min(1).max(500).optional() }).strict();
export type RedirectInput = z.input<typeof redirectInput>;
export type RedirectPatch = z.input<typeof redirectPatch>;

/** Where a path finally lands after following enabled redirects (no chains are stored, but a typed target may be one). */
async function finalTarget(tx: Tx, storeId: number, path: string): Promise<string> {
  let to = normalizePath(path);
  const seen = new Set<string>([to]);
  for (;;) {
    const r = await tx.redirect.findUnique({ where: { storeId_fromPath: { storeId, fromPath: to } } });
    if (!r || !r.enabled || r.archivedAt) return to;
    const next = normalizePath(r.toPath);
    if (seen.has(next)) return to;
    seen.add(next);
    to = next;
  }
}

async function assertNotLivePage(tx: Tx, storeId: number, ns: NamingSettings, path: string) {
  const slug = slugFromPath(ns.prefix, path);
  if (!slug) return;
  const p = await tx.product.findUnique({ where: { storeId_slug: { storeId, slug } }, select: { id: true } });
  if (p) throw new CatalogueError('SLUG_TAKEN', "this is a product's current link; change the product's link instead", ['fromPath']);
}

/** A hand-made forward (an old campaign link, a WordPress path). Pointing at an old link follows it to the end. */
export async function createRedirect(deps: CatalogueDeps, who: Who, input: RedirectInput): Promise<RedirectView> {
  await allow(deps, who, 'catalogue.write');
  const d = parse(redirectInput, input, 'redirect');
  const ns = await namingSettings(deps, who);
  return deps.db.$transaction(async (tx) => {
    const from = normalizePath(d.fromPath);
    await assertNotLivePage(tx, who.storeId, ns, from);
    const to = await finalTarget(tx, who.storeId, d.toPath);
    if (to === from) throw new CatalogueError('CONFLICT', 'a link cannot forward to itself', ['toPath']);
    const older = await tx.redirect.findMany({ where: { storeId: who.storeId, toPath: from, enabled: true, archivedAt: null } });
    for (const r of older) {
      await tx.redirect.update({ where: { id: r.id }, data: { toPath: to } });
      await logChange(tx, who, 'redirect.repoint', 'Redirect', r.id, { toPath: from }, { toPath: to });
    }
    const existing = await tx.redirect.findUnique({ where: { storeId_fromPath: { storeId: who.storeId, fromPath: from } } });
    const row = existing
      ? await tx.redirect.update({ where: { id: existing.id }, data: { toPath: to, enabled: true, archivedAt: null, statusCode: ns.statusCode, source: 'manual' } })
      : await tx.redirect.create({ data: { storeId: who.storeId, fromPath: from, toPath: to, statusCode: ns.statusCode, source: 'manual', enabled: true } });
    await logChange(tx, who, existing ? 'redirect.update' : 'redirect.create', 'Redirect', row.id, existing ? { toPath: existing.toPath, enabled: existing.enabled } : null, { fromPath: from, toPath: to, enabled: true });
    return redirectView(row);
  }, TX);
}

/** Switch a forward off or on, or point it elsewhere. Never deleted. */
export async function updateRedirect(deps: CatalogueDeps, who: Who, id: string, patch: RedirectPatch): Promise<RedirectView> {
  await allow(deps, who, 'catalogue.write');
  const d = parse(redirectPatch, patch, 'redirect');
  const ns = await namingSettings(deps, who);
  return deps.db.$transaction(async (tx) => {
    const cur = found(await tx.redirect.findFirst({ where: { id, storeId: who.storeId, archivedAt: null } }), 'redirect');
    const to = d.toPath !== undefined ? await finalTarget(tx, who.storeId, d.toPath) : cur.toPath;
    if (to === cur.fromPath) throw new CatalogueError('CONFLICT', 'a link cannot forward to itself', ['toPath']);
    const enabled = d.enabled ?? cur.enabled;
    if (enabled && !cur.enabled) await assertNotLivePage(tx, who.storeId, ns, cur.fromPath);
    if (to === cur.toPath && enabled === cur.enabled) return redirectView(cur);
    const row = await tx.redirect.update({ where: { id: cur.id }, data: { toPath: to, enabled } });
    await logChange(tx, who, enabled === cur.enabled ? 'redirect.update' : enabled ? 'redirect.enable' : 'redirect.disable', 'Redirect', cur.id, { toPath: cur.toPath, enabled: cur.enabled }, { toPath: to, enabled });
    return redirectView(row);
  }, TX);
}

export type PathResolution = { kind: 'product'; productId: string; slug: string; status: string } | { kind: 'redirect'; to: string; statusCode: number } | null;

/**
 * What a storefront path opens: a product by its current link, or an old link's forward (301, no chains). Read-only
 * unless `countHit` (the storefront counts a forward it follows). For the storefront (S03), which has no staff actor.
 */
export async function resolveProductPath(db: Db, settings: CatalogueDeps['settings'], storeId: number, path: string, opts: { countHit?: boolean; now?: Date } = {}): Promise<PathResolution> {
  const p = normalizePath(path);
  const prefix = await settings.value('naming.productPathPrefix', { storeId });
  const slug = slugFromPath(prefix, p);
  if (slug) {
    const product = await db.product.findFirst({ where: { storeId, slug, archivedAt: null }, select: { id: true, slug: true, status: true } });
    if (product) return { kind: 'product', productId: product.id, slug: product.slug, status: product.status };
  }
  const r = await db.redirect.findUnique({ where: { storeId_fromPath: { storeId, fromPath: p } } });
  if (!r || !r.enabled || r.archivedAt || normalizePath(r.toPath) === p) return null;
  if (opts.countHit) await db.redirect.update({ where: { id: r.id }, data: { hits: { increment: 1 }, lastHitAt: opts.now ?? new Date() } });
  return { kind: 'redirect', to: r.toPath, statusCode: r.statusCode };
}

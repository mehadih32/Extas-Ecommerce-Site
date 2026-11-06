// S11 · PR 228 — which pages the sitemaps list: the same pages that tell search engines they may be listed (each page's
// own rule, lib/shop/meta), read straight from the catalogue. Only kinds ticked in `seo.indexing` (Website › SEO):
// - pages: home; each help page that has something to say (not "Coming soon"); the sets hub while it is on; the set
//   builder while a set group is live;
// - collections: every shown collection and sub-collection (and "New in"), and each filter page the owner named
//   (`seo.filterPages`, PR 227) while it shows at least `minProducts` styles;
// - products: every published product of a shown collection (a sold-out one only while `seo.urlPolicy` keeps sold-out
//   pages listed);
// - combos: the owner's featured sets (not drafts) and each colour-pair list on sale.
// - PR 249 · journal (in pages, while the journal is on and its kind is ticked): the journal, each topic with a live
//   article, and every live article — an English one with its live Bengali twin at the twin's own link, a Bengali one
//   without an English twin alone under /bn (a Bengali article is written in Bengali and passed its review steps).
// A page's Bengali twin is named only once it passed the translation gate (`language.bengali.readyPages`, PR 588).
// The whole set is kept `seo.sitemaps.cacheMinutes` in this process (a new product shows within that time, or at once
// after "Make the sitemaps now" in the admin) and never holds more than `seo.sitemaps.maxUrls` addresses.
import { setBuilder, rulePage } from '@extas/combos';
import { getPrisma } from '@extas/db/client';
import { CATEGORY_SORTS } from '@extas/settings';
import { cartDeps } from '../shop/bag';
import { categoryData } from '../shop/catalogue';
import { filterItems } from '../shop/category-filter';
import { parseState, Q } from '../shop/category-model';
import { readPageSettings, shopContextFor } from '../shop/context';
import { loadHelp } from '../shop/help-data';
import { productPath } from '../shop/home-model';
import { ROUTES } from '../shop/routes';
import { settingsTimeoutMs, withTimeout } from '../settings';
import { filterPagePath } from './filter-pages';
import { liveSitemapPosts } from '../journal/journal';
import { capSet, type SitemapSet } from './sitemap';
import { hiddenShopPaths, isHiddenPath } from '../stages/closed';

const KEYS = [
  'seo.indexing',
  'seo.urlPolicy',
  'seo.filterPages',
  'seo.sitemaps',
  // PR 236: whether the files also name the language pairs
  'seo.hreflang',
  'category.page',
  'category.newIn',
  'combos.landing',
  'language.bengali.enabled',
  'language.bengali.readyPages',
  'naming.productPathPrefix',
  // PR 249: the journal's switch
  'blog.journal',
  // S19 · PR 652: the closed stages' shop pages stay out while their switch is off
  'stages.closedShown',
] as const;

export type SitemapSettings = Awaited<ReturnType<typeof sitemapSettings>>;
export const sitemapSettings = (storeId: number) => readPageSettings(KEYS, storeId);

/** "New in"'s own link name (from the routing table). */
const NEW_IN = ROUTES.newIn.split('/').pop()!;

/** Every page of the shop that may be listed, by kind (no database: an empty set). */
export async function collectSitemap(storeId: number, set: SitemapSettings): Promise<SitemapSet> {
  const out: SitemapSet = { pages: [], collections: [], products: [], combos: [] };
  if (!process.env.DATABASE_URL) return out;
  const ready = new Set(set['language.bengali.enabled'] ? set['language.bengali.readyPages'] : []);
  const hidden = hiddenShopPaths(set['stages.closedShown']);
  const add = (kind: keyof SitemapSet, path: string, pageKey: string, lastmod: Date | null = null) => {
    if (!isHiddenPath(path, hidden)) out[kind].push({ path, lastmod, bn: ready.has(pageKey) });
  };
  const on = set['seo.indexing'].pages;
  const db = getPrisma();
  const timeout = settingsTimeoutMs() * 10;
  const prefix = set['naming.productPathPrefix'];

  // ---- pages ----
  if (on.home) add('pages', ROUTES.home, 'home');
  if (on.help) {
    const help = await withTimeout(loadHelp(await shopContextFor(storeId, 'en')), timeout);
    for (const [slug, m] of Object.entries(help.models)) if (!m.soon) add('pages', ROUTES.help(slug), `help-${slug}`);
  }
  const deps = cartDeps();
  if (on.combosHub && set['combos.landing'].on) add('pages', ROUTES.combos, ROUTES.combos.slice(1));
  if (on.setBuilder && deps) {
    const b = await withTimeout(setBuilder(deps, { storeId, cartId: null, preview: false }), timeout).catch(() => null);
    if (b?.groups.length) add('pages', ROUTES.buildSet, ROUTES.buildSet.slice(1));
  }

  // ---- PR 249 · the journal ----
  if (on.journal && set['blog.journal'].on) {
    const bnOn = set['language.bengali.enabled'];
    const posts = await withTimeout(liveSitemapPosts(db, storeId, set['seo.sitemaps'].maxUrls), timeout);
    add('pages', ROUTES.journal, ROUTES.journal.slice(1));
    const live = await db.blogPost.findMany({
      where: { storeId, archivedAt: null, id: { in: [...posts.en, ...posts.bn].map((p) => p.id) }, category: { archivedAt: null } },
      select: { category: { select: { slug: true } } },
      distinct: ['categoryId'],
    });
    for (const t of live) if (t.category) add('pages', ROUTES.journalTopic(t.category.slug), `journal/topic/${t.category.slug}`);
    const bnById = new Map(posts.bn.map((p) => [p.id, p]));
    const paired = new Set<string>();
    for (const p of posts.en) {
      const twin = (p.twinPostId ? bnById.get(p.twinPostId) : undefined) ?? posts.bn.find((b) => b.twinPostId === p.id);
      if (twin && bnOn) paired.add(twin.id);
      const when = p.contentUpdatedAt ?? p.publishedAt ?? p.scheduledAt;
      out.pages.push({ path: ROUTES.article(p.slug), lastmod: when, bn: Boolean(twin && bnOn), ...(twin && bnOn ? { bnPath: ROUTES.article(twin.slug) } : {}) });
    }
    if (bnOn) for (const b of posts.bn) if (!paired.has(b.id)) out.pages.push({ path: ROUTES.article(b.slug), lastmod: b.contentUpdatedAt ?? b.publishedAt ?? b.scheduledAt, bn: false, only: 'bn' });
  }

  // ---- collections (and the named filter pages) ----
  if (on.category) {
    const cats = await db.category.findMany({
      where: { storeId, isVisible: true, archivedAt: null },
      select: { slug: true, updatedAt: true },
      orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
    });
    for (const c of cats) add('collections', ROUTES.category(c.slug), `collections/${c.slug}`, c.updatedAt);
    if (!cats.some((c) => c.slug === NEW_IN)) add('collections', ROUTES.newIn, `collections/${NEW_IN}`);
    const fp = set['seo.filterPages'];
    if (fp.enabled) {
      const shown = new Set(cats.map((c) => c.slug));
      const n = set['category.newIn'];
      for (const row of fp.pages) {
        if (!shown.has(row.category)) continue;
        const data = await categoryData(storeId, row.category, { slug: NEW_IN, order: n.order, days: n.days, ratings: false });
        if (!data || data.unavailable) continue;
        const items = set['category.page'].soldOut === 'hide' ? data.items.filter((i) => i.inStock) : data.items;
        const state = parseState({ [Q[row.filter]]: row.value }, CATEGORY_SORTS);
        if (filterItems(items, state, { cuts: [], chipTests: new Map() }).length >= fp.minProducts) add('collections', filterPagePath(row), `collections/${row.category}`);
      }
    }
  }

  // ---- products ----
  if (on.product) {
    const rows = await db.product.findMany({
      where: { storeId, status: 'PUBLISHED', archivedAt: null, category: { isVisible: true, archivedAt: null }, ...(set['seo.urlPolicy'].soldOutIndexed ? {} : { inStock: true }) },
      select: { slug: true, updatedAt: true },
      orderBy: [{ publishedAt: 'desc' }, { slug: 'asc' }],
      take: set['seo.sitemaps'].maxUrls,
    });
    const key = prefix.replace(/^\/+|\/+$/g, '');
    for (const p of rows) add('products', productPath(prefix, p.slug), `${key}/${p.slug}`, p.updatedAt);
  }

  // ---- combos ----
  if (on.combo) {
    const sets = await db.combo.findMany({ where: { storeId, isFeatured: true, archivedAt: null, status: { not: 'DRAFT' } }, select: { slug: true, updatedAt: true }, orderBy: [{ sortRank: 'desc' }, { slug: 'asc' }] });
    for (const s of sets) add('combos', ROUTES.combo(s.slug), `combo/${s.slug}`, s.updatedAt);
  }
  if (on.comboList && deps) {
    const rules = await db.comboAutoRule.findMany({ where: { storeId, archivedAt: null }, select: { key: true, updatedAt: true }, orderBy: { key: 'asc' } });
    for (const r of rules) {
      const page = await withTimeout(rulePage(deps, storeId, { key: r.key }), timeout).catch(() => null);
      if (page?.onSale) add('combos', ROUTES.comboRule(r.key), `combos/${r.key}`, r.updatedAt);
    }
  }

  // never more than the cap in all (a Bengali twin counts)
  return capSet(out, set['seo.sitemaps'].maxUrls);
}

interface Kept {
  at: number;
  set: SitemapSet;
}
const memo = globalThis as unknown as { __extasSitemaps?: Map<number, Kept> };

/** The store's sitemap set, kept `cacheMinutes` in this process. */
export async function sitemapSet(storeId: number, set: SitemapSettings, now = Date.now()): Promise<{ set: SitemapSet; at: Date }> {
  const map = (memo.__extasSitemaps ??= new Map());
  const hit = map.get(storeId);
  if (hit && now - hit.at < set['seo.sitemaps'].cacheMinutes * 60_000) return { set: hit.set, at: new Date(hit.at) };
  const made = await collectSitemap(storeId, set);
  map.set(storeId, { at: now, set: made });
  return { set: made, at: new Date(now) };
}

/** Forget the kept set (the admin's "Make the sitemaps now"); the next request makes it again. */
export function forgetSitemaps(storeId: number): void {
  memo.__extasSitemaps?.delete(storeId);
}

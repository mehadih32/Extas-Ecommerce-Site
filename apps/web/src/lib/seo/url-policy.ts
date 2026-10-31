// S11 · PR 527 — the permanent URL policy (Blueprint C12.1; App. answers #8 "never 404 a page that has earned rankings";
// setting `seo.urlPolicy`). A page that was on the shop keeps answering:
// - a product that is sold out, taken off or archived keeps its page (PR 36, the ghost page): honest "sold out", the
//   "tell me when it is back" form, and a row of what can be bought now from its category (`alternatives`);
//   restock makes it a normal page again by itself (its state is read on every visit);
// - a category archived after it had products on the shop answers with a short resting page (200, links on to the
//   live collections and what can be bought now) instead of "page not found" (`retiredCategoryPage`). A category that
//   never had a product on the shop has no public past, and a hidden one is the owner's choice (an add-ons group, a
//   collection being prepared): both still answer "page not found", so a name is never shown before it opens;
// - whether such a page stays listed in search engines is a switch each (`soldOutIndexed`, `retiredIndexed`); links on
//   them are always followed. Renamed links forward with their redirect (PR 590 / 235), so nothing is deleted.
import type { GhostReason } from '@extas/catalogue';
import { getPrisma } from '@extas/db/client';
import type { SeoUrlPolicy } from '@extas/settings';
import { settingsTimeoutMs, withTimeout } from '../settings';

/** Whether a product page in this state may stay listed in search engines (its kind's listing rule still applies). */
export function ghostListed(reason: GhostReason | null, policy: Pick<SeoUrlPolicy, 'soldOutIndexed' | 'retiredIndexed'>): boolean {
  if (reason === null) return true;
  return reason === 'soldOut' ? policy.soldOutIndexed : policy.retiredIndexed;
}

/** What can be bought now instead: the category's in-stock products first, then the shop's (never the product itself). */
export function pickAlternatives<C extends { id: string; inStock: boolean }>(own: readonly C[], shop: readonly C[], productId: string, max: number): C[] {
  const out: C[] = [];
  const seen = new Set([productId]);
  for (const card of [...own, ...shop]) {
    if (out.length >= max) break;
    if (!card.inStock || seen.has(card.id)) continue;
    seen.add(card.id);
    out.push(card);
  }
  return out;
}

/** How a schema.org offer names a product that cannot be bought: retired for good, or only sold out for now. */
export function retiredForGood(reason: GhostReason | null): boolean {
  return reason === 'archived';
}

interface Named {
  slug: string;
  nameEn: string;
  nameBn: string | null;
}

export interface RestingCategory extends Named {
  /** The parent collection, when it is still on the shop. */
  parent: Named | null;
}

/** The narrow database surface (tests pass the real client). */
export interface RestingDb {
  category: {
    findFirst(args: unknown): Promise<(Named & { parent: (Named & { isVisible: boolean; archivedAt: Date | null }) | null }) | null>;
  };
}

/**
 * An archived category with a public past (a product of its own or listed in it was ever published), or null. Hiding
 * is not retiring: a hidden category (add-ons, a collection being prepared) stays "page not found".
 */
export async function restingCategoryIn(db: RestingDb, storeId: number, slug: string): Promise<RestingCategory | null> {
  const wasOnShop = { publishedAt: { not: null } };
  const row = await db.category.findFirst({
    where: {
      storeId,
      slug,
      archivedAt: { not: null },
      OR: [{ products: { some: wasOnShop } }, { listings: { some: { product: wasOnShop } } }],
    },
    select: { slug: true, nameEn: true, nameBn: true, parent: { select: { slug: true, nameEn: true, nameBn: true, isVisible: true, archivedAt: true } } },
  });
  if (!row) return null;
  const p = row.parent;
  return { slug: row.slug, nameEn: row.nameEn, nameBn: row.nameBn, parent: p && p.isVisible && !p.archivedAt ? { slug: p.slug, nameEn: p.nameEn, nameBn: p.nameBn } : null };
}

/** The shop's read: null without a database, or when it is slow (the page then answers "page not found" as before). */
export async function restingCategory(storeId: number, slug: string): Promise<RestingCategory | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    return await withTimeout(restingCategoryIn(getPrisma() as unknown as RestingDb, storeId, slug), settingsTimeoutMs() * 3);
  } catch {
    return null;
  }
}

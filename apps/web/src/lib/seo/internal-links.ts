// S11 · PR 231 — the internal links engine (`seo.internalLinks`): which of the shop's own collections a collection
// page links to under "More collections". Pure: the shop's collection tree (shown ones, with their style counts) in,
// the links out — its sister collections under the same parent first, then the other main collections; never itself,
// never one without styles. Related products are PR 67's rows; related articles wait for the journal (S12).
import type { ShopCategory } from '../shop/shell-model';

export interface RelatedCollection {
  slug: string;
  nameEn: string;
  nameBn: string | null;
}

export function relatedCollections(cats: readonly ShopCategory[], slug: string, max: number): RelatedCollection[] {
  const pick = (x: { slug: string; nameEn: string; nameBn: string | null }): RelatedCollection => ({ slug: x.slug, nameEn: x.nameEn, nameBn: x.nameBn });
  const parent = cats.find((k) => k.children.some((x) => x.slug === slug)) ?? null;
  const sisters = parent ? parent.children.filter((x) => x.slug !== slug && x.count > 0).map(pick) : [];
  const own = cats.find((k) => k.slug === slug);
  // a main collection's own sub-collections first (its page leads to them), else its sisters, then the other mains
  const children = own ? own.children.filter((x) => x.count > 0).map(pick) : [];
  const mains = cats.filter((k) => k.slug !== slug && k.count > 0).map(pick);
  const out: RelatedCollection[] = [];
  for (const x of [...children, ...sisters, ...(parent && parent.count > 0 ? [pick(parent)] : []), ...mains]) {
    if (out.length >= max) break;
    if (x.slug !== slug && !out.some((y) => y.slug === x.slug)) out.push(x);
  }
  return out;
}

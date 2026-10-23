// PR 72 — what search can find, read from the catalogue: every published, not archived product of a shown category,
// and every shown category. A product is found by its name (English and Bengali), its category and that category's
// parent, its garment type, its colours (with the colour's own other names), its fabric, its brand and its address;
// a category by its names, its parent's, its garment type's and its address. Whether a product can be sold right now
// (a priced, active variant) is checked again when the results are drawn, so a stale document never shows a product.
//
// The catalogue's version — the newest change to a product, a category or a colour, and how many there are, with a
// fingerprint of the word lists and matching rules — tells the indexer whether Meilisearch is current, and the shop
// whether it may ask Meilisearch at all.
import type { PrismaClient } from '@extas/db/client';
import type { SearchDoc } from './match';
import { fingerprint, norm, words } from './text';

type Db = Pick<PrismaClient, 'product' | 'category' | 'colour'>;

const liveProduct = (storeId: number) => ({ storeId, status: 'PUBLISHED' as const, archivedAt: null, category: { isVisible: true, archivedAt: null } });

/** The words of several texts, each word once. */
function bag(...texts: Array<string | null | undefined>): string[] {
  return [...new Set(texts.flatMap((t) => words(t)))];
}

/** A slug's words ("classic-pique-polo" → classic, pique, polo). */
const slugWords = (slug: string | null | undefined) => (slug ?? '').replace(/-/g, ' ');

/** Search documents with the texts kept apart (Meilisearch weighs the name above the rest). */
export interface DocText {
  id: string;
  kind: 'product' | 'category';
  nameEn: string;
  nameBn: string;
  category: string;
  colours: string;
  more: string;
  rank: number;
}

/** Every product and category search can find in a store, as texts. */
export async function readDocTexts(db: Db, storeId: number): Promise<DocText[]> {
  const [products, categories] = await Promise.all([
    db.product.findMany({
      where: liveProduct(storeId),
      orderBy: [{ sortRank: 'desc' }, { nameEn: 'asc' }],
      select: {
        id: true,
        slug: true,
        nameEn: true,
        nameBn: true,
        sortRank: true,
        brand: { select: { name: true } },
        fabric: { select: { nameEn: true, nameBn: true } },
        category: {
          select: {
            slug: true,
            nameEn: true,
            nameBn: true,
            garmentType: { select: { nameEn: true, nameBn: true, key: true } },
            parent: { select: { nameEn: true, nameBn: true } },
          },
        },
        colours: {
          where: { archivedAt: null, colour: { archivedAt: null } },
          select: { colour: { select: { nameEn: true, nameBn: true, synonyms: true } } },
        },
      },
    }),
    db.category.findMany({
      where: { storeId, isVisible: true, archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
      select: {
        id: true,
        slug: true,
        nameEn: true,
        nameBn: true,
        sortOrder: true,
        garmentType: { select: { nameEn: true, nameBn: true, key: true } },
        parent: { select: { nameEn: true, nameBn: true, isVisible: true, archivedAt: true } },
      },
    }),
  ]);
  const out: DocText[] = products.map((p) => {
    const c = p.category;
    return {
      id: p.id,
      kind: 'product',
      nameEn: p.nameEn,
      nameBn: p.nameBn ?? '',
      category: [c?.nameEn, c?.nameBn, c?.parent?.nameEn, c?.parent?.nameBn, c?.garmentType?.nameEn, c?.garmentType?.nameBn, slugWords(c?.garmentType?.key)]
        .filter(Boolean)
        .join(' '),
      colours: p.colours.flatMap((x) => [x.colour.nameEn, x.colour.nameBn ?? '', ...x.colour.synonyms]).filter(Boolean).join(' '),
      more: [p.fabric?.nameEn, p.fabric?.nameBn, p.brand?.name, slugWords(p.slug), slugWords(c?.slug)].filter(Boolean).join(' '),
      rank: p.sortRank,
    };
  });
  for (const c of categories) {
    const parent = c.parent && c.parent.isVisible && !c.parent.archivedAt ? c.parent : null;
    out.push({
      id: c.id,
      kind: 'category',
      nameEn: c.nameEn,
      nameBn: c.nameBn ?? '',
      category: [parent?.nameEn, parent?.nameBn, c.garmentType?.nameEn, c.garmentType?.nameBn, slugWords(c.garmentType?.key)].filter(Boolean).join(' '),
      colours: '',
      more: slugWords(c.slug),
      rank: -c.sortOrder,
    });
  }
  return out;
}

/** A text document as the matcher reads it. */
export function toSearchDoc(t: DocText): SearchDoc {
  const name = bag(t.nameEn, t.nameBn);
  return { id: t.id, kind: t.kind, name, more: bag(t.category, t.colours, t.more).filter((w) => !name.includes(w)), rank: t.rank };
}

/** What the catalogue looks like now, as one short word: any change to what search reads gives a new one. */
export async function catalogueVersion(db: Db, storeId: number, rules: unknown): Promise<string> {
  const [p, c, k] = await Promise.all([
    db.product.aggregate({ where: { storeId }, _max: { updatedAt: true }, _count: { _all: true } }),
    db.category.aggregate({ where: { storeId }, _max: { updatedAt: true }, _count: { _all: true } }),
    db.colour.aggregate({ where: { storeId }, _max: { updatedAt: true }, _count: { _all: true } }),
  ]);
  const at = Math.max(p._max.updatedAt?.getTime() ?? 0, c._max.updatedAt?.getTime() ?? 0, k._max.updatedAt?.getTime() ?? 0);
  const counts = `${p._count._all}.${c._count._all}.${k._count._all}`;
  return `${at.toString(36)}-${fingerprint(counts)}-${fingerprint(JSON.stringify(rules ?? null))}`;
}

/** A query's words joined back (the form sent to Meilisearch). */
export const queryText = (ws: readonly string[]) => ws.map(norm).join(' ');

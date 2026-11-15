// PR 854 (prototype v5 Reports › Products): the page's own category filter ("All categories"). A style group holds products; the report
// keeps a style when one of its products is in the picked category (or under it), with the groups above it so the tree still reads
// (Polo → a brand's polo → its solid polo). Pure; the page loads the products. Read-only.
import { MOTHER_STORE_ID, type PrismaClient } from "@extas/db/client";
import { categoryTree } from "./areas";

/** The style rows to keep: those in `styleIds` and every group above them (rows keep their order). */
export function styleRowsFor<
  T extends { id: string | null; parentId: string | null },
>(rows: readonly T[], styleIds: ReadonlySet<string>): T[] {
  const byId = new Map(
    rows.filter((r) => r.id !== null).map((r) => [r.id as string, r]),
  );
  const keep = new Set<string>();
  for (const id of styleIds) {
    let at: string | null = byId.has(id) ? id : null;
    while (at && !keep.has(at)) {
      keep.add(at);
      at = byId.get(at)?.parentId ?? null;
    }
  }
  return rows.filter((r) => r.id !== null && keep.has(r.id));
}

export interface CategoryScope {
  /** Every category id of the picked category and below it. */
  tree: Set<string>;
  /** Products in them, and their style groups. */
  productIds: Set<string>;
  styleIds: Set<string>;
}

/** The products and style groups of one category (and its children). */
export async function categoryScope(
  db: PrismaClient,
  catId: string,
): Promise<CategoryScope> {
  const tree = await categoryTree(db, catId);
  const prods = await db.product.findMany({
    where: { storeId: MOTHER_STORE_ID, categoryId: { in: [...tree] } },
    select: { id: true, styleGroupId: true },
    take: 50_000,
  }); // hardcode-ok: a guard on the list length
  return {
    tree,
    productIds: new Set(prods.map((p) => p.id)),
    styleIds: new Set(
      prods.map((p) => p.styleGroupId).filter((x): x is string => !!x),
    ),
  };
}

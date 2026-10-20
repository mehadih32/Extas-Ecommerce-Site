// The facts the engine needs from the database: each product's categories (its own, its extra listings and every
// parent up the tree) and its collections, for the rule scopes; the category tree, for the conflict check; and the
// delivery band keys. Read once per request, never per line.
import type { Db } from './context';
import type { ScopeFacts } from './match';

/** Category id → parent id, for the store. */
export async function categoryParents(db: Db, storeId: number): Promise<Map<string, string | null>> {
  const rows = await db.category.findMany({ where: { storeId }, select: { id: true, parentId: true } });
  return new Map(rows.map((r) => [r.id, r.parentId]));
}

function lineage(id: string, parents: ReadonlyMap<string, string | null>): string[] {
  const out: string[] = [];
  for (let cur: string | null | undefined = id, guard = 0; cur && guard < 64 && !out.includes(cur); cur = parents.get(cur), guard++) out.push(cur);
  return out;
}

/** Scope facts per product id. A product that does not exist gets only its id (no category, no collection). */
export async function scopeFacts(db: Db, storeId: number, productIds: readonly string[], parents?: ReadonlyMap<string, string | null>): Promise<Map<string, ScopeFacts & { freeDelivery: boolean | null }>> {
  const ids = [...new Set(productIds)];
  const out = new Map<string, ScopeFacts & { freeDelivery: boolean | null }>();
  if (!ids.length) return out;
  const [products, listings, collections, tree] = await Promise.all([
    db.product.findMany({ where: { storeId, id: { in: ids } }, select: { id: true, categoryId: true, freeDelivery: true } }),
    db.categoryProduct.findMany({ where: { storeId, productId: { in: ids } }, select: { productId: true, categoryId: true } }),
    db.collectionProduct.findMany({ where: { storeId, productId: { in: ids }, archivedAt: null, collection: { archivedAt: null } }, select: { productId: true, collectionId: true } }),
    parents ? Promise.resolve(parents) : categoryParents(db, storeId),
  ]);
  for (const id of ids) out.set(id, { productId: id, categoryIds: [], collectionIds: [], freeDelivery: null });
  const addCats = (pid: string, cat: string | null) => {
    if (!cat) return;
    const f = out.get(pid)!;
    out.set(pid, { ...f, categoryIds: [...new Set([...f.categoryIds, ...lineage(cat, tree)])] });
  };
  for (const p of products) {
    out.set(p.id, { ...out.get(p.id)!, freeDelivery: p.freeDelivery });
    addCats(p.id, p.categoryId);
  }
  for (const l of listings) addCats(l.productId, l.categoryId);
  for (const c of collections) {
    const f = out.get(c.productId)!;
    out.set(c.productId, { ...f, collectionIds: [...new Set([...f.collectionIds, c.collectionId])] });
  }
  return out;
}

/** The store's delivery band keys (enabled or not: a rule may be prepared before a band is switched on). */
export async function bandKeys(db: Db, storeId: number): Promise<string[]> {
  const rows = await db.deliveryBand.findMany({ where: { storeId, archivedAt: null }, select: { key: true }, orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }] });
  return rows.map((r) => r.key);
}

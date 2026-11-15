// Parity round 3, lane F6 · PR 866 (prototype v5 Marketing › Tools › Shopping feed) — the two things the page's buttons do on the
// real data: "Fill N descriptions from template" (a product of the feed with no description gets the shop's own three sentences, in
// English as the shop's descriptions are; one audit line names the products; nothing already written is changed) and "Mark all as own
// brand" (the brands of the feed's products are marked as the shop's own, so Google is told no barcode is needed). Both need
// `marketing.campaigns.write` and `catalogue.write`; neither sends anything anywhere: Google and Facebook fetch the feed themselves.
import { audit, can } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { JournalError, answer, type JournalWho } from '../journal/journal';
import en from '../../../messages/admin-lane-f6.en.json';
import { feedProducts } from './merchant-feed';
import { descriptionFrom } from './shopping-feed-model';
import { body as readBody, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';

const S = MOTHER_STORE_ID;
type Db = AdminDeps['db'];
type Resolver = AdminDeps['resolver'];

async function allow(db: Db, who: JournalWho, storeId: number): Promise<void> {
  for (const perm of ['marketing.campaigns.write', 'catalogue.write'] as const)
    if (!(await can(db, who.actor, perm, { storeId }))) throw new JournalError('FORBIDDEN', 403, [perm]);
}

const sentences = () => {
  const d = (en as unknown as { lf6: { sf: { desc: { head: string; category: string; sizes: string } } } }).lf6.sf.desc;
  return { head: d.head, category: d.category, sizes: d.sizes };
};

/** Writes the template description on every feed product that has none. Returns how many were written. */
export async function fillDescriptions(db: Db, resolver: Resolver, who: JournalWho, storeId: number = S): Promise<{ filled: number }> {
  await allow(db, who, storeId);
  const { products } = await feedProducts(db, resolver, 'https://shop.invalid', storeId);
  const empty = products.filter((p) => !(p.description ?? '').trim());
  if (!empty.length) return { filled: 0 };
  const sizeRows = await db.productVariant.findMany({
    where: { storeId, productId: { in: empty.map((p) => p.id) }, archivedAt: null, active: true, sizeId: { not: null } },
    select: { productId: true, size: { select: { label: true, sortOrder: true } } },
  });
  const sizes = new Map<string, { label: string; order: number }[]>();
  for (const v of sizeRows) if (v.size) sizes.set(v.productId, [...(sizes.get(v.productId) ?? []), { label: v.size.label, order: v.size.sortOrder }]);
  const parts = sentences();
  const ids: string[] = [];
  await db.$transaction(async (tx) => {
    for (const p of empty) {
      const own = [...new Map((sizes.get(p.id) ?? []).map((s) => [s.label, s])).values()].sort((a, b) => a.order - b.order).map((s) => s.label);
      // only a product that still has none: a description written meanwhile is never overwritten
      const done = await tx.product.updateMany({
        where: { id: p.id, storeId, OR: [{ descriptionEn: null }, { descriptionEn: '' }] },
        data: { descriptionEn: descriptionFrom(parts, { title: p.title, category: p.category, sizes: own }) },
      });
      if (done.count) ids.push(p.id);
    }
  });
  if (ids.length) await audit(db, who.actor, { storeId, action: 'feed.descriptions.fill', entityType: 'Product', entityId: ids[0]!, before: {}, after: { count: ids.length, productIds: ids.slice(0, 200) } }, who.ctx); // hardcode-ok: an audit list cap
  return { filled: ids.length };
}

/** Marks the brand of every feed product as the shop's own. Returns how many brands were changed. */
export async function markOwnBrand(db: Db, resolver: Resolver, who: JournalWho, storeId: number = S): Promise<{ brands: number }> {
  await allow(db, who, storeId);
  const rows = await db.brand.findMany({ where: { storeId, archivedAt: null, isOwnLabel: false, products: { some: { status: 'PUBLISHED', archivedAt: null } } }, select: { id: true } });
  void resolver;
  if (!rows.length) return { brands: 0 };
  await db.brand.updateMany({ where: { storeId, id: { in: rows.map((b) => b.id) } }, data: { isOwnLabel: true } });
  await audit(db, who.actor, { storeId, action: 'feed.brands.own', entityType: 'Brand', entityId: rows[0]!.id, before: {}, after: { brandIds: rows.map((b) => b.id) } }, who.ctx);
  return { brands: rows.length };
}

/** POST /api/admin/marketing/shopping-feed {action: 'fillDescriptions' | 'ownBrand'} (`marketing.campaigns.write` and `catalogue.write`, checked again inside). */
export async function shoppingFeedHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'marketing.campaigns.write', storeId: S });
  if (g instanceof Response) return g;
  const b = (await readBody(request)) as { action?: unknown };
  try {
    const who = { actor: g.actor, ctx: g.ctx };
    if (b.action === 'fillDescriptions') return json({ ok: true, ...(await fillDescriptions(deps!.db, deps!.resolver, who)) });
    if (b.action === 'ownBrand') return json({ ok: true, ...(await markOwnBrand(deps!.db, deps!.resolver, who)) });
    return fail(400, 'INVALID_INPUT', ['action']);
  } catch (e) {
    return answer(e);
  }
}

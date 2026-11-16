// PR 906 (prototype Customer 360: "Sizes & favourites", "MRP value", "Discount received", "Influencer code") — what one
// person buys and how, read from the order lines already stored; nothing is written and nothing is added to the database.
// - pieces, MRP value (each line at the higher of its price and its crossed-out price) and the discount received (what the
//   shop's prices and offers took off that MRP, plus the order discounts), over every order that is not cancelled;
// - the usual size in each category (and whether it is always the same) and the favourite categories by pieces;
// - the influencer code: the first order of his that used the code of a partner of Marketing › Influencers & affiliates.
// Reading needs `customers.read`; a merged profile reads as its survivor, the orders are the whole family's.
import { z } from 'zod';
import { allow, UUID, type CustomersDeps, type Who } from './context';
import { CustomersError } from './errors';
import { familyOf, familyOrderWhere } from './family';

export interface TasteSize {
  categoryId: string | null;
  nameEn: string | null;
  nameBn: string | null;
  size: string;
  /** Every piece in this category was this size. */
  always: boolean;
  pieces: number;
}

export interface TasteCategory {
  categoryId: string | null;
  nameEn: string | null;
  nameBn: string | null;
  pieces: number;
}

export interface CustomerTaste {
  pieces: number;
  /** Every piece at its crossed-out price when it has one, else its price. */
  mrpMinor: number;
  /** MRP less what he paid for the goods, plus the order discounts (never below 0). */
  discountMinor: number;
  usual: TasteSize[];
  categories: TasteCategory[];
  influencer: { code: string; name: string; platform: string | null; orderNumber: string } | null;
}

const idInput = z.string().regex(UUID);

/** Pure: the figures from the order lines (so they can be tested without a database). */
export function tasteOf(
  orders: { id: string; number: string; placedAt: Date; subtotalMinor: number; discountMinor: number; couponCode: string | null }[],
  items: { orderId: string; productId: string | null; sizeLabel: string | null; quantity: number; unitPriceMinor: number; compareAtMinor: number | null }[],
  categoryOf: Map<string, string | null>,
  names: Map<string, { nameEn: string; nameBn: string | null }>,
  partners: Map<string, { name: string; platform: string | null }>,
): CustomerTaste {
  let pieces = 0;
  let mrp = 0;
  const bySize = new Map<string, Map<string, number>>();
  const byCat = new Map<string, number>();
  for (const it of items) {
    pieces += it.quantity;
    mrp += Math.max(it.unitPriceMinor, it.compareAtMinor ?? it.unitPriceMinor) * it.quantity;
    const cat = (it.productId ? categoryOf.get(it.productId) : null) ?? '';
    byCat.set(cat, (byCat.get(cat) ?? 0) + it.quantity);
    if (it.sizeLabel) {
      const m = bySize.get(cat) ?? new Map<string, number>();
      m.set(it.sizeLabel, (m.get(it.sizeLabel) ?? 0) + it.quantity);
      bySize.set(cat, m);
    }
  }
  const sold = orders.reduce((a, o) => a + o.subtotalMinor, 0);
  const orderDiscounts = orders.reduce((a, o) => a + o.discountMinor, 0);
  const nameOf = (cat: string) => ({ categoryId: cat || null, nameEn: cat ? (names.get(cat)?.nameEn ?? null) : null, nameBn: cat ? (names.get(cat)?.nameBn ?? null) : null });
  const usual: TasteSize[] = [...bySize.entries()]
    .map(([cat, m]) => {
      const e = [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
      const total = e.reduce((a, x) => a + x[1], 0);
      return { ...nameOf(cat), size: e[0]![0], always: e[0]![1] === total, pieces: total };
    })
    .sort((a, b) => b.pieces - a.pieces);
  const categories: TasteCategory[] = [...byCat.entries()].map(([cat, n]) => ({ ...nameOf(cat), pieces: n })).sort((a, b) => b.pieces - a.pieces);
  const first = [...orders].sort((a, b) => a.placedAt.getTime() - b.placedAt.getTime()).find((o) => o.couponCode && partners.has(o.couponCode.toLowerCase()));
  const partner = first?.couponCode ? partners.get(first.couponCode.toLowerCase()) : undefined;
  return {
    pieces,
    mrpMinor: mrp,
    discountMinor: Math.max(0, mrp - sold + orderDiscounts),
    usual,
    categories,
    influencer: first && partner ? { code: first.couponCode!, name: partner.name, platform: partner.platform, orderNumber: first.number } : null,
  };
}

/** One person's buying taste (see the file header). */
export async function customerTaste(deps: CustomersDeps, who: Who, id: string): Promise<CustomerTaste> {
  await allow(deps, who, 'customers.read');
  const ok = idInput.safeParse(id);
  const found = ok.success ? await familyOf(deps.db, who.storeId, id) : null;
  if (!found || found.family.root.erasedAt) throw new CustomersError('NOT_FOUND', 'no such customer', ['customerId']);
  const orders = await deps.db.order.findMany({
    where: { ...familyOrderWhere(who.storeId, found.family), status: { not: 'CANCELLED' } },
    select: { id: true, number: true, placedAt: true, subtotalMinor: true, discountMinor: true, couponCode: true },
  });
  if (!orders.length) return tasteOf([], [], new Map(), new Map(), new Map());
  const items = await deps.db.orderItem.findMany({
    where: { storeId: who.storeId, orderId: { in: orders.map((o) => o.id) }, status: 'ACTIVE' },
    select: { orderId: true, productId: true, sizeLabel: true, quantity: true, unitPriceMinor: true, compareAtMinor: true },
  });
  const productIds = [...new Set(items.map((i) => i.productId).filter((x): x is string => !!x))];
  const products = productIds.length ? await deps.db.product.findMany({ where: { storeId: who.storeId, id: { in: productIds } }, select: { id: true, categoryId: true } }) : [];
  const categoryOf = new Map(products.map((p) => [p.id, p.categoryId]));
  const catIds = [...new Set(products.map((p) => p.categoryId).filter((x): x is string => !!x))];
  const cats = catIds.length ? await deps.db.category.findMany({ where: { storeId: who.storeId, id: { in: catIds } }, select: { id: true, nameEn: true, nameBn: true } }) : [];
  const codes = [...new Set(orders.map((o) => o.couponCode).filter((x): x is string => !!x))];
  const partnerRows = codes.length
    ? await deps.db.affiliateCode.findMany({ where: { storeId: who.storeId, code: { in: codes, mode: 'insensitive' } }, select: { code: true, affiliate: { select: { name: true, platform: true } } } })
    : [];
  return tasteOf(
    orders,
    items,
    categoryOf,
    new Map(cats.map((c) => [c.id, { nameEn: c.nameEn, nameBn: c.nameBn }])),
    new Map(partnerRows.map((p) => [p.code.toLowerCase(), { name: p.affiliate.name, platform: p.affiliate.platform }])),
  );
}

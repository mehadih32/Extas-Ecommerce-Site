// PR 785 (lane D1, prototype v5 parity, m-products.js renderStock): what the Stock page's top part reads: the five figures
// (pieces on the shop, stock value at the buying price, held for open orders, sizes almost out, sizes sold out), the products
// that run out soon, the stuck stock, and the "Stock by product" rows with each colour and size. Read only: nothing here writes.
import { SOLD_STATUS } from '@extas/catalogue';
import type { InventoryDeps } from '@extas/inventory';

const DAY_MS = 86_400_000;

export interface StockCell {
  size: string;
  available: number;
  held: number;
}
export interface StockProductRow {
  id: string;
  nameEn: string;
  nameBn: string | null;
  style: string | null;
  stock: number;
  held: number;
  sold30: number;
  /** Days the stock lasts at the 30-day pace; null: nothing sold. */
  days: number | null;
  valueMinor: number | null;
  low: boolean;
  hasOut: boolean;
  sizes: string[];
  colours: { name: string; nameBn: string | null; hex: string | null; cells: (StockCell | null)[] }[];
  lowSizes: { colour: string; size: string; available: number }[];
}
export interface StockOverview {
  pieces: number;
  valueMinor: number | null;
  held: number;
  lowSizes: number;
  outSizes: number;
  deadCount: number;
  deadValueMinor: number | null;
  products: StockProductRow[];
  warehouse: string | null;
}

/** Days the stock lasts at the last 30 days' pace (null: nothing sold). */
export const stockDays = (stock: number, sold30: number): number | null => (sold30 > 0 ? Math.floor(stock / (sold30 / 30)) : null);

export async function loadStockOverview(deps: InventoryDeps, storeId: number, lowPieces: number, showsCost: boolean): Promise<StockOverview> {
  const db = deps.db;
  const now = (deps.now ?? (() => new Date()))();
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const [variants, levels, sold, location] = await Promise.all([
    db.productVariant.findMany({
      where: { storeId, archivedAt: null, product: { storeId, status: 'PUBLISHED', archivedAt: null, isDemo: false } },
      select: {
        id: true,
        productId: true,
        shopPriceMinor: true,
        avgCostMinor: true,
        colour: { select: { nameEn: true, nameBn: true, hex: true } },
        size: { select: { label: true, sortOrder: true } },
        product: { select: { nameEn: true, nameBn: true, erpStyleCode: true } },
      },
    }),
    db.stockLevel.groupBy({ by: ['variantId'], where: { variant: { storeId } }, _sum: { available: true, reserved: true } }),
    db.orderItem.groupBy({ by: ['productId'], where: { storeId, productId: { not: null }, status: 'ACTIVE', order: { status: { in: [...SOLD_STATUS] }, placedAt: { gte: since } } }, _sum: { quantity: true } }),
    db.inventoryLocation.findFirst({ where: { archivedAt: null, stockLevels: { some: { variant: { storeId } } } }, orderBy: { createdAt: 'asc' }, select: { name: true } }).catch(() => null),
  ]);
  const lv = new Map(levels.map((l) => [l.variantId, { available: Math.max(0, l._sum.available ?? 0), held: Math.max(0, l._sum.reserved ?? 0) }]));
  const soldBy = new Map(sold.map((r) => [r.productId as string, r._sum.quantity ?? 0]));
  const byProduct = new Map<string, typeof variants>();
  for (const v of variants) byProduct.set(v.productId, [...(byProduct.get(v.productId) ?? []), v]);
  const products: StockProductRow[] = [];
  for (const [id, vs] of byProduct) {
    const p = vs[0]!.product;
    const sizes = [...new Map(vs.filter((v) => v.size).map((v) => [v.size!.label, v.size!.sortOrder])).entries()].sort((a, b) => a[1] - b[1]).map(([l]) => l);
    const colourKeys = [...new Map(vs.map((v) => [v.colour?.nameEn ?? '—', v.colour])).entries()];
    const at = (v: (typeof vs)[number]) => lv.get(v.id) ?? { available: 0, held: 0 };
    const stock = vs.reduce((n, v) => n + at(v).available, 0);
    const cost = vs.reduce((n, v) => n + at(v).available * (v.shopPriceMinor ?? v.avgCostMinor ?? 0), 0);
    const sold30 = soldBy.get(id) ?? 0;
    products.push({
      id,
      nameEn: p.nameEn,
      nameBn: p.nameBn,
      style: p.erpStyleCode,
      stock,
      held: vs.reduce((n, v) => n + at(v).held, 0),
      sold30,
      days: stockDays(stock, sold30),
      valueMinor: showsCost ? cost : null,
      low: vs.some((v) => at(v).available <= lowPieces),
      hasOut: vs.some((v) => at(v).available === 0),
      sizes,
      colours: colourKeys.map(([name, c]) => ({
        name,
        nameBn: c?.nameBn ?? null,
        hex: c?.hex ?? null,
        cells: sizes.map((s) => {
          const v = vs.find((x) => (x.colour?.nameEn ?? '—') === name && x.size?.label === s);
          return v ? { size: s, available: at(v).available, held: at(v).held } : null;
        }),
      })),
      lowSizes: vs
        .filter((v) => at(v).available <= lowPieces)
        .map((v) => ({ colour: v.colour?.nameEn ?? '—', size: v.size?.label ?? '', available: at(v).available })),
    });
  }
  // the prototype's order: the products that run out first come first
  products.sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999) || b.sold30 - a.sold30);
  const dead = products.filter((p) => p.sold30 === 0 && p.stock > 30);
  const allVariants = variants.map((v) => lv.get(v.id) ?? { available: 0, held: 0 });
  return {
    pieces: products.reduce((n, p) => n + p.stock, 0),
    valueMinor: showsCost ? products.reduce((n, p) => n + (p.valueMinor ?? 0), 0) : null,
    held: products.reduce((n, p) => n + p.held, 0),
    lowSizes: allVariants.filter((x) => x.available <= lowPieces).length,
    outSizes: allVariants.filter((x) => x.available === 0).length,
    deadCount: dead.length,
    deadValueMinor: showsCost ? dead.reduce((n, p) => n + (p.valueMinor ?? 0), 0) : null,
    products,
    warehouse: location?.name ?? null,
  };
}

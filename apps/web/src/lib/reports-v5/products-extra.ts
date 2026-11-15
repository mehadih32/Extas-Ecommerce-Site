// PR 863 (prototype v5 Reports › Products, the rest of the page): the size-demand heat maps (tops and bottoms), colour demand, "Looked at a
// lot, bought little", return rate by product and the All products table. Pure sums over the period's order lines and the live products'
// 30-day facts (`loadRankInputs`); the loader below reads them. Read-only: nothing is changed here. A category filter narrows the products.
import { MOTHER_STORE_ID, type PrismaClient } from "@extas/db/client";
import { daysPeriod } from "@extas/metrics";
import { MIN_FINISHED } from "./delivery";

const S = MOTHER_STORE_ID;

/** The sizes the prototype's two heat maps have as columns. */
export const TOP_SIZES = ["S", "M", "L", "XL", "XXL"] as const;
export const BOTTOM_SIZES = ["30", "32", "34", "36", "38"] as const;
/** Colours in the colour-demand bars, and rows in the short lists (the prototype's own counts). */
const COLOURS_SHOWN = 8; // hardcode-ok: the prototype's own list length
const LIST_SHOWN = 8; // hardcode-ok: the prototype's own list length

export interface ExtraLine {
  productId: string | null;
  size: string | null;
  colour: string | null;
  qty: number;
  totalMinor: number;
  /** Cost of one piece (the ERP's snapshot); null = not known. */
  unitCostMinor: number | null;
  /** The order's status (OrderStatus). */
  status: string;
}
export interface ExtraProduct {
  id: string;
  name: string;
  categoryId: string | null;
  sold30: number;
  views30: number;
  stockDays: number | null;
}
export interface ExtraCategory {
  id: string;
  parentId: string | null;
  nameEn: string;
  nameBn: string | null;
}

export interface DemandRow {
  categoryId: string;
  nameEn: string;
  nameBn: string | null;
  /** Pieces per size column, in the column order. */
  pieces: number[];
  total: number;
}
export interface AllRow {
  productId: string;
  name: string;
  category: { en: string; bn: string | null } | null;
  pieces: number;
  salesMinor: number;
  /** Margin on the costed sales, in percent; null with no sales or no cost. */
  marginPct: number | null;
  /** Share of finished pieces that came back, in percent; null with none finished. */
  returnPct: number | null;
  stockDays: number | null;
}
export interface ProductsExtra {
  tops: DemandRow[];
  bottoms: DemandRow[];
  colours: { name: string; pieces: number }[];
  lookers: {
    productId: string;
    name: string;
    views: number;
    sold: number;
    conv: number;
  }[];
  returns: {
    productId: string;
    name: string;
    finished: number;
    returned: number;
    pct: number;
  }[];
  all: AllRow[];
}

const LIVE_OUT = new Set(["CANCELLED", "DRAFT"]);
const FINISHED = new Set(["DELIVERED", "PARTIALLY_DELIVERED", "RETURNED"]);

/** The top-level category a category sits under. */
export function rootOf(
  id: string | null,
  cats: ReadonlyMap<string, ExtraCategory>,
): ExtraCategory | null {
  let at = id ? cats.get(id) : undefined;
  for (
    let guard = 0;
    at?.parentId && cats.has(at.parentId) && guard < 20;
    guard++
  )
    at = cats.get(at.parentId); // hardcode-ok: a guard against a loop in the tree
  return at ?? null;
}

const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0);

/** Everything the rest of the Products page draws. `pool` = the products to count (all, or the category filter's). */
export function productsExtra(i: {
  lines: readonly ExtraLine[];
  products: readonly ExtraProduct[];
  categories: readonly ExtraCategory[];
  pool?: ReadonlySet<string> | null;
}): ProductsExtra {
  const cats = new Map(i.categories.map((c) => [c.id, c]));
  const prods = new Map(i.products.map((p) => [p.id, p]));
  const inPool = (id: string | null) =>
    !!id && prods.has(id) && (!i.pool || i.pool.has(id));
  const lines = i.lines.filter((l) => inPool(l.productId));
  const live = lines.filter((l) => !LIVE_OUT.has(l.status));

  // size demand: pieces per top category and size; a numeric size is a bottom, the others a top
  const sz = new Map<string, Map<string, number>>();
  const col = new Map<string, number>();
  for (const l of live) {
    const root = rootOf(prods.get(l.productId!)?.categoryId ?? null, cats);
    if (root && l.size) {
      const m = sz.get(root.id) ?? new Map<string, number>();
      m.set(l.size, (m.get(l.size) ?? 0) + l.qty);
      sz.set(root.id, m);
    }
    if (l.colour) col.set(l.colour, (col.get(l.colour) ?? 0) + l.qty);
  }
  const heat = (sizes: readonly string[]): DemandRow[] =>
    [...sz.entries()]
      .map(([id, m]) => {
        const c = cats.get(id)!;
        const pieces = sizes.map((s) => m.get(s) ?? 0);
        return {
          categoryId: id,
          nameEn: c.nameEn,
          nameBn: c.nameBn,
          pieces,
          total: pieces.reduce((n, x) => n + x, 0),
        };
      })
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total);
  const colours = [...col.entries()]
    .map(([name, pieces]) => ({ name, pieces }))
    .sort((a, b) => b.pieces - a.pieces || a.name.localeCompare(b.name))
    .slice(0, COLOURS_SHOWN);

  // looked at a lot, bought little: the products seen at least as often as the average product, the lowest buy rate first
  const pooled = i.products.filter((p) => inPool(p.id));
  const seen = pooled.filter((p) => p.views30 > 0);
  const avgViews = seen.length
    ? seen.reduce((n, p) => n + p.views30, 0) / seen.length
    : 0;
  const lookers = seen
    .filter((p) => p.views30 >= avgViews)
    .map((p) => ({
      productId: p.id,
      name: p.name,
      views: p.views30,
      sold: p.sold30,
      conv: pct(p.sold30, p.views30),
    }))
    .sort((a, b) => a.conv - b.conv || b.views - a.views)
    .slice(0, LIST_SHOWN);

  // returns and sales per product
  const per = new Map<
    string,
    {
      qty: number;
      sales: number;
      costed: number;
      cost: number;
      fin: number;
      ret: number;
    }
  >();
  for (const l of lines) {
    const p = per.get(l.productId!) ?? {
      qty: 0,
      sales: 0,
      costed: 0,
      cost: 0,
      fin: 0,
      ret: 0,
    };
    if (!LIVE_OUT.has(l.status)) {
      p.qty += l.qty;
      p.sales += l.totalMinor;
      if (l.unitCostMinor !== null) {
        p.costed += l.totalMinor;
        p.cost += l.unitCostMinor * l.qty;
      }
    }
    if (FINISHED.has(l.status)) {
      p.fin += l.qty;
      if (l.status === "RETURNED") p.ret += l.qty;
    }
    per.set(l.productId!, p);
  }
  const returns = [...per.entries()]
    .filter(([, p]) => p.fin >= MIN_FINISHED && p.ret > 0)
    .map(([id, p]) => ({
      productId: id,
      name: prods.get(id)!.name,
      finished: p.fin,
      returned: p.ret,
      pct: pct(p.ret, p.fin),
    }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, LIST_SHOWN);
  const all: AllRow[] = pooled.map((p) => {
    const x = per.get(p.id);
    const root = rootOf(p.categoryId, cats);
    return {
      productId: p.id,
      name: p.name,
      category: root ? { en: root.nameEn, bn: root.nameBn } : null,
      pieces: x?.qty ?? 0,
      salesMinor: x?.sales ?? 0,
      marginPct: x && x.costed > 0 ? pct(x.costed - x.cost, x.costed) : null,
      returnPct: x && x.fin > 0 ? pct(x.ret, x.fin) : null,
      stockDays: p.stockDays,
    };
  });
  return {
    tops: heat(TOP_SIZES),
    bottoms: heat(BOTTOM_SIZES),
    colours,
    lookers,
    returns,
    all,
  };
}

/** Reads the period's order lines, the live products' 30-day facts and the category tree, then sums them. */
export async function loadProductsExtra(
  db: PrismaClient,
  rank: {
    inputs: readonly {
      productId: string;
      sold30: number;
      views30: number;
      stockDays: number | null;
    }[];
    names: ReadonlyMap<string, { name: string; categoryId: string | null }>;
  },
  tz: string,
  from: string,
  to: string,
  pool: ReadonlySet<string> | null,
  scope: { isPractice?: false } = {},
): Promise<ProductsExtra> {
  const per = daysPeriod(from, to, tz);
  const [items, categories] = await Promise.all([
    db.orderItem.findMany({
      where: {
        storeId: S,
        status: "ACTIVE",
        productId: { not: null },
        order: { placedAt: { gte: per.from, lt: per.to }, ...scope },
      },
      select: {
        productId: true,
        sizeLabel: true,
        colourName: true,
        quantity: true,
        lineTotalMinor: true,
        unitCostMinor: true,
        order: { select: { status: true } },
      },
      take: 200_000, // hardcode-ok: a guard on the list length
    }),
    db.category.findMany({
      where: { storeId: S },
      select: { id: true, parentId: true, nameEn: true, nameBn: true },
      take: 5_000,
    }), // hardcode-ok: a guard on the list length
  ]);
  return productsExtra({
    lines: items.map((x) => ({
      productId: x.productId,
      size: x.sizeLabel,
      colour: x.colourName,
      qty: x.quantity,
      totalMinor: x.lineTotalMinor,
      unitCostMinor: x.unitCostMinor,
      status: x.order.status,
    })),
    products: rank.inputs.map((r) => ({
      id: r.productId,
      name: rank.names.get(r.productId)?.name ?? "",
      categoryId: rank.names.get(r.productId)?.categoryId ?? null,
      sold30: r.sold30,
      views30: r.views30,
      stockDays: r.stockDays,
    })),
    categories,
    pool,
  });
}

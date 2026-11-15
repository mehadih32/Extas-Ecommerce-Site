// PR 863 — Reports › Products, the rest of the page: size heat maps, colour demand, looked at a lot / bought little, returns by product and
// the All products table, from order lines and the live products' 30-day facts.
import { describe, expect, it } from "vitest";
import {
  productsExtra,
  rootOf,
  type ExtraCategory,
  type ExtraLine,
  type ExtraProduct,
} from "./products-extra";

const cats: ExtraCategory[] = [
  { id: "tops", parentId: null, nameEn: "Tops", nameBn: "টপস" },
  { id: "polo", parentId: "tops", nameEn: "Polo", nameBn: null },
  { id: "pants", parentId: null, nameEn: "Pants", nameBn: null },
];
const prod = (
  id: string,
  categoryId: string,
  over: Partial<ExtraProduct> = {},
): ExtraProduct => ({
  id,
  name: id.toUpperCase(),
  categoryId,
  sold30: 0,
  views30: 0,
  stockDays: null,
  ...over,
});
const line = (
  productId: string,
  size: string,
  qty: number,
  over: Partial<ExtraLine> = {},
): ExtraLine => ({
  productId,
  size,
  colour: "Black",
  qty,
  totalMinor: qty * 1000,
  unitCostMinor: 600,
  status: "DELIVERED",
  ...over,
});
const products = [
  prod("a", "polo", { sold30: 10, views30: 400, stockDays: 12 }),
  prod("b", "pants", { sold30: 1, views30: 500 }),
  prod("c", "polo", { sold30: 5, views30: 20 }),
];

describe("rootOf", () => {
  const m = new Map(cats.map((c) => [c.id, c]));
  it("walks up to the top category and gives null for an unknown one", () => {
    expect(rootOf("polo", m)?.id).toBe("tops");
    expect(rootOf("tops", m)?.id).toBe("tops");
    expect(rootOf(null, m)).toBeNull();
    expect(rootOf("zz", m)).toBeNull();
  });
  it("stops on a loop in the tree", () => {
    const loop = new Map<string, ExtraCategory>([
      ["x", { id: "x", parentId: "y", nameEn: "X", nameBn: null }],
      ["y", { id: "y", parentId: "x", nameEn: "Y", nameBn: null }],
    ]);
    expect(rootOf("x", loop)).not.toBeNull();
  });
});

describe("Size and colour demand", () => {
  const lines = [
    line("a", "M", 6),
    line("a", "L", 3),
    line("a", "XL", 1),
    line("b", "32", 4),
    line("b", "34", 1),
    line("a", "M", 9, { status: "CANCELLED" }),
    line("c", "M", 2, { colour: "Navy" }),
  ];
  const x = productsExtra({ lines, products, categories: cats });
  it("counts live pieces per top category and size, numeric sizes as bottoms, cancelled orders left out", () => {
    expect(x.tops).toHaveLength(1);
    expect(x.tops[0]).toMatchObject({
      categoryId: "tops",
      nameEn: "Tops",
      pieces: [0, 8, 3, 1, 0],
      total: 12,
    });
    expect(x.bottoms[0]).toMatchObject({
      categoryId: "pants",
      pieces: [0, 4, 1, 0, 0],
      total: 5,
    });
  });
  it("lists colours by pieces, most first", () => {
    expect(x.colours).toEqual([
      { name: "Black", pieces: 15 },
      { name: "Navy", pieces: 2 },
    ]);
  });
  it("a category filter keeps only its products", () => {
    const only = productsExtra({
      lines,
      products,
      categories: cats,
      pool: new Set(["b"]),
    });
    expect(only.tops).toEqual([]);
    expect(only.bottoms[0]!.total).toBe(5);
    expect(only.all.map((r) => r.productId)).toEqual(["b"]);
  });
  it("a size outside the heat map columns is not counted", () => {
    expect(
      productsExtra({
        lines: [line("a", "XXXL", 5)],
        products,
        categories: cats,
      }).tops,
    ).toEqual([]);
  });
});

describe("Looked at a lot, bought little", () => {
  it("keeps the products seen at least as often as the average and puts the lowest buy rate first", () => {
    const x = productsExtra({ lines: [], products, categories: cats });
    expect(x.lookers.map((l) => l.productId)).toEqual(["b", "a"]);
    expect(x.lookers[0]).toMatchObject({ views: 500, sold: 1 });
    expect(x.lookers[0]!.conv).toBeCloseTo(0.2);
  });
  it("is empty when nobody was seen", () => {
    expect(
      productsExtra({
        lines: [],
        products: [prod("a", "polo")],
        categories: cats,
      }).lookers,
    ).toEqual([]);
  });
});

describe("Returns and the All products table", () => {
  const lines = [
    line("a", "M", 4),
    line("a", "M", 2, { status: "RETURNED" }),
    line("b", "32", 2),
    line("b", "32", 1, { status: "RETURNED" }),
    line("c", "M", 5),
    line("c", "M", 1, { status: "RETURNED" }),
    line("c", "M", 3, { status: "IN_TRANSIT" }),
  ];
  const x = productsExtra({ lines, products, categories: cats });
  it("a product needs 3 finished pieces and a return to be listed; highest share first", () => {
    expect(
      x.returns.map((r) => [
        r.productId,
        r.finished,
        r.returned,
        Math.round(r.pct),
      ]),
    ).toEqual(
      [
        ["a", 6, 2, 33],
        ["c", 6, 1, 17],
        ["b", 3, 1, 33],
      ].sort((p, q) => (q[3] as number) - (p[3] as number)),
    );
  });
  it("gives pieces, sales, margin, return share and days of stock per product", () => {
    const a = x.all.find((r) => r.productId === "a")!;
    expect(a).toMatchObject({
      pieces: 6,
      salesMinor: 6000,
      stockDays: 12,
      category: { en: "Tops", bn: "টপস" },
    });
    expect(a.marginPct).toBeCloseTo(40);
    expect(a.returnPct).toBeCloseTo(33.33, 1);
  });
  it("margin is unknown without a cost, return share without a finished piece", () => {
    const y = productsExtra({
      lines: [line("a", "M", 2, { unitCostMinor: null, status: "IN_TRANSIT" })],
      products,
      categories: cats,
    });
    const a = y.all.find((r) => r.productId === "a")!;
    expect(a.marginPct).toBeNull();
    expect(a.returnPct).toBeNull();
    expect(a.pieces).toBe(2);
  });
  it("a line of a product the shop no longer lists is ignored", () => {
    expect(
      productsExtra({
        lines: [line("gone", "M", 9)],
        products,
        categories: cats,
      }).tops,
    ).toEqual([]);
  });
});

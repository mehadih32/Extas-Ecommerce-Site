// S28 · PR 706 (CN-049) — the practice data seeder. Fills a store with the admin prototype's sample world so the owner can
// practise on the real admin: ~90 orders over six months in every status (New, Confirmed, Booked, Packed, Handed over,
// Delivered, Paid, Returned, Cancelled, also Processing, On hold and Awaiting advance), 60 sample customers, 24 sample
// products, 18 incomplete orders, courier payouts and courier claims, with the prototype's names, areas, prices and
// couriers. Rules:
//  - Deterministic: the same `now` gives the same data (a fixed seed, ids made from the record's own key).
//  - Idempotent: when practice orders already exist only missing product details are added ("already").
//  - Every row it makes carries `isPractice = true`, so "Reset practice data" removes exactly these rows and nothing else.
//  - It touches nothing outside the system: no ERP push, no courier call, no message, no stock movement, no
//    reservation, no payment gateway. A practice product is complete (category, colours, sizes, stock levels, size chart,
//    fabric, description; no photo) and pressing the button again completes older empty ones. Practice products are DRAFT (never on the live shop) and every practice phone
//    number is in a reserved range that no operator uses.
// Tables that are not on `main` yet are skipped (see docs/demo/admin-proto-v5/gap/PRACTICE-TODO.md).
import { createHash } from 'node:crypto';
import { completeExtras } from './demo-extras';
import { pickGrade, practiceLevels } from './grades';
import { practiceId } from './ids';
import { PRACTICE_PHONE_PREFIX, type Prisma, type PrismaClient } from '@extas/db/client';
import {
  ADS_SOURCES,
  CANCEL_CODES,
  CHANNELS,
  COURIERS,
  DEMO_PACK,
  DELIVERY_FEE,
  DHAKA_AREAS,
  FIRST_NAMES,
  FREE_DELIVERY_OVER,
  HOLD_CODES,
  LAST_NAMES,
  ORDER_PLAN,
  RICH_ORDER_TOTAL,
  RICH_PLAN,
  OUTSIDE_AREAS,
  PAYMENTS,
  PRACTICE_CUSTOMERS,
  PRACTICE_INCOMPLETE,
  PRACTICE_SLUG,
  RICH,
  RICH_ADS,
  RICH_REVIEW_BODIES,
  SUB_AREAS,
  type DemoStyle,
  type OrderKind,
  type Zone,
} from './data';

type Db = PrismaClient;
const DAY = 86_400_000; // hardcode-ok: milliseconds in a day
const HOUR = 3_600_000; // hardcode-ok: milliseconds in an hour
const RICH_DONE_SHARE = 0.9; // hardcode-ok: a store with at least this share of the big set's orders counts as done
const SEED = 20_261_112; // hardcode-ok: the prototype's own seed, so the practice world matches the prototype's

export interface SeedResult {
  seeded: boolean;
  reason?: 'already' | 'no-store';
  counts: Record<string, number>;
}

export { practiceId };

function makeRng(seed: number) {
  let s = seed;
  const next = () => {
    s = (s * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return s / 4_294_967_296;
  };
  const int = (a: number, b: number) => Math.floor(a + next() * (b - a + 1));
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)]!;
  const weighted = <T>(pairs: readonly (readonly [T, number])[]): T => {
    const total = pairs.reduce((n, p) => n + p[1], 0);
    let r = next() * total;
    for (const p of pairs) if ((r -= p[1]) <= 0) return p[0];
    return pairs[0]![0];
  };
  return { next, int, pick, weighted };
}

interface Cust {
  id: string;
  name: string;
  phone: string;
  zone: Zone;
  district: string;
  area: string;
  createdAt: Date;
  orders: number;
  delivered: number;
  returned: number;
  ltv: number;
  last: Date | null;
}
interface Variant {
  id: string;
  productId: string;
  name: string;
  sku: string;
  colour: string;
  size: string;
  priceMinor: number;
  costMinor: number;
}

export interface ProductPlan {
  products: Prisma.ProductCreateManyInput[];
  variantRows: Prisma.ProductVariantCreateManyInput[];
  variants: Variant[];
  /** product id → the demo style it is and its SKUs (the completion needs both) */
  meta: Map<
    string,
    {
      style: DemoStyle;
      skus: { id: string; colour: string; size: string; sku: string; qty: number }[];
    }
  >;
}

/**
 * The practice products and variants: the approved demo's 72 styles (names, prices with struck prices, colours, sizes,
 * stock, fabric, care, fit and text as the demo has them). It is the first user of the random numbers (only for each
 * style's cost), so a fresh generator always gives the same plan. Addresses are `practice-<demo id>`; every id is made
 * from the demo id, so the same style is always the same row.
 */
function planProducts(rng: ReturnType<typeof makeRng>, storeId: number, minor: (taka: number) => number): ProductPlan {
  const plan: ProductPlan = {
    products: [],
    variantRows: [],
    variants: [],
    meta: new Map(),
  };
  const colourName = new Map(DEMO_PACK.colours.map((c) => [c.key, c.nameEn]));
  const sizeLabel = new Map(DEMO_PACK.sizes.map((z) => [z.key, z.label]));
  for (const p of DEMO_PACK.products) {
    const pid = practiceId(`product:${p.id}`);
    const price = minor(p.priceMinor / 100);
    const compareAt = p.compareAtMinor ? minor(p.compareAtMinor / 100) : null;
    const cost = Math.round(price * (0.36 + rng.next() * 0.12));
    plan.products.push({
      id: pid,
      storeId,
      slug: `${PRACTICE_SLUG}${p.id}`,
      nameEn: p.nameEn,
      descriptionEn: p.descriptionEn,
      careEn: p.careEn,
      status: 'DRAFT',
      templateKey: p.template,
      pdpBlocks: { fit: p.fit, fitNote: p.fitNote, ...(p.model ? { model: p.model } : {}) },
      freeDelivery: p.freeDelivery ? true : null,
      minPriceMinor: price,
      sortRank: p.sortRank,
      isPractice: true,
    });
    const skus: { id: string; colour: string; size: string; sku: string; qty: number }[] = [];
    let order = 0;
    for (const colour of p.colours) {
      for (const [si, size] of p.sizes.entries()) {
        const sku = `PRC-${p.id}-${colour}-${size}`.toUpperCase().slice(0, 80);
        const vid = practiceId(`variant:${sku}`);
        plan.variantRows.push({ id: vid, storeId, productId: pid, sku, priceMinor: price, compareAtMinor: compareAt, active: true, inStock: false, sortOrder: order++ });
        plan.variants.push({ id: vid, productId: pid, name: p.nameEn, sku, colour: colourName.get(colour) ?? colour, size: sizeLabel.get(size) ?? size, priceMinor: price, costMinor: cost });
        skus.push({ id: vid, colour, size, sku, qty: p.stock[colour]?.[si] ?? 0 });
      }
    }
    plan.meta.set(pid, { style: p, skus });
  }
  return plan;
}

/** A varied, repeatable on-hand quantity for a practice SKU: about 2 in 10 are out, 2 in 10 are low, the rest are healthy. */
export function practiceStock(sku: string): number {
  const v = createHash('sha1').update(`extas-practice-stock:${sku}`).digest()[0]! % 10; // hardcode-ok: ten buckets of a sample spread
  if (v < 2) return 0; // hardcode-ok: sample spread
  if (v < 4) return 1 + (v % 3); // hardcode-ok: sample spread (low: 1-3)
  return 8 + v * 3; // hardcode-ok: sample spread (healthy)
}

/**
 * Completes the practice products: category, colours (+ sizes on the variants), stock, size chart, fabric, collection and
 * tag, as the demo has them. It only fills what is missing (so a second run changes nothing and an older empty shell is
 * completed), touches only practice products, and every colour, size, fabric, chart, collection and tag it makes is
 * practice-owned (key or address "practice-...", name "... (practice)"), so "Reset practice data" removes exactly those and
 * never the owner's own. A category the shop already has is reused as it is (visibility follows the practice switch,
 * visibility.ts). Photos are made apart, by `addPracticePhotos` (photos.ts): a photo needs a stored file, which needs the
 * media storage this seeder does not hold.
 */
export async function completeProducts(db: Db, storeId: number, plan: ProductPlan): Promise<Record<string, number>> {
  const have = await db.product.findMany({
    where: { storeId, isPractice: true, id: { in: [...plan.meta.keys()] } },
    select: { id: true },
  });
  if (have.length === 0) return {};
  const ids = new Set(have.map((p) => p.id));
  const styles = [...plan.meta].filter(([pid]) => ids.has(pid)).map(([pid, m]) => ({ pid, ...m }));

  // categories: the shop's own, else made as the demo has them
  const garments = new Map((await db.garmentType.findMany({ where: { storeId }, select: { id: true, key: true } })).map((g) => [g.key, g.id]));
  const garmentFor = async (key: string, fields: { key: string; labelEn: string }[]): Promise<string> => {
    let id = garments.get(key);
    if (!id) {
      const nameEn = key[0]!.toUpperCase() + key.slice(1);
      id = (await db.garmentType.create({ data: { storeId, key, nameEn, nameBn: nameEn, measurementFields: fields.map((f) => ({ key: f.key, labelEn: f.labelEn, labelBn: f.labelEn, unit: 'inch' })) }, select: { id: true } })).id;
      garments.set(key, id);
    }
    return id;
  };
  const categories = new Map<string, string>();
  for (const [i, c] of DEMO_PACK.categories.entries()) {
    if (!styles.some((s) => s.style.category === c.slug)) continue;
    const row =
      (await db.category.findFirst({ where: { storeId, slug: c.slug }, select: { id: true } })) ??
      (await db.category.create({ data: { storeId, slug: c.slug, nameEn: c.nameEn, nameBn: c.nameBn, introEn: c.introEn, sortOrder: 100 + i, isVisible: !c.hidden }, select: { id: true } })); // hardcode-ok: sort step
    categories.set(c.slug, row.id);
  }

  // practice colours, sizes, collections, tags
  const colourIds = new Map<string, string>();
  for (const c of DEMO_PACK.colours) {
    const row = await db.colour.upsert({
      where: { storeId_key: { storeId, key: `${PRACTICE_SLUG}${c.key}` } },
      update: {},
      create: { storeId, key: `${PRACTICE_SLUG}${c.key}`, nameEn: c.nameEn, hex: c.hex, synonyms: [] },
      select: { id: true },
    });
    colourIds.set(c.key, row.id);
  }
  const sizeIds = new Map<string, string>();
  for (const z of DEMO_PACK.sizes) {
    const row = await db.size.upsert({
      where: { storeId_key: { storeId, key: `${PRACTICE_SLUG}${z.key}` } },
      update: {},
      create: { storeId, key: `${PRACTICE_SLUG}${z.key}`, label: z.label, sortOrder: z.sortOrder },
      select: { id: true },
    });
    sizeIds.set(z.key, row.id);
  }
  const collectionIds = new Map<string, string>();
  for (const c of DEMO_PACK.collections) {
    const row = await db.collection.upsert({
      where: { storeId_slug: { storeId, slug: `${PRACTICE_SLUG}${c.slug}` } },
      update: {},
      create: { storeId, slug: `${PRACTICE_SLUG}${c.slug}`, nameEn: c.nameEn, kind: 'MANUAL' },
      select: { id: true },
    });
    collectionIds.set(c.slug, row.id);
  }
  const tagIds = new Map<string, string>();
  for (const t of DEMO_PACK.tags) {
    const row = await db.tag.upsert({
      where: { storeId_slug: { storeId, slug: `${PRACTICE_SLUG}${t.slug}` } },
      update: {},
      create: { storeId, slug: `${PRACTICE_SLUG}${t.slug}`, name: t.name },
      select: { id: true },
    });
    tagIds.set(t.slug, row.id);
  }

  // a fabric per kind of fabric text and a size chart per demo chart (practice-owned by their names)
  const fabricIds = new Map<string, string>();
  for (const style of new Set(styles.map((s) => s.style.fabric))) {
    const nameEn = `${style} (practice)`;
    const care = styles.find((s) => s.style.fabric === style)!.style.careEn;
    const row = (await db.fabric.findFirst({ where: { storeId, nameEn }, select: { id: true } })) ?? (await db.fabric.create({ data: { storeId, nameEn, careEn: care }, select: { id: true } }));
    fabricIds.set(style, row.id);
  }
  const chartIds = new Map<string, string>();
  for (const ch of DEMO_PACK.charts) {
    if (!styles.some((s) => s.style.chart === ch.key)) continue;
    const name = `${ch.name} (practice)`;
    const row =
      (await db.sizeChart.findFirst({ where: { storeId, name }, select: { id: true } })) ??
      (await db.sizeChart.create({
        data: {
          storeId,
          garmentTypeId: await garmentFor(ch.garment, ch.fields),
          name,
          fitKey: ch.fitKey,
          columns: { fields: ch.fields.map((f) => f.key), easeInch: ch.easeInch, diagram: null, copiedFromId: null },
          rows: ch.rows.map((r) => ({ size: `${PRACTICE_SLUG}${r.size}`, values: r.values })),
        },
        select: { id: true },
      }));
    chartIds.set(ch.key, row.id);
  }

  // the shared stock pool: the first location of the store's warehouse (none made here; with none, no stock rows)
  const location = await db.inventoryLocation.findFirst({ where: { archivedAt: null }, orderBy: { createdAt: 'asc' }, select: { id: true } });

  const counts = { practiceStockRows: 0, practiceCharts: chartIds.size };
  for (const { pid, style: p, skus } of styles) {
    const categoryId = categories.get(p.category);
    const anyStock = skus.some((v) => v.qty > 0);
    if (categoryId) await db.product.updateMany({ where: { id: pid, categoryId: null }, data: { categoryId } });
    await db.product.updateMany({ where: { id: pid, fabricId: null }, data: { fabricId: fabricIds.get(p.fabric)! } });
    await db.product.updateMany({ where: { id: pid, inStock: !anyStock }, data: { inStock: anyStock } });
    if (categoryId)
      await db.categoryProduct.createMany({
        data: [{ storeId, categoryId, productId: pid, isVisible: true, inStock: anyStock, sortRank: p.sortRank, priceMinor: p.priceMinor }],
        skipDuplicates: true,
      });
    const note = new Map(DEMO_PACK.colours.map((c) => [c.key, c.noteEn]));
    await db.productColour.createMany({
      data: p.colours.map((c, i) => ({ storeId, productId: pid, colourId: colourIds.get(c)!, noteEn: note.get(c) ?? null, sortOrder: i * 10 })), // hardcode-ok: sort step
      skipDuplicates: true,
    });
    for (const v of skus)
      await db.productVariant.updateMany({
        where: { id: v.id, OR: [{ colourId: null }, { sizeId: null }] },
        data: { colourId: colourIds.get(v.colour)!, sizeId: sizeIds.get(v.size)!, inStock: v.qty > 0 },
      });
    if (location) {
      const made = await db.stockLevel.createMany({ data: skus.map((v) => ({ variantId: v.id, locationId: location.id, onHand: v.qty, available: v.qty })), skipDuplicates: true });
      counts.practiceStockRows += made.count;
    }
    await db.collectionProduct.createMany({ data: [{ storeId, collectionId: collectionIds.get(p.collection)!, productId: pid, position: p.sortRank }], skipDuplicates: true });
    if (p.tag) await db.productTag.createMany({ data: [{ storeId, tagId: tagIds.get(p.tag)!, productId: pid }], skipDuplicates: true });
    const sizeChartId = p.chart ? chartIds.get(p.chart) : undefined;
    if (sizeChartId && !(await db.sizeChartAssignment.findFirst({ where: { storeId, sizeChartId, productId: pid }, select: { id: true } }))) await db.sizeChartAssignment.create({ data: { storeId, sizeChartId, productId: pid } });
  }
  return counts;
}

/**
 * The demo's catalogue in the store, idempotent: its products and variants (made once, by their fixed ids), their
 * completion, the demo's combos and journal posts, and the retiring of an older generation of practice products (the
 * generic ones before the demo catalogue: archived, kept for the practice orders that name them).
 */
export async function ensureCatalogue(db: Db, storeId: number, plan: ProductPlan, minor: (taka: number) => number, now: Date): Promise<Record<string, number>> {
  await db.product.createMany({ data: plan.products, skipDuplicates: true });
  await db.productVariant.createMany({ data: plan.variantRows, skipDuplicates: true });
  const counts = await completeProducts(db, storeId, plan);
  const older = await db.product.updateMany({ where: { storeId, isPractice: true, archivedAt: null, id: { notIn: [...plan.meta.keys()] } }, data: { archivedAt: now, status: 'DRAFT' } });
  if (older.count) counts.retiredOlderProducts = older.count;
  Object.assign(counts, await completeExtras(db, storeId, minor, now));
  return counts;
}

/** The sample store's own mark (DefaultPackApplication.packKey of packages/seed/src/sample.ts): rich data goes only there. */
const SAMPLE_PACK_KEY = 'sample-catalogue'; // hardcode-ok: the sample seed's own marker, same string as @extas/seed

export interface SeedOptions {
  /** PR 724: the big sample world for screenshots. Honoured only on the sample store; anywhere else it is ignored. */
  rich?: boolean;
  /**
   * PR 880: the big sample world on the owner's own store too (the practice period of the real admin). Only the live seed
   * command and the owner's "Add sample data" ask for it; without it "rich" stays on the sample store only.
   */
  richAnywhere?: boolean;
}

export async function seedPractice(db: Db, storeId: number, now: Date = new Date(), opts: SeedOptions = {}): Promise<SeedResult> {
  const store = await db.store.findUnique({
    where: { id: storeId },
    select: { id: true, currency: true },
  });
  if (!store) return { seeded: false, reason: 'no-store', counts: {} };
  const digits =
    new Intl.NumberFormat('en', {
      style: 'currency',
      currency: store.currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  const minor = (taka: number) => Math.round(taka * 10 ** digits);
  const rich = !!opts.rich && (!!opts.richAnywhere || (await db.defaultPackApplication.count({ where: { storeId, packKey: SAMPLE_PACK_KEY } })) > 0);
  const existingOrders = await db.order.count({ where: { storeId, isPractice: true } });
  // PR 880: a store that holds only the small practice set (about 94 orders) is topped up to the big one: only the missing
  // orders, payouts and claims are added; the rows already there are never changed (their figures are recounted after).
  const topUp = rich && existingOrders > 0 && existingOrders < Math.floor(RICH_ORDER_TOTAL * RICH_DONE_SHARE);
  if (existingOrders > 0 && !topUp) {
    // an older run: bring the catalogue to the demo's (adds only what is missing, nothing else is touched)
    const done = await ensureCatalogue(db, storeId, planProducts(makeRng(SEED), storeId, minor), minor, now);
    return { seeded: false, reason: 'already', counts: done };
  }

  const rng = makeRng(SEED);
  const counts: Record<string, number> = {};

  // ---- couriers (practice ones; never enabled, never connected)
  const couriers = COURIERS.map((c) => ({
    ...c,
    id: practiceId(`courier:${c.key}`),
  }));
  await db.courierAccount.createMany({
    data: couriers.map((c) => ({
      id: c.id,
      storeId,
      providerKey: c.key,
      name: `${c.name} (practice)`,
      enabled: false,
      isPractice: true,
    })),
    skipDuplicates: true,
  });
  counts.couriers = couriers.length;

  // ---- the demo's products (DRAFT until the practice switch shows them, visibility.ts) with variants, then completed (category, colours, sizes, stock, chart, fabric)
  const plan = planProducts(rng, storeId, minor);
  Object.assign(counts, await ensureCatalogue(db, storeId, plan, minor, now));
  counts.products = plan.products.length;
  const variants = plan.variants;
  const byProduct = new Map<string, Variant[]>();
  for (const v of variants) (byProduct.get(v.productId) ?? byProduct.set(v.productId, []).get(v.productId)!).push(v);
  const productIds = [...byProduct.keys()];

  // ---- customers
  const custs: Cust[] = [];
  for (let i = 0; i < (rich ? RICH.customers : PRACTICE_CUSTOMERS); i++) {
    const zone = rng.weighted<Zone>([
      ['inside', 56],
      ['sub', 16],
      ['outside', 28],
    ]);
    const [district, area] = zone === 'inside' ? (['Dhaka', rng.pick(DHAKA_AREAS)] as const) : zone === 'sub' ? rng.pick(SUB_AREAS) : rng.pick(OUTSIDE_AREAS);
    custs.push({
      id: practiceId(`customer:${i}`),
      name: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`,
      phone: `${PRACTICE_PHONE_PREFIX}${String(10_000_000 + i * 137 + 11).padStart(8, '0')}`,
      zone,
      district,
      area,
      createdAt: new Date(now.getTime() - rng.int(5, 400) * DAY),
      orders: 0,
      delivered: 0,
      returned: 0,
      ltv: 0,
      last: null,
    });
  }

  if (topUp) {
    // people that already exist keep their own names, so a new order never names someone differently from his record
    const names = new Map((await db.customer.findMany({ where: { storeId, isPractice: true }, select: { id: true, name: true } })).map((c) => [c.id, c.name] as const));
    for (const c of custs) {
      const n = names.get(c.id);
      if (n) c.name = n;
    }
  }

  // ---- orders
  interface Plan {
    kind: OrderKind;
    ageDays: number;
  }
  const plans: Plan[] = [];
  for (const p of rich ? RICH_PLAN : ORDER_PLAN)
    for (let k = 0; k < p.count; k++)
      plans.push({
        kind: p.kind,
        ageDays: p.age[0] + rng.next() * (p.age[1] - p.age[0]),
      });
  plans.sort((a, b) => b.ageDays - a.ageDays); // oldest first, so numbers rise with time

  const orders: Prisma.OrderCreateManyInput[] = [];
  const items: Prisma.OrderItemCreateManyInput[] = [];
  const events: Prisma.OrderEventCreateManyInput[] = [];
  // PR 800: who did the staff work. The Team report counts work by person, so each staff step goes to one of the active staff users, in turn
  // (no staff yet means no person is named, as before). Chosen by the order's number, so a re-seed gives the same people.
  const staffIds = (await db.staffUser.findMany({ where: { archivedAt: null, status: 'ACTIVE' }, select: { id: true }, orderBy: { id: 'asc' }, take: 8 })).map((x) => x.id);
  const payments: Prisma.PaymentCreateManyInput[] = [];
  const shipments: Prisma.ShipmentCreateManyInput[] = [];
  const shipmentEvents: Prisma.ShipmentEventCreateManyInput[] = [];
  const paidCod: {
    orderId: string;
    shipmentId: string;
    courierId: string;
    cod: number;
    charge: number;
    at: Date;
    consignment: string;
  }[] = [];
  const claimable: {
    orderId: string;
    shipmentId: string;
    courierId: string;
    kind: string;
    total: number;
    at: Date;
  }[] = [];
  let num = 10_180;
  const have = topUp ? new Set((await db.order.findMany({ where: { storeId, isPractice: true }, select: { id: true } })).map((o) => o.id)) : new Set<string>();

  plans.forEach((plan, i) => {
    const placedAt = new Date(now.getTime() - plan.ageDays * DAY);
    placedAt.setUTCHours(rng.int(3, 17), rng.int(0, 59), 0, 0); // 9:00-23:59 shop time
    if (placedAt > now) placedAt.setTime(now.getTime() - rng.int(10, 300) * 60_000);
    const repeat = rng.next() < 0.3 && i > 6;
    const cust = repeat ? custs[rng.int(0, Math.min(custs.length - 1, rich ? 40 : 14))]! : rng.pick(custs);
    const id = practiceId(`order:${i}`);
    const number = `P-${num++}`;
    // lines
    const lineCount = rng.weighted([
      [1, 62],
      [2, 28],
      [3, 10],
    ] as const);
    let subtotal = 0;
    let pieces = 0;
    const lines: Prisma.OrderItemCreateManyInput[] = [];
    for (let l = 0; l < lineCount; l++) {
      const pv = byProduct.get(rng.pick(productIds))!;
      const v = rng.pick(pv);
      const qty = rng.next() < 0.85 ? 1 : 2;
      subtotal += v.priceMinor * qty;
      pieces += qty;
      lines.push({
        id: practiceId(`item:${i}:${l}`),
        storeId,
        orderId: id,
        variantId: v.id,
        productId: v.productId,
        sku: v.sku,
        productName: `${v.name} (practice)`,
        colourName: v.colour,
        sizeLabel: v.size,
        quantity: qty,
        unitPriceMinor: v.priceMinor,
        discountMinor: 0, // hardcode-ok: a sample order without a discount
        lineTotalMinor: v.priceMinor * qty,
        unitCostMinor: v.costMinor,
        createdAt: placedAt,
      });
    }
    const discount = pieces >= 3 ? Math.round(subtotal * 0.1) : pieces === 2 ? Math.round(subtotal * 0.05) : 0;
    const free = subtotal - discount >= minor(FREE_DELIVERY_OVER);
    const delivery = free ? 0 : minor(DELIVERY_FEE[cust.zone]);
    const total = subtotal - discount + delivery;
    const method = rng.weighted(PAYMENTS);
    const source = rng.weighted(CHANNELS);
    const utm = source === 'WEBSITE' ? rng.weighted(ADS_SOURCES) : null;
    const courier = rng.weighted(couriers.map((c) => [c, c.share] as const));
    const at = (h: number) => new Date(Math.min(placedAt.getTime() + h * HOUR, now.getTime() - 60_000));
    const kind = plan.kind;
    const confirmedKinds: OrderKind[] = ['CONFIRMED', 'PROCESSING', 'BOOKED', 'PACKED', 'HANDED_OVER', 'IN_TRANSIT', 'DELIVERED', 'PAID', 'RETURNED'];
    const confirmed = confirmedKinds.includes(kind);
    const shipped: OrderKind[] = ['HANDED_OVER', 'IN_TRANSIT', 'DELIVERED', 'PAID', 'RETURNED'];
    const booked = confirmed && !['CONFIRMED', 'PROCESSING'].includes(kind);
    const confirmedAt = confirmed ? at(rng.int(1, 4)) : null;
    const packedAt = ['PACKED', ...shipped].includes(kind) ? at(20) : null;
    const handedOverAt = shipped.includes(kind) ? at(26) : null;
    const zoneDays = cust.zone === 'inside' ? rng.int(1, 2) : cust.zone === 'sub' ? rng.int(2, 3) : rng.int(3, 5);
    const deliveredAt = kind === 'DELIVERED' || kind === 'PAID' ? at(26 + zoneDays * 24) : null;
    const returnedAt = kind === 'RETURNED' ? at(26 + 4 * 24) : null;
    const cancelledAt = kind === 'CANCELLED' ? at(rng.int(2, 30)) : null;
    const prepaid = method !== 'COD';
    const status = (
      {
        PLACED: 'PLACED',
        AWAITING_ADVANCE: 'AWAITING_ADVANCE',
        ON_HOLD: 'ON_HOLD',
        CONFIRMED: 'CONFIRMED',
        PROCESSING: 'PROCESSING',
        BOOKED: 'CONFIRMED',
        PACKED: 'PACKED',
        HANDED_OVER: 'HANDED_OVER',
        IN_TRANSIT: 'IN_TRANSIT',
        DELIVERED: 'DELIVERED',
        PAID: 'DELIVERED',
        RETURNED: 'RETURNED',
        CANCELLED: 'CANCELLED',
      } as const
    )[kind];
    const paidInFull = kind === 'PAID' || (prepaid && confirmed && kind !== 'RETURNED');
    const paidMinor = paidInFull ? total : 0;
    orders.push({
      id,
      storeId,
      number,
      customerId: cust.id,
      status,
      source,
      currency: store.currency,
      placedAt,
      phone: cust.phone,
      customerName: cust.name,
      shippingAddressText: `House ${rng.int(1, 120)}, Road ${rng.int(1, 30)}, ${cust.area}, ${cust.district}`,
      subtotalMinor: subtotal,
      discountMinor: discount,
      deliveryChargeMinor: delivery,
      totalMinor: total,
      codAmountMinor: prepaid ? 0 : total,
      paidMinor,
      paymentMethod: method,
      utmSource: utm,
      advanceRequirement: kind === 'AWAITING_ADVANCE' ? 'DELIVERY_CHARGE' : 'NONE',
      advanceRequiredMinor: kind === 'AWAITING_ADVANCE' ? delivery || minor(DELIVERY_FEE[cust.zone]) : null,
      holdReasonCode: kind === 'ON_HOLD' ? rng.pick(HOLD_CODES) : null,
      holdFromStatus: kind === 'ON_HOLD' ? 'PLACED' : null,
      onHoldSince: kind === 'ON_HOLD' ? at(2) : null,
      cancelReasonCode: kind === 'CANCELLED' ? rng.pick(CANCEL_CODES) : null,
      confirmedAt,
      packedAt,
      handedOverAt,
      deliveredAt,
      cancelledAt,
      returnedAt,
      courierAccountId: booked ? courier.id : null,
      riskScore: rng.int(2, 40),
      riskBand: 'low',
      idempotencyKey: `practice:order:${i}`,
      isPractice: true,
      createdAt: placedAt,
      updatedAt: returnedAt ?? deliveredAt ?? cancelledAt ?? handedOverAt ?? packedAt ?? confirmedAt ?? placedAt,
    });
    items.push(...lines);
    const ev = (type: string, toStatus: Prisma.OrderEventCreateManyInput['toStatus'], when: Date, actor: 'CUSTOMER' | 'STAFF' | 'COURIER' | 'SYSTEM', message?: string) =>
      events.push({
        id: practiceId(`event:${i}:${type}`),
        storeId,
        orderId: id,
        type,
        toStatus,
        message: message ?? null,
        actorType: actor,
        actorId: actor === 'STAFF' && staffIds.length ? staffIds[i % staffIds.length]! : null,
        source: 'practice',
        createdAt: when,
      });
    ev('order.placed', 'PLACED', placedAt, source === 'PHONE' ? 'STAFF' : 'CUSTOMER', `Order placed (${source.toLowerCase()})`);
    if (confirmedAt) ev('order.confirmed', 'CONFIRMED', confirmedAt, 'STAFF', 'Confirmed on call');
    if (packedAt) ev('order.packed', 'PACKED', packedAt, 'STAFF', 'Packed and checked');
    if (handedOverAt) ev('order.handedOver', 'HANDED_OVER', handedOverAt, 'STAFF', `Handed to ${courier.name}`);
    if (deliveredAt) ev('order.delivered', 'DELIVERED', deliveredAt, 'COURIER', 'Delivered');
    if (returnedAt) ev('order.returned', 'RETURNED', returnedAt, 'COURIER', 'Returned to the shop');
    if (cancelledAt) ev('order.cancelled', 'CANCELLED', cancelledAt, 'STAFF', 'Cancelled');
    if (kind === 'ON_HOLD') ev('order.held', 'ON_HOLD', at(2), 'STAFF', 'Put on hold');
    // money
    if (paidInFull && (prepaid || kind !== 'PAID')) {
      payments.push({
        id: practiceId(`payment:${i}`),
        storeId,
        orderId: id,
        method,
        provider: method.toLowerCase(),
        purpose: 'ORDER',
        status: 'PAID',
        amountMinor: total,
        currency: store.currency,
        paidAt: confirmedAt ?? placedAt,
        idempotencyKey: `practice:pay:${i}`,
        receivedMinor: total,
        isPractice: true,
      });
    }
    // the parcel
    if (booked) {
      const sid = practiceId(`shipment:${i}`);
      const consignment = `PRACTICE-${number}`;
      const sStatus = (
        {
          BOOKED: 'PENDING_PICKUP',
          PACKED: 'PENDING_PICKUP',
          HANDED_OVER: 'PICKED_UP',
          IN_TRANSIT: 'IN_TRANSIT',
          DELIVERED: 'DELIVERED',
          PAID: 'DELIVERED',
          RETURNED: 'RETURNED',
        } as const
      )[kind as 'BOOKED'];
      const bookedAt = at(rng.int(5, 18));
      shipments.push({
        id: sid,
        storeId,
        orderId: id,
        courierAccountId: courier.id,
        consignmentId: consignment,
        trackingCode: consignment,
        status: sStatus,
        codAmountMinor: prepaid ? 0 : total,
        codCollectedMinor: kind === 'PAID' && !prepaid ? total : null,
        chargeMinor: minor(courier.fee[cust.zone]),
        bookedAt,
        pickedAt: handedOverAt,
        deliveredAt,
        returnedAt,
        idempotencyKey: `practice:ship:${i}`,
        mode: 'MOCK',
        merchantRef: `${number}-1`,
        isPractice: true,
        createdAt: bookedAt,
      });
      shipmentEvents.push({
        id: practiceId(`sevent:${i}:0`),
        storeId,
        shipmentId: sid,
        providerEventId: `practice:${i}:booked`,
        status: 'PENDING_PICKUP',
        rawStatus: 'practice',
        occurredAt: bookedAt,
        source: 'booking',
      } as Prisma.ShipmentEventCreateManyInput);
      if (handedOverAt)
        shipmentEvents.push({
          id: practiceId(`sevent:${i}:1`),
          storeId,
          shipmentId: sid,
          providerEventId: `practice:${i}:picked`,
          status: 'PICKED_UP',
          rawStatus: 'practice',
          occurredAt: handedOverAt,
          source: 'poll',
        } as Prisma.ShipmentEventCreateManyInput);
      if (kind === 'PAID' && !prepaid && deliveredAt) {
        const settleAt = new Date(Math.min(deliveredAt.getTime() + 3 * DAY, now.getTime() - HOUR));
        paidCod.push({
          orderId: id,
          shipmentId: sid,
          courierId: courier.id,
          cod: total,
          charge: minor(courier.fee[cust.zone]),
          at: settleAt,
          consignment,
        });
        payments.push({
          id: practiceId(`payment:${i}`),
          storeId,
          orderId: id,
          method: 'COD',
          provider: 'courier',
          purpose: 'ORDER',
          status: 'PAID',
          amountMinor: total,
          currency: store.currency,
          paidAt: settleAt,
          idempotencyKey: `practice:pay:${i}`,
          receivedMinor: total,
          isPractice: true,
        });
      }
      if (['PAID', 'RETURNED', 'IN_TRANSIT', 'DELIVERED'].includes(kind))
        claimable.push({
          orderId: id,
          shipmentId: sid,
          courierId: courier.id,
          kind,
          total,
          at: handedOverAt ?? placedAt,
        });
    }
    // the customer's figures
    cust.orders += 1;
    if (status === 'DELIVERED') {
      cust.delivered += 1;
      cust.ltv += total;
    }
    if (status === 'RETURNED') cust.returned += 1;
    if (!cust.last || placedAt > cust.last) cust.last = placedAt;
  });

  if (topUp) {
    // keep only what is new: an order that exists is never given more lines, payments or shipments
    const drop = <T>(rows: T[], isOld: (r: T) => boolean) => {
      for (let j = rows.length - 1; j >= 0; j--) if (isOld(rows[j]!)) rows.splice(j, 1);
    };
    const oldShip = new Set(shipments.filter((x) => have.has(String(x.orderId))).map((x) => String(x.id)));
    drop(orders, (r) => have.has(String(r.id)));
    drop(items, (r) => have.has(String(r.orderId)));
    drop(events, (r) => have.has(String(r.orderId)));
    drop(payments, (r) => have.has(String(r.orderId)));
    drop(shipments, (r) => have.has(String(r.orderId)));
    drop(shipmentEvents, (r) => oldShip.has(String(r.shipmentId)));
    drop(paidCod, (r) => have.has(r.orderId));
    drop(claimable, (r) => have.has(r.orderId));
  }
  const levels = await practiceLevels(db, storeId);
  await db.customer.createMany({
    data: custs.map((c) => ({
      id: c.id,
      gradeId: pickGrade(levels, c.delivered, c.returned),
      storeId,
      phone: c.phone,
      name: c.name,
      firstSource: 'practice',
      orderCount: c.orders,
      deliveredCount: c.delivered,
      returnedCount: c.returned,
      lifetimeValueMinor: c.ltv,
      lastOrderAt: c.last,
      isPractice: true,
      createdAt: c.createdAt,
    })),
    skipDuplicates: true,
  });
  counts.customers = custs.length;
  await db.order.createMany({ data: orders, skipDuplicates: true });
  await db.orderItem.createMany({ data: items, skipDuplicates: true });
  await db.orderEvent.createMany({ data: events, skipDuplicates: true });
  await db.payment.createMany({ data: payments, skipDuplicates: true });
  await db.shipment.createMany({ data: shipments, skipDuplicates: true });
  await db.shipmentEvent.createMany({
    data: shipmentEvents,
    skipDuplicates: true,
  });
  Object.assign(counts, {
    orders: orders.length,
    items: items.length,
    payments: payments.length,
    shipments: shipments.length,
  });

  // ---- courier payouts: one per courier per week for the cash the couriers paid out
  const weeks = new Map<string, typeof paidCod>();
  for (const p of paidCod) {
    const week = Math.floor(p.at.getTime() / (7 * DAY));
    const k = `${p.courierId}:${week}`;
    (weeks.get(k) ?? weeks.set(k, []).get(k)!).push(p);
  }
  let payoutNo = topUp ? await db.courierSettlement.count({ where: { storeId, isPractice: true } }) : 0;
  const payoutBase = payoutNo;
  for (const [, group] of [...weeks].sort((a, b) => a[0].localeCompare(b[0]))) {
    payoutNo += 1;
    const sid = practiceId(`settlement:${payoutNo}`);
    const last = group.reduce((m, g) => (g.at > m ? g.at : m), group[0]!.at);
    const first = group.reduce((m, g) => (g.at < m ? g.at : m), group[0]!.at);
    const totalCod = group.reduce((s, g) => s + g.cod, 0);
    const charges = group.reduce((s, g) => s + g.charge, 0);
    await db.courierSettlement.create({
      data: {
        id: sid,
        storeId,
        courierAccountId: group[0]!.courierId,
        reference: `PRACTICE-PAYOUT-${payoutNo}`,
        periodFrom: first,
        periodTo: last,
        totalCodMinor: totalCod,
        chargesMinor: charges,
        netMinor: totalCod - charges,
        receivedAt: last,
        status: 'IMPORTED',
        receivedAs: 'BANK',
        isPractice: true,
        createdAt: last,
      },
    });
    await db.courierSettlementLine.createMany({
      data: group.map((g, k) => ({
        id: practiceId(`sline:${payoutNo}:${k}`),
        storeId,
        settlementId: sid,
        orderId: g.orderId,
        shipmentId: g.shipmentId,
        consignmentId: g.consignment,
        codMinor: g.cod,
        chargeMinor: g.charge,
        lineNo: k + 1,
        kind: 'COD',
        courierStatus: 'delivered',
        expectedMinor: g.cod,
        expectedChargeMinor: g.charge,
        matchState: 'MATCHED',
        moneyStatus: 'RECONCILED',
      })),
      skipDuplicates: true,
    });
  }
  counts.payouts = payoutNo - payoutBase;

  // ---- courier claims (lost, damaged, rider overcharge, other) in every state
  // the big set holds the prototype's three claims: a lost parcel (sent), a damaged one (won) and a COD short (open)
  const baseKinds = rich ? (['LOST', 'DAMAGED', 'OTHER'] as const) : (['LOST', 'DAMAGED', 'RIDER_OVERCHARGE', 'OTHER', 'LOST', 'DAMAGED'] as const);
  const baseStates = rich ? (['SENT', 'SETTLED', 'OPEN'] as const) : (['OPEN', 'SENT', 'SETTLED', 'REJECTED', 'OPEN', 'SENT'] as const);
  const claimTotal = rich ? RICH.claims : baseKinds.length;
  const kinds = Array.from({ length: claimTotal }, (_, k) => baseKinds[k % baseKinds.length]!);
  const states = Array.from({ length: claimTotal }, (_, k) => baseStates[(k + Math.floor(k / baseStates.length)) % baseStates.length]!);
  const claims: Prisma.CourierClaimCreateManyInput[] = [];
  const claimBase = topUp ? await db.courierClaim.count({ where: { storeId, isPractice: true } }) : 0;
  kinds.forEach((kind, k0) => {
    const k = k0 + claimBase;
    const src = claimable[(k0 * (rich ? 7 : 5)) % Math.max(1, claimable.length)];
    if (!src) return;
    const claimed = kind === 'RIDER_OVERCHARGE' ? minor(rng.int(30, 120)) : Math.min(src.total, minor(rng.int(700, 1800)));
    claims.push({
      id: practiceId(`claim:${k}`),
      storeId,
      courierAccountId: src.courierId,
      orderId: src.orderId,
      shipmentId: src.shipmentId,
      kind,
      status: states[k0]!,
      claimedMinor: claimed,
      settledMinor: states[k0] === 'SETTLED' ? claimed : null,
      courierRef: states[k0] === 'OPEN' ? null : `CLM-${1000 + k}`,
      note: 'Practice claim',
      idempotencyKey: `practice:claim:${k}`,
      sentAt: states[k0] === 'OPEN' ? null : new Date(src.at.getTime() + 6 * DAY),
      closedAt: states[k0] === 'SETTLED' || states[k0] === 'REJECTED' ? new Date(src.at.getTime() + 12 * DAY) : null,
      isPractice: true,
      createdAt: new Date(src.at.getTime() + 5 * DAY),
    });
  });
  await db.courierClaim.createMany({ data: claims, skipDuplicates: true });
  counts.claims = claims.length;

  // PR 880: after a top-up the older people's figures are counted again from their orders (practice rows only, and only when a figure differs)
  if (topUp) counts.customersRecounted = await recountPracticeCustomers(db, storeId, levels);

  // ---- incomplete orders (started checkouts that did not finish)
  const drafts: Prisma.CheckoutDraftCreateManyInput[] = [];
  for (let k = 0; k < (rich ? RICH.incomplete : PRACTICE_INCOMPLETE); k++) {
    const c = rng.pick(custs);
    const v = rng.pick(variants);
    const last = new Date(now.getTime() - rng.int(20, 30 * 24 * 60) * 60_000);
    const handled = k % 6 === 5;
    drafts.push({
      id: practiceId(`draft:${k}`),
      storeId,
      visitorId: `practice-visitor-${k}`,
      phone: rng.next() < 0.75 ? c.phone : null,
      name: rng.next() < 0.7 ? c.name : null,
      addressText: rng.next() < 0.5 ? `${c.area}, ${c.district}` : null,
      data: {
        items: [
          {
            name: `${v.name} (practice)`,
            sku: v.sku,
            quantity: 1,
            unitPriceMinor: v.priceMinor,
          },
        ],
      } as Prisma.InputJsonValue,
      lastStep: rng.pick(['address', 'phone', 'payment', 'review']),
      lastActivityAt: last,
      handledAt: handled ? new Date(last.getTime() + 2 * HOUR) : null,
      handledNote: handled ? 'Called, will order later (practice)' : null,
      isPractice: true,
      createdAt: last,
      updatedAt: last,
    });
  }
  await db.checkoutDraft.createMany({ data: drafts, skipDuplicates: true });
  counts.incomplete = drafts.length;

  if (rich) Object.assign(counts, await seedRichExtras(db, storeId, store.currency, minor, rng, plan, now, !opts.richAnywhere));

  return { seeded: true, counts };
}

/**
 * PR 724 — what only the rich sample adds: three ad accounts with daily spend (Reports › Marketing & ads), and approved
 * reviews on the sample products (Reports › Products, the product pages). Every id comes from the row's own key, so a
 * second run adds nothing. Ad accounts are never enabled or connected; nothing leaves the system.
 */
async function seedRichExtras(
  db: Db,
  storeId: number,
  currency: string,
  minor: (taka: number) => number,
  rng: ReturnType<typeof makeRng>,
  plan: ProductPlan,
  now: Date,
  withAds: boolean,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const accounts: Prisma.AdAccountCreateManyInput[] = [];
  const campaigns: Prisma.AdCampaignCreateManyInput[] = [];
  const spend: Prisma.AdSpendDailyCreateManyInput[] = [];
  // PR 880: the ad accounts and their spend are made on the sample store only. Ad spend is read straight by the profit and
  // cost reports (no practice switch there), so on the owner's own store it would mix with real ad money.
  for (const a of withAds ? RICH_ADS : []) {
    const accountId = practiceId(`adaccount:${a.platform}`);
    accounts.push({ id: accountId, storeId, platform: a.platform, externalId: `practice-${a.platform.toLowerCase()}`, name: a.account, currency, enabled: false });
    for (const [ci, name] of a.campaigns.entries()) {
      const campaignId = practiceId(`adcampaign:${a.platform}:${ci}`);
      campaigns.push({ id: campaignId, storeId, adAccountId: accountId, externalId: `practice-${a.platform.toLowerCase()}-${ci}`, name, status: 'ACTIVE', objective: 'SALES', dailyBudgetMinor: minor(a.spend[1]), currency });
      for (let d = 0; d < RICH.adDays; d++) {
        const date = new Date(today.getTime() - d * DAY);
        const weekend = [5, 6].includes(date.getUTCDay()); // hardcode-ok: Friday and Saturday, the shop's busy days
        const taka = Math.round((a.spend[0] + rng.next() * (a.spend[1] - a.spend[0])) * (weekend ? 1.15 : 1) / a.campaigns.length);
        const impressions = Math.round((taka / 0.9) * 1000 * (0.8 + rng.next() * 0.4)); // hardcode-ok: sample reach, about 0.9 taka per 1,000
        const clicks = Math.round(impressions * a.ctr * (0.8 + rng.next() * 0.4));
        const purchases = Math.round(clicks * a.cvr * (0.7 + rng.next() * 0.6));
        spend.push({
          id: practiceId(`adspend:${a.platform}:${ci}:${d}`),
          storeId,
          adAccountId: accountId,
          adCampaignId: campaignId,
          date,
          platform: a.platform,
          spendMinor: minor(taka),
          currency,
          spendStoreMinor: minor(taka),
          impressions,
          clicks,
          purchases,
          deliveredPurchases: Math.round(purchases * (0.68 + rng.next() * 0.12)), // hardcode-ok: sample delivery rate
        });
      }
    }
  }
  await db.adAccount.createMany({ data: accounts, skipDuplicates: true });
  await db.adCampaign.createMany({ data: campaigns, skipDuplicates: true });
  await db.adSpendDaily.createMany({ data: spend, skipDuplicates: true });
  counts.adAccounts = accounts.length;
  counts.adSpendRows = spend.length;

  const colourName = new Map(DEMO_PACK.colours.map((c) => [c.key, c.nameEn]));
  const sizeLabel = new Map(DEMO_PACK.sizes.map((z) => [z.key, z.label]));
  const reviews: Prisma.ReviewCreateManyInput[] = [];
  const pids = [...plan.meta.keys()];
  for (let k = 0; k < RICH.reviews; k++) {
    const pid = pids[Math.floor(rng.next() * pids.length)]!;
    const m = plan.meta.get(pid)!;
    const pickSize = rng.pick(m.style.sizes);
    const pickColour = rng.pick(m.style.colours);
    const at = new Date(now.getTime() - rng.int(1, 175) * DAY);
    const status = k % 10 === 9 ? 'PENDING' : 'APPROVED'; // hardcode-ok: one in ten waits for a person
    reviews.push({
      id: practiceId(`review:${k}`),
      storeId,
      productId: pid,
      rating: rng.weighted([[5, 52], [4, 28], [3, 12], [2, 5], [1, 3]] as const),
      body: rng.pick(RICH_REVIEW_BODIES),
      displayName: `Practice reviewer ${k + 1}`,
      status,
      source: 'STAFF',
      isVerifiedPurchase: true,
      sizeLabel: sizeLabel.get(pickSize) ?? pickSize,
      colourName: colourName.get(pickColour) ?? pickColour,
      publishedAt: status === 'APPROVED' ? at : null,
      moderatedAt: status === 'APPROVED' ? at : null,
      createdAt: at,
      updatedAt: at,
    });
  }
  await db.review.createMany({ data: reviews, skipDuplicates: true });
  counts.reviews = reviews.length;
  return counts;
}

/** Counts every practice customer's orders, delivered, returned and lifetime value again from the practice orders; changes only a row whose figure differs. */
export async function recountPracticeCustomers(db: Db, storeId: number, levels: Parameters<typeof pickGrade>[0]): Promise<number> {
  const rows = await db.order.findMany({ where: { storeId, isPractice: true, customerId: { not: null } }, select: { customerId: true, status: true, totalMinor: true, placedAt: true } });
  const by = new Map<string, { orders: number; delivered: number; returned: number; ltv: number; last: Date | null }>();
  for (const o of rows) {
    const c = by.get(o.customerId!) ?? by.set(o.customerId!, { orders: 0, delivered: 0, returned: 0, ltv: 0, last: null }).get(o.customerId!)!;
    c.orders += 1;
    if (o.status === 'DELIVERED') {
      c.delivered += 1;
      c.ltv += o.totalMinor;
    }
    if (o.status === 'RETURNED') c.returned += 1;
    if (!c.last || o.placedAt > c.last) c.last = o.placedAt;
  }
  const have = await db.customer.findMany({ where: { storeId, isPractice: true }, select: { id: true, orderCount: true, deliveredCount: true, returnedCount: true, lifetimeValueMinor: true, lastOrderAt: true } });
  let changed = 0;
  for (const h of have) {
    const c = by.get(h.id);
    if (!c) continue;
    if (h.orderCount === c.orders && h.deliveredCount === c.delivered && h.returnedCount === c.returned && Number(h.lifetimeValueMinor) === c.ltv && h.lastOrderAt?.getTime() === c.last?.getTime()) continue;
    await db.customer.update({ where: { id: h.id }, data: { orderCount: c.orders, deliveredCount: c.delivered, returnedCount: c.returned, lifetimeValueMinor: c.ltv, lastOrderAt: c.last, gradeId: pickGrade(levels, c.delivered, c.returned) } });
    changed += 1;
  }
  return changed;
}

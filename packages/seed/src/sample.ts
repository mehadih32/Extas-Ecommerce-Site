// PR 14 — the sample catalogue: a sample store with the approved demo's categories, colours, sizes, products, variants,
// stock, size charts and one demo order, so every demo screen can be built and tested against real rows.
//
// SAMPLE DATA ONLY (CLAUDE.md rule 4, PR 509). The store, brand, customer and order are made up and carry the sample
// marker; the prices are the demo's sample figures, never the owner's; the phone is in the unallocated +88010 range and
// the e-mail on example.com. The owner-data check (CI) proves it. It runs only on the explicit `sample` command, never
// on a new installation, and it refuses to run beside a live store that is not the sample store.
//
// Idempotent: every row is created only when it is missing (by its natural key), nothing is ever updated, so a second
// run changes nothing — not even an `updatedAt`. Every store-scoped row carries the sample store's `storeId`.
import { z } from 'zod';
import type { Prisma, PrismaClient } from '@extas/db/client';
import sampleJson from '../data/sample-catalogue.json';
import { lockSeed } from './lock';
import { applyPackTx, defaultPack, type PackData, type PackReport } from './pack';

/** DefaultPackApplication key that marks a store as created by this seed. */
export const SAMPLE_PACK_KEY = 'sample-catalogue';

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const text = (max: number) => z.string().trim().min(1).max(max);
const minor = z.int().min(0);

const sampleSchema = z
  .object({
    $comment: z.string(),
    version: z.int().min(1),
    /** Every made-up name in this file contains it (checked by the owner-data check). */
    marker: text(20),
    store: z.object({ slug, name: text(120), defaultLocale: text(20), currency: z.string().regex(/^[A-Z]{3}$/), timezone: text(60) }).strict(),
    brand: z.object({ slug, name: text(80), isOwnLabel: z.boolean() }).strict(),
    warehouse: z
      .object({
        code: text(40),
        name: text(80),
        location: z.object({ code: text(40), name: text(80), kind: z.enum(['WAREHOUSE', 'SHOWROOM', 'IN_TRANSIT', 'DAMAGED']) }).strict(),
      })
      .strict(),
    publishedAt: z.iso.datetime(),
    visibleCategories: z.array(slug),
    colours: z
      .array(
        z
          .object({
            key: slug,
            nameEn: text(60),
            nameBn: text(60).optional(),
            hex: z.string().regex(/^#[0-9A-F]{6}$/),
            noteEn: text(300).optional(),
          })
          .strict(),
      )
      .min(1),
    sizes: z.array(z.object({ key: slug, label: text(20), sortOrder: z.int().min(0) }).strict()).min(1),
    collections: z.array(z.object({ slug, nameEn: text(80) }).strict()),
    tags: z.array(z.object({ slug, name: text(40) }).strict()),
    sizeCharts: z.array(
      z
        .object({
          key: slug,
          name: text(80),
          garmentType: slug,
          fitKey: slug,
          columns: z.array(z.string().regex(/^[a-z][a-zA-Z]*$/)).min(1),
          rows: z.array(z.object({ size: slug, values: z.array(z.number().positive()) }).strict()).min(1),
          categories: z.array(slug),
        })
        .strict(),
    ),
    products: z
      .array(
        z
          .object({
            slug,
            code: z.string().regex(/^[A-Z0-9]{2,8}$/),
            nameEn: text(120),
            category: slug,
            collection: slug,
            tag: slug.optional(),
            templateKey: z.string().regex(/^T[1-9]$/),
            sortRank: z.int(),
            descriptionEn: text(1000),
            careEn: text(300),
            fabric: text(120),
            fit: text(40),
            fitNote: text(200),
            freeDelivery: z.literal(true).optional(),
            sizeChart: slug.optional(),
            samplePriceMinor: minor,
            sampleCompareAtMinor: minor.optional(),
            colours: z.array(slug).min(1),
            sizes: z.array(slug).min(1),
            stock: z.record(z.string(), z.array(z.int().min(0))),
          })
          .strict(),
      )
      .min(1),
    customer: z.object({ name: text(80), phone: z.string().regex(/^\+[1-9]\d{7,14}$/), email: z.email() }).strict(),
    order: z
      .object({
        number: text(40),
        idempotencyKey: text(80),
        placedAt: z.iso.datetime(),
        source: z.enum(['WEBSITE', 'LANDING_PAGE', 'MESSENGER', 'WHATSAPP', 'LIVE_CHAT', 'PHONE', 'TELEGRAM', 'ADMIN', 'SHOWROOM', 'IMPORT']),
        paymentMethod: z.enum(['COD', 'BKASH', 'NAGAD', 'CARD', 'CASH', 'WALLET', 'BANK_TRANSFER']),
        address: text(300),
        items: z.array(z.object({ product: slug, colour: slug, size: slug, quantity: z.int().min(1) }).strict()).min(1),
      })
      .strict(),
  })
  .strict()
  .superRefine((s, ctx) => {
    const bad = (message: string) => ctx.addIssue({ code: 'custom', message });
    const colours = new Set(s.colours.map((c) => c.key));
    const sizes = new Set(s.sizes.map((c) => c.key));
    const charts = new Set(s.sizeCharts.map((c) => c.key));
    const collections = new Set(s.collections.map((c) => c.slug));
    const tags = new Set(s.tags.map((c) => c.slug));
    const products = new Map(s.products.map((p) => [p.slug, p]));
    const codes = new Set<string>();
    for (const p of s.products) {
      if (codes.has(p.code)) bad(`product code ${p.code} is used twice`);
      codes.add(p.code);
      for (const c of p.colours) if (!colours.has(c)) bad(`${p.slug}: unknown colour ${c}`);
      for (const z2 of p.sizes) if (!sizes.has(z2)) bad(`${p.slug}: unknown size ${z2}`);
      if (p.sizeChart && !charts.has(p.sizeChart)) bad(`${p.slug}: unknown size chart ${p.sizeChart}`);
      if (!collections.has(p.collection)) bad(`${p.slug}: unknown collection ${p.collection}`);
      if (p.tag && !tags.has(p.tag)) bad(`${p.slug}: unknown tag ${p.tag}`);
      for (const c of p.colours) {
        if (p.stock[c]?.length !== p.sizes.length) bad(`${p.slug}: stock for ${c} needs one number per size`);
      }
      if (p.sampleCompareAtMinor !== undefined && p.sampleCompareAtMinor <= p.samplePriceMinor) {
        bad(`${p.slug}: a compare-at price must be above the price`);
      }
    }
    for (const ch of s.sizeCharts) {
      for (const r of ch.rows) {
        if (!sizes.has(r.size)) bad(`size chart ${ch.key}: unknown size ${r.size}`);
        if (r.values.length !== ch.columns.length) bad(`size chart ${ch.key}: one value per column`);
      }
    }
    for (const i of s.order.items) {
      const p = products.get(i.product);
      if (!p) bad(`order: unknown product ${i.product}`);
      else if (!p.colours.includes(i.colour) || !p.sizes.includes(i.size)) bad(`order: ${i.product} has no ${i.colour}/${i.size}`);
    }
  });

export type SampleData = z.output<typeof sampleSchema>;

export function parseSample(data: unknown, label = 'sample'): SampleData {
  const parsed = sampleSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`${label} is not valid: ${parsed.error.issues.map((i) => `${i.path.join('.') || '(sample)'}: ${i.message}`).join('; ')}`);
  }
  return parsed.data;
}

/** The sample catalogue shipped with this code. */
export const sampleCatalogue: SampleData = parseSample(sampleJson, 'data/sample-catalogue.json');

/** The SKU of a sample variant: always starts with SAMPLE-, so a sample row can never pass for a real one. */
export const sampleSku = (code: string, colour: string, size: string) => `SAMPLE-${code}-${colour}-${size}`.toUpperCase();

export const SAMPLE_TABLES = [
  'Store',
  'Brand',
  'Colour',
  'Size',
  'Collection',
  'Tag',
  'Fabric',
  'SizeChart',
  'SizeChartAssignment',
  'Product',
  'ProductColour',
  'ProductVariant',
  'CategoryProduct',
  'CollectionProduct',
  'ProductTag',
  'Warehouse',
  'InventoryLocation',
  'StockLevel',
  'Customer',
  'Order',
  'OrderItem',
  'OrderEvent',
] as const;
export type SampleTable = (typeof SAMPLE_TABLES)[number];

export interface SampleReport {
  status: 'applied' | 'unchanged';
  storeId: number;
  created: Record<SampleTable, number>;
  /** Pack categories switched visible in the sample store. */
  categoriesShown: number;
  pack: PackReport;
  recorded: boolean;
}

export class SampleSeedRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SampleSeedRefused';
  }
}

export interface SampleOptions {
  sample?: SampleData;
  pack?: PackData;
  /** Allow the sample store next to another live store (never on the owner's installation). */
  besideLiveStore?: boolean;
}

export async function seedSample(prisma: PrismaClient, opts: SampleOptions = {}): Promise<SampleReport> {
  const sample = opts.sample ?? sampleCatalogue;
  const pack = opts.pack ?? defaultPack;
  return prisma.$transaction(
    async (tx) => {
      await lockSeed(tx);
      return seedSampleTx(tx, sample, pack, opts.besideLiveStore ?? false);
    },
    { maxWait: 30_000, timeout: 300_000 },
  );
}

async function seedSampleTx(
  tx: Prisma.TransactionClient,
  s: SampleData,
  pack: PackData,
  besideLiveStore: boolean,
): Promise<SampleReport> {
  const created = Object.fromEntries(SAMPLE_TABLES.map((t) => [t, 0])) as Record<SampleTable, number>;
  const made = (t: SampleTable) => {
    created[t]++;
  };

  // --- the sample store ---
  let store = await tx.store.findUnique({ where: { slug: s.store.slug }, select: { id: true } });
  if (store) {
    const mark = await tx.defaultPackApplication.findFirst({ where: { storeId: store.id, packKey: SAMPLE_PACK_KEY } });
    if (!mark) {
      throw new SampleSeedRefused(`a store with the address "${s.store.slug}" exists and was not made by the sample seed`);
    }
  } else {
    const live = await tx.store.count({ where: { status: 'LIVE', archivedAt: null } });
    if (live > 0 && !besideLiveStore) {
      throw new SampleSeedRefused('a live store exists: sample data never goes next to a real shop');
    }
    const hasPrimary = (await tx.store.count({ where: { isPrimary: true } })) > 0;
    store = await tx.store.create({
      data: {
        slug: s.store.slug,
        name: s.store.name,
        status: 'LIVE',
        isPrimary: hasPrimary ? null : true,
        defaultLocale: s.store.defaultLocale,
        currency: s.store.currency,
        timezone: s.store.timezone,
      },
      select: { id: true },
    });
    made('Store');
  }
  const storeId = store.id;

  // --- the general default pack: garment types, categories, bands, templates ---
  const packReport = await applyPackTx(tx, pack, { storeId });
  const shown = await tx.category.updateMany({
    where: { storeId, slug: { in: s.visibleCategories }, isVisible: false },
    data: { isVisible: true },
  });
  const categories = new Map(
    (await tx.category.findMany({ where: { storeId }, select: { id: true, slug: true, garmentTypeId: true } })).map((c) => [c.slug, c]),
  );
  const garments = new Map((await tx.garmentType.findMany({ where: { storeId }, select: { id: true, key: true } })).map((g) => [g.key, g.id]));
  const need = <T>(map: Map<string, T>, key: string, what: string): T => {
    const v = map.get(key);
    if (v === undefined) throw new Error(`sample: ${what} "${key}" is missing (is it in the default pack?)`);
    return v;
  };

  // --- reference rows ---
  let brand = await tx.brand.findUnique({ where: { storeId_slug: { storeId, slug: s.brand.slug } }, select: { id: true } });
  if (!brand) {
    brand = await tx.brand.create({ data: { storeId, slug: s.brand.slug, name: s.brand.name, isOwnLabel: s.brand.isOwnLabel }, select: { id: true } });
    made('Brand');
  }

  const colourIds = new Map<string, { id: string; nameEn: string }>();
  for (const c of s.colours) {
    let row = await tx.colour.findUnique({ where: { storeId_key: { storeId, key: c.key } }, select: { id: true, nameEn: true } });
    if (!row) {
      row = await tx.colour.create({
        data: { storeId, key: c.key, nameEn: c.nameEn, nameBn: c.nameBn ?? null, hex: c.hex, synonyms: [] },
        select: { id: true, nameEn: true },
      });
      made('Colour');
    }
    colourIds.set(c.key, row);
  }
  const notes = new Map(s.colours.map((c) => [c.key, c.noteEn]));

  const sizeIds = new Map<string, { id: string; label: string }>();
  for (const z2 of s.sizes) {
    let row = await tx.size.findUnique({ where: { storeId_key: { storeId, key: z2.key } }, select: { id: true, label: true } });
    if (!row) {
      row = await tx.size.create({ data: { storeId, key: z2.key, label: z2.label, sortOrder: z2.sortOrder }, select: { id: true, label: true } });
      made('Size');
    }
    sizeIds.set(z2.key, row);
  }

  const collectionIds = new Map<string, string>();
  for (const c of s.collections) {
    let row = await tx.collection.findUnique({ where: { storeId_slug: { storeId, slug: c.slug } }, select: { id: true } });
    if (!row) {
      row = await tx.collection.create({ data: { storeId, slug: c.slug, nameEn: c.nameEn, kind: 'MANUAL' }, select: { id: true } });
      made('Collection');
    }
    collectionIds.set(c.slug, row.id);
  }

  const tagIds = new Map<string, string>();
  for (const t of s.tags) {
    let row = await tx.tag.findUnique({ where: { storeId_slug: { storeId, slug: t.slug } }, select: { id: true } });
    if (!row) {
      row = await tx.tag.create({ data: { storeId, slug: t.slug, name: t.name }, select: { id: true } });
      made('Tag');
    }
    tagIds.set(t.slug, row.id);
  }

  const fabricIds = new Map<string, string>();
  for (const name of [...new Set(s.products.map((p) => p.fabric))]) {
    let row = await tx.fabric.findFirst({ where: { storeId, nameEn: name }, select: { id: true } });
    if (!row) {
      row = await tx.fabric.create({ data: { storeId, nameEn: name }, select: { id: true } });
      made('Fabric');
    }
    fabricIds.set(name, row.id);
  }

  const chartIds = new Map<string, string>();
  for (const ch of s.sizeCharts) {
    let row = await tx.sizeChart.findFirst({ where: { storeId, name: ch.name }, select: { id: true } });
    if (!row) {
      row = await tx.sizeChart.create({
        data: {
          storeId,
          garmentTypeId: need(garments, ch.garmentType, 'garment type'),
          name: ch.name,
          fitKey: ch.fitKey,
          columns: ch.columns,
          rows: ch.rows.map((r) => ({ size: r.size, values: r.values })),
        },
        select: { id: true },
      });
      made('SizeChart');
    }
    chartIds.set(ch.key, row.id);
    for (const slugKey of ch.categories) {
      const categoryId = need(categories, slugKey, 'category').id;
      const has = await tx.sizeChartAssignment.findFirst({ where: { storeId, sizeChartId: row.id, categoryId }, select: { id: true } });
      if (!has) {
        await tx.sizeChartAssignment.create({ data: { storeId, sizeChartId: row.id, categoryId } });
        made('SizeChartAssignment');
      }
    }
  }

  // --- the shared stock pool (installation level, A4.4) ---
  let warehouse = await tx.warehouse.findUnique({ where: { code: s.warehouse.code }, select: { id: true } });
  if (!warehouse) {
    warehouse = await tx.warehouse.create({ data: { code: s.warehouse.code, name: s.warehouse.name }, select: { id: true } });
    made('Warehouse');
  }
  const loc = s.warehouse.location;
  let location = await tx.inventoryLocation.findUnique({
    where: { warehouseId_code: { warehouseId: warehouse.id, code: loc.code } },
    select: { id: true },
  });
  if (!location) {
    location = await tx.inventoryLocation.create({
      data: { warehouseId: warehouse.id, code: loc.code, name: loc.name, kind: loc.kind },
      select: { id: true },
    });
    made('InventoryLocation');
  }

  // --- products, colours, variants, stock and listings ---
  const variants = new Map<string, { id: string; sku: string; productId: string; priceMinor: number; compareAtMinor: number | null; productName: string; colourName: string; sizeLabel: string }>();
  const publishedAt = new Date(s.publishedAt);
  for (const p of s.products) {
    const category = need(categories, p.category, 'category');
    const anyStock = p.colours.some((c) => p.stock[c]!.some((q) => q > 0));
    let product = await tx.product.findUnique({ where: { storeId_slug: { storeId, slug: p.slug } }, select: { id: true } });
    if (!product) {
      product = await tx.product.create({
        data: {
          storeId,
          brandId: brand.id,
          categoryId: category.id,
          fabricId: fabricIds.get(p.fabric) ?? null,
          slug: p.slug,
          nameEn: p.nameEn,
          descriptionEn: p.descriptionEn,
          careEn: p.careEn,
          status: 'PUBLISHED',
          templateKey: p.templateKey,
          pdpBlocks: { fit: p.fit, fitNote: p.fitNote },
          freeDelivery: p.freeDelivery ?? null,
          inStock: anyStock,
          minPriceMinor: p.samplePriceMinor,
          sortRank: p.sortRank,
          publishedAt,
        },
        select: { id: true },
      });
      made('Product');
    }
    const productId = product.id;

    for (const [ci, c] of p.colours.entries()) {
      const colour = need(colourIds, c, 'colour');
      const has = await tx.productColour.findUnique({ where: { productId_colourId: { productId, colourId: colour.id } }, select: { id: true } });
      if (!has) {
        await tx.productColour.create({ data: { storeId, productId, colourId: colour.id, noteEn: notes.get(c) ?? null, sortOrder: ci * 10 } });
        made('ProductColour');
      }
      for (const [si, z2] of p.sizes.entries()) {
        const size = need(sizeIds, z2, 'size');
        const qty = p.stock[c]![si]!;
        const sku = sampleSku(p.code, c, z2);
        let variant = await tx.productVariant.findUnique({ where: { storeId_sku: { storeId, sku } }, select: { id: true } });
        if (!variant) {
          variant = await tx.productVariant.create({
            data: {
              storeId,
              productId,
              colourId: colour.id,
              sizeId: size.id,
              sku,
              priceMinor: p.samplePriceMinor,
              compareAtMinor: p.sampleCompareAtMinor ?? null,
              active: true,
              inStock: qty > 0,
              sortOrder: ci * 100 + si,
            },
            select: { id: true },
          });
          made('ProductVariant');
        }
        variants.set(`${p.slug}/${c}/${z2}`, {
          id: variant.id,
          sku,
          productId,
          priceMinor: p.samplePriceMinor,
          compareAtMinor: p.sampleCompareAtMinor ?? null,
          productName: p.nameEn,
          colourName: colour.nameEn,
          sizeLabel: size.label,
        });
        const level = await tx.stockLevel.findUnique({
          where: { variantId_locationId: { variantId: variant.id, locationId: location.id } },
          select: { id: true },
        });
        if (!level) {
          await tx.stockLevel.create({ data: { variantId: variant.id, locationId: location.id, onHand: qty, available: qty } });
          made('StockLevel');
        }
      }
    }

    const listing = await tx.categoryProduct.findUnique({ where: { categoryId_productId: { categoryId: category.id, productId } }, select: { id: true } });
    if (!listing) {
      await tx.categoryProduct.create({
        data: { storeId, categoryId: category.id, productId, isVisible: true, inStock: anyStock, sortRank: p.sortRank, priceMinor: p.samplePriceMinor },
      });
      made('CategoryProduct');
    }
    const collectionId = need(collectionIds, p.collection, 'collection');
    const inCollection = await tx.collectionProduct.findUnique({ where: { collectionId_productId: { collectionId, productId } }, select: { id: true } });
    if (!inCollection) {
      await tx.collectionProduct.create({ data: { storeId, collectionId, productId, position: p.sortRank } });
      made('CollectionProduct');
    }
    if (p.tag) {
      const tagId = need(tagIds, p.tag, 'tag');
      const tagged = await tx.productTag.findUnique({ where: { tagId_productId: { tagId, productId } }, select: { id: true } });
      if (!tagged) {
        await tx.productTag.create({ data: { storeId, tagId, productId } });
        made('ProductTag');
      }
    }
    if (p.sizeChart) {
      const sizeChartId = need(chartIds, p.sizeChart, 'size chart');
      const has = await tx.sizeChartAssignment.findFirst({ where: { storeId, sizeChartId, productId }, select: { id: true } });
      if (!has) {
        await tx.sizeChartAssignment.create({ data: { storeId, sizeChartId, productId } });
        made('SizeChartAssignment');
      }
    }
  }

  // --- the demo order ---
  const placedAt = new Date(s.order.placedAt);
  let customer = await tx.customer.findUnique({ where: { storeId_phone: { storeId, phone: s.customer.phone } }, select: { id: true } });
  const lines = s.order.items.map((i) => {
    const v = need(variants, `${i.product}/${i.colour}/${i.size}`, 'variant');
    return { ...v, quantity: i.quantity, lineTotalMinor: v.priceMinor * i.quantity };
  });
  const subtotalMinor = lines.reduce((sum, l) => sum + l.lineTotalMinor, 0);
  if (!customer) {
    customer = await tx.customer.create({
      data: {
        storeId,
        phone: s.customer.phone,
        name: s.customer.name,
        email: s.customer.email,
        firstSource: s.order.source,
        orderCount: 1,
        lifetimeValueMinor: subtotalMinor,
        lastOrderAt: placedAt,
      },
      select: { id: true },
    });
    made('Customer');
  }
  const order = await tx.order.findUnique({ where: { storeId_number: { storeId, number: s.order.number } }, select: { id: true } });
  if (!order) {
    // The delivery charge is the owner's (rule 6): the sample order leaves it unset ("charge not fixed", PR 563).
    const madeOrder = await tx.order.create({
      data: {
        storeId,
        number: s.order.number,
        customerId: customer.id,
        status: 'PLACED',
        source: s.order.source,
        currency: s.store.currency,
        placedAt,
        phone: s.customer.phone,
        customerName: s.customer.name,
        email: s.customer.email,
        shippingAddressText: s.order.address,
        chargeFixed: false,
        subtotalMinor,
        totalMinor: subtotalMinor,
        codAmountMinor: s.order.paymentMethod === 'COD' ? subtotalMinor : 0,
        paymentMethod: s.order.paymentMethod,
        idempotencyKey: s.order.idempotencyKey,
        flags: ['sample'],
      },
      select: { id: true },
    });
    made('Order');
    for (const l of lines) {
      await tx.orderItem.create({
        data: {
          storeId,
          orderId: madeOrder.id,
          variantId: l.id,
          productId: l.productId,
          sku: l.sku,
          productName: l.productName,
          colourName: l.colourName,
          sizeLabel: l.sizeLabel,
          quantity: l.quantity,
          unitPriceMinor: l.priceMinor,
          compareAtMinor: l.compareAtMinor,
          lineTotalMinor: l.lineTotalMinor,
        },
      });
      made('OrderItem');
    }
    await tx.orderEvent.create({
      data: { storeId, orderId: madeOrder.id, type: 'order.placed', toStatus: 'PLACED', actorType: 'SYSTEM', source: 'sample-seed', createdAt: placedAt },
    });
    made('OrderEvent');
  }

  // --- the marker: this store is the sample store ---
  const recordedBefore = await tx.defaultPackApplication.findFirst({ where: { storeId, packKey: SAMPLE_PACK_KEY, version: s.version } });
  if (!recordedBefore) {
    await tx.defaultPackApplication.create({ data: { storeId, packKey: SAMPLE_PACK_KEY, version: s.version, summary: { created } } });
  }

  const createdAny = Object.values(created).some((n) => n > 0) || shown.count > 0 || packReport.status === 'applied';
  return {
    status: createdAny || !recordedBefore ? 'applied' : 'unchanged',
    storeId,
    created,
    categoriesShown: shown.count,
    pack: packReport,
    recorded: !recordedBefore,
  };
}

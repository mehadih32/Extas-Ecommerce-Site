// S28 · PR 708 — the demo catalogue: the approved demo's 72 styles made as real DEMO products (`isDemo`), with their
// categories, colours, sizes, per-colour/size stock, fabric, care, fit, model line, tag, collection and size chart.
// The data is `demo-catalogue.json`, made from the demo source by tools/demo/export-demo-catalogue.mjs. Idempotent (a
// style is made once, by its address `demo-<style>`), never touches a product that is not a demo one, and everything is
// made hidden: the switches of PR 684 (`catalogue.demo`) decide what shows. Reading a colour, size, collection, tag,
// fabric or category that already exists reuses it. Photos: the shop draws its own placeholder for a product without one.
import data from './demo-catalogue.json';
import { allow, logChange, type CatalogueDeps, type Who } from './context';

interface DemoRow {
  slug: string;
  nameEn: string;
  category: string;
  collection: string;
  tag: string | null;
  template: string;
  sortRank: number;
  descriptionEn: string;
  careEn: string;
  fabric: string;
  fit: string;
  fitNote: string;
  model: string | null;
  freeDelivery: boolean;
  chart: string | null;
  priceMinor: number;
  compareAtMinor: number | null;
  colours: string[];
  sizes: string[];
  stock: Record<string, number[]>;
}

const pack = data as unknown as {
  categories: {
    slug: string;
    nameEn: string;
    nameBn: string;
    garment: string;
    hidden: boolean;
    introEn: string;
  }[];
  colours: {
    key: string;
    nameEn: string;
    hex: string;
    noteEn: string | null;
  }[];
  sizes: { key: string; label: string; sortOrder: number }[];
  charts: {
    key: string;
    name: string;
    garment: string;
    fitKey: string;
    easeInch: number;
    fields: { key: string; labelEn: string }[];
    rows: { size: string; values: number[] }[];
  }[];
  collections: { slug: string; nameEn: string }[];
  tags: { slug: string; name: string }[];
  products: DemoRow[];
};

/** How many styles the demo catalogue holds. */
export const DEMO_CATALOGUE_SIZE = pack.products.length;

export interface DemoCatalogueResult {
  /** Styles made now. */
  made: number;
  /** Styles that were already there (or whose address belongs to a real product) and were left alone. */
  skipped: number;
  /** Categories added because the shop did not have them yet. */
  categoriesMade: number;
}

export async function addDemoCatalogue(deps: CatalogueDeps, who: Who): Promise<DemoCatalogueResult> {
  await allow(deps, who, 'catalogue.write');
  const storeId = who.storeId;
  const db = deps.db;
  let categoriesMade = 0;
  const now = deps.now?.() ?? new Date();

  // --- garment types and categories (as in the demo; a category the shop has is reused as it is) ---
  const garments = new Map(
    (
      await db.garmentType.findMany({
        where: { storeId },
        select: { id: true, key: true },
      })
    ).map((g) => [g.key, g.id]),
  );
  const garmentFor = async (key: string, fields: { key: string; labelEn: string }[]): Promise<string> => {
    let id = garments.get(key);
    if (!id) {
      const nameEn = key[0]!.toUpperCase() + key.slice(1);
      id = (
        await db.garmentType.create({
          data: {
            storeId,
            key,
            nameEn,
            nameBn: nameEn,
            measurementFields: fields.map((f) => ({
              key: f.key,
              labelEn: f.labelEn,
              labelBn: f.labelEn,
              unit: 'inch',
            })),
          },
          select: { id: true },
        })
      ).id;
      garments.set(key, id);
    }
    return id;
  };
  const categories = new Map(
    (
      await db.category.findMany({
        where: { storeId },
        select: { id: true, slug: true },
      })
    ).map((c) => [c.slug, c.id]),
  );
  for (const [i, c] of pack.categories.entries()) {
    if (categories.has(c.slug)) continue;
    const chart = pack.charts.find((x) => x.garment === c.garment);
    const garmentTypeId = await garmentFor(c.garment, chart?.fields ?? []);
    const row = await db.category.create({
      data: {
        storeId,
        slug: c.slug,
        nameEn: c.nameEn,
        nameBn: c.nameBn,
        introEn: c.introEn,
        garmentTypeId,
        sortOrder: 100 + i,
        isVisible: !c.hidden,
      },
      select: { id: true },
    });
    categories.set(c.slug, row.id);
    categoriesMade += 1;
  }

  // --- colours, sizes, collections, tags, fabrics, size charts (found by their key or name, else made) ---
  const colourIds = new Map<string, string>();
  for (const c of pack.colours) {
    const row =
      (await db.colour.findUnique({
        where: { storeId_key: { storeId, key: c.key } },
        select: { id: true },
      })) ??
      (await db.colour.create({
        data: {
          storeId,
          key: c.key,
          nameEn: c.nameEn,
          hex: c.hex,
          synonyms: [],
        },
        select: { id: true },
      }));
    colourIds.set(c.key, row.id);
  }
  const colourNote = new Map(pack.colours.map((c) => [c.key, c.noteEn]));
  const sizeIds = new Map<string, string>();
  for (const z of pack.sizes) {
    const row =
      (await db.size.findUnique({
        where: { storeId_key: { storeId, key: z.key } },
        select: { id: true },
      })) ??
      (await db.size.create({
        data: { storeId, key: z.key, label: z.label, sortOrder: z.sortOrder },
        select: { id: true },
      }));
    sizeIds.set(z.key, row.id);
  }
  const collectionIds = new Map<string, string>();
  for (const c of pack.collections) {
    const row =
      (await db.collection.findUnique({
        where: { storeId_slug: { storeId, slug: c.slug } },
        select: { id: true },
      })) ??
      (await db.collection.create({
        data: { storeId, slug: c.slug, nameEn: c.nameEn, kind: 'MANUAL' },
        select: { id: true },
      }));
    collectionIds.set(c.slug, row.id);
  }
  const tagIds = new Map<string, string>();
  for (const t of pack.tags) {
    const row =
      (await db.tag.findUnique({
        where: { storeId_slug: { storeId, slug: t.slug } },
        select: { id: true },
      })) ??
      (await db.tag.create({
        data: { storeId, slug: t.slug, name: t.name },
        select: { id: true },
      }));
    tagIds.set(t.slug, row.id);
  }
  const fabricIds = new Map<string, string>();
  for (const nameEn of new Set(pack.products.map((p) => p.fabric))) {
    const row =
      (await db.fabric.findFirst({
        where: { storeId, nameEn },
        select: { id: true },
      })) ??
      (await db.fabric.create({
        data: { storeId, nameEn },
        select: { id: true },
      }));
    fabricIds.set(nameEn, row.id);
  }
  const chartIds = new Map<string, string>();
  for (const ch of pack.charts) {
    const found = await db.sizeChart.findFirst({
      where: { storeId, name: ch.name },
      select: { id: true },
    });
    const row =
      found ??
      (await db.sizeChart.create({
        data: {
          storeId,
          garmentTypeId: await garmentFor(ch.garment, ch.fields),
          name: ch.name,
          fitKey: ch.fitKey,
          columns: {
            fields: ch.fields.map((f) => f.key),
            easeInch: ch.easeInch,
            diagram: null,
            copiedFromId: null,
          },
          rows: ch.rows,
        },
        select: { id: true },
      }));
    chartIds.set(ch.key, row.id);
  }

  // --- stock goes to the shop's first stock place, when there is one ---
  const location = await db.inventoryLocation.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  // --- the styles ---
  let made = 0;
  let skipped = 0;
  for (const p of pack.products) {
    if (
      await db.product.findFirst({
        where: { storeId, slug: p.slug },
        select: { id: true },
      })
    ) {
      skipped += 1;
      continue;
    }
    const categoryId = categories.get(p.category)!;
    const anyStock = p.colours.some((c) => p.stock[c]!.some((q) => q > 0));
    await db.$transaction(
      async (tx) => {
        const product = await tx.product.create({
          data: {
            storeId,
            categoryId,
            fabricId: fabricIds.get(p.fabric) ?? null,
            slug: p.slug,
            nameEn: p.nameEn,
            descriptionEn: p.descriptionEn,
            careEn: p.careEn,
            status: 'UNPUBLISHED',
            isDemo: true,
            templateKey: p.template,
            pdpBlocks: {
              fit: p.fit,
              fitNote: p.fitNote,
              ...(p.model ? { model: p.model } : {}),
            },
            freeDelivery: p.freeDelivery ? true : null,
            inStock: anyStock,
            minPriceMinor: p.priceMinor,
            sortRank: p.sortRank,
            unpublishedAt: now,
          },
          select: { id: true },
        });
        const productId = product.id;
        await tx.productColour.createMany({
          data: p.colours.map((c, ci) => ({
            storeId,
            productId,
            colourId: colourIds.get(c)!,
            noteEn: colourNote.get(c) ?? null,
            sortOrder: ci * 10,
          })),
        });
        const wanted = p.colours.flatMap((c, ci) =>
          p.sizes.map((z, si) => ({
            c,
            z,
            qty: p.stock[c]![si] ?? 0,
            sort: ci * 100 + si,
          })),
        );
        await tx.productVariant.createMany({
          data: wanted.map((w) => ({
            storeId,
            productId,
            colourId: colourIds.get(w.c)!,
            sizeId: sizeIds.get(w.z)!,
            sku: `DEMO-${p.slug.slice(5)}-${w.c}-${w.z}`.toUpperCase().slice(0, 80),
            priceMinor: p.priceMinor,
            compareAtMinor: p.compareAtMinor,
            active: true,
            inStock: w.qty > 0,
            sortOrder: w.sort,
          })),
        });
        if (location) {
          const variants = await tx.productVariant.findMany({
            where: { storeId, productId },
            select: { id: true, sku: true },
          });
          const bySku = new Map(variants.map((v) => [v.sku, v.id]));
          await tx.stockLevel.createMany({
            data: wanted.map((w) => ({
              variantId: bySku.get(`DEMO-${p.slug.slice(5)}-${w.c}-${w.z}`.toUpperCase().slice(0, 80))!,
              locationId: location.id,
              onHand: w.qty,
              available: w.qty,
            })),
          });
        }
        await tx.categoryProduct.create({
          data: {
            storeId,
            categoryId,
            productId,
            isVisible: false,
            inStock: anyStock,
            sortRank: p.sortRank,
            priceMinor: p.priceMinor,
          },
        });
        await tx.collectionProduct.create({
          data: {
            storeId,
            collectionId: collectionIds.get(p.collection)!,
            productId,
            position: p.sortRank,
          },
        });
        if (p.tag)
          await tx.productTag.create({
            data: { storeId, tagId: tagIds.get(p.tag)!, productId },
          });
        if (p.chart)
          await tx.sizeChartAssignment.create({
            data: { storeId, sizeChartId: chartIds.get(p.chart)!, productId },
          });
        await logChange(tx, who, 'demo.catalogue', 'Product', productId, null, {
          slug: p.slug,
        });
      },
      { timeout: 60_000 },
    );
    made += 1;
  }
  return { made, skipped, categoriesMade };
}

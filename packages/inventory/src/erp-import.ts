// PR 609 (CN-028) — import from the ERP by style code (docs/erp/site-changes-v6.md §2.1). The admin types a style code;
// every SKU of that style comes in (`GET /catalog/variants?styleCode=`: colour, size, barcode, grade, shop price) and
// groups into one product, a draft. Nothing is priced for the customer: the admin sees "bought from ERP at" (only with
// `catalogue.prices`; never shown to customers) and sets the selling price on the product page.
// - Colours must already be in the shop's colour list (a colour needs its shade, which the ERP does not send): a style
//   with an unknown colour is refused with COLOUR_MISSING naming them, before anything is made. Sizes are made as
//   needed (a size is only a label).
// - The factory's own B-grade SKUs (grade B: their own SKU, shop price and stock) are a separate listing when
//   `catalogue.bGrade.listing` is on (its name gets `catalogue.bGrade.nameSuffix`); off, they are left out.
// - Importing again adds the new SKUs and refreshes the rest (barcode, buying price); a changed buying price is flagged
//   (shop-price.ts). A SKU that already belongs to another product stays where it is (it is listed, not moved).
// - On the practice ERP the preview works (marked practice) but nothing is saved: practice data is never made real.
// - Contract v6 only (register row 609): a store still on v5 is refused (ERP_V5); its catalogue comes as before.
// qa-gate (30 Oct):
// - Switch-over: the shop's SKUs often already sit in products made before the ERP, without a style code. When the
//   style has no product of its own yet and all of a grade's SKUs already in the shop are in one such product, that
//   product is adopted (it gets the style code; the preview says `adopt`) and the rest of the style joins it. SKUs spread
//   over several products, or in a product of another style, stop the import (SKU_IN_OTHER_PRODUCT, each one listed in
//   the preview with its product); a row the shop cannot take as sent (a SKU, barcode or size label too long, or an
//   existing SKU whose colour or size changed) stops it too (ROW_NOT_ACCEPTED).
// - Everything is checked before anything is written, and then the new sizes, the products (made or adopted), the
//   variants, their grades and buying prices are written in one transaction: a failure half-way leaves nothing behind.
// - A re-import never turns back on a variant the admin turned off; a variant the ERP turned off is turned off.
// - qa-gate re-check: a SKU the admin archived is left out (ARCHIVED, shown in the preview): a re-import never brings it
//   back on sale; restoring it is the admin's own step on the product page.
import { can } from '@extas/auth';
import { allow as allowCatalogue, createProduct, createSize, findColour, listSizes, sizeInput, upsertVariantBySku, variantInput, type CatalogueDeps } from '@extas/catalogue';
import type { ErpGrade, ErpVariantRow } from '@extas/adapters';
import type { PrismaClient } from '@extas/db/client';
import { z } from 'zod';
import { allow, logChange, nowOf, parse, setting, TX, type InventoryDeps, type Tx, type Who } from './context';
import { InventoryError } from './errors';
import { erpModelOf } from './erp-model';
import { currencyDigits } from './erp-push';
import { behaviourOf, resolveErp } from './guard';
import { checkCompany } from './mapping';
import { decimalToMinor } from './money';
import { applyShopPrice } from './shop-price';
import { callErp, retryPolicy } from './sync';

export const styleCodeInput = z.object({ styleCode: z.string().trim().min(1).max(60) }).strict();
export type StyleCodeInput = z.input<typeof styleCodeInput>;

export type ErpLineSkip = 'B_GRADE_OFF' | 'OTHER_PRODUCT' | 'INACTIVE' | 'ARCHIVED';

export interface ErpStyleLine {
  sku: string;
  colour: string | null;
  colourId: string | null;
  size: string | null;
  sizeId: string | null;
  barcode: string | null;
  grade: ErpGrade;
  /** "Bought from ERP at", minor units: null when not known, or when the person may not see buying prices. */
  shopPriceMinor: number | null;
  active: boolean;
  inShop: { productId: string; variantId: string } | null;
  action: 'create' | 'update' | 'skip';
  skip: ErpLineSkip | null;
}

export interface ErpStyleListing {
  grade: ErpGrade;
  /** The product it goes into: an existing one of this style and grade, one adopted (see `adopt`), or null (a new draft). */
  productId: string | null;
  name: string;
  lines: number;
  /** The product was made before the ERP (no style code) and holds this grade's SKUs already: it gets the style code. */
  adopt: boolean;
}

/** A SKU of the style that sits in a product the import may not take over. */
export interface ErpStyleConflict {
  sku: string;
  productId: string;
  productName: string;
}

/** A row the shop cannot take as the ERP sent it. */
export interface ErpStyleInvalidRow {
  sku: string;
  why: 'SKU' | 'BARCODE' | 'SIZE' | 'GARMENT_CHANGED';
}

export interface ErpStylePreview {
  state: 'run' | 'practice';
  model: 'v5' | 'v6';
  styleCode: string;
  styleName: string | null;
  lines: ErpStyleLine[];
  listings: ErpStyleListing[];
  /** ERP colours the shop's colour list does not know (add them first). */
  missingColours: string[];
  /** Sizes the import will make. */
  newSizes: string[];
  /** May the person see buying prices (`catalogue.prices`)? */
  showsBuyingPrice: boolean;
  /** SKUs in products the import may not take over (they stop the import). */
  conflicts: ErpStyleConflict[];
  /** Rows the shop cannot take as sent (they stop the import). */
  invalid: ErpStyleInvalidRow[];
  /** What stops the import: ERP_V5, COLOUR_MISSING, SKU_IN_OTHER_PRODUCT, ROW_NOT_ACCEPTED, NOTHING_TO_IMPORT, ERP_ON_PRACTICE. */
  blocking: string[];
}

const catDeps = (deps: InventoryDeps): CatalogueDeps => ({ db: deps.db, settings: deps.settings, now: deps.now });
const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/**
 * The catalogue's own writes (a size, a product, a variant) each open a transaction; given this, they run inside ours
 * instead, so the whole import is one all-or-nothing transaction.
 */
function within(tx: Tx): PrismaClient {
  return new Proxy(tx, {
    get(t, k, r) {
      if (k === '$transaction')
        return (fn: unknown) => {
          if (typeof fn !== 'function') throw new Error('erp-import: a batch transaction inside the import');
          return (fn as (x: Tx) => unknown)(tx);
        };
      return Reflect.get(t, k, r) as unknown;
    },
  }) as unknown as PrismaClient;
}

const PROBE_ID = '00000000-0000-4000-8000-000000000000';

async function styleRows(deps: InventoryDeps, who: Who, styleCode: string): Promise<{ state: 'run' | 'practice'; rows: ErpVariantRow[] }> {
  const link = await resolveErp(deps, who.storeId);
  if (link.state === 'none') throw new InventoryError('ERP_NOT_CONNECTED', 'this store runs without an ERP');
  if (link.state === 'unavailable') throw new InventoryError('ERP_UNAVAILABLE', link.reason, [link.code]);
  if (behaviourOf('variants.discover', link) === 'skip') throw new InventoryError('ERP_NOT_CONNECTED', 'this store runs without an ERP');
  const policy = await retryPolicy(deps);
  if (link.state === 'connected') await checkCompany(deps, link, (await callErp(deps, policy, (o) => link.api.health(o))).value);
  const state = link.state === 'mock' ? 'practice' : 'run';
  const v6 = link.api.v6;
  if (v6) return { state, rows: (await callErp(deps, policy, (o) => v6.variantsByStyle(styleCode, o))).value };
  // An ERP without the v6 reads: the variant list, filtered to the style.
  const [pageSize, maxPages] = await Promise.all([setting(deps, null, 'erp.sync.pageSize'), setting(deps, null, 'inventory.publish.discoverMaxPages')]);
  const rows: ErpVariantRow[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const p = (await callErp(deps, policy, (o) => link.api.variants({ cursor, limit: pageSize, styleCode }, o))).value;
    rows.push(...p.items.filter((r) => r.styleCode === styleCode));
    cursor = p.nextCursor;
    if (!cursor) break;
  }
  return { state, rows };
}

/** What importing this style would do. Reads the ERP; changes nothing. */
export async function previewErpStyle(deps: InventoryDeps, who: Who, input: StyleCodeInput): Promise<ErpStylePreview> {
  await allow(deps, who, 'inventory.read');
  const cd = catDeps(deps);
  const { styleCode } = parse(styleCodeInput, input, 'style code');
  await allowCatalogue(cd, who, 'catalogue.import');
  const [{ state, rows }, model, bGrade, suffix, sizes, store, showsBuyingPrice] = await Promise.all([
    styleRows(deps, who, styleCode),
    erpModelOf(deps, who.storeId),
    setting(deps, who.storeId, 'catalogue.bGrade.listing'),
    setting(deps, who.storeId, 'catalogue.bGrade.nameSuffix'),
    listSizes(cd, who),
    deps.db.store.findUniqueOrThrow({ where: { id: who.storeId }, select: { currency: true } }),
    can(deps.db, who.actor, 'catalogue.prices', { storeId: who.storeId }),
  ]);
  const digits = currencyDigits(store.currency);
  const known = await deps.db.productVariant.findMany({
    where: { storeId: who.storeId, sku: { in: rows.map((r) => r.sku) } },
    select: { id: true, sku: true, productId: true, colourId: true, sizeId: true, archivedAt: true, product: { select: { id: true, nameEn: true, erpStyleCode: true, archivedAt: true } } },
  });
  const bySku = new Map(known.map((k) => [k.sku, k]));
  const products = await deps.db.product.findMany({ where: { storeId: who.storeId, erpStyleCode: styleCode, archivedAt: null }, select: { id: true, nameEn: true, erpGrade: true }, orderBy: { createdAt: 'asc' } });
  const own = (g: ErpGrade) => products.find((p) => p.erpGrade === g) ?? null;
  // Switch-over: a grade with no product of the style yet whose SKUs in the shop all sit in one product made before the
  // ERP (no style code, not archived) adopts that product; one product is adopted for one grade only.
  const gradeOf = (r: ErpVariantRow): ErpGrade => r.grade ?? 'A';
  const adopted = new Map<ErpGrade, { id: string; nameEn: string }>();
  for (const g of ['A', 'B'] as const) {
    if (own(g) || (g === 'B' && !bGrade)) continue;
    // (An archived SKU is left out of the import, so it never decides which product is adopted.)
    const live = (sku: string) => (bySku.get(sku) && !bySku.get(sku)!.archivedAt ? bySku.get(sku)! : null);
    const holders = new Map(rows.filter((r) => gradeOf(r) === g).flatMap((r) => (live(r.sku) ? [[live(r.sku)!.productId, live(r.sku)!.product]] : [])));
    const [only] = [...holders.values()];
    if (holders.size === 1 && only && only.erpStyleCode === null && only.archivedAt === null && ![...adopted.values()].some((a) => a.id === only.id)) adopted.set(g, { id: only.id, nameEn: only.nameEn });
  }
  const target = (g: ErpGrade) => own(g) ?? adopted.get(g) ?? null;
  const colourIds = new Map<string, string | null>();
  for (const c of new Set(rows.map((r) => r.color).filter((c): c is string => !!c))) colourIds.set(c, (await findColour(cd, who, c))?.id ?? null);
  const sizeOf = (label: string | null) => (label ? (sizes.find((s) => norm(s.label) === norm(label) || norm(s.erpSizeCode) === norm(label)) ?? null) : null);

  const lines: ErpStyleLine[] = rows
    .slice()
    .sort((a, b) => a.sku.localeCompare(b.sku))
    .map((r) => {
      const grade: ErpGrade = r.grade ?? 'A';
      const have = bySku.get(r.sku) ?? null;
      const into = target(grade);
      const skip: ErpLineSkip | null =
        grade === 'B' && !bGrade ? 'B_GRADE_OFF' : have?.archivedAt ? 'ARCHIVED' : have && into && have.productId !== into.id ? 'OTHER_PRODUCT' : !have && !r.active ? 'INACTIVE' : null;
      return {
        sku: r.sku,
        colour: r.color,
        colourId: r.color ? (colourIds.get(r.color) ?? null) : null,
        size: r.size,
        sizeId: sizeOf(r.size)?.id ?? null,
        barcode: r.barcode,
        grade,
        shopPriceMinor: showsBuyingPrice ? decimalToMinor(r.shopPrice ?? null, digits) : null,
        active: r.active,
        inShop: have ? { productId: have.productId, variantId: have.id } : null,
        action: skip ? 'skip' : have ? 'update' : 'create',
        skip,
      };
    });
  const taken = lines.filter((l) => l.action !== 'skip');
  const missingColours = [...new Set(taken.filter((l) => l.colour && !l.colourId).map((l) => l.colour!))].sort();
  const newSizes = [...new Set(taken.filter((l) => l.size && !l.sizeId).map((l) => l.size!))].sort();
  // Everything the writes would refuse, found before any of them: a SKU in a product that is not the grade's own, a row
  // the catalogue cannot take as sent, an existing SKU whose colour or size changed (an SKU's garment never changes).
  const conflicts: ErpStyleConflict[] = [];
  const invalid: ErpStyleInvalidRow[] = [];
  for (const l of taken) {
    const have = bySku.get(l.sku);
    const into = target(l.grade);
    if (have && (!into || have.productId !== into.id)) {
      conflicts.push({ sku: l.sku, productId: have.productId, productName: have.product.nameEn });
      continue;
    }
    const v = variantInput.safeParse({ sku: l.sku, productId: PROBE_ID, barcode: l.barcode });
    if (!v.success) invalid.push({ sku: l.sku, why: v.error.issues.some((i) => i.path[0] === 'sku') ? 'SKU' : 'BARCODE' });
    else if (l.size && !l.sizeId && !sizeInput.safeParse({ label: l.size }).success) invalid.push({ sku: l.sku, why: 'SIZE' });
    // (A colour the shop does not know yet is COLOUR_MISSING above, not a changed garment.)
    else if (have && (l.colourId !== null || !l.colour) && (have.colourId !== l.colourId || have.sizeId !== l.sizeId)) invalid.push({ sku: l.sku, why: 'GARMENT_CHANGED' });
  }
  const styleName = rows.find((r) => r.styleName)?.styleName ?? null;
  const listings: ErpStyleListing[] = (['A', 'B'] as const)
    .map((g) => {
      const n = taken.filter((l) => l.grade === g).length;
      const into = target(g);
      return { grade: g, productId: into?.id ?? null, name: into?.nameEn ?? `${styleName ?? styleCode}${g === 'B' ? suffix : ''}`, lines: n, adopt: adopted.has(g) };
    })
    .filter((l) => l.lines > 0);
  const blocking = [
    ...(model !== 'v6' ? ['ERP_V5'] : []),
    ...(missingColours.length ? ['COLOUR_MISSING'] : []),
    ...(conflicts.length ? ['SKU_IN_OTHER_PRODUCT'] : []),
    ...(invalid.length ? ['ROW_NOT_ACCEPTED'] : []),
    ...(taken.length ? [] : ['NOTHING_TO_IMPORT']),
    ...(state === 'practice' ? ['ERP_ON_PRACTICE'] : []),
  ];
  return { state, model, styleCode, styleName, lines, listings, missingColours, newSizes, showsBuyingPrice, conflicts, invalid, blocking };
}

export interface ErpStyleImportResult {
  styleCode: string;
  products: { grade: ErpGrade; productId: string; created: boolean; adopted: boolean }[];
  created: number;
  updated: number;
  skipped: number;
  sizesCreated: number;
  /** Buying prices that changed since the last import (flagged for the admin). */
  buyingPricesChanged: number;
}

/**
 * Imports the style: one product per grade (a new draft, the style's own, or one adopted at switch-over), its SKUs and
 * their buying price, in one transaction. No selling price is set.
 */
export async function importErpStyle(deps: InventoryDeps, who: Who, input: StyleCodeInput): Promise<ErpStyleImportResult> {
  const p = await previewErpStyle(deps, who, input);
  // The practice ERP first: whatever the contract, its data is never saved.
  if (p.state === 'practice') throw new InventoryError('ERP_ON_PRACTICE', 'the practice ERP is never imported as real products');
  if (p.model !== 'v6') throw new InventoryError('ERP_V5', 'import by style code needs the store on ERP contract v6');
  if (p.missingColours.length) throw new InventoryError('COLOUR_MISSING', 'add these colours to the colour list first', p.missingColours);
  if (p.conflicts.length) throw new InventoryError('SKU_IN_OTHER_PRODUCT', 'these SKUs sit in other products; move or archive them first', p.conflicts.map((c) => c.sku));
  if (p.invalid.length) throw new InventoryError('ROW_NOT_ACCEPTED', 'the shop cannot take these rows as the ERP sent them', p.invalid.map((r) => `${r.sku}: ${r.why}`));
  if (!p.lines.some((l) => l.action !== 'skip')) throw new InventoryError('NOTHING_TO_IMPORT', 'no SKU of this style can be imported', [p.styleCode]);
  const now = nowOf(deps);
  // Buying prices are read again here (the preview hides them from someone without `catalogue.prices`): before the
  // transaction, so no network call runs inside it.
  const fresh = new Map((await styleRows(deps, who, p.styleCode)).rows.map((r) => [r.sku, r]));
  return deps.db.$transaction(async (tx) => {
    const cd: CatalogueDeps = { db: within(tx), settings: deps.settings, now: deps.now };
    const sizeIds = new Map<string, string>();
    for (const label of p.newSizes) sizeIds.set(label, (await createSize(cd, who, { label })).id);
    const out: ErpStyleImportResult = { styleCode: p.styleCode, products: [], created: 0, updated: 0, skipped: 0, sizesCreated: p.newSizes.length, buyingPricesChanged: 0 }; // hardcode-ok: counters that start at zero, not a price
    for (const listing of p.listings) {
      let productId = listing.productId;
      if (!productId) {
        productId = (await createProduct(cd, who, { nameEn: listing.name, erpStyleCode: p.styleCode })).id;
        if (listing.grade !== 'A') await tx.product.update({ where: { id: productId }, data: { erpGrade: listing.grade } });
      } else if (listing.adopt) {
        // Taken over only while it is still nobody's (another import may have adopted it since the preview).
        const took = await tx.product.updateMany({ where: { id: productId, storeId: who.storeId, erpStyleCode: null, archivedAt: null }, data: { erpStyleCode: p.styleCode, erpGrade: listing.grade } });
        if (took.count !== 1) throw new InventoryError('SKU_IN_OTHER_PRODUCT', 'the product to adopt changed since the preview; preview again', [productId]);
      }
      out.products.push({ grade: listing.grade, productId, created: !listing.productId, adopted: listing.adopt });
      for (const l of p.lines.filter((x) => x.grade === listing.grade && x.action !== 'skip')) {
        const sizeId = l.sizeId ?? (l.size ? (sizeIds.get(l.size) ?? null) : null);
        // A new SKU takes the ERP's on/off; an existing one is turned off when the ERP turned it off, and otherwise keeps
        // what the admin chose (a re-import never turns a variant back on).
        const active = l.inShop ? (l.active ? undefined : false) : l.active;
        const r = await upsertVariantBySku(cd, who, { sku: l.sku, productId, colourId: l.colourId, sizeId, barcode: l.barcode, active });
        if (r.created) out.created++;
        else out.updated++;
        await tx.productVariant.update({ where: { id: r.variant.id }, data: { grade: l.grade } });
        if ((await applyShopPrice(tx, who.storeId, l.sku, fresh.get(l.sku)?.shopPrice ?? null, now)) === 'changed') out.buyingPricesChanged++;
      }
    }
    out.skipped = p.lines.filter((l) => l.action === 'skip').length;
    await logChange(tx, who, { action: 'erp.style.import', entityType: 'Product', entityId: out.products[0]!.productId, before: null, after: { ...out }, storeId: who.storeId });
    return out;
  }, TX);
}

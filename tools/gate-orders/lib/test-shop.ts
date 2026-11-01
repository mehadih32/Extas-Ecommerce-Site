// PR 414 follow-up (CN-013 go-live gate phase 2; live run 1 Nov) — the shop-side test-data helpers both go-live gate
// runs share: tools/gate-orders (its oracle, server/actions.ts) and tools/gate-c360 (helper.ts). Run with tsx from
// inside the workspace (infra/deploy/gate-orders.sh mounts tools/gate-orders at /repo/apps/web/gate-orders,
// gate-c360.sh at /repo/packages/jobs/.gate-orders), so the @extas packages resolve.
//
// 1. The GATE TEST products (data/test-data.json: sample data only, every row marked GATE TEST): made or opened again
//    at the start, archived at the end — never deleted.
// 2. The run's mock-payment grant: the live run of 1 Nov skipped every order because cash on delivery is the owner's
//    switch (off) and the practice gateway's page is closed for everyone while `payments.testPayments` is off. The run
//    never switches that on for the shop. It opens a grant for its own browser only (apps/web/src/lib/shop/gate-run.ts
//    reads it): one IdempotencyKey row (scope `gate-run.mock-pay`, key the run's id) with the SHA-256 of the run's
//    random token, the preview host and a short expiry, refused for any host but the preview host. Closed at the end
//    (the shell's trap runs the close on a failure or a signal too; the next run closes what a crashed one left).
// 3. Cash on delivery only with the workflow's `allow_cod` (the owner's OK, default false): switched on for the store
//    while the run lasts and put back to the exact earlier value afterwards (the earlier row, or no row at all), unless
//    someone changed it meanwhile — then it is left as they set it and the report says so.
// Every change is an audit line as the system actor. No price, discount, charge or COD amount is ever changed, and no
// real payment key or connection is touched.
import { audit } from '@extas/auth';
import { unpublishProduct, updateProduct, type Who } from '@extas/catalogue';
import type { PrismaClient } from '@extas/db/client';
import { recomputeVariantStock } from '@extas/inventory';
import { storeTarget, type registry, type SettingsResolver } from '@extas/settings';

/** The test data file's shape (data/test-data.json; only what the shop side reads). */
export interface TestData {
  marker: string;
  slugPrefix: string;
  warehouse: { code: string; name: string; location: { code: string; name: string } };
  colours: { key: string; nameEn: string; nameBn: string; hex: string }[];
  sizes: { key: string; label: string; sortOrder: number }[];
  products: { key: string; slug: string; nameEn: string; nameBn: string; priceMinor: number; weightGrams: number; colours: string[]; sizes: string[]; stock: number }[];
  payment: { recordMinor: number };
  statement: { collectedMinor: number; chargeMinor: number; unknownConsignment: string };
  weightCheckGrams: number;
}

/** What the helpers need: the shop's database and settings, the store, the system actor and the run's audit source. */
export interface Kit {
  db: PrismaClient;
  storeId: number;
  settings: SettingsResolver<typeof registry>;
  who: Who;
  /** The audit actions' prefix (`gate-orders`, `gate-c360`). */
  source: string;
}

type Json = Record<string, unknown>;
const errText = (e: unknown): string => {
  const code = (e as { code?: unknown })?.code;
  return `${typeof code === 'string' ? `${code}: ` : ''}${e instanceof Error ? e.message : String(e)}`.split('\n')[0]!.slice(0, 300);
};

/** The SKU of a GATE TEST piece (every one starts with the marker, so a run finds its own orders and nothing else). */
export const skuPrefix = (d: TestData): string => `${d.marker.replace(/\s+/g, '-').toUpperCase()}-`;
export const skuOf = (d: TestData, product: string, colour: string, size: string): string =>
  `${skuPrefix(d)}${product}-${colour.replace(d.slugPrefix, '')}-${size.replace(d.slugPrefix, '')}`.toUpperCase();

// ---- 1. the GATE TEST products ----

/** One test variant as the runs use it. */
export interface TestVariant {
  id: string;
  sku: string;
  colour: string;
  size: string;
  priceMinor: number;
  weightGrams: number;
}

/** The test colours, sizes, shelf, products, variants and stock (made once, opened again on a later run). */
export async function setUpProducts(k: Kit, d: TestData, runId: string): Promise<{ products: { key: string; slug: string; id: string; variants: TestVariant[] }[]; locationKind: string }> {
  const S = k.storeId;
  const kinds = new Set(await k.settings.value('inventory.sellableLocationKinds'));
  const kind = kinds.has('WAREHOUSE') ? 'WAREHOUSE' : ([...kinds][0] ?? 'WAREHOUSE');
  const now = new Date();
  return k.db.$transaction(
    async (tx) => {
      const colour = new Map<string, string>();
      for (const c of d.colours) {
        const row = await tx.colour.upsert({ where: { storeId_key: { storeId: S, key: c.key } }, create: { storeId: S, key: c.key, nameEn: c.nameEn, nameBn: c.nameBn, hex: c.hex, synonyms: [] }, update: { archivedAt: null }, select: { id: true } });
        colour.set(c.key, row.id);
      }
      const size = new Map<string, string>();
      for (const z of d.sizes) {
        const row = await tx.size.upsert({ where: { storeId_key: { storeId: S, key: z.key } }, create: { storeId: S, key: z.key, label: z.label, sortOrder: z.sortOrder }, update: { archivedAt: null }, select: { id: true } });
        size.set(z.key, row.id);
      }
      const wh = await tx.warehouse.upsert({ where: { code: d.warehouse.code }, create: { code: d.warehouse.code, name: d.warehouse.name }, update: { archivedAt: null }, select: { id: true } });
      const loc = await tx.inventoryLocation.upsert({
        where: { warehouseId_code: { warehouseId: wh.id, code: d.warehouse.location.code } },
        create: { warehouseId: wh.id, code: d.warehouse.location.code, name: d.warehouse.location.name, kind },
        update: { archivedAt: null, kind },
        select: { id: true },
      });
      const products: { key: string; slug: string; id: string; variants: TestVariant[] }[] = [];
      const variantIds: string[] = [];
      for (const p of d.products) {
        const prod = await tx.product.upsert({
          where: { storeId_slug: { storeId: S, slug: p.slug } },
          create: { storeId: S, slug: p.slug, nameEn: p.nameEn, nameBn: p.nameBn, status: 'PUBLISHED', inStock: true, minPriceMinor: p.priceMinor, publishedAt: now, inCombos: false },
          update: { status: 'PUBLISHED', archivedAt: null, unpublishedAt: null, publishedAt: now, inStock: true, minPriceMinor: p.priceMinor, inCombos: false },
          select: { id: true },
        });
        const variants: TestVariant[] = [];
        for (const [ci, c] of p.colours.entries()) {
          await tx.productColour.upsert({ where: { productId_colourId: { productId: prod.id, colourId: colour.get(c)! } }, create: { storeId: S, productId: prod.id, colourId: colour.get(c)!, sortOrder: ci * 10 }, update: {} });
          for (const [si, z] of p.sizes.entries()) {
            const sku = skuOf(d, p.key, c, z);
            const v = await tx.productVariant.upsert({
              where: { storeId_sku: { storeId: S, sku } },
              create: { storeId: S, productId: prod.id, colourId: colour.get(c)!, sizeId: size.get(z)!, sku, priceMinor: p.priceMinor, weightGrams: p.weightGrams, active: true, inStock: true, sortOrder: ci * 100 + si },
              update: { archivedAt: null, active: true, priceMinor: p.priceMinor, weightGrams: p.weightGrams },
              select: { id: true },
            });
            const level = await tx.stockLevel.findUnique({ where: { variantId_locationId: { variantId: v.id, locationId: loc.id } }, select: { reserved: true } });
            if (level) await tx.stockLevel.update({ where: { variantId_locationId: { variantId: v.id, locationId: loc.id } }, data: { onHand: p.stock + level.reserved, available: p.stock } });
            else await tx.stockLevel.create({ data: { variantId: v.id, locationId: loc.id, onHand: p.stock, available: p.stock } });
            variantIds.push(v.id);
            variants.push({ id: v.id, sku, colour: c, size: z, priceMinor: p.priceMinor, weightGrams: p.weightGrams });
          }
        }
        products.push({ key: p.key, slug: p.slug, id: prod.id, variants });
      }
      await recomputeVariantStock(tx, S, variantIds, kinds);
      await audit(tx, k.who.actor, { action: `${k.source}.setup`, entityType: 'Product', storeId: S, after: { run: runId, products: products.length, variants: variantIds.length } }, k.who.ctx);
      return { products, locationKind: kind };
    },
    { timeout: 60_000 },
  );
}

/** Sets one test variant's sellable stock on the test shelf (a sold-out size, the last piece, a race). */
export async function setTestStock(k: Kit, d: TestData, runId: string, variantId: string, qty: number): Promise<{ variantId: string; available: number }> {
  const v = await k.db.productVariant.findFirst({ where: { id: variantId, storeId: k.storeId, sku: { startsWith: skuPrefix(d) } }, select: { id: true, stockLevels: { select: { id: true, reserved: true, location: { select: { code: true } } } } } });
  if (!v) throw new Error('not a GATE TEST variant');
  const level = v.stockLevels.find((l) => l.location.code === d.warehouse.location.code);
  if (!level) throw new Error('the GATE TEST shelf holds no row for this variant');
  const kinds = new Set(await k.settings.value('inventory.sellableLocationKinds'));
  await k.db.$transaction(async (tx) => {
    await tx.stockLevel.update({ where: { id: level.id }, data: { onHand: qty + level.reserved, available: qty } });
    await recomputeVariantStock(tx, k.storeId, [v.id], kinds);
    await audit(tx, k.who.actor, { action: `${k.source}.stock`, entityType: 'ProductVariant', entityId: v.id, storeId: k.storeId, after: { run: runId, available: qty } }, k.who.ctx);
  });
  return { variantId, available: qty };
}

/** The test products unpublished and archived, their colours, sizes, shelf and warehouse archived (nothing deleted). */
export async function archiveProducts(k: Kit, d: TestData, runId: string): Promise<{ productsArchived: number; extrasArchived: number; fails: string[] }> {
  const S = k.storeId;
  let productsArchived = 0;
  const fails: string[] = [];
  const products = await k.db.product.findMany({ where: { storeId: S, slug: { startsWith: d.slugPrefix }, archivedAt: null }, select: { id: true, slug: true, status: true } });
  const deps = { db: k.db, settings: k.settings };
  for (const p of products) {
    try {
      if (p.status === 'PUBLISHED') await unpublishProduct(deps, k.who, p.id);
      await updateProduct(deps, k.who, p.id, { archived: true });
      productsArchived += 1;
    } catch (e) {
      fails.push(`${p.slug} (${errText(e)})`);
    }
  }
  const at = new Date();
  const extrasArchived = await k.db.$transaction(async (tx) => {
    const c = await tx.colour.updateMany({ where: { storeId: S, key: { in: d.colours.map((x) => x.key) }, archivedAt: null }, data: { archivedAt: at } });
    const z = await tx.size.updateMany({ where: { storeId: S, key: { in: d.sizes.map((x) => x.key) }, archivedAt: null }, data: { archivedAt: at } });
    const wh = await tx.warehouse.findUnique({ where: { code: d.warehouse.code }, select: { id: true } });
    const l = wh ? await tx.inventoryLocation.updateMany({ where: { warehouseId: wh.id, archivedAt: null }, data: { archivedAt: at } }) : { count: 0 };
    const w = wh ? await tx.warehouse.updateMany({ where: { id: wh.id, archivedAt: null }, data: { archivedAt: at } }) : { count: 0 };
    await audit(tx, k.who.actor, { action: `${k.source}.cleanup`, entityType: 'Product', storeId: S, after: { run: runId, productsArchived, colours: c.count, sizes: z.count, shelves: l.count, warehouses: w.count } }, k.who.ctx);
    return c.count + z.count + l.count + w.count;
  });
  return { productsArchived, extrasArchived, fails };
}

// ---- 2 and 3. the run's mock-payment grant, and cash on delivery with the owner's OK ----

/** The IdempotencyKey scope of a run's grant (apps/web/src/lib/shop/gate-run.ts reads the same). */
export const GATE_RUN_SCOPE = 'gate-run.mock-pay';
const COD = 'payment.cod.enabled';
/** The longest a grant may stay open (the shell closes it long before; a lost close expires by itself). */
const MAX_MINUTES = 240; // hardcode-ok: a safety bound of the gate's own grant, not a business number
const HEX64 = /^[a-f0-9]{64}$/;
const RUN = /^[A-Za-z0-9-]{1,24}$/;
const HOST = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;

/** What a grant keeps beside the token's hash: its host, and how cash on delivery was before the run. */
export interface GrantBody {
  host: string;
  source: string;
  cod: { changed: false } | { changed: true; hadRow: boolean; previous: boolean | null; version: number };
}

/** Why a host may not get a grant (null: it may): the shop's saved preview host, and never a host the shop sells on. */
export async function grantHostRefusal(k: Kit, host: string): Promise<string | null> {
  if (!HOST.test(host)) return 'not a host name';
  const [saved, domains] = await Promise.all([k.settings.value('system.stagingHost'), k.db.storeDomain.findMany({ where: { archivedAt: null }, select: { hostname: true } })]);
  if (saved && saved.toLowerCase() !== host) return "the shop's saved preview host is another host";
  if (domains.some((x) => x.hostname.toLowerCase() === host)) return 'this host is one the shop sells on';
  return null;
}

/**
 * Opens the run's grant: the practice gateway for the run's own browser on the preview host, for `minutes`; with
 * `allowCod` (the workflow's `allow_cod`, the owner's OK) cash on delivery switched on for the run when it is off.
 */
export async function openRun(k: Kit, o: { runId: string; tokenHash: string; host: string; minutes: number; allowCod: boolean }): Promise<Json> {
  if (!RUN.test(o.runId)) throw new Error('not a run id');
  if (!HEX64.test(o.tokenHash)) throw new Error("the run's token hash is missing");
  const host = o.host.toLowerCase();
  const refused = await grantHostRefusal(k, host);
  if (refused) return { open: false, why: refused, cod: { on: (await k.settings.value(COD, { storeId: k.storeId })) === true, changed: false } };
  const minutes = Math.max(5, Math.min(MAX_MINUTES, Math.floor(o.minutes) || 0));
  const codBefore = (await k.settings.value(COD, { storeId: k.storeId })) === true;
  let cod: GrantBody['cod'] = { changed: false };
  if (o.allowCod && !codBefore) {
    const row = await k.db.storeSettingValue.findUnique({ where: { storeId_key: { storeId: k.storeId, key: COD } }, select: { value: true, version: true } });
    const r = await k.settings.set(COD, true, storeTarget(k.storeId), { ownerApproved: true, actorId: null, reason: `go-live gate run ${o.runId}: cash on delivery on for the run only (allow_cod, the owner's OK); put back at the end` });
    cod = { changed: true, hadRow: !!row, previous: row ? (row.value as boolean | null) : null, version: r.version };
  }
  const body: GrantBody = { host, source: k.source, cod };
  const expiresAt = new Date(Date.now() + minutes * 60_000);
  const g = await k.db.idempotencyKey.upsert({
    where: { scope_key: { scope: GATE_RUN_SCOPE, key: o.runId } },
    create: { scope: GATE_RUN_SCOPE, key: o.runId, requestHash: o.tokenHash, responseBody: body as never, expiresAt },
    update: { requestHash: o.tokenHash, responseBody: body as never, expiresAt, completedAt: null },
    select: { id: true },
  });
  await audit(k.db, k.who.actor, { action: 'gate-run.mock-pay.open', entityType: 'IdempotencyKey', entityId: g.id, storeId: k.storeId, after: { run: o.runId, host, until: expiresAt.toISOString(), cod: cod.changed ? 'switched on for the run (allow_cod)' : codBefore ? 'already on' : "off (the owner's setting)" } }, k.who.ctx);
  return { open: true, until: expiresAt.toISOString(), cod: { on: codBefore || cod.changed, changed: cod.changed } };
}

/**
 * Closes the open grants (one run's, or what a crashed run left: every open grant of this gate, and any other gate's
 * that has expired — never another gate's run that is still going, e.g. gate-c360 while gate-orders starts) and puts
 * cash on delivery back as it was. Safe to run twice. Never changes a value someone else set during the run.
 */
export async function closeRuns(k: Kit, o: { runId?: string; except?: string } = {}): Promise<{ ok: boolean; closed: number; codRestored: number; notes: string[] }> {
  const found = await k.db.idempotencyKey.findMany({ where: { scope: GATE_RUN_SCOPE, completedAt: null, ...(o.runId ? { key: o.runId } : o.except ? { key: { not: o.except } } : {}) }, select: { id: true, key: true, responseBody: true, expiresAt: true } });
  const sweepNow = Date.now();
  const open = o.runId ? found : found.filter((g) => (g.responseBody as Partial<GrantBody> | null)?.source === k.source || g.expiresAt.getTime() <= sweepNow);
  const notes: string[] = [];
  let codRestored = 0; // hardcode-ok: a count of grants put back, not a business number
  let closed = 0;
  let ok = true;
  for (const g of open) {
    const body = (g.responseBody ?? {}) as Partial<GrantBody>;
    let codNote = 'unchanged';
    const c = body.cod;
    if (c && c.changed) {
      try {
        const now = await k.db.storeSettingValue.findUnique({ where: { storeId_key: { storeId: k.storeId, key: COD } }, select: { version: true } });
        if (!now || now.version !== c.version) {
          codNote = 'changed by someone during the run: left as they set it';
          notes.push(`run ${g.key}: cash on delivery was changed by someone during the run, so it was left as they set it`);
        } else {
          const meta = { ownerApproved: true, actorId: null, reason: `go-live gate run ${g.key}: cash on delivery put back as it was before the run`, expectedVersion: c.version };
          if (c.hadRow) await k.settings.set(COD, c.previous, storeTarget(k.storeId), meta);
          else await k.settings.reset(COD, storeTarget(k.storeId), meta);
          codNote = c.hadRow ? `put back to ${String(c.previous)}` : 'put back to no store value (the installation value answers again)';
          codRestored += 1;
        }
      } catch (e) {
        ok = false;
        codNote = `could not be put back: ${errText(e)}`;
        notes.push(`run ${g.key}: cash on delivery ${codNote}`);
        continue; // the grant stays open, so the next close tries again
      }
    }
    const at = new Date();
    await k.db.idempotencyKey.update({ where: { id: g.id }, data: { completedAt: at, expiresAt: at } });
    await audit(k.db, k.who.actor, { action: 'gate-run.mock-pay.close', entityType: 'IdempotencyKey', entityId: g.id, storeId: k.storeId, after: { run: g.key, cod: codNote } }, k.who.ctx);
    closed += 1;
  }
  return { ok, closed, codRestored, notes };
}

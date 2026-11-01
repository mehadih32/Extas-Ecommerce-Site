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
//    Live run 2 (1 Nov): the grant row is written BEFORE cash on delivery is switched on (`pending`), so a run that dies
//    at any moment leaves a record the close can put back from; the close keeps what it did on the row (`closed`), so
//    every later close (the shell's trap, the workflow's last step) can say it in the report; and `strayCod` puts back a
//    switch-on that the gate's own setting-change line shows was never put back (a run of older code, a lost row).
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
  /** Live run 2: the test products' own category (a product the shop shows in search, its lists and the wishlist has one). */
  category: { slug: string; nameEn: string; nameBn: string; sortOrder: number };
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
      // live run 2 (1 Nov): the shop shows a product in search, in its category lists and on the wishlist page only when
      // it sits in a shown category (the publish checklist's "at least one category", blocking by default) — the first
      // live runs made the products without one, so search found nothing and the wishlist stayed empty
      const cat = await tx.category.upsert({
        where: { storeId_slug: { storeId: S, slug: d.category.slug } },
        create: { storeId: S, slug: d.category.slug, nameEn: d.category.nameEn, nameBn: d.category.nameBn, sortOrder: d.category.sortOrder, isVisible: true },
        update: { archivedAt: null, isVisible: true },
        select: { id: true },
      });
      const products: { key: string; slug: string; id: string; variants: TestVariant[] }[] = [];
      const variantIds: string[] = [];
      for (const p of d.products) {
        const prod = await tx.product.upsert({
          where: { storeId_slug: { storeId: S, slug: p.slug } },
          create: { storeId: S, slug: p.slug, nameEn: p.nameEn, nameBn: p.nameBn, status: 'PUBLISHED', inStock: true, minPriceMinor: p.priceMinor, publishedAt: now, inCombos: false, categoryId: cat.id },
          update: { status: 'PUBLISHED', archivedAt: null, unpublishedAt: null, publishedAt: now, inStock: true, minPriceMinor: p.priceMinor, inCombos: false, categoryId: cat.id },
          select: { id: true },
        });
        // its line in the category's list, shown (as publishing a product does, catalogue publish.ts)
        await tx.categoryProduct.upsert({
          where: { categoryId_productId: { categoryId: cat.id, productId: prod.id } },
          create: { storeId: S, categoryId: cat.id, productId: prod.id, isVisible: true, inStock: true, priceMinor: p.priceMinor },
          update: { isVisible: true, inStock: true, priceMinor: p.priceMinor },
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
    const g = await tx.category.updateMany({ where: { storeId: S, slug: d.category.slug, archivedAt: null }, data: { archivedAt: at, isVisible: false } });
    const wh = await tx.warehouse.findUnique({ where: { code: d.warehouse.code }, select: { id: true } });
    const l = wh ? await tx.inventoryLocation.updateMany({ where: { warehouseId: wh.id, archivedAt: null }, data: { archivedAt: at } }) : { count: 0 };
    const w = wh ? await tx.warehouse.updateMany({ where: { id: wh.id, archivedAt: null }, data: { archivedAt: at } }) : { count: 0 };
    await audit(tx, k.who.actor, { action: `${k.source}.cleanup`, entityType: 'Product', storeId: S, after: { run: runId, productsArchived, colours: c.count, sizes: z.count, categories: g.count, shelves: l.count, warehouses: w.count } }, k.who.ctx);
    return c.count + z.count + g.count + l.count + w.count;
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
  /**
   * `pending`: written before the switch, so a run that died between the two still has its record; `version` is then
   * the row's version before the switch (0: no row) and the close asks the setting-change log whether the switch happened.
   */
  cod: { changed: false } | { changed: true; hadRow: boolean; previous: boolean | null; version: number; pending?: boolean };
  /** What the close did, kept on the row so every later close can say it. */
  closed?: { at: string; cod: string };
}

/** How cash on delivery stood before the run, in the report's words. */
export const codWord = (c: { hadRow: boolean; previous: boolean | null }): string => (c.hadRow ? String(c.previous) : 'no store value (the installation value answers)');

/** The reason of the gate's own switch-on line (SettingChange), which the close and `strayCod` look for. */
const codReason = (runId: string) => `go-live gate run ${runId}: cash on delivery on for the run only`;
const COD_REASON = /^go-live gate run ([A-Za-z0-9-]{1,24}): cash on delivery on for the run only/;

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
  const expiresAt = new Date(Date.now() + minutes * 60_000);
  const save = (body: GrantBody) =>
    k.db.idempotencyKey.upsert({
      where: { scope_key: { scope: GATE_RUN_SCOPE, key: o.runId } },
      create: { scope: GATE_RUN_SCOPE, key: o.runId, requestHash: o.tokenHash, responseBody: body as never, expiresAt },
      update: { requestHash: o.tokenHash, responseBody: body as never, expiresAt, completedAt: null },
      select: { id: true },
    });
  let cod: GrantBody['cod'] = { changed: false };
  let g = await save({ host, source: k.source, cod: { changed: false } });
  if (o.allowCod && !codBefore) {
    const row = await k.db.storeSettingValue.findUnique({ where: { storeId_key: { storeId: k.storeId, key: COD } }, select: { value: true, version: true } });
    const was = { hadRow: !!row, previous: row ? (row.value as boolean | null) : null };
    // the record first: a run that dies right after the switch still leaves what to put back
    g = await save({ host, source: k.source, cod: { changed: true, ...was, version: row?.version ?? 0, pending: true } });
    const r = await k.settings.set(COD, true, storeTarget(k.storeId), { ownerApproved: true, actorId: null, reason: `${codReason(o.runId)} (allow_cod, the owner's OK); put back at the end` });
    cod = { changed: true, ...was, version: r.version };
    g = await save({ host, source: k.source, cod });
  }
  await audit(k.db, k.who.actor, { action: 'gate-run.mock-pay.open', entityType: 'IdempotencyKey', entityId: g.id, storeId: k.storeId, after: { run: o.runId, host, until: expiresAt.toISOString(), cod: cod.changed ? 'switched on for the run (allow_cod)' : codBefore ? 'already on' : "off (the owner's setting)" } }, k.who.ctx);
  return { open: true, until: expiresAt.toISOString(), cod: { on: codBefore || cod.changed, changed: cod.changed } };
}

/** Puts cash on delivery back from a grant's record: the report's words, whether it was put back, and any note. */
async function putCodBack(k: Kit, runId: string, c: Extract<GrantBody['cod'], { changed: true }>): Promise<{ note: string; restored: boolean; notes: string[] }> {
  const now = await k.db.storeSettingValue.findUnique({ where: { storeId_key: { storeId: k.storeId, key: COD } }, select: { version: true } });
  let expected = c.version;
  if (c.pending) {
    // the run stopped around the switch: it happened only when the newest COD line is the gate's own for this run
    const last = await k.db.settingChange.findFirst({ where: { storeId: k.storeId, key: COD }, orderBy: { createdAt: 'desc' }, select: { reason: true } });
    if (!now || !last?.reason || COD_REASON.exec(last.reason)?.[1] !== runId) return { note: 'not touched (the run stopped before it switched cash on delivery on)', restored: false, notes: [] };
    expected = now.version;
  }
  if (!now || now.version !== expected) {
    return { note: 'changed by someone during the run: left as they set it', restored: false, notes: [`run ${runId}: cash on delivery was changed by someone during the run, so it was left as they set it`] };
  }
  const meta = { ownerApproved: true, actorId: null, reason: `go-live gate run ${runId}: cash on delivery put back as it was before the run`, expectedVersion: expected };
  if (c.hadRow) await k.settings.set(COD, c.previous, storeTarget(k.storeId), meta);
  else await k.settings.reset(COD, storeTarget(k.storeId), meta);
  return { note: `put back to ${codWord(c)}`, restored: true, notes: [] };
}

/**
 * Closes the open grants (one run's, or what a crashed run left: every open grant of this gate, and any other gate's
 * that has expired — never another gate's run that is still going, e.g. gate-c360 while gate-orders starts) and puts
 * cash on delivery back as it was. Safe to run twice. Never changes a value someone else set during the run.
 * `runs`: what each grant closed now did with cash on delivery, in the report's words (kept on its row too).
 */
export async function closeRuns(k: Kit, o: { runId?: string; except?: string } = {}): Promise<{ ok: boolean; closed: number; codRestored: number; notes: string[]; runs: { run: string; cod: string }[] }> {
  const found = await k.db.idempotencyKey.findMany({ where: { scope: GATE_RUN_SCOPE, completedAt: null, ...(o.runId ? { key: o.runId } : o.except ? { key: { not: o.except } } : {}) }, select: { id: true, key: true, responseBody: true, expiresAt: true } });
  const sweepNow = Date.now();
  const open = o.runId ? found : found.filter((g) => (g.responseBody as Partial<GrantBody> | null)?.source === k.source || g.expiresAt.getTime() <= sweepNow);
  const notes: string[] = [];
  const runs: { run: string; cod: string }[] = [];
  let codRestored = 0; // hardcode-ok: a count of grants put back, not a business number
  let closed = 0;
  let ok = true;
  for (const g of open) {
    const body = (g.responseBody ?? {}) as Partial<GrantBody>;
    let codNote = 'not touched';
    const c = body.cod;
    if (c && c.changed) {
      try {
        const r = await putCodBack(k, g.key, c);
        codNote = r.note;
        notes.push(...r.notes);
        if (r.restored) codRestored += 1;
      } catch (e) {
        ok = false;
        codNote = `could not be put back: ${errText(e)}`;
        notes.push(`run ${g.key}: cash on delivery ${codNote}`);
        runs.push({ run: g.key, cod: codNote });
        continue; // the grant stays open, so the next close tries again
      }
    }
    const at = new Date();
    const kept: GrantBody = { host: body.host ?? '', source: body.source ?? '', cod: c ?? { changed: false }, closed: { at: at.toISOString(), cod: codNote } };
    await k.db.idempotencyKey.update({ where: { id: g.id }, data: { completedAt: at, expiresAt: at, responseBody: kept as never } });
    await audit(k.db, k.who.actor, { action: 'gate-run.mock-pay.close', entityType: 'IdempotencyKey', entityId: g.id, storeId: k.storeId, after: { run: g.key, cod: codNote } }, k.who.ctx);
    runs.push({ run: g.key, cod: codNote });
    closed += 1;
  }
  return { ok, closed, codRestored, notes, runs };
}

/**
 * One run's grant as it stands now, for the report's "Safety net" line (read only): `grant` none (never opened) | open
 * | closed; `cod` what happened to cash on delivery, in the report's words.
 */
export async function runState(k: Kit, runId: string): Promise<{ grant: 'none' | 'open' | 'closed'; cod: string }> {
  const g = await k.db.idempotencyKey.findUnique({ where: { scope_key: { scope: GATE_RUN_SCOPE, key: runId } }, select: { completedAt: true, responseBody: true } });
  if (!g) return { grant: 'none', cod: 'not touched' };
  const body = (g.responseBody ?? {}) as Partial<GrantBody>;
  const c = body.cod;
  if (!g.completedAt) return { grant: 'open', cod: c && c.changed ? `still switched on for the run (it was ${codWord(c)})` : 'not touched' };
  return { grant: 'closed', cod: body.closed?.cod ?? (c && c.changed ? 'put back (an older close kept no words)' : 'not touched') };
}

/**
 * The start-of-run check behind the grants: cash on delivery whose newest change is still a gate run's own switch-on
 * line ("… on for the run only") while that run's grant is closed or gone (a run of older code, a lost row). Puts back
 * the value that line replaced, with an audit line as the system actor, and says so. Nothing when the newest change is
 * anyone else's, or when that run's grant is still open (closeRuns puts it back from the grant).
 */
export async function strayCod(k: Kit): Promise<{ restored: boolean; note: string | null }> {
  const last = await k.db.settingChange.findFirst({ where: { storeId: k.storeId, key: COD }, orderBy: { createdAt: 'desc' }, select: { reason: true, oldValue: true, action: true } });
  const run = last?.reason ? COD_REASON.exec(last.reason)?.[1] : undefined;
  if (!last || !run || last.action !== 'SET') return { restored: false, note: null };
  const g = await k.db.idempotencyKey.findUnique({ where: { scope_key: { scope: GATE_RUN_SCOPE, key: run } }, select: { completedAt: true } });
  if (g && !g.completedAt) return { restored: false, note: null };
  const now = await k.db.storeSettingValue.findUnique({ where: { storeId_key: { storeId: k.storeId, key: COD } }, select: { version: true } });
  if (!now) return { restored: false, note: null };
  const previous = typeof last.oldValue === 'boolean' ? last.oldValue : null;
  const word = previous === null ? 'no store value (the installation value answers)' : String(previous);
  const meta = { ownerApproved: true, actorId: null, reason: `go-live gate run ${run}: cash on delivery put back as it was before the run (found still on at the start of a later run)`, expectedVersion: now.version };
  if (previous === null) await k.settings.reset(COD, storeTarget(k.storeId), meta);
  else await k.settings.set(COD, previous, storeTarget(k.storeId), meta);
  await audit(k.db, k.who.actor, { action: 'gate-run.mock-pay.cod-restored', entityType: 'StoreSettingValue', storeId: k.storeId, after: { run, cod: `put back to ${word}` } }, k.who.ctx);
  return { restored: true, note: `run ${run} had left cash on delivery switched on with its grant closed: put back to ${word}` };
}

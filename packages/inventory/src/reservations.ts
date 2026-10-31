// PR 197, 198 — one global hold on the one shared stock pool (Blueprint A3.5 rule 2, A4.4; Bhandari B03).
//
// The pool. All three stores sell from one stock (A4.4 option a). A store's variant is its own ProductVariant row, but
// the same ERP SKU in the same location is one pool: every store's StockLevel row for that SKU and location mirrors
// the same ERP numbers. A hold made on one store counts on all of them at once — "the moment a variant is held in
// checkout on one site, the other two see it held", so two sites can never sell the same last piece.
//
// The rule (A3.5 rule 2): the shop's cart/checkout hold is local and short-lived and is never sent to the ERP. When the
// order is confirmed the hold becomes CONVERTED and keeps counting until the ERP's own `reserved` shows the order (the
// next stock pull after the order push was accepted, PR 199) or `inventory.reservation.convertedHoldHours` pass.
//
// Row locking (PR 198). Every write that changes what is held locks all StockLevel rows of the SKUs involved, in every
// store and location, with one `SELECT … FOR UPDATE` in id order, inside the transaction that reads the free number and
// writes the hold. A second checkout for the same SKU waits on that lock and then sees the first one's hold: the last
// piece can only be held once. Because every writer (holds, releases, the stock pull) takes its locks in the same order,
// they cannot deadlock each other; if PostgreSQL still reports a deadlock or a write conflict, the hold is tried again
// (`inventory.reservation.lockRetries`).
//
// The numbers. Free in a pool = the ERP's `available` (the freshest row of the pool) − the shop's live holds, where a
// hold is live while it is ACTIVE or CONVERTED, not released and not past `expiresAt`. `StockLevel.cartReserved` is kept
// equal to the pool's live holds on every row of the pool (recomputed under the lock, never added to), so the stock
// views, `liveStock` and `ProductVariant.inStock` (and with it the product summary) see the hold in every store.
//
// Release. A hold lasts `inventory.reservation.holdMinutes` (signed in: `…holdMinutesSignedIn`) from its last refresh;
// the sweep job (`inventory.reservations.release`, every `inventory.reservation.sweepSeconds`) expires what is past its
// time and releases the holds of a bag idle for `inventory.reservation.abandonMinutes` or no longer active. Nothing is
// deleted: a released hold stays as a row with its status and time.
import { z } from 'zod';
import type { LocationKindName } from '@extas/settings';
import { nowOf, parse, setting, TX, type Db, type InventoryDeps, type Tx } from './context';
import { InventoryError } from './errors';
import { bGradeClosed, isV6 } from './erp-model';
import { sellableKinds } from './locations';
import { recomputeVariantStock } from './stock';

/** One StockLevel row of a pool, as locked. */
export interface PoolRow {
  id: string;
  variantId: string;
  locationId: string;
  available: number;
  cartReserved: number;
  erpUpdatedAt: Date | null;
  sku: string;
  storeId: number;
  kind: LocationKindName;
  /** The location and its warehouse are not archived. */
  live: boolean;
}

/** A pool: one SKU in one location, over every store. */
export interface Pool {
  key: string;
  sku: string;
  locationId: string;
  kind: LocationKindName;
  live: boolean;
  /** The ERP's available number, from the freshest row of the pool. */
  available: number;
  rows: PoolRow[];
}

export const poolKey = (sku: string, locationId: string) => `${sku}\u0000${locationId}`;

/** Live holds count: ACTIVE or CONVERTED, not released, not past their time. */
const liveHold = (now: Date) => ({ releasedAt: null, status: { in: ['ACTIVE' as const, 'CONVERTED' as const] }, expiresAt: { gt: now } });

/**
 * Locks every StockLevel row of these SKUs — every store, every location — in id order (one statement), and returns
 * them. Runs inside the caller's transaction; the locks hold until it ends.
 */
export async function lockPools(tx: Tx, skus: string[]): Promise<PoolRow[]> {
  const list = [...new Set(skus)].sort();
  if (!list.length) return [];
  return tx.$queryRaw<PoolRow[]>`
    SELECT sl."id", sl."variantId", sl."locationId", sl."available", sl."cartReserved", sl."erpUpdatedAt",
           pv."sku", pv."storeId", il."kind"::text AS "kind",
           (il."archivedAt" IS NULL AND w."archivedAt" IS NULL) AS "live"
      FROM "StockLevel" sl
      JOIN "ProductVariant" pv ON pv."id" = sl."variantId"
      JOIN "InventoryLocation" il ON il."id" = sl."locationId"
      JOIN "Warehouse" w ON w."id" = il."warehouseId"
     WHERE pv."sku" = ANY(${list}::text[])
     ORDER BY sl."id"
       FOR UPDATE OF sl`;
}

/** Groups locked rows into pools. The pool's available number is the freshest row's (ties: the smaller number). */
export function poolsOf(rows: PoolRow[]): Map<string, Pool> {
  const out = new Map<string, Pool>();
  for (const r of rows) {
    const key = poolKey(r.sku, r.locationId);
    const p = out.get(key);
    if (!p) {
      out.set(key, { key, sku: r.sku, locationId: r.locationId, kind: r.kind, live: r.live, available: r.available, rows: [r] });
      continue;
    }
    p.rows.push(r);
    const best = p.rows.reduce((a, b) => {
      const ta = a.erpUpdatedAt?.getTime() ?? -Infinity;
      const tb = b.erpUpdatedAt?.getTime() ?? -Infinity;
      return tb > ta || (tb === ta && b.available < a.available) ? b : a;
    });
    p.available = best.available;
  }
  return out;
}

/** Live holds per pool for these SKUs (every store). */
export async function heldByPool(db: Db, skus: string[], now: Date): Promise<Map<string, number>> {
  const variants = await db.productVariant.findMany({ where: { sku: { in: [...new Set(skus)] } }, select: { id: true, sku: true } });
  if (!variants.length) return new Map();
  const skuOf = new Map(variants.map((v) => [v.id, v.sku]));
  const groups = await db.stockReservation.groupBy({ by: ['variantId', 'locationId'], where: { variantId: { in: [...skuOf.keys()] }, ...liveHold(now) }, _sum: { quantity: true } });
  const out = new Map<string, number>();
  for (const g of groups) {
    if (!g.locationId) continue;
    const key = poolKey(skuOf.get(g.variantId)!, g.locationId);
    out.set(key, (out.get(key) ?? 0) + (g._sum.quantity ?? 0));
  }
  return out;
}

export interface Allocation {
  locationId: string;
  quantity: number;
}

/**
 * Takes `quantity` pieces from the pools of one SKU (most free first, then by location id so the choice is stable).
 * Returns null when the pools together have fewer free pieces; `free` is what they have.
 */
export function allocate(pools: { locationId: string; free: number }[], quantity: number): { allocations: Allocation[] | null; free: number } {
  const usable = pools.filter((p) => p.free > 0).sort((a, b) => b.free - a.free || a.locationId.localeCompare(b.locationId));
  const free = usable.reduce((s, p) => s + p.free, 0);
  if (free < quantity) return { allocations: null, free };
  const allocations: Allocation[] = [];
  let left = quantity;
  for (const p of usable) {
    if (left <= 0) break;
    const take = Math.min(left, p.free);
    allocations.push({ locationId: p.locationId, quantity: take });
    left -= take;
  }
  return { allocations, free };
}

/**
 * Sets `cartReserved` on every locked row to its pool's live holds (only rows that differ are written) and refreshes
 * `inStock` and the product summary of the variants whose rows changed, store by store. Under the caller's locks.
 */
export async function refreshPools(tx: Tx, rows: PoolRow[], now: Date, kinds: Set<LocationKindName>): Promise<{ rowsChanged: number; variantsChanged: number }> {
  if (!rows.length) return { rowsChanged: 0, variantsChanged: 0 };
  const held = await heldByPool(tx, rows.map((r) => r.sku), now);
  const byValue = new Map<number, string[]>();
  const touched = new Map<number, Set<string>>();
  for (const r of rows) {
    const n = held.get(poolKey(r.sku, r.locationId)) ?? 0;
    if (r.cartReserved === n) continue;
    byValue.set(n, [...(byValue.get(n) ?? []), r.id]);
    r.cartReserved = n;
    touched.set(r.storeId, (touched.get(r.storeId) ?? new Set()).add(r.variantId));
  }
  let rowsChanged = 0;
  for (const [n, ids] of byValue) rowsChanged += (await tx.stockLevel.updateMany({ where: { id: { in: ids } }, data: { cartReserved: n } })).count;
  let variantsChanged = 0;
  for (const [storeId, ids] of touched) variantsChanged += (await recomputeVariantStock(tx, storeId, [...ids], kinds)).variantsChanged;
  return { rowsChanged, variantsChanged };
}

/** A deadlock or a write conflict reported by PostgreSQL / Prisma: the transaction may simply be tried again. */
export function isLockConflict(e: unknown): boolean {
  const code = (e as { code?: unknown })?.code;
  if (code === 'P2034') return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /\b40P01\b|\b40001\b|deadlock detected|could not serialize access/i.test(msg);
}

async function withLockRetry<T>(retries: number, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= retries || !isLockConflict(e)) throw e;
    }
  }
}

/** Runs `fn` in its own transaction (with lock retries), or inside the caller's when one is given. */
async function inTx<T>(deps: InventoryDeps, tx: Tx | undefined, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (tx) return fn(tx);
  const retries = await setting(deps, null, 'inventory.reservation.lockRetries');
  return withLockRetry(retries, () => deps.db.$transaction(fn, TX));
}

// ---------------------------------------------------------------------------------------------------------------------
// Holding a bag
// ---------------------------------------------------------------------------------------------------------------------

export const holdInput = z
  .object({
    storeId: z.int().min(1),
    cartId: z.uuid(),
    lines: z.array(z.object({ variantId: z.uuid(), quantity: z.int().min(1) }).strict()).max(200),
    signedIn: z.boolean().optional(),
  })
  .strict();
export type HoldInput = z.input<typeof holdInput>;

export interface HeldLine {
  variantId: string;
  sku: string;
  quantity: number;
  /** Where the pieces are held (location → pieces). */
  locations: Allocation[];
}

export interface HoldResult {
  cartId: string;
  expiresAt: string | null;
  lines: HeldLine[];
  /** Holds of this bag let go because their line left the bag or got smaller. */
  released: number;
}

/**
 * Holds the bag's lines on the shared pool, replacing what the bag held before: a line that left the bag lets go, a
 * line that stayed keeps its pieces with a fresh time, a bigger line takes the extra pieces. All or nothing: when any
 * line is short, nothing changes and OUT_OF_STOCK names every short SKU with what is free (`SKU:free`).
 *
 * Called by checkout on the server (S04), not by staff: there is no permission to check, but the bag must be an
 * active bag of this store and every variant a live variant of this store.
 */
export async function holdCart(deps: InventoryDeps, input: HoldInput, opts: { tx?: Tx } = {}): Promise<HoldResult> {
  const d = parse(holdInput, input, 'hold');
  const want = new Map<string, number>();
  for (const l of d.lines) want.set(l.variantId, (want.get(l.variantId) ?? 0) + l.quantity);
  const [minutes, maxUnits, kinds] = await Promise.all([
    setting(deps, null, d.signedIn ? 'inventory.reservation.holdMinutesSignedIn' : 'inventory.reservation.holdMinutes'),
    setting(deps, null, 'inventory.reservation.maxUnitsPerLine'),
    sellableKinds(deps),
  ]);
  const tooMany = [...want].filter(([, q]) => q > maxUnits).map(([id]) => `${id}:max ${maxUnits}`);
  if (tooMany.length) throw new InventoryError('INVALID_INPUT', `at most ${maxUnits} pieces of one variant`, tooMany);

  return inTx(deps, opts.tx, async (tx) => {
    const now = nowOf(deps);
    const expiresAt = new Date(now.getTime() + minutes * 60_000);
    const cart = await tx.cart.findFirst({ where: { id: d.cartId, storeId: d.storeId }, select: { status: true } });
    if (!cart) throw new InventoryError('NOT_FOUND', 'no such bag in this store', ['cartId']);
    if (cart.status !== 'ACTIVE') throw new InventoryError('CONFLICT', 'the bag is not active', ['cartId']);

    const current = await tx.stockReservation.findMany({ where: { storeId: d.storeId, cartId: d.cartId, status: 'ACTIVE', releasedAt: null } });
    const ids = [...new Set([...want.keys(), ...current.map((r) => r.variantId)])];
    const variants = await tx.productVariant.findMany({ where: { storeId: d.storeId, id: { in: ids } }, select: { id: true, sku: true, archivedAt: true, shopPriceMissingAt: true, grade: true } });
    const byId = new Map(variants.map((v) => [v.id, v]));
    const bad = [...want.keys()].filter((id) => !byId.get(id) || byId.get(id)!.archivedAt);
    if (bad.length) throw new InventoryError('INVALID_INPUT', 'not a live variant of this store', bad.map((id) => `variantId:${id}`));
    // PR 610 (v6): a SKU the ERP refused for having no shop price yet (409 NO_SHOP_PRICE) is not sold until it has one.
    const noPrice = [...want.keys()].filter((id) => byId.get(id)!.shopPriceMissingAt);
    if (noPrice.length && (await isV6(deps, d.storeId))) throw new InventoryError('OUT_OF_STOCK', 'not for sale until the ERP has its shop price', noPrice.map((id) => `${byId.get(id)!.sku}:0`));
    // CN-033 (v6): a B-grade piece is not sold while the ERP takes no B-grade line (`erp.orders.bGradeOpen` off).
    const bGrade = [...want.keys()].filter((id) => byId.get(id)!.grade === 'B');
    if (bGrade.length && (await bGradeClosed(deps, d.storeId))) throw new InventoryError('OUT_OF_STOCK', 'B-grade pieces are not sold until the ERP opens them', bGrade.map((id) => `${byId.get(id)!.sku}:0`));

    const rows = await lockPools(tx, variants.map((v) => v.sku));
    await deps.hooks?.afterPoolLock?.();

    // What this bag keeps, lets go of and still needs.
    const live = (r: (typeof current)[number]) => r.expiresAt.getTime() > now.getTime();
    const release: string[] = [];
    const extend: string[] = [];
    const need = new Map<string, number>();
    for (const [variantId, qty] of want) {
      const mine = current.filter((r) => r.variantId === variantId && live(r));
      const have = mine.reduce((s, r) => s + r.quantity, 0);
      if (have > qty) {
        release.push(...mine.map((r) => r.id));
        need.set(variantId, qty);
      } else {
        extend.push(...mine.map((r) => r.id));
        if (qty > have) need.set(variantId, qty - have);
      }
    }
    for (const r of current) if (!want.has(r.variantId) || !live(r)) release.push(r.id);

    const held = await heldByPool(tx, rows.map((r) => r.sku), now);
    for (const r of current) {
      if (!release.includes(r.id) || !live(r) || !r.locationId) continue;
      const key = poolKey(byId.get(r.variantId)!.sku, r.locationId);
      held.set(key, (held.get(key) ?? 0) - r.quantity);
    }
    const pools = [...poolsOf(rows).values()].filter((p) => p.live && kinds.has(p.kind));
    const picks: { variantId: string; sku: string; allocations: Allocation[] }[] = [];
    const short: string[] = [];
    for (const [variantId, qty] of need) {
      const sku = byId.get(variantId)!.sku;
      const mine = pools.filter((p) => p.sku === sku).map((p) => ({ locationId: p.locationId, free: Math.max(0, p.available - (held.get(p.key) ?? 0)) }));
      const a = allocate(mine, qty);
      if (!a.allocations) short.push(`${sku}:${a.free}`);
      else {
        picks.push({ variantId, sku, allocations: a.allocations });
        for (const x of a.allocations) held.set(poolKey(sku, x.locationId), (held.get(poolKey(sku, x.locationId)) ?? 0) + x.quantity);
      }
    }
    if (short.length) throw new InventoryError('OUT_OF_STOCK', 'not enough free pieces', short);

    if (release.length) {
      const expired = current.filter((r) => release.includes(r.id) && !live(r)).map((r) => r.id);
      const dropped = release.filter((id) => !expired.includes(id));
      if (expired.length) await tx.stockReservation.updateMany({ where: { id: { in: expired } }, data: { status: 'EXPIRED', releasedAt: now } });
      if (dropped.length) await tx.stockReservation.updateMany({ where: { id: { in: dropped } }, data: { status: 'RELEASED', releasedAt: now } });
    }
    if (extend.length) await tx.stockReservation.updateMany({ where: { id: { in: extend } }, data: { expiresAt } });
    const create = picks.flatMap((p) => p.allocations.map((a) => ({ storeId: d.storeId, variantId: p.variantId, locationId: a.locationId, quantity: a.quantity, cartId: d.cartId, status: 'ACTIVE' as const, expiresAt })));
    if (create.length) await tx.stockReservation.createMany({ data: create });
    await refreshPools(tx, rows, now, kinds);

    const after = await tx.stockReservation.findMany({ where: { storeId: d.storeId, cartId: d.cartId, status: 'ACTIVE', releasedAt: null }, orderBy: { createdAt: 'asc' } });
    const lines: HeldLine[] = [];
    for (const [variantId] of want) {
      const mine = after.filter((r) => r.variantId === variantId);
      const locs = new Map<string, number>();
      for (const r of mine) if (r.locationId) locs.set(r.locationId, (locs.get(r.locationId) ?? 0) + r.quantity);
      lines.push({ variantId, sku: byId.get(variantId)!.sku, quantity: mine.reduce((s, r) => s + r.quantity, 0), locations: [...locs].map(([locationId, quantity]) => ({ locationId, quantity })) });
    }
    return { cartId: d.cartId, expiresAt: lines.length ? expiresAt.toISOString() : null, lines, released: release.length };
  });
}

const cartInput = z.object({ storeId: z.int().min(1), cartId: z.uuid() }).strict();

/** Lets go of every hold of a bag (emptied, abandoned, merged). */
export async function releaseCart(deps: InventoryDeps, input: z.input<typeof cartInput>, opts: { tx?: Tx } = {}): Promise<{ released: number }> {
  const d = parse(cartInput, input, 'bag');
  return releaseWhere(deps, opts.tx, { storeId: d.storeId, cartId: d.cartId, status: 'ACTIVE' }, 'RELEASED');
}

const orderInput = z.object({ storeId: z.int().min(1), orderId: z.uuid() }).strict();

/** Lets go of an order's holds (the order was cancelled before the ERP took it). */
export async function releaseOrderHolds(deps: InventoryDeps, input: z.input<typeof orderInput>, opts: { tx?: Tx } = {}): Promise<{ released: number }> {
  const d = parse(orderInput, input, 'order');
  return releaseWhere(deps, opts.tx, { storeId: d.storeId, orderId: d.orderId, status: 'CONVERTED' }, 'CONVERTED');
}

async function releaseWhere(deps: InventoryDeps, tx: Tx | undefined, where: { storeId: number; cartId?: string; orderId?: string; status: 'ACTIVE' | 'CONVERTED' }, to: 'RELEASED' | 'CONVERTED'): Promise<{ released: number }> {
  const kinds = await sellableKinds(deps);
  return inTx(deps, tx, async (t) => {
    const now = nowOf(deps);
    const holds = await t.stockReservation.findMany({ where: { ...where, releasedAt: null }, select: { id: true, variantId: true } });
    if (!holds.length) return { released: 0 };
    const variants = await t.productVariant.findMany({ where: { id: { in: [...new Set(holds.map((h) => h.variantId))] } }, select: { sku: true } });
    const rows = await lockPools(t, variants.map((v) => v.sku));
    const n = (await t.stockReservation.updateMany({ where: { id: { in: holds.map((h) => h.id) }, releasedAt: null }, data: { status: to, releasedAt: now } })).count;
    await refreshPools(t, rows, now, kinds);
    return { released: n };
  });
}

const convertInput = z.object({ storeId: z.int().min(1), cartId: z.uuid(), orderId: z.uuid() }).strict();

/**
 * The order is confirmed (S04/S05): the bag's live holds become the order's (CONVERTED) and keep counting until the
 * ERP's own reservation shows the order, at most `inventory.reservation.convertedHoldHours` after the ERP took it (the
 * sweep renews the hold of an order that is still open and not with the ERP yet: review R1 M1). A hold already past its
 * time is not brought back: checkout holds the bag again first. Can run inside the order's own transaction.
 */
export async function convertCart(deps: InventoryDeps, input: z.input<typeof convertInput>, opts: { tx?: Tx } = {}): Promise<{ converted: number; units: number }> {
  const d = parse(convertInput, input, 'order');
  const hours = await setting(deps, null, 'inventory.reservation.convertedHoldHours');
  return inTx(deps, opts.tx, async (tx) => {
    const now = nowOf(deps);
    const holds = await tx.stockReservation.findMany({ where: { storeId: d.storeId, cartId: d.cartId, status: 'ACTIVE', releasedAt: null }, select: { id: true, variantId: true, quantity: true, expiresAt: true } });
    if (!holds.length) return { converted: 0, units: 0 };
    const variants = await tx.productVariant.findMany({ where: { id: { in: [...new Set(holds.map((h) => h.variantId))] } }, select: { sku: true } });
    await lockPools(tx, variants.map((v) => v.sku));
    const live = holds.filter((h) => h.expiresAt.getTime() > now.getTime());
    if (!live.length) return { converted: 0, units: 0 };
    const until = new Date(now.getTime() + hours * 3_600_000);
    const n = (await tx.stockReservation.updateMany({ where: { id: { in: live.map((h) => h.id) }, status: 'ACTIVE', releasedAt: null }, data: { status: 'CONVERTED', orderId: d.orderId, expiresAt: until } })).count;
    return { converted: n, units: live.reduce((s, h) => s + h.quantity, 0) };
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// The abandon timer and the ERP hand-over
// ---------------------------------------------------------------------------------------------------------------------

export interface SweepResult {
  expired: number;
  abandoned: number;
  /** Order holds whose maximum time passed (the ERP never showed the order). */
  ordersTimedOut: number;
  /** Pools whose `cartReserved` changed. */
  rowsChanged: number;
  /** Review R1 (M1): order holds past their time whose order is still open and not with the ERP — renewed, not let go. */
  ordersRenewed?: number;
}

/**
 * The abandon timer (job `inventory.reservations.release`): expires holds past their time, lets go of the holds of a
 * bag idle for `inventory.reservation.abandonMinutes` (or no longer active), and ends order holds past their maximum.
 * At most `inventory.reservation.batchSize` holds of each kind per run; the next run takes the rest.
 */
export async function sweepReservations(deps: InventoryDeps): Promise<SweepResult> {
  const [abandonMin, batch, kinds] = await Promise.all([setting(deps, null, 'inventory.reservation.abandonMinutes'), setting(deps, null, 'inventory.reservation.batchSize'), sellableKinds(deps)]);
  const now = nowOf(deps);
  const cutoff = new Date(now.getTime() - abandonMin * 60_000);
  const db = deps.db;
  const expired = await db.stockReservation.findMany({ where: { status: 'ACTIVE', releasedAt: null, expiresAt: { lte: now } }, select: { id: true, variantId: true }, take: batch, orderBy: { expiresAt: 'asc' } });
  const due = await db.stockReservation.findMany({ where: { status: 'CONVERTED', releasedAt: null, expiresAt: { lte: now } }, select: { id: true, variantId: true, storeId: true, orderId: true }, take: batch, orderBy: { expiresAt: 'asc' } });
  // Review R1 (M1): an order still open and not yet taken by the ERP keeps its pieces — its hold is renewed, never let go,
  // so a piece is not sold twice while the order waits for a call, an advance or a hold reason. Let go: a cancelled or
  // finished order, an order the ERP accepted (its own `reserved` counts it from then), a hold with no order.
  const keep = await stillOpen(db, due);
  const timedOut = due.filter((h) => !keep.has(h.id));
  const renew = due.filter((h) => keep.has(h.id));
  const activeCarts = await db.stockReservation.findMany({ where: { status: 'ACTIVE', releasedAt: null, expiresAt: { gt: now }, cartId: { not: null } }, select: { cartId: true }, distinct: ['cartId'], take: batch });
  const idle = activeCarts.length
    ? await db.cart.findMany({ where: { id: { in: activeCarts.map((c) => c.cartId!) }, OR: [{ lastActivityAt: { lt: cutoff } }, { status: { not: 'ACTIVE' } }] }, select: { id: true } })
    : [];
  const abandoned = idle.length ? await db.stockReservation.findMany({ where: { status: 'ACTIVE', releasedAt: null, expiresAt: { gt: now }, cartId: { in: idle.map((c) => c.id) } }, select: { id: true, variantId: true }, take: batch }) : [];
  if (renew.length) {
    const hours = await setting(deps, null, 'inventory.reservation.convertedHoldHours');
    await db.stockReservation.updateMany({ where: { id: { in: renew.map((h) => h.id) }, status: 'CONVERTED', releasedAt: null }, data: { expiresAt: new Date(now.getTime() + hours * 3_600_000) } });
  }
  const all = [...expired, ...timedOut, ...abandoned];
  if (!all.length) return { expired: 0, abandoned: 0, ordersTimedOut: 0, rowsChanged: 0, ...(renew.length ? { ordersRenewed: renew.length } : {}) };

  const retries = await setting(deps, null, 'inventory.reservation.lockRetries');
  return withLockRetry(retries, () =>
    db.$transaction(async (tx) => {
      const variants = await tx.productVariant.findMany({ where: { id: { in: [...new Set(all.map((h) => h.variantId))] } }, select: { sku: true } });
      const rows = await lockPools(tx, variants.map((v) => v.sku));
      const e = expired.length ? (await tx.stockReservation.updateMany({ where: { id: { in: expired.map((h) => h.id) }, status: 'ACTIVE', releasedAt: null, expiresAt: { lte: now } }, data: { status: 'EXPIRED', releasedAt: now } })).count : 0;
      const o = timedOut.length ? (await tx.stockReservation.updateMany({ where: { id: { in: timedOut.map((h) => h.id) }, status: 'CONVERTED', releasedAt: null }, data: { releasedAt: now } })).count : 0;
      const a = abandoned.length ? (await tx.stockReservation.updateMany({ where: { id: { in: abandoned.map((h) => h.id) }, status: 'ACTIVE', releasedAt: null }, data: { status: 'RELEASED', releasedAt: now } })).count : 0;
      const r = await refreshPools(tx, rows, now, kinds);
      return { expired: e, abandoned: a, ordersTimedOut: o, rowsChanged: r.rowsChanged, ...(renew.length ? { ordersRenewed: renew.length } : {}) };
    }, TX),
  );
}

/** Order states whose pieces are still the shop's to keep (not cancelled, not finished, not with the courier). */
const OPEN_ORDER_STATES = ['PLACED', 'AWAITING_ADVANCE', 'ON_HOLD', 'CONFIRMED', 'PROCESSING', 'PACKED'] as const;

/** Review R1 (M1): of these order holds, the ones whose order is still open and whose ERP push was not accepted yet. */
async function stillOpen(db: InventoryDeps['db'], holds: { id: string; storeId: number; orderId: string | null }[]): Promise<Set<string>> {
  const ids = [...new Set(holds.map((h) => h.orderId).filter((x): x is string => x !== null))];
  if (!ids.length) return new Set();
  const [orders, pushes] = await Promise.all([
    db.order.findMany({ where: { id: { in: ids }, status: { in: [...OPEN_ORDER_STATES] } }, select: { id: true } }),
    db.erpPush.findMany({ where: { documentType: 'order.create', status: 'SENT', referenceId: { in: ids } }, select: { referenceId: true } }),
  ]);
  const open = new Set(orders.map((o) => o.id));
  for (const p of pushes) open.delete(p.referenceId);
  return new Set(holds.filter((h) => h.orderId !== null && open.has(h.orderId)).map((h) => h.id));
}

/**
 * Called by the stock pull for the rows it applied (variant, location, the ERP's time of the row): an order hold in that
 * pool lets go once the order's push was accepted by the ERP at or before that time — from then the ERP's own
 * `reserved` (now in the mirror) counts the order, so the shop must not count it a second time.
 */
export async function releaseHandedOver(tx: Tx, applied: { variantId: string; locationId: string; erpUpdatedAt: Date }[], now: Date): Promise<number> {
  if (!applied.length) return 0;
  const variants = await tx.productVariant.findMany({ where: { id: { in: [...new Set(applied.map((a) => a.variantId))] } }, select: { id: true, sku: true } });
  const skuOf = new Map(variants.map((v) => [v.id, v.sku]));
  const newest = new Map<string, number>();
  for (const a of applied) {
    const key = poolKey(skuOf.get(a.variantId)!, a.locationId);
    newest.set(key, Math.max(newest.get(key) ?? -Infinity, a.erpUpdatedAt.getTime()));
  }
  const all = await tx.productVariant.findMany({ where: { sku: { in: [...new Set(variants.map((v) => v.sku))] } }, select: { id: true, sku: true } });
  const allSku = new Map(all.map((v) => [v.id, v.sku]));
  const holds = await tx.stockReservation.findMany({
    where: { status: 'CONVERTED', releasedAt: null, orderId: { not: null }, variantId: { in: [...allSku.keys()] }, locationId: { in: [...new Set(applied.map((a) => a.locationId))] } },
    select: { id: true, storeId: true, orderId: true, variantId: true, locationId: true },
  });
  if (!holds.length) return 0;
  const pushes = await tx.erpPush.findMany({ where: { documentType: 'order.create', status: 'SENT', referenceId: { in: [...new Set(holds.map((h) => h.orderId!))] } }, select: { storeId: true, referenceId: true, sentAt: true } });
  const sentAt = new Map(pushes.map((p) => [`${p.storeId}:${p.referenceId}`, p.sentAt?.getTime() ?? Infinity]));
  const done = holds
    .filter((h) => {
      const t = newest.get(poolKey(allSku.get(h.variantId)!, h.locationId!));
      const s = sentAt.get(`${h.storeId}:${h.orderId}`);
      return t !== undefined && s !== undefined && s <= t;
    })
    .map((h) => h.id);
  if (!done.length) return 0;
  return (await tx.stockReservation.updateMany({ where: { id: { in: done }, releasedAt: null }, data: { releasedAt: now } })).count;
}

// ---------------------------------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------------------------------

export interface HoldSummary {
  active: { holds: number; units: number; carts: number };
  orders: { holds: number; units: number };
  /** The next hold to run out, if any. */
  nextExpiry: string | null;
}

/** What is held right now on the shared pool (every store). */
export async function holdSummary(db: Db, now: Date): Promise<HoldSummary> {
  const [active, orders, carts, next] = await Promise.all([
    db.stockReservation.aggregate({ where: { status: 'ACTIVE', releasedAt: null, expiresAt: { gt: now } }, _count: { _all: true }, _sum: { quantity: true } }),
    db.stockReservation.aggregate({ where: { status: 'CONVERTED', releasedAt: null, expiresAt: { gt: now } }, _count: { _all: true }, _sum: { quantity: true } }),
    db.stockReservation.findMany({ where: { status: 'ACTIVE', releasedAt: null, expiresAt: { gt: now } }, select: { cartId: true }, distinct: ['cartId'] }),
    db.stockReservation.findFirst({ where: { status: 'ACTIVE', releasedAt: null, expiresAt: { gt: now } }, orderBy: { expiresAt: 'asc' }, select: { expiresAt: true } }),
  ]);
  return {
    active: { holds: active._count._all, units: active._sum.quantity ?? 0, carts: carts.length },
    orders: { holds: orders._count._all, units: orders._sum.quantity ?? 0 },
    nextExpiry: next ? next.expiresAt.toISOString() : null,
  };
}

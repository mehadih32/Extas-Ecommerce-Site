// PR 127 (S04) — stock for a line added to an order already placed ("Add to this parcel"). The order's own pieces are
// held as CONVERTED holds with the order's id (convertCart); an added line takes its pieces the same way, on the same
// shared pool, under the same row locks (reservations.ts), so the last piece is never sold twice. Its holds carry no
// bag (cartId null), which is how they are told apart from the order's first pieces: taking the line out again lets
// go of exactly those, and a cancel lets go of all the order's holds as before (releaseOrderHolds).
import { z } from 'zod';
import { nowOf, parse, setting, type InventoryDeps, type Tx } from './context';
import { InventoryError } from './errors';
import { sellableKinds } from './locations';
import { allocate, heldByPool, lockPools, poolKey, poolsOf, refreshPools, type Allocation } from './reservations';

const unitsInput = z.object({ storeId: z.int().min(1), orderId: z.uuid(), variantId: z.uuid(), quantity: z.int().min(1) }).strict();
const releaseInput = z.object({ storeId: z.int().min(1), orderId: z.uuid(), variantId: z.uuid() }).strict();

/**
 * Holds `quantity` pieces of a live variant for an order (a line added after it was placed), in the caller's
 * transaction. OUT_OF_STOCK (`SKU:free`) when the shared pool has fewer free pieces; nothing changes then.
 */
export async function holdOrderUnits(deps: InventoryDeps, input: z.input<typeof unitsInput>, opts: { tx: Tx }): Promise<{ sku: string; allocations: Allocation[] }> {
  const d = parse(unitsInput, input, 'hold');
  const [hours, maxUnits, kinds] = await Promise.all([setting(deps, null, 'inventory.reservation.convertedHoldHours'), setting(deps, null, 'inventory.reservation.maxUnitsPerLine'), sellableKinds(deps)]);
  if (d.quantity > maxUnits) throw new InventoryError('INVALID_INPUT', `at most ${maxUnits} pieces of one variant`, [`${d.variantId}:max ${maxUnits}`]);
  const tx = opts.tx;
  const now = nowOf(deps);
  const v = await tx.productVariant.findFirst({ where: { id: d.variantId, storeId: d.storeId, archivedAt: null }, select: { sku: true } });
  if (!v) throw new InventoryError('INVALID_INPUT', 'not a live variant of this store', [`variantId:${d.variantId}`]);
  const rows = await lockPools(tx, [v.sku]);
  const held = await heldByPool(tx, [v.sku], now);
  const pools = [...poolsOf(rows).values()].filter((p) => p.live && kinds.has(p.kind) && p.sku === v.sku);
  const a = allocate(
    pools.map((p) => ({ locationId: p.locationId, free: Math.max(0, p.available - (held.get(poolKey(v.sku, p.locationId)) ?? 0)) })),
    d.quantity,
  );
  if (!a.allocations) throw new InventoryError('OUT_OF_STOCK', 'not enough free pieces', [`${v.sku}:${a.free}`]);
  const expiresAt = new Date(now.getTime() + hours * 3_600_000);
  await tx.stockReservation.createMany({
    data: a.allocations.map((x) => ({ storeId: d.storeId, variantId: d.variantId, locationId: x.locationId, quantity: x.quantity, cartId: null, orderId: d.orderId, status: 'CONVERTED' as const, expiresAt })),
  });
  await refreshPools(tx, rows, now, kinds);
  return { sku: v.sku, allocations: a.allocations };
}

/** Lets go of the pieces held for an added line of this variant (its holds only, never the order's first pieces). */
export async function releaseOrderUnits(deps: InventoryDeps, input: z.input<typeof releaseInput>, opts: { tx: Tx }): Promise<{ released: number }> {
  const d = parse(releaseInput, input, 'release');
  const kinds = await sellableKinds(deps);
  const tx = opts.tx;
  const now = nowOf(deps);
  const holds = await tx.stockReservation.findMany({ where: { storeId: d.storeId, orderId: d.orderId, variantId: d.variantId, cartId: null, status: 'CONVERTED', releasedAt: null }, select: { id: true } });
  if (!holds.length) return { released: 0 };
  const v = await tx.productVariant.findUnique({ where: { id: d.variantId }, select: { sku: true } });
  const rows = await lockPools(tx, v ? [v.sku] : []);
  const n = (await tx.stockReservation.updateMany({ where: { id: { in: holds.map((h) => h.id) }, releasedAt: null }, data: { status: 'RELEASED', releasedAt: now } })).count;
  await refreshPools(tx, rows, now, kinds);
  return { released: n };
}

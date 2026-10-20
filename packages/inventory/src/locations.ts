// PR 201 — inventory locations, the damaged bin among them (Blueprint A4.4, A6.2; Bhandari B03, B06). One shared pool
// for every store: warehouses, each with its locations — stock, showroom, in transit, and the damaged bin.
//
// - A new warehouse gets the locations in `inventory.locations.defaults` (main stock + damaged bin by default).
// - While `inventory.locations.requireDamagedBin` is on, a warehouse always keeps one live damaged bin: its last one
//   cannot be archived or turned into another kind. Damaged stock is never sellable (`inventory.sellableLocationKinds`
//   refuses DAMAGED); returns with a damaged QC result go there (PR 187).
// - A location that holds stock cannot be archived or change kind; a warehouse whose locations hold stock cannot be
//   archived. Nothing is deleted: archived rows stay and can be restored (CLAUDE.md rule 3).
// - A warehouse links to one ERP warehouse (`erpWarehouseId`, PR 196); the ERP's stock for it lands in its location
//   with the code `inventory.erp.stockLocationCode`.
// - Stock numbers are never typed in here: they come from the ERP (PR 195). Adjustments are the ERP's (A3.6).
import { z } from 'zod';
import { SYSTEM, type Actor } from '@extas/auth';
import { locationCodeSchema, locationKindSchema, type LocationKindName } from '@extas/settings';
import { allow, allowEveryStore, found, logChange, parse, setting, TX, type Db, type InventoryDeps, type Tx, type Who } from './context';
import { InventoryError } from './errors';

/** A warehouse code: letters, digits and dashes (unique, never reused: archived codes stay taken). */
export const warehouseCodeSchema = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,39}$/, { message: 'letters, digits and dashes' });
const nameSchema = z.string().trim().min(1).max(80);
const erpIdSchema = z.string().trim().min(1).max(64);

export async function sellableKinds(deps: InventoryDeps): Promise<Set<LocationKindName>> {
  return new Set(await setting(deps, null, 'inventory.sellableLocationKinds'));
}

export interface StockTotals {
  onHand: number;
  reserved: number;
  available: number;
  cartReserved: number;
  variants: number;
}

export interface LocationView {
  id: string;
  warehouseId: string;
  code: string;
  name: string;
  kind: LocationKindName;
  sellable: boolean;
  /** The ERP's stock for this warehouse lands here (`inventory.erp.stockLocationCode`). */
  receivesErpStock: boolean;
  archived: boolean;
  stock: StockTotals;
}

export interface WarehouseView {
  id: string;
  code: string;
  name: string;
  erpWarehouseId: string | null;
  archived: boolean;
  locations: LocationView[];
}

const EMPTY: StockTotals = { onHand: 0, reserved: 0, available: 0, cartReserved: 0, variants: 0 };

async function totalsByLocation(db: Db, locationIds: string[]): Promise<Map<string, StockTotals>> {
  if (!locationIds.length) return new Map();
  const rows = await db.stockLevel.groupBy({ by: ['locationId'], where: { locationId: { in: locationIds } }, _sum: { onHand: true, reserved: true, available: true, cartReserved: true }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.locationId, { onHand: r._sum.onHand ?? 0, reserved: r._sum.reserved ?? 0, available: r._sum.available ?? 0, cartReserved: r._sum.cartReserved ?? 0, variants: r._count._all }]));
}

async function views(deps: InventoryDeps, where: { id?: string; archivedAt?: null }): Promise<WarehouseView[]> {
  const [rows, kinds, erpCode] = await Promise.all([
    deps.db.warehouse.findMany({ where, orderBy: { code: 'asc' }, include: { locations: { orderBy: { code: 'asc' } } } }),
    sellableKinds(deps),
    setting(deps, null, 'inventory.erp.stockLocationCode'),
  ]);
  const totals = await totalsByLocation(deps.db, rows.flatMap((w) => w.locations.map((l) => l.id)));
  return rows.map((w) => ({
    id: w.id,
    code: w.code,
    name: w.name,
    erpWarehouseId: w.erpWarehouseId,
    archived: w.archivedAt != null,
    locations: w.locations.map((l) => ({
      id: l.id,
      warehouseId: w.id,
      code: l.code,
      name: l.name,
      kind: l.kind,
      sellable: kinds.has(l.kind) && !l.archivedAt,
      receivesErpStock: l.code === erpCode && !l.archivedAt,
      archived: l.archivedAt != null,
      stock: totals.get(l.id) ?? EMPTY,
    })),
  }));
}

export async function listWarehouses(deps: InventoryDeps, who: Who, opts: { includeArchived?: boolean } = {}): Promise<WarehouseView[]> {
  await allow(deps, who, 'inventory.read');
  return views(deps, opts.includeArchived ? {} : { archivedAt: null });
}

export async function getWarehouse(deps: InventoryDeps, who: Who, id: string): Promise<WarehouseView> {
  await allow(deps, who, 'inventory.read');
  return found((await views(deps, { id }))[0], 'warehouse');
}

async function assertErpWarehouseFree(tx: Tx, erpWarehouseId: string | null | undefined, exceptId?: string) {
  if (!erpWarehouseId) return;
  const other = await tx.warehouse.findFirst({ where: { erpWarehouseId, archivedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { code: true } });
  if (other) throw new InventoryError('ERP_WAREHOUSE_TAKEN', 'another warehouse is linked to this ERP warehouse', [`warehouse: ${other.code}`]);
}

async function holdsStock(tx: Db, where: { locationId?: string; location?: { warehouseId: string } }): Promise<boolean> {
  const row = await tx.stockLevel.findFirst({ where: { ...where, OR: [{ onHand: { not: 0 } }, { reserved: { not: 0 } }, { cartReserved: { not: 0 } }] }, select: { id: true } });
  return row != null;
}

export const warehouseInput = z.object({ code: warehouseCodeSchema, name: nameSchema, erpWarehouseId: erpIdSchema.nullable().optional() }).strict();
export type WarehouseInput = z.input<typeof warehouseInput>;

/** Creates a warehouse with the default locations (`inventory.locations.defaults`). */
export async function createWarehouse(deps: InventoryDeps, who: Who, input: WarehouseInput): Promise<WarehouseView> {
  await allow(deps, who, 'inventory.read');
  await allowEveryStore(deps, who, 'inventory.locations');
  const d = parse(warehouseInput, input, 'warehouse');
  const defaults = await setting(deps, null, 'inventory.locations.defaults');
  const id = await deps.db.$transaction(async (tx) => {
    if (await tx.warehouse.findUnique({ where: { code: d.code }, select: { id: true } })) throw new InventoryError('CODE_TAKEN', 'a warehouse has this code', [`code: ${d.code}`]);
    await assertErpWarehouseFree(tx, d.erpWarehouseId);
    const w = await tx.warehouse.create({ data: { code: d.code, name: d.name, erpWarehouseId: d.erpWarehouseId ?? null } });
    for (const l of defaults) await tx.inventoryLocation.create({ data: { warehouseId: w.id, code: l.code, name: l.name, kind: l.kind } });
    await logChange(tx, who, { action: 'warehouse.create', entityType: 'Warehouse', entityId: w.id, before: null, after: { code: w.code, name: w.name, erpWarehouseId: w.erpWarehouseId, locations: defaults }, storeId: null });
    return w.id;
  }, TX);
  return found((await views(deps, { id }))[0], 'warehouse');
}

export const warehousePatch = z.object({ name: nameSchema.optional(), erpWarehouseId: erpIdSchema.nullable().optional(), archived: z.boolean().optional() }).strict();
export type WarehousePatch = z.input<typeof warehousePatch>;

/** Renames, links to an ERP warehouse (PR 196), archives or restores a warehouse. */
export async function updateWarehouse(deps: InventoryDeps, who: Who, id: string, patch: WarehousePatch): Promise<WarehouseView> {
  await allow(deps, who, 'inventory.read');
  await allowEveryStore(deps, who, 'inventory.locations');
  const d = parse(warehousePatch, patch, 'warehouse');
  await deps.db.$transaction(async (tx) => {
    const cur = found(await tx.warehouse.findUnique({ where: { id } }), 'warehouse');
    const archivedAt = d.archived === undefined ? cur.archivedAt : d.archived ? (cur.archivedAt ?? deps.now?.() ?? new Date()) : null;
    const next = { name: d.name ?? cur.name, erpWarehouseId: d.erpWarehouseId === undefined ? cur.erpWarehouseId : d.erpWarehouseId, archivedAt };
    if (d.archived === true && !cur.archivedAt && (await holdsStock(tx, { location: { warehouseId: id } }))) {
      throw new InventoryError('LOCATION_HAS_STOCK', 'the warehouse still holds stock', [`warehouse: ${cur.code}`]);
    }
    if (!next.archivedAt) await assertErpWarehouseFree(tx, next.erpWarehouseId, id);
    const before = { name: cur.name, erpWarehouseId: cur.erpWarehouseId, archivedAt: cur.archivedAt };
    if (JSON.stringify(before) === JSON.stringify(next)) return;
    await tx.warehouse.update({ where: { id }, data: next });
    const action = d.archived === true && !cur.archivedAt ? 'warehouse.archive' : d.archived === false && cur.archivedAt ? 'warehouse.restore' : 'warehouse.update';
    await logChange(tx, who, { action, entityType: 'Warehouse', entityId: id, before, after: next, storeId: null });
  }, TX);
  return found((await views(deps, { id }))[0], 'warehouse');
}

export const locationInput = z.object({ code: locationCodeSchema, name: nameSchema, kind: locationKindSchema }).strict();
export type LocationInput = z.input<typeof locationInput>;

export async function createLocation(deps: InventoryDeps, who: Who, warehouseId: string, input: LocationInput): Promise<WarehouseView> {
  await allow(deps, who, 'inventory.read');
  await allowEveryStore(deps, who, 'inventory.locations');
  const d = parse(locationInput, input, 'location');
  await deps.db.$transaction(async (tx) => {
    const w = found(await tx.warehouse.findUnique({ where: { id: warehouseId } }), 'warehouse');
    if (w.archivedAt) throw new InventoryError('PARENT_ARCHIVED', 'the warehouse is archived', ['warehouseId']);
    if (await tx.inventoryLocation.findUnique({ where: { warehouseId_code: { warehouseId, code: d.code } }, select: { id: true } })) {
      throw new InventoryError('CODE_TAKEN', 'the warehouse has a location with this code', [`code: ${d.code}`]);
    }
    const l = await tx.inventoryLocation.create({ data: { warehouseId, code: d.code, name: d.name, kind: d.kind } });
    await logChange(tx, who, { action: 'location.create', entityType: 'InventoryLocation', entityId: l.id, before: null, after: { warehouse: w.code, code: l.code, name: l.name, kind: l.kind }, storeId: null });
  }, TX);
  return found((await views(deps, { id: warehouseId }))[0], 'warehouse');
}

export const locationPatch = z.object({ name: nameSchema.optional(), kind: locationKindSchema.optional(), archived: z.boolean().optional() }).strict();
export type LocationPatch = z.input<typeof locationPatch>;

async function liveDamagedBins(tx: Db, warehouseId: string, exceptId?: string): Promise<number> {
  return tx.inventoryLocation.count({ where: { warehouseId, kind: 'DAMAGED', archivedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) } });
}

export async function updateLocation(deps: InventoryDeps, who: Who, id: string, patch: LocationPatch): Promise<WarehouseView> {
  await allow(deps, who, 'inventory.read');
  await allowEveryStore(deps, who, 'inventory.locations');
  const d = parse(locationPatch, patch, 'location');
  const requireDamaged = await setting(deps, null, 'inventory.locations.requireDamagedBin');
  const warehouseId = await deps.db.$transaction(async (tx) => {
    const cur = found(await tx.inventoryLocation.findUnique({ where: { id }, include: { warehouse: { select: { code: true, archivedAt: true } } } }), 'location');
    const archiving = d.archived === true && !cur.archivedAt;
    const restoring = d.archived === false && cur.archivedAt != null;
    const kind = d.kind ?? cur.kind;
    const kindChanges = kind !== cur.kind;
    if (restoring && cur.warehouse.archivedAt) throw new InventoryError('PARENT_ARCHIVED', 'the warehouse is archived', ['warehouseId']);
    if ((archiving || kindChanges) && (await holdsStock(tx, { locationId: id }))) {
      throw new InventoryError('LOCATION_HAS_STOCK', archiving ? 'the location still holds stock' : 'a location that holds stock keeps its kind', [`location: ${cur.warehouse.code}/${cur.code}`]);
    }
    if (requireDamaged && cur.kind === 'DAMAGED' && !cur.archivedAt && (archiving || kindChanges) && (await liveDamagedBins(tx, cur.warehouseId, id)) === 0) {
      throw new InventoryError('DAMAGED_BIN_REQUIRED', 'every warehouse keeps a damaged bin', [`location: ${cur.warehouse.code}/${cur.code}`]);
    }
    const next = { name: d.name ?? cur.name, kind, archivedAt: archiving ? (deps.now?.() ?? new Date()) : restoring ? null : cur.archivedAt };
    const before = { name: cur.name, kind: cur.kind, archivedAt: cur.archivedAt };
    if (JSON.stringify(before) === JSON.stringify(next)) return cur.warehouseId;
    await tx.inventoryLocation.update({ where: { id }, data: next });
    const action = archiving ? 'location.archive' : restoring ? 'location.restore' : 'location.update';
    await logChange(tx, who, { action, entityType: 'InventoryLocation', entityId: id, before, after: next, storeId: null });
    return cur.warehouseId;
  }, TX);
  return found((await views(deps, { id: warehouseId }))[0], 'warehouse');
}

/** The live damaged bin of a warehouse (returns with a damaged QC result go here, PR 187), or null. */
export async function damagedBin(db: Db, warehouseId: string): Promise<{ id: string; code: string } | null> {
  return db.inventoryLocation.findFirst({ where: { warehouseId, kind: 'DAMAGED', archivedAt: null }, orderBy: { createdAt: 'asc' }, select: { id: true, code: true } });
}

/**
 * Gives every live warehouse its default locations (codes it does not have at all) and, while a damaged bin is
 * required, a live damaged bin (restoring an archived default one before making a new one). Idempotent: a second run
 * changes nothing. A job (`inventory.locations.ensureDefaults`) and the deploy may run it; warehouses made before PR 201
 * (the sample seed's) get their damaged bin this way.
 */
export async function ensureDefaultLocations(deps: InventoryDeps, actor: Actor = SYSTEM): Promise<{ created: number; restored: number }> {
  const [defaults, requireDamaged] = await Promise.all([setting(deps, null, 'inventory.locations.defaults'), setting(deps, null, 'inventory.locations.requireDamagedBin')]);
  const who: Who = { actor, storeId: 0, ctx: { source: 'job' } };
  let created = 0;
  let restored = 0;
  const warehouses = await deps.db.warehouse.findMany({ where: { archivedAt: null }, select: { id: true, code: true } });
  for (const w of warehouses) {
    await deps.db.$transaction(async (tx) => {
      const have = await tx.inventoryLocation.findMany({ where: { warehouseId: w.id }, select: { id: true, code: true, kind: true, archivedAt: true } });
      for (const l of defaults) {
        if (have.some((h) => h.code === l.code)) continue;
        const row = await tx.inventoryLocation.create({ data: { warehouseId: w.id, code: l.code, name: l.name, kind: l.kind } });
        have.push({ id: row.id, code: row.code, kind: row.kind, archivedAt: null });
        created++;
        await logChange(tx, who, { action: 'location.create', entityType: 'InventoryLocation', entityId: row.id, before: null, after: { warehouse: w.code, code: row.code, kind: row.kind, reason: 'default location' }, storeId: null });
      }
      if (requireDamaged && !have.some((h) => h.kind === 'DAMAGED' && !h.archivedAt)) {
        const spec = defaults.find((l) => l.kind === 'DAMAGED');
        const archived = have.find((h) => h.kind === 'DAMAGED' && h.archivedAt);
        if (archived) {
          await tx.inventoryLocation.update({ where: { id: archived.id }, data: { archivedAt: null } });
          restored++;
          await logChange(tx, who, { action: 'location.restore', entityType: 'InventoryLocation', entityId: archived.id, before: { archivedAt: archived.archivedAt }, after: { archivedAt: null, reason: 'a damaged bin is required' }, storeId: null });
        } else if (spec) {
          // The default code is taken by a location of another kind: the bin gets a free code next to it.
          let code = spec.code;
          for (let n = 2; have.some((h) => h.code === code); n++) code = `${spec.code}-${n}`;
          const row = await tx.inventoryLocation.create({ data: { warehouseId: w.id, code, name: spec.name, kind: 'DAMAGED' } });
          created++;
          await logChange(tx, who, { action: 'location.create', entityType: 'InventoryLocation', entityId: row.id, before: null, after: { warehouse: w.code, code, kind: 'DAMAGED', reason: 'a damaged bin is required' }, storeId: null });
        }
      }
    }, TX);
  }
  return { created, restored };
}

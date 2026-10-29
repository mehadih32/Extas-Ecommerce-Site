// PR 196 — `companyId` and warehouse mapping per store (Blueprint A3.5 rule 3, A4.4; contract: "one integration = one
// store = one ERP company; the companyId comes from the key").
//
// - The ERP decides the company from the key; the shop keeps a mirror of it (StoreErpMapping.erpCompanyId and
//   Store.erpCompanyId — the owner's data, PR 509) and checks it before every sync: a key of another company stops the
//   sync with COMPANY_MISMATCH and nothing is written. The first real answer fills an empty mirror (audited). The
//   practice ERP's company is shown, never saved.
// - The store's ERP warehouse (StoreErpMapping.erpWarehouseId) limits what the stock pull asks for; local warehouses
//   link to ERP warehouses one to one (Warehouse.erpWarehouseId, locations.ts). One shared warehouse serves every
//   store (A4.4), while sales and accounts stay per company.
import { z } from 'zod';
import { SYSTEM } from '@extas/auth';
import type { ErpHealth } from '@extas/adapters';
import { allow, logChange, parse, setting, TX, type InventoryDeps, type Tx, type Who } from './context';
import { readErpSetup, type ErpSetup } from './erp-mode';
import { isV6 } from './erp-model';
import { InventoryError } from './errors';
import { behaviourOf, resolveErp, type ErpLink } from './guard';
import { callErp, retryPolicy } from './sync';

const erpId = z.string().trim().min(1).max(64);
export const erpMappingInput = z.object({ erpCompanyId: erpId.nullable().optional(), erpWarehouseId: erpId.nullable().optional() }).strict();
export type ErpMappingInput = z.input<typeof erpMappingInput>;

/** Writes the company mirror on both places it lives (the mapping row when there is one, and the store). */
async function writeCompany(tx: Tx, storeId: number, erpCompanyId: string | null): Promise<void> {
  await tx.store.update({ where: { id: storeId }, data: { erpCompanyId } });
  await tx.storeErpMapping.updateMany({ where: { storeId }, data: { erpCompanyId } });
}

export async function setErpMapping(deps: InventoryDeps, who: Who, input: ErpMappingInput): Promise<ErpSetup> {
  await allow(deps, who, 'inventory.erp');
  const d = parse(erpMappingInput, input, 'ERP mapping');
  await deps.db.$transaction(async (tx) => {
    const before = await readErpSetup(tx, deps.settings, who.storeId);
    const next = {
      erpCompanyId: d.erpCompanyId === undefined ? before.erpCompanyId : d.erpCompanyId,
      erpWarehouseId: d.erpWarehouseId === undefined ? before.erpWarehouseId : d.erpWarehouseId,
    };
    if (next.erpCompanyId === before.erpCompanyId && next.erpWarehouseId === before.erpWarehouseId) return;
    // Saving a mapping keeps the store's current mode (a store following the default gets its own row with that mode).
    await tx.storeErpMapping.upsert({
      where: { storeId: who.storeId },
      create: { storeId: who.storeId, mode: before.mode, integrationId: before.integrationId, ...next },
      update: next,
    });
    await writeCompany(tx, who.storeId, next.erpCompanyId);
    await logChange(tx, who, {
      action: 'erp.mapping',
      entityType: 'StoreErpMapping',
      entityId: String(who.storeId),
      before: { erpCompanyId: before.erpCompanyId, erpWarehouseId: before.erpWarehouseId },
      after: next,
      storeId: who.storeId,
    });
  }, TX);
  return readErpSetup(deps.db, deps.settings, who.storeId);
}

export interface CompanyCheck {
  /** The answer came from the practice ERP: shown, never saved. */
  practice: boolean;
  erp: ErpHealth;
  /** The company this store is mapped to (before any learning). */
  mapped: string | null;
  /** null when one side does not know its company. */
  matches: boolean | null;
  /** The ERP's company was saved as this store's (the mirror was empty). */
  learned: boolean;
}

/**
 * Compares the key's company with the store's mapping. A real ERP's answer fills an empty mirror; a different company
 * is COMPANY_MISMATCH. Used before every sync and by the admin's "check company" button.
 */
export async function checkCompany(deps: InventoryDeps, link: Extract<ErpLink, { api: unknown }>, health: ErpHealth): Promise<CompanyCheck> {
  const mapped = link.setup.erpCompanyId;
  const practice = link.state === 'mock';
  const matches = mapped && health.companyId ? mapped === health.companyId : null;
  if (practice) return { practice, erp: health, mapped, matches, learned: false };
  if (matches === false) throw new InventoryError('COMPANY_MISMATCH', 'the ERP key belongs to another company than this store is mapped to', [`store: ${mapped}`, `key: ${health.companyId}`]);
  // CN-029 §16: in v6 a key of a company another store's open ERP link holds is refused before anything is learned.
  if (health.companyId && (await isV6(deps, link.setup.storeId))) {
    const other = await deps.db.erpStoreLink.findFirst({ where: { openErpCompanyId: health.companyId, storeId: { not: link.setup.storeId } }, select: { storeId: true } });
    if (other) throw new InventoryError('SHARED_COMPANY', 'this ERP key belongs to a company already linked to another store: one store = one ERP company (§16)', [`key: ${health.companyId}`, `store: ${other.storeId}`]);
  }
  let learned = false;
  if (!mapped && health.companyId) {
    const storeId = link.setup.storeId;
    await deps.db.$transaction(async (tx) => {
      await writeCompany(tx, storeId, health.companyId);
      await logChange(tx, { actor: SYSTEM, storeId, ctx: { source: 'erp-sync' } }, {
        action: 'erp.company.learn',
        entityType: 'StoreErpMapping',
        entityId: String(storeId),
        before: { erpCompanyId: null },
        after: { erpCompanyId: health.companyId, companyName: health.companyName, integrationName: health.integrationName },
        storeId,
      });
    }, TX);
    learned = true;
  }
  return { practice, erp: health, mapped, matches, learned };
}

async function connectedLink(deps: InventoryDeps, who: Who, path: 'company.verify' | 'warehouses.discover') {
  const link = await resolveErp(deps, who.storeId);
  const b = behaviourOf(path, link);
  if (link.state === 'none' && b !== 'skip') throw new InventoryError('ERP_NOT_CONNECTED', 'this store works without an ERP');
  if (link.state === 'unavailable') throw new InventoryError('ERP_UNAVAILABLE', link.reason, [link.code]);
  return link;
}

/** The admin's "which company is this key?" check (needs `inventory.erp`). */
export async function verifyErpCompany(deps: InventoryDeps, who: Who): Promise<CompanyCheck> {
  await allow(deps, who, 'inventory.erp');
  const link = await connectedLink(deps, who, 'company.verify');
  if (!('api' in link)) throw new InventoryError('ERP_NOT_CONNECTED', 'this store works without an ERP');
  const health = (await callErp(deps, await retryPolicy(deps), (o) => link.api.health(o))).value;
  return checkCompany(deps, link, health);
}

export interface ErpWarehouseView {
  erpWarehouseId: string;
  /** The ERP named it as the integration's warehouse. */
  integrationWarehouse: boolean;
  /** Seen in the ERP's stock. */
  seenInStock: boolean;
  /** The local warehouse linked to it. */
  linkedTo: { id: string; code: string; name: string } | null;
  /** The store's own ERP warehouse (StoreErpMapping.erpWarehouseId). */
  storeWarehouse: boolean;
}

/**
 * The ERP warehouses this store can link to: the integration's own (from `/health`) and those its stock is kept in
 * (one page of `/stock`). With no ERP the list is empty (PR 499); on the practice ERP it lists the practice warehouses.
 */
export async function erpWarehouses(deps: InventoryDeps, who: Who): Promise<{ practice: boolean; warehouses: ErpWarehouseView[] }> {
  await allow(deps, who, 'inventory.read');
  const link = await connectedLink(deps, who, 'warehouses.discover');
  if (!('api' in link)) return { practice: false, warehouses: [] };
  const policy = await retryPolicy(deps);
  const [health, page] = await Promise.all([
    callErp(deps, policy, (o) => link.api.health(o)),
    callErp(deps, policy, async (o) => link.api.stock({ limit: await setting(deps, null, 'erp.sync.pageSize') }, o)),
  ]);
  const ids = new Map<string, { integrationWarehouse: boolean; seenInStock: boolean }>();
  if (health.value.warehouseId) ids.set(health.value.warehouseId, { integrationWarehouse: true, seenInStock: false });
  for (const r of page.value.items) {
    const cur = ids.get(r.warehouseId) ?? { integrationWarehouse: false, seenInStock: false };
    ids.set(r.warehouseId, { ...cur, seenInStock: true });
  }
  if (link.setup.erpWarehouseId && !ids.has(link.setup.erpWarehouseId)) ids.set(link.setup.erpWarehouseId, { integrationWarehouse: false, seenInStock: false });
  const local = await deps.db.warehouse.findMany({ where: { erpWarehouseId: { in: [...ids.keys()] }, archivedAt: null }, select: { id: true, code: true, name: true, erpWarehouseId: true } });
  return {
    practice: link.state === 'mock',
    warehouses: [...ids.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([erpWarehouseId, f]) => {
        const w = local.find((x) => x.erpWarehouseId === erpWarehouseId);
        return { erpWarehouseId, ...f, linkedTo: w ? { id: w.id, code: w.code, name: w.name } : null, storeWarehouse: link.setup.erpWarehouseId === erpWarehouseId };
      }),
  };
}

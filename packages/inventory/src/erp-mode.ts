// PR 497 — the ERP mode switch: per store, where stock and orders come from — our ERP (`EXTAS_ERP`), another ERP
// (`OTHER_ERP`, through its own adapter), or no ERP (`NONE`). The choice is the store's StoreErpMapping row (owner
// data, PR 509); a store without a row follows the setting `erp.defaultMode`. The ERP's address and keys are never
// here: the address is on the connection row and the keys are in the vault (PR 493, 500).
//
// Switching is reversible and nothing is lost: going to "no ERP" keeps the company, warehouse and connection on the
// row, so switching back restores them (CLAUDE.md rule 3). Every switch is in the audit log.
import { z } from 'zod';
import { EXTAS_ERP_PROVIDER } from '@extas/adapters';
import { erpModeSchema, type ErpModeName } from '@extas/settings';
import { allow, logChange, parse, TX, type Db, type InventoryDeps, type SettingsReader, type Who } from './context';
import { InventoryError } from './errors';

export interface ErpSetup {
  storeId: number;
  mode: ErpModeName;
  /** `store` = chosen for this store; `default` = the setting `erp.defaultMode`. */
  modeSource: 'store' | 'default';
  /** The ERP connection (Integration row) the store uses; null = the provider's default lookup. */
  integrationId: string | null;
  erpCompanyId: string | null;
  erpWarehouseId: string | null;
}

/** The store's ERP setup as it stands (no permission check: internal callers and jobs). */
export async function readErpSetup(db: Db, settings: SettingsReader, storeId: number): Promise<ErpSetup> {
  const row = await db.storeErpMapping.findUnique({ where: { storeId } });
  if (row) return { storeId, mode: row.mode, modeSource: 'store', integrationId: row.integrationId, erpCompanyId: row.erpCompanyId, erpWarehouseId: row.erpWarehouseId };
  const store = await db.store.findUnique({ where: { id: storeId }, select: { erpCompanyId: true } });
  return { storeId, mode: await settings.value('erp.defaultMode', { storeId }), modeSource: 'default', integrationId: null, erpCompanyId: store?.erpCompanyId ?? null, erpWarehouseId: null };
}

export const erpModeInput = z.object({ mode: erpModeSchema, integrationId: z.uuid().nullable().optional() }).strict();
export type ErpModeInput = z.input<typeof erpModeInput>;

/** An ERP connection this store may use: kind ERP, not archived, the store's own or installation-wide. */
async function erpConnection(db: Db, storeId: number, id: string) {
  const row = await db.integration.findFirst({ where: { id, kind: 'ERP', archivedAt: null, OR: [{ storeId }, { storeId: null }] }, select: { id: true, provider: true } });
  if (!row) throw new InventoryError('INVALID_INPUT', 'not an ERP connection of this store', ['integrationId']);
  return row;
}

export async function setErpMode(deps: InventoryDeps, who: Who, input: ErpModeInput): Promise<ErpSetup> {
  await allow(deps, who, 'inventory.erp');
  const d = parse(erpModeInput, input, 'ERP mode');
  if (d.mode === 'NONE' && d.integrationId) throw new InventoryError('INVALID_INPUT', '"no ERP" takes no connection', ['integrationId']);
  if (d.mode === 'OTHER_ERP' && !d.integrationId) throw new InventoryError('INVALID_INPUT', 'another ERP needs its connection', ['integrationId']);
  if (d.integrationId) {
    const conn = await erpConnection(deps.db, who.storeId, d.integrationId);
    const ours = conn.provider === EXTAS_ERP_PROVIDER;
    if ((d.mode === 'EXTAS_ERP') !== ours) throw new InventoryError('INVALID_INPUT', d.mode === 'EXTAS_ERP' ? 'that connection is another ERP' : 'that connection is our own ERP', ['integrationId']);
  }
  await deps.db.$transaction(async (tx) => {
    const before = await readErpSetup(tx, deps.settings, who.storeId);
    // "No ERP" keeps the connection on the row; choosing an ERP without naming a connection keeps the one it had only if
    // it is of that kind.
    let integrationId = d.integrationId ?? null;
    if (d.mode === 'NONE') integrationId = before.integrationId;
    else if (d.integrationId === undefined && before.integrationId) {
      const prev = await tx.integration.findUnique({ where: { id: before.integrationId }, select: { provider: true } });
      if (prev && (prev.provider === EXTAS_ERP_PROVIDER) === (d.mode === 'EXTAS_ERP')) integrationId = before.integrationId;
    }
    if (before.modeSource === 'store' && before.mode === d.mode && before.integrationId === integrationId) return;
    await tx.storeErpMapping.upsert({
      where: { storeId: who.storeId },
      create: { storeId: who.storeId, mode: d.mode, integrationId, erpCompanyId: before.erpCompanyId, erpWarehouseId: before.erpWarehouseId },
      update: { mode: d.mode, integrationId },
    });
    await logChange(tx, who, {
      action: 'erp.mode',
      entityType: 'StoreErpMapping',
      entityId: String(who.storeId),
      before: { mode: before.mode, modeSource: before.modeSource, integrationId: before.integrationId },
      after: { mode: d.mode, integrationId },
      storeId: who.storeId,
    });
  }, TX);
  return readErpSetup(deps.db, deps.settings, who.storeId);
}

/** The store's ERP setup for the admin (needs `inventory.read`). */
export async function getErpSetup(deps: InventoryDeps, who: Who): Promise<ErpSetup> {
  await allow(deps, who, 'inventory.read');
  return readErpSetup(deps.db, deps.settings, who.storeId);
}

/** The effective mode of every live store (the poll schedule and the health panel read it). */
export async function storesWithErp(deps: InventoryDeps): Promise<{ storeId: number; mode: ErpModeName }[]> {
  const stores = await deps.db.store.findMany({ where: { archivedAt: null }, select: { id: true }, orderBy: { id: 'asc' } });
  const out: { storeId: number; mode: ErpModeName }[] = [];
  for (const s of stores) {
    const setup = await readErpSetup(deps.db, deps.settings, s.id);
    if (setup.mode !== 'NONE') out.push({ storeId: s.id, mode: setup.mode });
  }
  return out;
}

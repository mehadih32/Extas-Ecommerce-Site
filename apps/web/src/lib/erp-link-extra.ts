// PR 851 (owner order 15 Nov 2026: the real admin equals prototype v5, Settings › ERP connection) — the two things the prototype's page
// does that the real one did not: "Change ERP connection" (the live ERP or the practice ERP, with the owner's PIN) and "Matching"
// (the ERP warehouse and the ERP accounts shop money lands in). Both are called from `POST /api/admin/erp-link` (erp-link-admin.ts).
// - Live ERP is the connection row's mode LIVE, practice ERP its mode SANDBOX (the ERP's test system, the same client). The address
//   and keys stay on the connection (Keys & connections); orders waiting to be sent are never touched, they go by themselves.
// - Matching: the warehouse is the store's own mapping row (`inv.setErpMapping`, audited); the three accounts are the setting
//   `erp.matching` (owner data, written through the settings history). Nothing here moves money, stock or an order.
import { audit, isOwner } from '@extas/auth';
import * as inv from '@extas/inventory';
import { ERP_MATCHING_DEFAULT, erpMatchingSchema, INSTALLATION, type ErpMatchingSettings } from '@extas/settings';
import type { AdminDeps } from './admin-auth';
import { inventoryDeps } from './inventory-api';
import { requireOwnerPin } from './owner-pin';

export class ErpExtraError extends Error {
  constructor(
    public status: number,
    public code: string,
    public details: string[] = [],
  ) {
    super(code);
  }
}

export const ERP_MODE_CHOICES = ['live', 'practice'] as const;
export type ErpModeChoice = (typeof ERP_MODE_CHOICES)[number];
/** The adapter mode each choice means on the connection row. */
export const ADAPTER_MODE_OF: Record<ErpModeChoice, 'LIVE' | 'SANDBOX'> = { live: 'LIVE', practice: 'SANDBOX' };

export function parseModeChoice(raw: unknown): ErpModeChoice {
  if (typeof raw !== 'string' || !(ERP_MODE_CHOICES as readonly string[]).includes(raw)) throw new ErpExtraError(400, 'INVALID_INPUT', ['mode']);
  return raw as ErpModeChoice;
}

/** The ERP connection rows of one store (not archived). */
async function erpRows(deps: AdminDeps, storeId: number) {
  return deps.db.integration.findMany({ where: { storeId, kind: 'ERP', archivedAt: null }, select: { id: true, mode: true, enabled: true } });
}

/** Which of the two the store's ERP connection is on now; null when it has none or is on neither (mock). */
export async function currentModeChoice(deps: AdminDeps, storeId: number): Promise<ErpModeChoice | null> {
  const rows = await erpRows(deps, storeId);
  if (rows.some((r) => r.mode === 'LIVE')) return 'live';
  if (rows.some((r) => r.mode === 'SANDBOX')) return 'practice';
  return null;
}

/** "Change ERP connection": the owner's PIN, then the connection row's mode. Audited; a no-op when it is on that ERP already. */
export async function changeErpConnection(deps: AdminDeps, who: inv.Who, input: { mode: unknown; pin: unknown }): Promise<{ changed: boolean; mode: ErpModeChoice }> {
  const mode = parseModeChoice(input.mode);
  if (!who.actor.staffUserId || !(await isOwner(deps.db, who.actor.staffUserId))) throw new ErpExtraError(403, 'OWNER_ONLY');
  await requireOwnerPin(deps, who.actor, who.ctx ?? {}, input.pin, 'erp.connection.change', who.storeId);
  const rows = await erpRows(deps, who.storeId);
  if (!rows.length) throw new ErpExtraError(409, 'NO_CONNECTION');
  const target = ADAPTER_MODE_OF[mode];
  let changed = false;
  for (const r of rows) {
    if (r.mode === target) continue;
    await deps.db.integration.update({ where: { id: r.id }, data: { mode: target } });
    await audit(deps.db, who.actor, { storeId: who.storeId, action: 'integration.mode', entityType: 'Integration', entityId: r.id, before: { mode: r.mode }, after: { mode: target, reason: 'Settings › ERP connection: Change ERP connection' } }, who.ctx);
    changed = true;
  }
  return { changed, mode };
}

export interface MatchingView {
  warehouse: string;
  accounts: ErpMatchingSettings;
  /** Account names the owner already gave on Settings › Payments, offered while typing. */
  suggestions: string[];
}

export async function matchingView(deps: AdminDeps, who: inv.Who): Promise<MatchingView> {
  const [setup, saved, settle] = await Promise.all([
    inv.getErpSetup(await inventoryDeps(deps), who).catch(() => null),
    deps.resolver.value('erp.matching'),
    deps.resolver.value('payments.settlement'),
  ]);
  return { warehouse: setup?.erpWarehouseId ?? '', accounts: saved ?? ERP_MATCHING_DEFAULT, suggestions: settle?.accounts ?? [] };
}

const matchingInput = erpMatchingSchema.extend({ warehouse: erpMatchingSchema.shape.cod }).strict();

/** "Save matching": the ERP warehouse (the store's mapping row) and the three ERP accounts (the setting). */
export async function saveMatching(deps: AdminDeps, who: inv.Who, canWrite: boolean, raw: unknown): Promise<MatchingView> {
  if (!canWrite) throw new ErpExtraError(403, 'FORBIDDEN');
  const r = matchingInput.safeParse(raw);
  if (!r.success) throw new ErpExtraError(400, 'INVALID_INPUT', r.error.issues.map((i) => i.path.join('.')));
  const { warehouse, ...accounts } = r.data;
  const before = await matchingView(deps, who);
  if (warehouse !== before.warehouse) await inv.setErpMapping(await inventoryDeps(deps), who, { erpWarehouseId: warehouse === '' ? null : warehouse });
  const same = (Object.keys(accounts) as (keyof ErpMatchingSettings)[]).every((k) => accounts[k] === before.accounts[k]);
  if (!same) await deps.resolver.set('erp.matching', accounts, INSTALLATION, { actorId: who.actor.staffUserId ?? null, reason: 'Settings › ERP connection: Matching' });
  return matchingView(deps, who);
}

// CN-028 · PR 612–614 (CN-029 Phase 1) — the old shop-side return paths as switches (registry v67,
// `returns.legacy.*`). The owner's rule: the old exchange and return work (PR 184–191, 525, 526) keeps working while a
// store speaks ERP contract v5; the v6 path sits beside it; at the switch-over (PR 619) the old shop QC, restock and
// write-off become switches that are off, never deleted. So each path asks here first:
//   - v6: the path never runs, whatever its switch says (ERP_MODEL): the owner decides every returned piece in the ERP
//     and there are no refunds after delivery (CN-028 (3)); the hand-back desk (PR 612) and the ERP exchange (PR 614)
//     take over.
//   - v5: the path runs while its switch is on (the default: today's behaviour); off → LEGACY_OFF for a step (the QC),
//     or the part is skipped inside a step (no restock document, no write-off cost, no credit noted).
import { isV6 } from '@extas/inventory';
import { setting, type OrdersDeps } from './context';
import { OrdersError } from './errors';

export const LEGACY_PATHS = ['shopQc', 'restock', 'writeOff', 'creditDue'] as const;
export type LegacyPath = (typeof LEGACY_PATHS)[number];

export interface LegacyPaths {
  model: 'v5' | 'v6';
  /** Each old path: may it run in this store now? (always false in v6) */
  shopQc: boolean;
  restock: boolean;
  writeOff: boolean;
  creditDue: boolean;
}

const KEY = {
  shopQc: 'returns.legacy.shopQc',
  restock: 'returns.legacy.restock',
  writeOff: 'returns.legacy.writeOff',
  creditDue: 'returns.legacy.creditDue',
} as const satisfies Record<LegacyPath, string>;

/** The store's model and which old paths may run in it. */
export async function legacyPaths(deps: Pick<OrdersDeps, 'settings'>, storeId: number): Promise<LegacyPaths> {
  const [v6, shopQc, restock, writeOff, creditDue] = await Promise.all([
    isV6(deps, storeId),
    setting(deps, storeId, KEY.shopQc),
    setting(deps, storeId, KEY.restock),
    setting(deps, storeId, KEY.writeOff),
    setting(deps, storeId, KEY.creditDue),
  ]);
  if (v6) return { model: 'v6', shopQc: false, restock: false, writeOff: false, creditDue: false };
  return { model: 'v5', shopQc, restock, writeOff, creditDue };
}

/** Refuses a step of an old path that may not run here (ERP_MODEL in v6, LEGACY_OFF when its switch is off). */
export function requireLegacy(paths: LegacyPaths, path: LegacyPath, what: string): void {
  if (paths.model === 'v6') throw new OrdersError('ERP_MODEL', `${what} is not used on ERP contract v6: the owner checks every returned piece in the ERP`, [path], { model: 'v6', use: 'handback' });
  if (!paths[path]) throw new OrdersError('LEGACY_OFF', `${what} is switched off for this store`, [path], { setting: KEY[path] });
}

/** Refuses a v6 step on a store still on v5 (the old flow keeps working there). */
export async function requireV6(deps: Pick<OrdersDeps, 'settings'>, storeId: number, what: string): Promise<void> {
  if (!(await isV6(deps, storeId))) throw new OrdersError('ERP_MODEL', `${what} is used from the switch to ERP contract v6`, ['erp.model'], { model: 'v5' });
}

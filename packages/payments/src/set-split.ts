// CN-018 (4) · PR 89 follow-up (SIM-F-051, follow-up 330) — the owner's set rules for the sets on one order: each set's
// "Fixed" or "Flexible" and its split-price rule, after the store's defaults (`combos.split`, @extas/settings
// `setSplitOf`). Empty while the setting is off, so every set then splits pro rata as before.
import { setSplitOf } from '@extas/settings';
import type { DoorSetRule } from './cod-match';
import { setting, type Db, type PaymentsDeps } from './context';

export type SetRule = DoorSetRule & { name: string };

/** The rules of these sets (by combo id) in the store; empty while `combos.split` is off. */
export async function setRulesFor(db: Db, deps: Pick<PaymentsDeps, 'settings'>, storeId: number, comboIds: readonly string[]): Promise<Map<string, SetRule>> {
  const out = new Map<string, SetRule>();
  const ids = [...new Set(comboIds)];
  if (!ids.length) return out;
  const s = await setting(deps, storeId, 'combos.split');
  if (!s.enabled) return out;
  const rows = await db.combo.findMany({ where: { storeId, id: { in: ids } }, select: { id: true, nameEn: true, splitMode: true, splitPriceRule: true } });
  for (const r of rows) {
    const rule = setSplitOf(r, s);
    if (rule) out.set(r.id, { ...rule, name: r.nameEn });
  }
  return out;
}

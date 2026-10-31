// CN-018 (4) · SIM-F-051 (PR 179 follow-up) — the rider is told about a Fixed set: the sets in a parcel that are
// "Fixed" (kept or returned whole, after the store's `combos.split` default and the set's own choice), for the
// sticker's "Set …: deliver whole" line and the courier booking note. Nothing while the owner's setting is off.
import { setSplitOf } from '@extas/settings';
import { setting, type ShippingDeps } from './context';

export interface FixedSetName {
  nameEn: string;
  nameBn: string | null;
}

type Db = Pick<ShippingDeps['db'], 'combo'>;

/** The fixed sets among these lines' sets (by combo id), in the order the lines name them; empty while off. */
export async function fixedSetsOf(db: Db, deps: Pick<ShippingDeps, 'settings'>, storeId: number, lines: readonly { comboId: string | null }[]): Promise<FixedSetName[]> {
  const ids = [...new Set(lines.flatMap((l) => (l.comboId ? [l.comboId] : [])))];
  if (!ids.length) return [];
  const s = await setting(deps, storeId, 'combos.split');
  if (!s.enabled) return [];
  const rows = await db.combo.findMany({ where: { storeId, id: { in: ids } }, select: { id: true, nameEn: true, nameBn: true, splitMode: true, splitPriceRule: true } });
  const fixed = new Map(rows.filter((r) => setSplitOf(r, s)?.mode === 'FIXED').map((r) => [r.id, { nameEn: r.nameEn, nameBn: r.nameBn }]));
  return ids.flatMap((id) => (fixed.has(id) ? [fixed.get(id)!] : []));
}

/** The booking note's line for each fixed set (`template` with {name}, in the note's language). */
export function fixedSetNoteLines(sets: readonly FixedSetName[], template: string, lang: 'en' | 'bn'): string[] {
  return sets.map((s) => template.replace(/\{name\}/g, lang === 'bn' ? (s.nameBn ?? s.nameEn) : s.nameEn));
}

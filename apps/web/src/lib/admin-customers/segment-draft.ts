// S14 · PR 287 — the segment builder's rows (what the person types) to and from a stored definition, without React or a
// database (the builder and the tests share it). A row with nothing typed yet is left out of the count and the save, so
// a half-made condition never narrows the group by accident; a value that is not a number where one is needed makes the
// row "not valid" (shown under it) and is left out too.
import { SEGMENT_FIELDS, type SegmentCondition, type SegmentDefinition, type SegmentField } from '@extas/customers/pure';
import { toMajor, toMinor, type Money } from '@/components/admin/products/model';

export interface DraftRow {
  field: SegmentField;
  value: string;
}

/** The first value a field's picker shows when the field is chosen ('' = nothing typed yet). */
export function startValue(field: SegmentField): string {
  const kind = SEGMENT_FIELDS[field];
  if (kind === 'consent') return 'sms';
  if (kind === 'yesno') return 'true';
  return '';
}

/** One row as a condition: null while empty, 'bad' when what is typed is not a value of its kind. */
export function rowCondition(r: DraftRow, money: Money): SegmentCondition | null | 'bad' {
  const v = r.value.trim();
  if (!v) return null;
  const kind = SEGMENT_FIELDS[r.field];
  if (kind === 'count' || kind === 'percent' || kind === 'days') {
    if (!/^\d+$/.test(v)) return 'bad';
    const n = Number(v);
    if (kind === 'percent' && n > 100) return 'bad';
    if (kind === 'days' && (n < 1 || n > 3650)) return 'bad';
    return { field: r.field, value: n } as SegmentCondition;
  }
  if (kind === 'money') {
    const m = toMinor(v, money);
    return m === null || m === undefined ? 'bad' : ({ field: r.field, value: m } as SegmentCondition);
  }
  if (kind === 'yesno') return { field: r.field, value: v === 'true' } as SegmentCondition;
  if (kind === 'consent') return ['sms', 'whatsapp', 'none'].includes(v) ? ({ field: r.field, value: v } as SegmentCondition) : 'bad';
  return { field: r.field, value: v } as SegmentCondition;
}

/** The definition of the filled, valid rows. */
export function draftDefinition(rows: readonly DraftRow[], money: Money): SegmentDefinition {
  const all = rows.map((r) => rowCondition(r, money)).filter((c): c is SegmentCondition => !!c && c !== 'bad');
  return { v: 1, all };
}

/** A stored definition as the builder's rows. */
export function draftRows(def: SegmentDefinition | null, money: Money): DraftRow[] {
  if (!def) return [];
  return def.all.map((c) => {
    const kind = SEGMENT_FIELDS[c.field];
    const value = kind === 'money' ? toMajor(c.value as number, money) : String(c.value);
    return { field: c.field, value };
  });
}

// PR 629 (CN-036, LUMEN-SPEC §3 item 5) — the form's readiness checklist ("Ready to publish?"), pure so the form + live
// preview pattern (components/admin/lumen/FormPreview.tsx) and its tests share it. Publish stays off until every check
// passes; the page's own API checks everything again (this list only helps the owner see what is missing).

export type CheckRule = 'filled' | 'minLength' | 'maxLength' | 'min' | 'max' | 'number';

export interface FormCheck {
  id: string;
  label: string;
  field: string;
  rule: CheckRule;
  arg?: number;
}

const filled = (v: unknown) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && String(v).trim() !== '');

/** One check against the values as typed. */
export function checkPasses(c: FormCheck, values: Record<string, unknown>): boolean {
  const v = values[c.field];
  const s = v === undefined || v === null ? '' : String(v).trim();
  const num = s === '' ? NaN : Number(s);
  switch (c.rule) {
    case 'filled':
      return filled(v);
    case 'minLength':
      return [...s].length >= (c.arg ?? 1);
    case 'maxLength':
      return s !== '' && [...s].length <= (c.arg ?? Infinity);
    case 'number':
      return Number.isFinite(num);
    case 'min':
      return Number.isFinite(num) && num >= (c.arg ?? 0);
    case 'max':
      return Number.isFinite(num) && num <= (c.arg ?? Infinity);
    default:
      return false;
  }
}

/** The readiness checklist: each check with its result, and whether Publish may be pressed (every check passes). */
export function readiness(checks: readonly FormCheck[], values: Record<string, unknown>): { list: { id: string; label: string; ok: boolean }[]; ready: boolean; done: number } {
  const list = checks.map((c) => ({ id: c.id, label: c.label, ok: checkPasses(c, values) }));
  const done = list.filter((c) => c.ok).length;
  return { list, ready: list.length > 0 && done === list.length, done };
}


// PR 492 — the two-tier resolution itself, as a pure function: store value → installation value → definition default.
// Every stored value is validated with the setting's schema; a value that no longer passes (for example after the
// schema got stricter) is skipped with an issue, and the next tier answers. The default always passes (registry test).
import type { SettingSource, SettingSpec } from './define';

/** A value row as the backend holds it. `undefined` = no row at that tier. */
export interface StoredValue {
  value: unknown;
  version: number;
}

export interface ResolveIssue {
  tier: 'store' | 'installation';
  message: string;
}

export interface Resolved<T> {
  key: string;
  value: T;
  source: SettingSource;
  /** Version of the row that answered (0 for the default); a save names it for the optimistic lock. */
  version: number;
  issues: ResolveIssue[];
}

export function resolveValue<S extends SettingSpec>(
  key: string,
  spec: S,
  tiers: { store?: StoredValue; installation?: StoredValue },
): Resolved<S['default']> {
  const issues: ResolveIssue[] = [];
  const attempt = (tier: 'store' | 'installation', row: StoredValue | undefined) => {
    if (!row) return undefined;
    const parsed = spec.schema.safeParse(row.value);
    if (parsed.success) return { value: parsed.data as S['default'], version: row.version };
    issues.push({ tier, message: parsed.error.issues.map((i) => i.message).join('; ') });
    return undefined;
  };

  if (spec.scope === 'store') {
    const hit = attempt('store', tiers.store);
    if (hit) return { key, value: hit.value, source: 'store', version: hit.version, issues };
  } else if (tiers.store) {
    issues.push({ tier: 'store', message: 'installation-only setting: store value ignored' });
  }
  const inst = attempt('installation', tiers.installation);
  if (inst) return { key, value: inst.value, source: 'installation', version: inst.version, issues };
  return { key, value: spec.default as S['default'], source: 'default', version: 0, issues };
}

// The read-only admin list: every setting with its effective value and where the value came from. The values of the
// owner's own data (PR 509) and of anything pointing into the vault (SECRET_REF, PR 493) are never included — not the
// effective value, not the default — only the fact that a value is set.
import type { RegistryShape, SettingSource, SettingValueTypeName } from './define';
import { lookup, type LabelPair, type SettingsMessages } from './messages';
import type { SettingsResolver } from './resolver';

export interface AdminSettingRow {
  key: string;
  group: string;
  scope: 'installation' | 'store';
  valueType: SettingValueTypeName;
  label: LabelPair;
  help: LabelPair | null;
  source: SettingSource;
  isOwnerData: boolean;
  /** true when `value` and `default` are withheld (owner data or a vault reference). */
  redacted: boolean;
  value?: unknown;
  default?: unknown;
  /** Stored values that no longer pass the schema and were skipped. */
  issues: string[];
}

export function isRedacted(spec: { isOwnerData: boolean; valueType: SettingValueTypeName }): boolean {
  return spec.isOwnerData || spec.valueType === 'SECRET_REF';
}

export async function listSettingsForAdmin<R extends RegistryShape>(
  resolver: SettingsResolver<R>,
  messages: SettingsMessages,
  opts: { storeId?: number } = {},
): Promise<AdminSettingRow[]> {
  const resolved = await resolver.all(opts);
  const text = (k: string | undefined): LabelPair | null =>
    k ? { en: lookup(messages.en, k) ?? k, bn: lookup(messages.bn, k) ?? k } : null;
  return resolved.map((r) => {
    const spec = resolver.registry[r.key]!;
    const redacted = isRedacted(spec);
    const row: AdminSettingRow = {
      key: r.key,
      group: spec.group,
      scope: spec.scope,
      valueType: spec.valueType,
      label: text(spec.labelKey)!,
      help: text(spec.helpKey),
      source: r.source,
      isOwnerData: spec.isOwnerData,
      redacted,
      issues: r.issues.map((i) => `${i.tier}: ${i.message}`),
    };
    if (!redacted) {
      row.value = r.value;
      row.default = spec.default;
    }
    return row;
  });
}

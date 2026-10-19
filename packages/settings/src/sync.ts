// PR 496 — the settings migration. Makes the SettingDefinition rows match the code registry, on every deploy, before
// the new version starts (infra/deploy/deploy.sh → the `migrate` image → `sync`):
// - a new key gets its definition row with its default (and a MIGRATION_ADDED entry in the change log);
// - a changed definition gets its metadata updated (group, type, scope, default, constraints, labels, flags, order);
// - a key that left the registry is marked retired (deprecatedAt) — never deleted, and its values stay;
// - values (InstallationSettingValue, StoreSettingValue) are never written, overwritten or removed here;
// - the registry version is recorded once in SettingsMigration and on the Installation row.
// Running it again changes nothing (idempotent). Two syncs never interleave (advisory lock). An installation already
// at a newer registry version (a rollback to older code) is left exactly as it is.
import { z } from 'zod';
import type { PrismaClient } from '@extas/db/client';
import { canonicalJson } from './backend';
import { registryVersion, type RegistryShape, type SettingSpec } from './define';
import { pair, type SettingsMessages } from './messages';
import { jsonOrDbNull, jsonValue } from './prisma-backend';

export interface SyncOptions {
  registry: RegistryShape;
  messages: SettingsMessages;
  /** Release that ran the sync (the image's GIT_SHA), kept on the Installation row. */
  appVersion?: string | null;
  now?: () => Date;
}

export interface SyncReport {
  status: 'applied' | 'unchanged' | 'skipped-installation-ahead';
  registryVersion: number;
  /** Installation.settingsVersion before this run (0 for a fresh database). */
  installationVersionBefore: number;
  added: string[];
  changed: string[];
  retired: string[];
  /** Keys that were retired and are back in the registry. */
  restored: string[];
  ownerData: { added: string[]; archived: string[]; restored: string[] };
  /** A SettingsMigration row was written for this registry version. */
  recorded: boolean;
  warnings: string[];
}

/** The SettingDefinition columns the registry decides (everything except key, sinceVersion and the timestamps). */
export function definitionColumns(key: string, spec: SettingSpec, messages: SettingsMessages) {
  const label = pair(messages, spec.labelKey);
  const help = spec.helpKey ? pair(messages, spec.helpKey) : null;
  return {
    group: spec.group,
    valueType: spec.valueType,
    scope: spec.scope === 'installation' ? ('INSTALLATION' as const) : ('INHERITED' as const),
    defaultValue: spec.default as unknown,
    // The value schema as JSON Schema: min, max, options, pattern — what the admin form needs (B7.2 #2).
    constraints: constraintsOf(key, spec) as unknown,
    labelEn: label.en,
    labelBn: label.bn,
    helpEn: help?.en ?? null,
    helpBn: help?.bn ?? null,
    isOwnerData: spec.isOwnerData,
    isPublic: spec.isPublic ?? false,
    requiresOwnerOk: spec.requiresOwnerOk ?? false,
    sortOrder: spec.sortOrder ?? 0,
  };
}

export function constraintsOf(key: string, spec: SettingSpec): Record<string, unknown> {
  try {
    return z.toJSONSchema(spec.schema, { unrepresentable: 'any' }) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`setting ${key}: its schema cannot be described as JSON Schema (${String(error)})`);
  }
}

type Columns = ReturnType<typeof definitionColumns>;
const JSON_COLUMNS = new Set<keyof Columns>(['defaultValue', 'constraints']);

/** The columns of a stored row that differ from what the registry wants. */
export function changedColumns(row: Record<string, unknown>, want: Columns): (keyof Columns)[] {
  return (Object.keys(want) as (keyof Columns)[]).filter((col) =>
    JSON_COLUMNS.has(col) ? canonicalJson(row[col] ?? null) !== canonicalJson(want[col] ?? null) : row[col] !== want[col],
  );
}

const SYNC_LOCK = 'SELECT pg_advisory_xact_lock(4910496)::text AS locked'; // 491 + 0496: this job's own lock id

export async function syncSettings(prisma: PrismaClient, opts: SyncOptions): Promise<SyncReport> {
  const now = opts.now ?? (() => new Date());
  const version = registryVersion(opts.registry);
  const keys = Object.keys(opts.registry).sort();
  // Labels and schemas are checked before anything is written, so a bad registry never half-applies.
  const wanted = new Map(keys.map((k) => [k, definitionColumns(k, opts.registry[k]!, opts.messages)]));
  const ownerReason = pair(opts.messages, 'ownerData.settingReason');

  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRawUnsafe(SYNC_LOCK);
      const report: SyncReport = {
        status: 'unchanged',
        registryVersion: version,
        installationVersionBefore: 0,
        added: [],
        changed: [],
        retired: [],
        restored: [],
        ownerData: { added: [], archived: [], restored: [] },
        recorded: false,
        warnings: [],
      };

      const installation = await tx.installation.findFirst({ orderBy: { createdAt: 'asc' } });
      report.installationVersionBefore = installation?.settingsVersion ?? 0;
      if (installation && installation.settingsVersion > version) {
        report.status = 'skipped-installation-ahead';
        report.warnings.push(
          `installation is at settings v${installation.settingsVersion}, this code has v${version}: nothing changed`,
        );
        return report;
      }

      const rows = await tx.settingDefinition.findMany();
      const byKey = new Map(rows.map((r) => [r.key, r]));
      const at = now();

      for (const key of keys) {
        const spec = opts.registry[key]!;
        const want = wanted.get(key)!;
        const row = byKey.get(key);
        const data = {
          ...want,
          defaultValue: jsonOrDbNull(want.defaultValue, want.defaultValue !== null),
          constraints: jsonValue(want.constraints),
        };
        if (!row) {
          await tx.settingDefinition.create({ data: { key, ...data, sinceVersion: spec.since ?? spec.version } });
          await tx.settingChange.create({
            data: {
              storeId: null,
              key,
              action: 'MIGRATION_ADDED',
              oldValue: jsonOrDbNull(null, false),
              newValue: jsonValue(want.defaultValue),
              reason: `settings v${version}`,
            },
          });
          report.added.push(key);
          continue;
        }
        const diff = changedColumns(row as unknown as Record<string, unknown>, want);
        const wasRetired = row.deprecatedAt !== null;
        if (diff.length === 0 && !wasRetired) continue;
        await tx.settingDefinition.update({
          where: { key },
          data: { ...data, ...(wasRetired ? { deprecatedAt: null } : {}) },
        });
        if (wasRetired) report.restored.push(key);
        if (diff.length > 0) report.changed.push(key);
      }

      for (const row of rows) {
        if (wanted.has(row.key) || row.deprecatedAt !== null) continue;
        await tx.settingDefinition.update({ where: { key: row.key }, data: { deprecatedAt: at } });
        report.retired.push(row.key);
      }

      // PR 509 register: every owner-data setting is listed as a SETTING_KEY entry (archived, never deleted, when a
      // key stops being owner data).
      const entries = await tx.ownerDataEntry.findMany({ where: { kind: 'SETTING_KEY' } });
      const entryByKey = new Map(entries.map((e) => [e.target, e]));
      for (const key of keys) {
        const entry = entryByKey.get(key);
        if (opts.registry[key]!.isOwnerData) {
          if (!entry) {
            await tx.ownerDataEntry.create({
              data: { kind: 'SETTING_KEY', target: key, reasonEn: ownerReason.en, reasonBn: ownerReason.bn },
            });
            report.ownerData.added.push(key);
          } else if (entry.archivedAt) {
            await tx.ownerDataEntry.update({ where: { id: entry.id }, data: { archivedAt: null } });
            report.ownerData.restored.push(key);
          }
        } else if (entry && !entry.archivedAt) {
          await tx.ownerDataEntry.update({ where: { id: entry.id }, data: { archivedAt: at } });
          report.ownerData.archived.push(key);
        }
      }

      const changedAny =
        report.added.length + report.changed.length + report.retired.length + report.restored.length > 0;
      const recordedBefore = await tx.settingsMigration.findUnique({ where: { version } });
      if (!recordedBefore) {
        await tx.settingsMigration.create({
          data: {
            version,
            name: migrationName(version, report),
            addedKeys: report.added,
            changedKeys: [...report.changed, ...report.restored, ...report.retired],
          },
        });
        report.recorded = true;
      } else if (changedAny) {
        report.warnings.push(
          `definitions changed but registry v${version} was already recorded — bump the changed settings' version`,
        );
      }

      const appVersion = opts.appVersion ?? null;
      if (!installation) {
        await tx.installation.create({ data: { settingsVersion: version, appVersion } });
      } else if (installation.settingsVersion !== version || (appVersion && installation.appVersion !== appVersion)) {
        await tx.installation.update({
          where: { id: installation.id },
          data: { settingsVersion: version, ...(appVersion ? { appVersion } : {}) },
        });
      }

      const ownerChanged =
        report.ownerData.added.length + report.ownerData.archived.length + report.ownerData.restored.length > 0;
      report.status = changedAny || ownerChanged || report.recorded ? 'applied' : 'unchanged';
      return report;
    },
    { maxWait: 30_000, timeout: 120_000 },
  );
}

function migrationName(version: number, r: SyncReport): string {
  const parts = [`settings v${version}`, `added ${r.added.length}`, `changed ${r.changed.length + r.restored.length}`];
  parts.push(r.retired.length ? `retired ${r.retired.length} (${r.retired.join(', ')})` : 'retired 0');
  return parts.join(' · ');
}

/** One line per fact, for the deploy log. Never contains a value, only keys and counts. */
export function describeSync(r: SyncReport): string[] {
  const lines = [
    `settings sync: ${r.status} · registry v${r.registryVersion} (installation was v${r.installationVersionBefore})`,
  ];
  const list = (label: string, ks: string[]) => ks.length && lines.push(`  ${label}: ${ks.join(', ')}`);
  list('added', r.added);
  list('changed', r.changed);
  list('restored', r.restored);
  list('retired', r.retired);
  list('owner-data register added', r.ownerData.added);
  list('owner-data register archived', r.ownerData.archived);
  list('owner-data register restored', r.ownerData.restored);
  if (r.recorded) lines.push(`  recorded SettingsMigration v${r.registryVersion}`);
  for (const w of r.warnings) lines.push(`  WARNING: ${w}`);
  return lines;
}

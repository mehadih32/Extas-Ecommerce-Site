// PR 509 — the installation export and the new-installation import: the path by which one installation's settings and
// structure reach another (a handover, a second shop) without a single value of the owner's.
//
// Export: reads only what EXPORT_READS allows — settings values, the stores' technical columns and the pack-form
// structure (garment types, categories, bands without their charge, templates). It leaves out every setting the
// register covers (owner data, owner decisions, vault references, keys this code does not know), and then checks the
// whole bundle against the owner's actual values read from this database and the owner-data patterns. One hit and the
// export is refused, naming where the value sits — never the value itself.
//
// Import: checks the bundle again, writes the settings through the resolver (validated, logged), and adds the structure
// to stores that already exist (a store's name is the new owner's own, typed in at setup; the import never creates a
// store). Like every pack, it only adds missing rows. Run the settings migration (sync) on the target first.
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Prisma, type PrismaClient } from '@extas/db/client';
import {
  INSTALLATION,
  isOwnerSetting,
  ownerDataRegister,
  prismaBackend,
  registry as builtInRegistry,
  registryVersion,
  SettingsError,
  SettingsResolver,
  storeTarget,
  type OwnerDataRegister,
  type RegistryShape,
} from '@extas/settings';
import { defaultDetectors, detect, strings, type Detector } from './detectors';
import type { Finding } from './owner-data-check';
import { applyPack, packFromStore, packSchema, type PackData, type PackReport } from './pack';

export const EXPORT_FORMAT = 'installation-export';
export const EXPORT_FORMAT_VERSION = 1;

export interface StoreExport {
  /**
   * `primary` for the mother store, `store-<n>` for the others. Never the store's own address: a slug is often the
   * shop's name, which is the owner's.
   */
  ref: string;
  defaultLocale: string;
  currency: string;
  timezone: string;
  /** Store-level setting values (owner data left out). */
  settings: Record<string, unknown>;
  pack: PackData;
}

export interface InstallationExport {
  format: typeof EXPORT_FORMAT;
  formatVersion: number;
  exportId: string;
  exportedAt: string;
  registryVersion: number;
  /** Installation-level setting values (owner data left out). */
  settings: Record<string, unknown>;
  stores: StoreExport[];
  /** What was left out, by name only. */
  omitted: {
    settingKeys: string[];
    unknownSettingKeys: string[];
    invalidSettingKeys: string[];
    tables: string[];
    columns: string[];
    media: string[];
  };
}

export class OwnerDataLeak extends Error {
  readonly findings: Finding[];
  constructor(findings: Finding[]) {
    super(`refused: ${findings.length} value(s) of the owner's would leave the installation (${findings.map((f) => f.where).join(', ')})`);
    this.name = 'OwnerDataLeak';
    this.findings = findings;
  }
}

/** Owner values shorter than this are not matched (a size "M" or a two-letter code would match everything). */
export const MIN_OWNER_VALUE_LENGTH = 4;

/**
 * The owner's actual values on this installation: every string inside an owner setting's value (both tiers) and in
 * every register column. Kept in memory only, for matching; never printed.
 */
export async function ownerValuesOf(
  tx: Prisma.TransactionClient,
  registry: RegistryShape = builtInRegistry,
  register: OwnerDataRegister = ownerDataRegister,
): Promise<string[]> {
  const values = new Set<string>();
  const keep = (v: unknown) => {
    for (const s of strings(v)) if (!s.path.endsWith('(key)') && s.text.trim().length >= MIN_OWNER_VALUE_LENGTH) values.add(s.text.trim());
  };
  const rows = [
    ...(await tx.installationSettingValue.findMany({ select: { key: true, value: true } })),
    ...(await tx.storeSettingValue.findMany({ select: { key: true, value: true } })),
  ];
  for (const r of rows) if (isOwnerSetting(r.key, registry, register)) keep(r.value);
  const delegates = tx as unknown as Record<string, { findMany(args: unknown): Promise<Record<string, unknown>[]> }>;
  for (const c of register.columns) {
    const [model, field] = c.target.split('.') as [string, string];
    const delegate = delegates[model.charAt(0).toLowerCase() + model.slice(1)];
    if (!delegate) throw new Error(`register column ${c.target}: no such model in the client`);
    for (const row of await delegate.findMany({ select: { [field]: true } })) keep(row[field]);
  }
  return [...values];
}

/** Where in a bundle a value of the owner's sits (paths only). */
export function findOwnerData(bundle: unknown, opts: { ownerValues?: string[]; detectors?: Detector[] } = {}): Finding[] {
  const detectors = opts.detectors ?? defaultDetectors();
  const owner = (opts.ownerValues ?? []).map((v) => v.toLowerCase());
  const findings: Finding[] = [];
  for (const s of strings(bundle)) {
    const hit = detect(s.text, detectors);
    if (hit) findings.push({ rule: `export-${hit.id}`, where: s.path, message: `carries ${hit.what}` });
    const lower = s.text.toLowerCase();
    if (owner.some((v) => lower.includes(v))) {
      findings.push({ rule: 'export-owner-value', where: s.path, message: "carries a value of the owner's own data" });
    }
  }
  return findings;
}

export interface ExportOptions {
  registry?: RegistryShape;
  register?: OwnerDataRegister;
  detectors?: Detector[];
  now?: () => Date;
}

export async function exportInstallation(prisma: PrismaClient, opts: ExportOptions = {}): Promise<InstallationExport> {
  const registry: RegistryShape = opts.registry ?? builtInRegistry;
  const register = opts.register ?? ownerDataRegister;
  const now = opts.now ?? (() => new Date());
  return prisma.$transaction(
    async (tx) => {
      const omittedKeys = new Set<string>();
      const unknownKeys = new Set<string>();
      const invalidKeys = new Set<string>();
      const take = (key: string, value: unknown): boolean => {
        if (!Object.prototype.hasOwnProperty.call(registry, key)) {
          unknownKeys.add(key);
          return false;
        }
        if (isOwnerSetting(key, registry, register)) {
          omittedKeys.add(key);
          return false;
        }
        if (!registry[key]!.schema.safeParse(value).success) {
          invalidKeys.add(key);
          return false;
        }
        return true;
      };

      const settings: Record<string, unknown> = {};
      const installationRows = await tx.installationSettingValue.findMany({ select: { key: true, value: true }, orderBy: { key: 'asc' } });
      for (const r of installationRows) if (take(r.key, r.value)) settings[r.key] = r.value;

      const storeRows = await tx.storeSettingValue.findMany({ select: { storeId: true, key: true, value: true }, orderBy: { key: 'asc' } });
      const stores = await tx.store.findMany({
        where: { archivedAt: null },
        select: { id: true, isPrimary: true, defaultLocale: true, currency: true, timezone: true },
        orderBy: { id: 'asc' },
      });
      const storeExports: StoreExport[] = [];
      for (const s of stores) {
        const values: Record<string, unknown> = {};
        for (const r of storeRows) if (r.storeId === s.id && take(r.key, r.value)) values[r.key] = r.value;
        storeExports.push({
          ref: s.isPrimary ? 'primary' : `store-${storeExports.filter((e) => e.ref !== 'primary').length + 1}`,
          defaultLocale: s.defaultLocale,
          currency: s.currency,
          timezone: s.timezone,
          settings: values,
          pack: await packFromStore(tx, s.id, 'export', 1),
        });
      }

      const bundle: InstallationExport = {
        format: EXPORT_FORMAT,
        formatVersion: EXPORT_FORMAT_VERSION,
        exportId: randomUUID(),
        exportedAt: now().toISOString(),
        registryVersion: registryVersion(registry),
        settings,
        stores: storeExports,
        omitted: {
          settingKeys: [...omittedKeys].sort(),
          unknownSettingKeys: [...unknownKeys].sort(),
          invalidSettingKeys: [...invalidKeys].sort(),
          tables: register.tables.map((t) => t.target),
          columns: register.columns.map((c) => c.target),
          media: register.media.map((m) => m.target),
        },
      };
      const findings = findOwnerData(bundle, { ownerValues: await ownerValuesOf(tx, registry, register), detectors: opts.detectors });
      if (findings.length) throw new OwnerDataLeak(findings);
      return bundle;
    },
    { maxWait: 30_000, timeout: 120_000, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

const bundleSchema = z
  .object({
    format: z.literal(EXPORT_FORMAT),
    formatVersion: z.literal(EXPORT_FORMAT_VERSION),
    exportId: z.uuid(),
    exportedAt: z.string(),
    registryVersion: z.int(),
    settings: z.record(z.string(), z.unknown()),
    stores: z.array(
      z.object({
        ref: z.string().regex(/^(primary|store-\d+)$/),
        defaultLocale: z.string(),
        currency: z.string(),
        timezone: z.string(),
        settings: z.record(z.string(), z.unknown()),
        pack: packSchema,
      }),
    ),
    omitted: z.object({}).passthrough(),
  })
  .passthrough();

export interface ImportReport {
  settings: { written: string[]; unchanged: string[]; skippedOwner: string[]; skippedUnknown: string[]; rejected: string[] };
  stores: { ref: string; storeId: number; settingsWritten: number; pack: PackReport }[];
  storesSkipped: string[];
}

export interface ImportOptions {
  registry?: RegistryShape;
  register?: OwnerDataRegister;
  detectors?: Detector[];
  /** Store ref in the bundle (`primary`, `store-2` …) → store id here. Default: `primary` → this mother store. */
  storeMap?: Record<string, number>;
  actorId?: string | null;
}

export async function importInstallation(prisma: PrismaClient, data: unknown, opts: ImportOptions = {}): Promise<ImportReport> {
  const registry: RegistryShape = opts.registry ?? builtInRegistry;
  const register = opts.register ?? ownerDataRegister;
  const parsed = bundleSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`not an installation export: ${parsed.error.issues.map((i) => `${i.path.join('.') || '(bundle)'}: ${i.message}`).join('; ')}`);
  }
  const bundle = parsed.data;
  const findings = findOwnerData(bundle, { detectors: opts.detectors });
  if (findings.length) throw new OwnerDataLeak(findings);

  const resolver = new SettingsResolver(prismaBackend(prisma), registry, { checkIntervalMs: 0 });
  const report: ImportReport = {
    settings: { written: [], unchanged: [], skippedOwner: [], skippedUnknown: [], rejected: [] },
    stores: [],
    storesSkipped: [],
  };
  const reason = `imported from installation export ${bundle.exportId}`;
  const write = async (key: string, value: unknown, storeId?: number): Promise<boolean> => {
    const label = storeId === undefined ? key : `${key}@store${storeId}`;
    if (!Object.prototype.hasOwnProperty.call(registry, key)) {
      report.settings.skippedUnknown.push(label);
      return false;
    }
    if (isOwnerSetting(key, registry, register)) {
      report.settings.skippedOwner.push(label);
      return false;
    }
    if (storeId !== undefined && registry[key]!.scope === 'installation') {
      report.settings.rejected.push(label);
      return false;
    }
    try {
      const r = await resolver.set(key, value as never, storeId === undefined ? INSTALLATION : storeTarget(storeId), {
        actorId: opts.actorId ?? null,
        reason,
      });
      (r.changed ? report.settings.written : report.settings.unchanged).push(label);
      return r.changed;
    } catch (error) {
      if (error instanceof SettingsError) {
        report.settings.rejected.push(label);
        return false;
      }
      throw error;
    }
  };

  for (const [key, value] of Object.entries(bundle.settings)) await write(key, value);

  for (const s of bundle.stores) {
    const storeId =
      opts.storeMap?.[s.ref] ??
      (s.ref === 'primary' ? (await prisma.store.findFirst({ where: { isPrimary: true }, select: { id: true } }))?.id : undefined);
    if (storeId === undefined) {
      report.storesSkipped.push(s.ref);
      continue;
    }
    let settingsWritten = 0;
    for (const [key, value] of Object.entries(s.settings)) if (await write(key, value, storeId)) settingsWritten++;
    const pack = await applyPack(prisma, { ...s.pack, key: `import-${bundle.exportId.slice(0, 8)}` }, { storeId, actorId: opts.actorId });
    report.stores.push({ ref: s.ref, storeId, settingsWritten, pack });
  }
  return report;
}

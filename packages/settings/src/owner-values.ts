// The owner's own values (PR 509 owner data) put into the live store on the server, never into Git (CN-009): the
// owner gives an answer in chat, the store-settings workflow on the VM passes it in as a file, and this writes each
// value through the resolver, so it is validated, logged in SettingChange with the reason, and needs the owner's OK
// flag for settings marked `requiresOwnerOk`. The report names keys and whether they changed, never a value.
import type { PrismaClient } from '@extas/db/client';
import { INSTALLATION, storeTarget, type RegistryShape } from './define';
import { SettingsError } from './errors';
import { prismaBackend } from './prisma-backend';
import { SettingsResolver } from './resolver';

export interface OwnerValuesFile {
  /** Why (shown in the change log), e.g. "CN-009 owner answer". */
  reason: string;
  /** The owner's written OK for these values (CLAUDE.md rule 6). */
  ownerApproved: boolean;
  values: Record<string, unknown>;
}

export interface OwnerValueLine {
  key: string;
  level: 'store' | 'installation';
  changed: boolean;
}

/** Reads and checks the file shape; every key must exist in the registry. */
export function parseOwnerValues<R extends RegistryShape>(text: string, registry: R): OwnerValuesFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SettingsError('INVALID_VALUE', '(file)', 'not valid JSON');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SettingsError('INVALID_VALUE', '(file)', 'expected an object');
  const { reason, ownerApproved, values } = raw as Record<string, unknown>;
  if (typeof reason !== 'string' || !reason.trim()) throw new SettingsError('INVALID_VALUE', '(file)', 'a reason is required');
  if (typeof ownerApproved !== 'boolean') throw new SettingsError('INVALID_VALUE', '(file)', 'ownerApproved must be true or false');
  if (!values || typeof values !== 'object' || Array.isArray(values) || !Object.keys(values).length) {
    throw new SettingsError('INVALID_VALUE', '(file)', 'values must name at least one setting');
  }
  for (const key of Object.keys(values)) {
    if (!(key in registry)) throw new SettingsError('UNKNOWN_KEY', key, 'not in the settings registry');
  }
  return { reason: reason.trim(), ownerApproved, values: values as Record<string, unknown> };
}

/**
 * Writes the values: store-scoped settings on the mother store (Store.isPrimary), installation-only settings at the
 * installation. All are checked before the first write, so a bad value changes nothing.
 */
export async function applyOwnerValues<R extends RegistryShape>(prisma: PrismaClient, registry: R, file: OwnerValuesFile): Promise<OwnerValueLine[]> {
  const store = await prisma.store.findFirst({ where: { isPrimary: true }, select: { id: true } });
  const target = (key: string) => (registry[key]!.scope === 'installation' ? INSTALLATION : store ? storeTarget(store.id) : null);
  for (const [key, value] of Object.entries(file.values)) {
    if (!target(key)) throw new SettingsError('UNKNOWN_STORE', key, 'there is no mother store yet');
    const spec = registry[key]!;
    if (spec.requiresOwnerOk && !file.ownerApproved) throw new SettingsError('OWNER_OK_REQUIRED', key, "needs the owner's written OK");
    if (!spec.schema.safeParse(value).success) throw new SettingsError('INVALID_VALUE', key, 'value rejected by the setting schema');
  }
  const resolver = new SettingsResolver(prismaBackend(prisma), registry);
  const lines: OwnerValueLine[] = [];
  for (const [key, value] of Object.entries(file.values)) {
    const t = target(key)!;
    const r = await resolver.set(key as never, value as never, t, { reason: file.reason, ownerApproved: file.ownerApproved });
    lines.push({ key, level: t.level, changed: r.changed });
  }
  return lines;
}

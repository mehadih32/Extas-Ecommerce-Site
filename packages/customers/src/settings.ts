// PR 288 onwards — Customers › More options › Customer settings (/admin/customers/settings): the CRM features' switches
// and numbers in their own section (ADMIN-ARCHITECTURE: settings inside their section, rare options under "More
// options"). Each card is one setting of the `customers` group from the CRM registry (registry-crm.ts, v190–199); every
// feature is off as shipped. Reading needs `customers.read`; saving needs `customers.settings`, checked through the
// setting's own schema (a bad value saves nothing) and audited with the value before and after.
import { audit, requirePermission } from '@extas/auth';
import { registry, type Key, type Value } from '@extas/settings';
import { z } from 'zod';
import { allow, parse, setting, type CustomersDeps, type Who } from './context';
import { CustomersError } from './errors';

/** The settings the Customer settings page edits, in its order (later CRM PRs add theirs). */
export const CRM_PAGE_SETTINGS = ['customers.journey', 'customers.aiWriter'] as const satisfies readonly Key[];
export type CrmPageSetting = (typeof CRM_PAGE_SETTINGS)[number];

export interface CrmSettingsScreen {
  values: { [K in CrmPageSetting]: Value<K> };
  canWrite: boolean;
}

/** Every card's current value. */
export async function crmSettingsScreen(deps: CustomersDeps, who: Who): Promise<CrmSettingsScreen> {
  const held = await requirePermission(deps.db, who.actor, 'customers.read', { storeId: who.storeId });
  await allow(deps, who, 'customers.read');
  const values = Object.fromEntries(await Promise.all(CRM_PAGE_SETTINGS.map(async (k) => [k, await setting(deps, who.storeId, k)] as const))) as CrmSettingsScreen['values'];
  return { values, canWrite: held.has('customers.settings') };
}

const saveInput = z.object({ key: z.enum(CRM_PAGE_SETTINGS), value: z.unknown() }).strict();

/** Saves one card (`customers.settings`); audited. */
export async function saveCrmSetting(deps: CustomersDeps, who: Who, input: unknown): Promise<CrmSettingsScreen> {
  await allow(deps, who, 'customers.settings');
  const d = parse(saveInput, input, 'setting');
  if (!deps.settings.set) throw new CustomersError('INVALID_INPUT', 'settings cannot be written here', ['settings']);
  const checked = registry[d.key].schema.safeParse(d.value);
  if (!checked.success) throw new CustomersError('INVALID_INPUT', `the ${d.key} setting is not valid`, checked.error.issues.map((i) => `${d.key}${i.path.length ? '.' + i.path.join('.') : ''}: ${i.message}`));
  const before = await setting(deps, who.storeId, d.key);
  if (JSON.stringify(before) !== JSON.stringify(d.value)) {
    try {
      await deps.settings.set(d.key, d.value as never, { level: 'store', storeId: who.storeId }, { actorId: who.actor.staffUserId ?? null, reason: 'Customers › Customer settings' });
    } catch (e) {
      throw new CustomersError('INVALID_INPUT', `the ${d.key} setting is not valid`, (e as { details?: string[] }).details ?? [d.key]);
    }
    await audit(deps.db, who.actor, { action: 'customer.settings.save', entityType: 'Setting', entityId: d.key, storeId: who.storeId, before, after: d.value }, who.ctx);
  }
  return crmSettingsScreen(deps, who);
}

// PR 407 (B2.1: "every word and block of the invoice is editable from the dashboard"; Note 4.4) — the settings cards of
// Orders › Packing & print › Invoices: what the invoice says (`account.invoice`: its parts, number pattern, the owner's
// note and footer, the download button — the same setting the customer's invoice page reads), how it prints
// (`documents.invoice.print`), its chat picture and issuing (`documents.invoice.image`, `documents.invoice.issue`, under
// "More options"). Read with `fulfilment.read`, saved one card at a time with `orders.invoiceSettings`, with the card's
// version (a save in between is STALE) and an audit row. Saving never moves money or changes a price, COD or an order:
// an invoice issued before keeps its number; a new pattern gives only the next invoices their numbers.
import { createHash } from 'node:crypto';
import { audit, requirePermission } from '@extas/auth';
import { accountInvoiceSchema, invoiceImageSchema, invoiceIssueSchema, invoicePrintSchema, registry, storeTarget, type Key, type Value } from '@extas/settings';
import { z } from 'zod';
import { checkStoreId, parse, setting, type OrdersDeps, type Who } from './context';
import { OrdersError } from './errors';
import type { SettingsWriter } from './rule-switches';

/** The keys the invoice page edits, each one card. */
export const INVOICE_SETTING_KEYS = ['account.invoice', 'documents.invoice.print', 'documents.invoice.image', 'documents.invoice.issue'] as const satisfies readonly Key[];
export type InvoiceSettingKey = (typeof INVOICE_SETTING_KEYS)[number];

const SCHEMAS = {
  'account.invoice': accountInvoiceSchema,
  'documents.invoice.print': invoicePrintSchema,
  'documents.invoice.image': invoiceImageSchema,
  'documents.invoice.issue': invoiceIssueSchema,
} as const satisfies Record<InvoiceSettingKey, z.ZodType>;

export interface InvoiceSettingCard<K extends InvoiceSettingKey = InvoiceSettingKey> {
  key: K;
  value: Value<K>;
  /** What a new installation ships with. */
  byDefault: Value<K>;
  version: string;
}

export type InvoiceSettingsView = { [K in InvoiceSettingKey]: InvoiceSettingCard<K> };

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

async function card<K extends InvoiceSettingKey>(deps: Pick<OrdersDeps, 'settings'>, storeId: number, key: K): Promise<InvoiceSettingCard<K>> {
  const value = await setting(deps, storeId, key);
  return { key, value, byDefault: registry[key].default as Value<K>, version: versionOf(value) };
}

async function viewOf(deps: Pick<OrdersDeps, 'settings'>, storeId: number): Promise<InvoiceSettingsView> {
  const [a, b, c, d] = await Promise.all([card(deps, storeId, 'account.invoice'), card(deps, storeId, 'documents.invoice.print'), card(deps, storeId, 'documents.invoice.image'), card(deps, storeId, 'documents.invoice.issue')]);
  return { 'account.invoice': a, 'documents.invoice.print': b, 'documents.invoice.image': c, 'documents.invoice.issue': d };
}

/** Every card's data (`fulfilment.read`). */
export async function invoiceSettings(deps: Pick<OrdersDeps, 'db' | 'settings'>, who: Who): Promise<InvoiceSettingsView> {
  checkStoreId(who.storeId);
  await requirePermission(deps.db, who.actor, 'fulfilment.read', { storeId: who.storeId });
  return viewOf(deps, who.storeId);
}

export const saveInvoiceSettingInput = z.object({ key: z.enum(INVOICE_SETTING_KEYS), value: z.unknown(), version: z.string().min(1).max(64).optional() }).strict();

/** Saves one card whole (`orders.invoiceSettings`); a stale version is refused with the fresh one. */
export async function saveInvoiceSetting(deps: Pick<OrdersDeps, 'db'> & { settings: OrdersDeps['settings'] & SettingsWriter }, who: Who, input: unknown): Promise<InvoiceSettingsView> {
  checkStoreId(who.storeId);
  await requirePermission(deps.db, who.actor, 'orders.invoiceSettings', { storeId: who.storeId });
  const d = parse(saveInvoiceSettingInput, input, 'invoice setting');
  const key = d.key;
  const value = parse(SCHEMAS[key], d.value, 'invoice setting') as Value<typeof key>;
  const before = await card(deps, who.storeId, key);
  if (d.version !== undefined && d.version !== before.version) throw new OrdersError('STALE', 'the invoice settings were changed by someone else; reload them', ['version'], { version: before.version });
  if (versionOf(value) === before.version) return viewOf(deps, who.storeId);
  try {
    await deps.settings.set(key, value, storeTarget(who.storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Packing & print › Invoices' });
  } catch (e) {
    const details = (e as { details?: string[] }).details ?? [];
    throw new OrdersError('INVALID_INPUT', 'the invoice settings could not be saved', details.length ? details : ['value']);
  }
  await audit(deps.db, who.actor, { storeId: who.storeId, action: 'orders.invoiceSettings.save', entityType: 'Setting', entityId: key, before: before.value, after: value }, { source: 'admin-api', ...who.ctx });
  return viewOf(deps, who.storeId);
}

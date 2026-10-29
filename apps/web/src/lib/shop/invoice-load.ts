// PR 136 — everything the invoice page and its file need, read once: the owner's invoice setting, the order (for its
// customer or the browser that placed it, or a staff member with `orders.invoice`), the shop's own details, and the
// sheet's view. Off (`account.invoice.enabled`): there is no invoice; not his order: the same log-in prompt as the
// order page, saying nothing about whose order it is.
// PR 407: the order's issued invoice (packages/orders issueInvoice — made now when the background run has not reached
// it yet) gives its kept number and, after an edit, its version. When the database is slow the page still shows the
// invoice with the number made from the pattern, never an error. The admin's printed copy (lib/admin-invoices) builds
// its view with the same invoiceViewFor, so the paper and the page always say the same.
import type { Receipt } from '@extas/checkout';
import type { Value } from '@extas/settings';
import { issueInvoice } from '@extas/orders';
import { settingsTimeoutMs, withTimeout } from '../settings';
import { checkoutDeps, checkoutWords, invoiceReceipt } from './checkout';
import { readPageSettings, type ShopContext } from './context';
import { dateText } from './account-view';
import { fill } from './dict';
import type { InvoiceView } from './invoice';
import { invoiceView } from './invoice-view';

const KEYS = ['account.invoice', 'contact.address', 'legal.registeredName', 'legal.bin', 'policy.exchange.summary'] as const;

export type InvoiceSettingsRead = { [P in (typeof KEYS)[number]]: Value<P> };

/** The settings the invoice reads beyond the shop's own (the invoice's parts and words, the shop's legal lines). */
export const readInvoiceSettings = (storeId: number): Promise<InvoiceSettingsRead> => readPageSettings(KEYS, storeId);

/** The issued invoice as the view needs it: its kept number, its version and when this version was made. */
export interface IssuedNumber {
  number: string;
  version: number;
  issuedAt: Date;
}

export type InvoiceLoad = { kind: 'off' } | { kind: 'prompt'; signedIn: boolean } | { kind: 'ok'; receipt: Receipt; view: InvoiceView; download: boolean };

/** The issued invoice of an order the caller may already read (made now when it has none yet), or null. */
export async function issuedInvoice(storeId: number, number: string): Promise<IssuedNumber | null> {
  const deps = checkoutDeps();
  if (!deps) return null;
  try {
    const r = await withTimeout(issueInvoice(deps, { storeId, number }), settingsTimeoutMs() * 4);
    return r ? { number: r.invoice.number, version: r.invoice.version, issuedAt: r.invoice.issuedAt } : null;
  } catch (e) {
    console.warn(`shop: the invoice could not be issued (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return null;
  }
}

/** The invoice's view of one order in the context's language, with its issued number and version when it has them. */
export function invoiceViewFor(c: ShopContext, receipt: Receipt, s: InvoiceSettingsRead, issued: IssuedNumber | null): InvoiceView {
  const words = checkoutWords(c);
  const w = (k: string) => fill(words[k] ?? k, {});
  // the payment method's name, as the order page and the thank-you page say it
  const methodName = (p: { method: string | null; provider: string | null }) =>
    p.method === 'COD' ? w('pay.cod') : p.method === 'ONLINE' || p.provider === 'online' ? w('pay.online') : p.provider && words[`pm.${p.provider}`] ? w(`pm.${p.provider}`) : (p.provider ?? p.method ?? '');
  return invoiceView(
    c,
    receipt,
    s['account.invoice'],
    { address: s['contact.address'], registeredName: s['legal.registeredName'], bin: s['legal.bin'], exchangeSummary: s['policy.exchange.summary'] },
    {
      date: dateText(c, receipt.placedAt, true),
      methodName,
      delivered: receipt.status === 'DELIVERED',
      issued: issued ? { number: issued.number, version: issued.version, revisedDate: issued.version > 1 ? dateText(c, issued.issuedAt.toISOString(), true) : null } : null,
    },
  );
}

export async function loadInvoice(c: ShopContext, number: string): Promise<InvoiceLoad> {
  const s = await readInvoiceSettings(c.storeId);
  const set = s['account.invoice'];
  if (!set.enabled) return { kind: 'off' };
  const { receipt, signedIn } = await invoiceReceipt(c, number);
  if (!receipt) return { kind: 'prompt', signedIn };
  const issued = await issuedInvoice(c.storeId, receipt.number);
  return { kind: 'ok', receipt, view: invoiceViewFor(c, receipt, s, issued), download: set.download };
}

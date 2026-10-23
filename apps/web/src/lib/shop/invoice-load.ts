// PR 136 — everything the invoice page and its file need, read once: the owner's invoice setting, the order (for its
// customer or the browser that placed it, or a staff member with `orders.invoice`), the shop's own details, and the
// sheet's view. Off (`account.invoice.enabled`): there is no invoice; not his order: the same log-in prompt as the
// order page, saying nothing about whose order it is.
import type { Receipt } from '@extas/checkout';
import { checkoutWords, invoiceReceipt } from './checkout';
import { readPageSettings, type ShopContext } from './context';
import { dateText } from './account-view';
import { fill } from './dict';
import type { InvoiceView } from './invoice';
import { invoiceView } from './invoice-view';

const KEYS = ['account.invoice', 'contact.address', 'legal.registeredName', 'legal.bin', 'policy.exchange.summary'] as const;

export type InvoiceLoad = { kind: 'off' } | { kind: 'prompt'; signedIn: boolean } | { kind: 'ok'; receipt: Receipt; view: InvoiceView; download: boolean };

export async function loadInvoice(c: ShopContext, number: string): Promise<InvoiceLoad> {
  const s = await readPageSettings(KEYS, c.storeId);
  const set = s['account.invoice'];
  if (!set.enabled) return { kind: 'off' };
  const { receipt, signedIn } = await invoiceReceipt(c, number);
  if (!receipt) return { kind: 'prompt', signedIn };
  const words = checkoutWords(c);
  const w = (k: string) => fill(words[k] ?? k, {});
  // the payment method's name, as the order page and the thank-you page say it
  const methodName = (p: { method: string | null; provider: string | null }) =>
    p.method === 'COD' ? w('pay.cod') : p.method === 'ONLINE' || p.provider === 'online' ? w('pay.online') : p.provider && words[`pm.${p.provider}`] ? w(`pm.${p.provider}`) : (p.provider ?? p.method ?? '');
  const view = invoiceView(
    c,
    receipt,
    set,
    { address: s['contact.address'], registeredName: s['legal.registeredName'], bin: s['legal.bin'], exchangeSummary: s['policy.exchange.summary'] },
    { date: dateText(c, receipt.placedAt, true), methodName, delivered: receipt.status === 'DELIVERED' },
  );
  return { kind: 'ok', receipt, view, download: set.download };
}

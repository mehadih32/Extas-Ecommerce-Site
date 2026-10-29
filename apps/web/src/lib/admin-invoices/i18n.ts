// S20 · PR 407 — the words of Orders › Packing & print › Invoices: messages/admin-invoice.<lang>.json, everything under
// `inv.*`, merged into the page's dictionary with the packing pages' own `ful.*` words (the print button's refusals).
import type { AdminView } from '@/lib/admin-page';
import { mergeDicts } from '@/lib/admin-i18n';
import { withFulfil } from '@/lib/admin-fulfil/i18n';
import type { Dict } from '@/lib/i18n';
import bn from '../../../messages/admin-invoice.bn.json';
import en from '../../../messages/admin-invoice.en.json';

export const invoiceDicts: Record<'bn' | 'en', Dict> = { bn: bn as Dict, en: en as Dict };

/** The admin view with the `inv.*` and `ful.*` words of its language. */
export function withInvoice(view: AdminView): AdminView {
  const v = withFulfil(view);
  return { ...v, dict: mergeDicts(v.dict, invoiceDicts[v.lang]) };
}

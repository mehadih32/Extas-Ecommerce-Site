// S14 · PR 284 — the words of the Customers pages: messages/admin-customers.<lang>.json, everything under `cus.*`,
// merged into the page's dictionary here (like the courier and fulfilment pages do with their own file), so the shared
// admin dictionary is not touched for every screen.
import type { AdminView } from '@/lib/admin-page';
import { mergeDicts } from '@/lib/admin-i18n';
import type { Dict } from '@/lib/i18n';
import bn from '../../../messages/admin-customers.bn.json';
import en from '../../../messages/admin-customers.en.json';

export const customerDicts: Record<'bn' | 'en', Dict> = { bn: bn as Dict, en: en as Dict };

/** The admin view with the `cus.*` words of its language. */
export function withCustomers(view: AdminView): AdminView {
  return { ...view, dict: mergeDicts(view.dict, customerDicts[view.lang]) };
}

export { cusError } from './words';

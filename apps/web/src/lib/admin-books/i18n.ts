// CN-028 · PR 615, 616 — the words of the Money → Books pages: messages/admin-books.<lang>.json, everything under `bk.*`,
// merged into the page's dictionary here (like the customers and courier pages do with their own file), so the shared
// admin dictionary is not touched for every screen.
import type { AdminView } from '@/lib/admin-page';
import { mergeDicts } from '@/lib/admin-i18n';
import type { Dict } from '@/lib/i18n';
import bn from '../../../messages/admin-books.bn.json';
import en from '../../../messages/admin-books.en.json';

export const booksDicts: Record<'bn' | 'en', Dict> = { bn: bn as Dict, en: en as Dict };

/** The admin view with the `bk.*` words of its language. */
export function withBooks(view: AdminView): AdminView {
  return { ...view, dict: mergeDicts(view.dict, booksDicts[view.lang]) };
}

export { bkError } from './words';

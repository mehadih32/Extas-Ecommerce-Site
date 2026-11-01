// S14 · PR 295 — the words of Products › Reviews: messages/admin-reviews.<lang>.json, everything under `rev.*`, merged
// into the page's dictionary here (like the Customers pages do with theirs), so the shared admin dictionary is not
// touched for this screen.
import type { AdminView } from '@/lib/admin-page';
import { mergeDicts } from '@/lib/admin-i18n';
import type { Dict } from '@/lib/i18n';
import bn from '../../../messages/admin-reviews.bn.json';
import en from '../../../messages/admin-reviews.en.json';

export const reviewDicts: Record<'bn' | 'en', Dict> = { bn: bn as Dict, en: en as Dict };

/** The admin view with the `rev.*` words of its language. */
export function withReviews(view: AdminView): AdminView {
  return { ...view, dict: mergeDicts(view.dict, reviewDicts[view.lang]) };
}

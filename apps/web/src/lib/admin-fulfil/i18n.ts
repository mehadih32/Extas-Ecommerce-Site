// S08 · PR 554, 179–181 — the words of the courier and fulfilment pages (Delivery → Couriers; Orders → Packing & print):
// messages/admin-fulfil.<lang>.json, everything under `ful.*`, merged into the page's dictionary here (like the delivery
// zones page does with its own file), so the shared admin dictionary is not touched for every screen.
import type { AdminView } from '@/lib/admin-page';
import { mergeDicts } from '@/lib/admin-i18n';
import type { Dict } from '@/lib/i18n';
import bn from '../../../messages/admin-fulfil.bn.json';
import en from '../../../messages/admin-fulfil.en.json';

export const fulfilDicts: Record<'bn' | 'en', Dict> = { bn: bn as Dict, en: en as Dict };

/** The admin view with the `ful.*` words of its language. */
export function withFulfil(view: AdminView): AdminView {
  return { ...view, dict: mergeDicts(view.dict, fulfilDicts[view.lang]) };
}

export { fulError } from './words';

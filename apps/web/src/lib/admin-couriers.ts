// S28 · PR 670 (CN-048) — the words of the Couriers section (Courier 360, the overview, the claims and payouts pages and
// the courier messages): messages/admin-couriers.<lang>.json (`cr.*`), added to the admin view's dictionary.
import type { AdminView } from './admin-page';
import type { Dict } from './i18n';
import bn from '../../messages/admin-couriers.bn.json';
import en from '../../messages/admin-couriers.en.json';

export function withCouriers<V extends AdminView>(view: V): V {
  return { ...view, dict: { ...view.dict, cr: (view.lang === 'bn' ? bn : en).cr as unknown as Dict } };
}

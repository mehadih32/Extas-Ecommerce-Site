// S08 · PR 192 — the words of Reports › Delivery & RTO, a courier's claims and Support › Rider issues
// (messages/admin-courier-report.<lang>.json, `courierReport.*`), added to the admin view's dictionary.
import type { AdminView } from './admin-page';
import type { Dict } from './i18n';
import bn from '../../messages/admin-courier-report.bn.json';
import en from '../../messages/admin-courier-report.en.json';

export function withCourierReport<V extends AdminView>(view: V): V {
  return { ...view, dict: { ...view.dict, courierReport: (view.lang === 'bn' ? bn : en).courierReport as unknown as Dict } };
}

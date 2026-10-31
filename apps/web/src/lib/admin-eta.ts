// S08 · PR 193 — the words of Marketing › Smart Rules › Eid dates and Delivery › Delivery settings
// (messages/admin-eta.<lang>.json, `eta.*`), added to the admin view's dictionary.
import type { AdminView } from './admin-page';
import type { Dict } from './i18n';
import bn from '../../messages/admin-eta.bn.json';
import en from '../../messages/admin-eta.en.json';

export function withEta<V extends AdminView>(view: V): V {
  return { ...view, dict: { ...view.dict, eta: (view.lang === 'bn' ? bn : en).eta as unknown as Dict } };
}

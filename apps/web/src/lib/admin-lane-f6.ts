// Parity round 3, lane F6 (PR 865-867) — the words the prototype v5 shows on Marketing › Ad campaigns (one campaign), Plan, Studio,
// the Shopping feed and Rules › More options that the older dictionaries do not have (messages/admin-lane-f6.<lang>.json, `lf6.*`),
// added to the admin view's dictionary.
import type { AdminView } from './admin-page';
import type { Dict } from './i18n';
import bn from '../../messages/admin-lane-f6.bn.json';
import en from '../../messages/admin-lane-f6.en.json';

export function withLaneF6<V extends AdminView>(view: V): V {
  return { ...view, dict: { ...view.dict, lf6: (view.lang === 'bn' ? bn : en).lf6 as unknown as Dict } };
}

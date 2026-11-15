// Parity round 3, lane F (PR 807-812) — the words the prototype v5 shows on the Marketing, Inbox, Finance, Rules and Offers
// pages that the older dictionaries do not have (messages/admin-lane-f.<lang>.json, `lf.*`), added to the admin view's dictionary.
import type { AdminView } from './admin-page';
import type { Dict } from './i18n';
import bn from '../../messages/admin-lane-f.bn.json';
import en from '../../messages/admin-lane-f.en.json';

export function withLaneF<V extends AdminView>(view: V): V {
  return { ...view, dict: { ...view.dict, lf: (view.lang === 'bn' ? bn : en).lf as unknown as Dict } };
}

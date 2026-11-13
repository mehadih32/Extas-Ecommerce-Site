// S28 · wave 5 (CN-048) — the words of the inbox and marketing screens of the admin prototype v5 (PR 692-699,
// messages/admin-v5-w5a.<lang>.json, `w5a.*`), added to the admin view's dictionary.
import type { AdminView } from './admin-page';
import type { Dict } from './i18n';
import bn from '../../messages/admin-v5-w5a.bn.json';
import en from '../../messages/admin-v5-w5a.en.json';

export function withW5a<V extends AdminView>(view: V): V {
  return { ...view, dict: { ...view.dict, w5a: (view.lang === 'bn' ? bn : en).w5a as unknown as Dict } };
}

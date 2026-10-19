// PR 500 — the admin's language (Bengali first, English beside it; demo 98a-admin-lang.js). The person's choice is a
// cookie set by the EN | বাং switch; without one, the store's language setting (`store.locale`, PR 492) decides.
// Every visible admin string comes from messages/admin.<lang>.json.
import bn from '../../messages/admin.bn.json';
import en from '../../messages/admin.en.json';
import type { Dict } from './i18n';

export type AdminLang = 'bn' | 'en';
export const ADMIN_LANGS: readonly AdminLang[] = ['bn', 'en'];
export { ADMIN_LANG_COOKIE } from './admin-nav';

export const adminDicts: Record<AdminLang, Dict> = { bn, en };

const isLang = (v: unknown): v is AdminLang => typeof v === 'string' && (ADMIN_LANGS as readonly string[]).includes(v);

/** The cookie's choice, else the language of the store's locale, else Bengali. */
export function pickAdminLang(cookie: string | undefined | null, storeLocale: string | undefined | null): AdminLang {
  if (isLang(cookie)) return cookie;
  const base = (storeLocale ?? '').toLowerCase().split('-')[0];
  return isLang(base) ? base : 'bn';
}

/** The locale dates are written in: the store's own when it is in the admin's language, else the bare language. */
export function adminLocale(lang: AdminLang, storeLocale: string | undefined | null): string {
  return storeLocale && storeLocale.toLowerCase().split('-')[0] === lang ? storeLocale : lang;
}

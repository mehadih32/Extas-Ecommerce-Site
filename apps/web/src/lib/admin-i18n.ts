// PR 500 — the admin's language (Bengali first, English beside it; demo 98a-admin-lang.js). The person's choice is a
// cookie set by the EN | বাং switch; without one, the store's language setting (`store.locale`, PR 492) decides.
// Every visible admin string comes from messages/admin.<lang>.json.
// The product screens (PR 21, 26, 29, 35) keep their own files (admin-products.<lang>.json), and the catalogue tools
// (PR 33 import from a link, 36 back in stock, 39 product audit) theirs (admin-tools.<lang>.json), and the stock pages
// (S09 · PR 202–207) theirs (admin-stock.<lang>.json, everything under `stock.*`), and Smart Rules with its notices
// (S10 · PR 208–219) theirs (admin-rules.<lang>.json, everything under `rules.*`), and the combo pages (S03) theirs
// (admin-combos.<lang>.json, everything under `combos.*` and their own error codes), and the Server page (PR 6) its
// own (admin-server.<lang>.json, everything under `server.*`), and the admin shell with the Dashboard and Help (PR 12,
// CN-022) theirs (admin-shell.<lang>.json: `shell.*`, `dash.*`, `help.*`), and the Orders section (S05 · PR 140, 141,
// 152, 154) theirs (admin-orders.<lang>.json, everything under `orders.*`), merged in here.
import bn from '../../messages/admin.bn.json';
import en from '../../messages/admin.en.json';
import productsBn from '../../messages/admin-products.bn.json';
import productsEn from '../../messages/admin-products.en.json';
import toolsBn from '../../messages/admin-tools.bn.json';
import toolsEn from '../../messages/admin-tools.en.json';
import stockBn from '../../messages/admin-stock.bn.json';
import stockEn from '../../messages/admin-stock.en.json';
import rulesBn from '../../messages/admin-rules.bn.json';
import rulesEn from '../../messages/admin-rules.en.json';
import combosBn from '../../messages/admin-combos.bn.json';
import combosEn from '../../messages/admin-combos.en.json';
import serverBn from '../../messages/admin-server.bn.json';
import serverEn from '../../messages/admin-server.en.json';
import shellBn from '../../messages/admin-shell.bn.json';
import shellEn from '../../messages/admin-shell.en.json';
import ordersBn from '../../messages/admin-orders.bn.json';
import ordersEn from '../../messages/admin-orders.en.json';
import type { Dict } from './i18n';

export type AdminLang = 'bn' | 'en';
export const ADMIN_LANGS: readonly AdminLang[] = ['bn', 'en'];
export { ADMIN_LANG_COOKIE } from './admin-nav';

/** Deep merge of message trees; a key in both is an error in the files (the test checks there is none). */
export function mergeDicts(a: Dict, b: Dict): Dict {
  const out: Dict = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const was = out[k];
    out[k] = typeof was === 'object' && typeof v === 'object' ? mergeDicts(was, v) : v;
  }
  return out;
}

export const adminDicts: Record<AdminLang, Dict> = {
  bn: mergeDicts(mergeDicts(mergeDicts(mergeDicts(mergeDicts(mergeDicts(mergeDicts(mergeDicts(bn, productsBn), toolsBn), stockBn), rulesBn), combosBn), serverBn), shellBn), ordersBn),
  en: mergeDicts(mergeDicts(mergeDicts(mergeDicts(mergeDicts(mergeDicts(mergeDicts(mergeDicts(en, productsEn), toolsEn), stockEn), rulesEn), combosEn), serverEn), shellEn), ordersEn),
};

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

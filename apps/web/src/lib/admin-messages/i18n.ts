// S14 · PR 291, 292, 298, 505 — the words of the Messages pages (Message log, Channels & limits, Opt-outs & consent,
// Templates, Order journey): messages/admin-messages.<lang>.json, everything under `msg.*`, merged into the page's
// dictionary here (like the fulfilment pages do), so the shared admin dictionary is not touched for every screen.
import type { AdminView } from '@/lib/admin-page';
import { mergeDicts } from '@/lib/admin-i18n';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../messages/admin-messages.bn.json';
import en from '../../../messages/admin-messages.en.json';

export const messagesDicts: Record<'bn' | 'en', Dict> = { bn: bn as Dict, en: en as Dict };

/** The admin view with the `msg.*` words of its language. */
export function withMessages(view: AdminView): AdminView {
  return { ...view, dict: mergeDicts(view.dict, messagesDicts[view.lang]) };
}

/** A label from a group of words (`msg.<group>.<code>`), or the code itself when there is none (a new code). */
export function label(dict: Dict, group: string, code: string | null | undefined): string {
  if (!code) return '';
  const key = `msg.${group}.${code}`;
  const text = t(dict, key);
  return text === key ? code : text;
}

/** A refusal of the API as words (`msg.err.<code>`, else the general one). */
export function msgError(dict: Dict, code: string | undefined, fields = ''): string {
  const key = `msg.err.${code ?? 'other'}`;
  const text = t(dict, key, { fields });
  return text === key ? t(dict, 'msg.err.other') : text;
}

/** Money in minor units (the store's currency, two decimals) as the page writes it: Western digits, ৳ 1,234.50. */
export function moneyText(minor: number, locale: string, currency: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol', numberingSystem: 'latn', minimumFractionDigits: minor % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(minor / 100);
  } catch {
    return String(minor / 100);
  }
}

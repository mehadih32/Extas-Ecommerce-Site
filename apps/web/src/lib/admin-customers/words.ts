// S14 · PR 284 — a refusal of the customers API as words of the Customers pages (`cus.err.<code>`), for the client parts
// too (no dictionary files imported here: the page passes its own).
import { t, type Dict } from '@/lib/i18n';

/** A refusal code from the API as words (`cus.err.<code>`, else the general one). */
export function cusError(dict: Dict, code: string | undefined, fields = ''): string {
  const key = `cus.err.${code ?? 'default'}`;
  const text = t(dict, key, { fields });
  return text === key ? t(dict, 'cus.err.default') : text;
}

/** PR 286 — a line of "Who looked at this customer" (`cus.profile.looks.action.<word>`): the logged action's own dot
 * cannot be a message key, so each action has its word here; an unknown one reads as an open. */
const LOOK_WORDS: Record<string, 'open' | 'copy' | 'call'> = { 'profile.open': 'open', 'phone.copy': 'copy', 'phone.call': 'call' };
export function lookWord(dict: Dict, action: string): string {
  return t(dict, `cus.profile.looks.action.${LOOK_WORDS[action] ?? 'open'}`);
}

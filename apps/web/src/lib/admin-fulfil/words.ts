// S08 · PR 554, 179–181 — a refusal of the admin API as words of the courier and fulfilment pages (`ful.err.<code>`),
// for the client parts too (no dictionary files imported here: the page passes its own).
import { t, type Dict } from '@/lib/i18n';

/** A refusal code from the API as words (`ful.err.<code>`, else the general one). */
export function fulError(dict: Dict, code: string | undefined, fields = ''): string {
  const key = `ful.err.${code ?? 'default'}`;
  const text = t(dict, key, { fields });
  return text === key ? t(dict, 'ful.err.default') : text;
}

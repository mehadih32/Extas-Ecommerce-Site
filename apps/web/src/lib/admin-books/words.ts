// CN-028 · PR 615, 616 — a refusal of the books API as words of the Money → Books pages (`bk.err.<code>`), for the client
// parts too (no dictionary files imported here: the page passes its own).
import { t, type Dict } from '@/lib/i18n';

/** A refusal code from the API as words (`bk.err.<code>`, else the general one). */
export function bkError(dict: Dict, code: string | undefined, fields = ''): string {
  const key = `bk.err.${code ?? 'default'}`;
  const text = t(dict, key, { fields });
  return text === key ? t(dict, 'bk.err.default') : text;
}

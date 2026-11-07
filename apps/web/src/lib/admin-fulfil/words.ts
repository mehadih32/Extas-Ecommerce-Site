// S08 · PR 554, 179–181 — a refusal of the admin API as words of the courier and fulfilment pages (`ful.err.<code>`),
// for the client parts too (no dictionary files imported here: the page passes its own).
import { t, type Dict } from '@/lib/i18n';

/**
 * Follow-up 465: the screen a refusal came from. The same code can mean another field on another screen — REASON_REQUIRED
 * is "say why these stickers are printed again" on the sticker screen and "a reason is needed for this step" on the
 * packing screen — so a screen's own words (`ful.err.<source>.<code>`) come first.
 */
export type FulSource = 'print' | 'pack';

/** A refusal code from the API as words (the screen's own `ful.err.<source>.<code>`, then `ful.err.<code>`, else the general one). */
export function fulError(dict: Dict, code: string | undefined, fields = '', source?: FulSource): string {
  if (source && code) {
    const own = `ful.err.${source}.${code}`;
    const text = t(dict, own, { fields });
    if (text !== own) return text;
  }
  const key = `ful.err.${code ?? 'default'}`;
  const text = t(dict, key, { fields });
  return text === key ? t(dict, 'ful.err.default') : text;
}

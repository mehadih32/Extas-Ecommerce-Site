// Follow-up 508 (PR 407, 425) — the words for a refused save that every settings card shares: no permission, the thing
// is not there any more, signed out. The admin layout hands them to the browser (ShellText, `shell.saveErr.*`), so a
// card whose page gave no words of its own for these codes still says what happened instead of "could not save".
import { t, type Dict } from '@/lib/i18n';

/** The shared key for an API's refusal code (both spellings the admin APIs use), or null for a code with no shared words. */
export function commonSaveKey(code: string): 'FORBIDDEN' | 'NOT_FOUND' | 'UNAUTHENTICATED' | null {
  const c = code.toUpperCase().replace(/-/g, '_');
  if (c === 'FORBIDDEN') return 'FORBIDDEN';
  if (c === 'NOT_FOUND') return 'NOT_FOUND';
  if (c === 'UNAUTHORIZED' || c === 'UNAUTHENTICATED') return 'UNAUTHENTICATED';
  return null;
}

/** The shared words for `code` from a dictionary holding `shell.saveErr`, or null. */
export function commonSaveError(dict: Dict, code: string): string | null {
  const k = commonSaveKey(code);
  if (!k) return null;
  const key = `shell.saveErr.${k}`;
  const s = t(dict, key);
  return s === key ? null : s;
}

// S09 · PR 202–207 — the stock pages' small text helpers, shared by the server pages and their buttons (no server
// imports here). Every word comes from messages/admin-stock.<lang>.json.
import { t, type Dict } from '@/lib/i18n';
import { formatNumber } from '../products/model';

export const STOCK_HOME = '/admin/stock';
export const COUNTS_HOME = '/admin/stock/counts';
export const MOVEMENTS_HOME = '/admin/stock/movements';
export const countHref = (id: string) => `${COUNTS_HOME}/${id}`;

/** A key part for a value with dots (`stock.pull` → `stock_pull`), since message keys are dotted paths. */
export const keyOf = (v: string) => v.replace(/\./g, '_');

/** A date and time in the admin's language and the store's time zone (Western digits, like every admin number). */
export function dateTime(iso: string, locale: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone, numberingSystem: 'latn' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** How long ago: minutes up to two hours, then the date and time itself. */
export function ago(dict: Dict, iso: string | null, now: Date, locale: string, timeZone: string): string {
  if (!iso) return t(dict, 'stock.time.never');
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return t(dict, 'stock.time.justNow');
  if (minutes <= 120) return t(dict, 'stock.time.minutesAgo', { n: minutes });
  return dateTime(iso, locale, timeZone);
}

/** A refusal from the stock API as text: `stock.errors.<code>`, else the admin's `errors.<code>`, else the server error. */
export function stockRefusal(dict: Dict, code: string | undefined, details: string[] = []): string {
  const c = code ?? 'server-error';
  const fields = details.join(', ');
  for (const key of [`stock.errors.${c}`, `errors.${c}`]) {
    const text = t(dict, key, { fields });
    if (text !== key) return text;
  }
  return t(dict, 'errors.server-error');
}

/** The first part of an error line (`CODE status: message (N tries)` → `CODE`), for its text in the messages. */
export function errorCodeOf(line: string | null): string | null {
  if (!line) return null;
  const m = /^([A-Z_]+)\b/.exec(line.trim());
  return m ? m[1]! : null;
}

/** A finished ERP check's summary (`ON_HAND_DIFFERS ×2 · MISSING_IN_ERP ×1`) in words; null when the line is not one. */
export function mismatchLine(dict: Dict, line: string | null, kinds: readonly string[], locale: string): string | null {
  if (!line) return null;
  const parts = line.split(/\s+·\s+/).map((p) => /^([A-Z_]+) ×(\d+)$/.exec(p.trim()));
  if (!parts.every((m) => m && kinds.includes(m[1]!))) return null;
  return parts.map((m) => t(dict, `stock.reconcile.kind.${m![1]}`, { n: formatNumber(Number(m![2]), locale) })).join(t(dict, 'stock.sep'));
}

/** A count's lines on screen: as scanned while counting; once compared with the ERP, the ones that differ first — or only them. */
export function linesToShow<L extends { variance: number }>(lines: L[], compared: boolean, onlyDiff: boolean): L[] {
  if (!compared) return lines;
  const differ = lines.filter((l) => l.variance !== 0);
  return onlyDiff ? differ : [...differ, ...lines.filter((l) => l.variance === 0)];
}

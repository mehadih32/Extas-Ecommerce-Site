// PR 6 — the Server page's small text helpers (no server imports here). Every word comes from
// messages/admin-server.<lang>.json.
import { t, type Dict } from '@/lib/i18n';
import { dateTime, errorCodeOf, keyOf } from '../stock/text';

export const SERVER_HOME = '/admin/server';

/** How long ago, for a heartbeat: seconds up to two minutes, minutes up to two hours, then the date and time. */
export function beatAgo(dict: Dict, iso: string | null, now: Date, locale: string, timeZone: string): string {
  if (!iso) return t(dict, 'server.time.never');
  const seconds = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return t(dict, 'server.time.justNow');
  if (seconds < 120) return t(dict, 'server.time.secondsAgo', { n: seconds });
  const minutes = Math.floor(seconds / 60);
  if (minutes <= 120) return t(dict, 'server.time.minutesAgo', { n: minutes });
  return dateTime(iso, locale, timeZone);
}

/** A job's name in words (`server.jobs.<key>`), else its key as it is. */
export function jobName(dict: Dict, jobKey: string): string {
  const k = `server.jobs.${keyOf(jobKey)}`;
  const text = t(dict, k);
  return text === k ? jobKey : text;
}

/** When a failed job is tried next: its time, or "in a moment" when that time has already come. */
export function nextTry(dict: Dict, iso: string | null, now: Date, locale: string, timeZone: string): string {
  if (!iso || new Date(iso).getTime() <= now.getTime()) return t(dict, 'server.failed.nextSoon');
  return t(dict, 'server.failed.next', { time: dateTime(iso, locale, timeZone) });
}

/** A failed job's reason: plain words for the worker's own codes (`server.errors.<CODE>`), else the line itself. */
export function failureText(dict: Dict, line: string | null): string | null {
  if (!line) return null;
  const code = errorCodeOf(line);
  if (!code) return line;
  const k = `server.errors.${code}`;
  const text = t(dict, k);
  return text === k ? line : text;
}

// Numbers and times in the reader's language. The locale and time zone come from the settings framework (PR 491/492,
// `store.locale` and `store.timeZone`, read by lib/settings.ts) when the database is reachable; otherwise from the
// environment the server sets (EXTAS_LOCALE, EXTAS_TIMEZONE from infra/config/server.conf).
export const locale = () => process.env.EXTAS_LOCALE || 'bn-BD';
export const timeZone = () => process.env.EXTAS_TIMEZONE || 'UTC';

export interface DisplayOptions {
  locale?: string;
  timeZone?: string;
}

export function num(n: number, d: DisplayOptions = {}): string {
  return new Intl.NumberFormat(d.locale ?? locale()).format(n);
}

export function dateTime(iso: string | undefined | null, d: DisplayOptions = {}): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(d.locale ?? locale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: d.timeZone ?? timeZone(),
  }).format(date);
}

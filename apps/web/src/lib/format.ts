// Numbers and times in the reader's language. The locale and time zone come from the environment the server sets
// (EXTAS_LOCALE, EXTAS_TIMEZONE from infra/config/server.conf); the settings framework (PR 491) takes over later.
export const locale = () => process.env.EXTAS_LOCALE || 'bn-BD';
export const timeZone = () => process.env.EXTAS_TIMEZONE || 'UTC';

export function num(n: number): string {
  return new Intl.NumberFormat(locale()).format(n);
}

export function dateTime(iso: string | undefined | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeStyle: 'short', timeZone: timeZone() }).format(d);
}

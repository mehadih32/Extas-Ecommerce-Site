// S14 · PR 294 — "Send at that time" on the who-and-when box: the advice's hours are in the store's time zone
// (`store.timeZone`), while the send form's time box reads the browser's own clock. This finds the next moment the store's
// clock turns to that hour and writes it as the browser's local time for the box, so a person outside the store's zone
// still gets the store's hour.
const STEP_MS = 15 * 60_000;

const pad = (x: number) => String(x).padStart(2, '0');

/** A moment as the browser's local `datetime-local` value (YYYY-MM-DDTHH:MM). */
export function localValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The next moment after `now` that the clock of `timeZone` shows `hour`:00, as a `datetime-local` value. */
export function nextStoreHour(hour: number, timeZone: string, now = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const start = Math.floor(now.getTime() / STEP_MS) * STEP_MS + STEP_MS;
  // 15-minute steps cover every zone offset in use; two days always reach the hour
  for (let i = 0; i < (2 * 24 * 60 * 60_000) / STEP_MS; i++) {
    const at = new Date(start + i * STEP_MS);
    const parts = fmt.formatToParts(at);
    const h = Number(parts.find((p) => p.type === 'hour')?.value);
    const m = Number(parts.find((p) => p.type === 'minute')?.value);
    if (h === hour && m === 0) return localValue(at);
  }
  return localValue(new Date(start));
}

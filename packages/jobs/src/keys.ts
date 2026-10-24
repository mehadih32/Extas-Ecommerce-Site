// PR 6 — a scheduled run's slot and identity, in a module that imports nothing, so a job module (PR 148 messages.ts)
// can name its run keys without importing the scheduler (which imports the catalogue, which imports the job modules).
/** The slot number of `now` for an interval (slots are counted from the epoch, so every worker agrees). */
export const slotOf = (nowMs: number, everyMs: number): number => Math.floor(nowMs / everyMs);

/** A job and its store: `job/store` (`-` = every store). */
export function seriesKey(name: string, payload: Record<string, unknown>): string {
  return `${name}/${typeof payload.storeId === 'number' ? String(payload.storeId) : '-'}`;
}

/** A scheduled run's identity: `job/store/slot`. Safe as a queue job id (the queue refuses ids with a colon). */
export function runKey(name: string, payload: Record<string, unknown>, slot: number): string {
  return `${seriesKey(name, payload)}/${slot}`;
}

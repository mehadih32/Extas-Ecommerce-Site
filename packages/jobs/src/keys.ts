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

/**
 * The slot of a run named by its period (`2026-11-01`, `D:2026-11-07`, `M:2026-10`): FNV-1a of the text, so the same
 * period is the same run on every worker and the next period is a new one. A job planned once per store day or period
 * puts this in its run key — slot 0 made every later day the same run as the first, so it was skipped ever after.
 */
export function textSlot(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

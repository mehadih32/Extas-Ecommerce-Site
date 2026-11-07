// Follow-up 602 (PR 257) — the sweep for tracked events still waiting. A shopper event is sent right after it is
// recorded; one that failed (or was lost to a restart) was only tried again with the store's next event, so on a quiet
// shop it could wait for hours. While `ads.tracking` is on, each live store with a real event that has rested past the
// resting time gets one run an hour (the UTC hour is in the payload and its slot in the run key, so the worker looking
// every tick runs it once an hour). The run asks the web app (inside the server, with the server's internal token) to send them
// (apps/web lib/tracking/service.ts `trackingSweepHook`, the same `sendEvents` with its claim, attempts and platforms):
// the senders live with the web app, so the worker calls it rather than keeping a second copy. Off with tracking;
// nothing here moves money or touches a budget or a campaign (rule 6).
// This module imports `./keys`, never `./scheduler` (the scheduler imports the catalogue, which imports this).
import type { JobDeps } from './context';
import { runKey, slotOf } from './keys';
import type { Planner } from './worker';

export const TRACKING_SWEEP_JOB = 'tracking.sweep';
export const TRACKING_SWEEP_QUEUE = 'reports';
/** How long an event rests before the sweep counts it (the web app's own retry rests the same; service.ts RETRY_AFTER_MS). */
const RESTED_MS = 60_000; // hardcode-ok: a technical resting time between tries, the same as the web app's
/** One sweep a store an hour (the run key's slot). */
const HOUR_MS = 3_600_000;

export interface TrackingSweepPayload {
  storeId: number;
  /** The UTC hour (`YYYY-MM-DDTHH`): one sweep a store an hour. */
  hour: string;
}

/** What the web app answers (counts only). */
export interface TrackingSweepAnswer {
  ok: boolean;
  status: number;
  /** Events the send took. */
  events?: number;
  /** Platform sends that failed (tried again until the owner's number of attempts). */
  failed?: number;
}

/** The sweep's hour of a moment (UTC). */
export const trackingSweepHour = (now: Date): string => now.toISOString().slice(0, 13);

/** Each live store with tracking on and a real event waiting past the resting time: one run an hour. Nothing without the hook. */
export const trackingSweepPlanner: Planner = async (deps, now) => {
  if (!deps.tracking) return [];
  const stores = await deps.db.store.findMany({ where: { status: { not: 'ARCHIVED' }, archivedAt: null }, select: { id: true }, orderBy: { id: 'asc' } });
  const out: Awaited<ReturnType<Planner>> = [];
  for (const st of stores) {
    const s = await deps.settings.value('ads.tracking', { storeId: st.id });
    if (!s.on) continue;
    const waiting = await deps.db.trackedEvent.count({ where: { storeId: st.id, pending: true, test: false, updatedAt: { lt: new Date(now.getTime() - RESTED_MS) } } });
    if (!waiting) continue;
    const payload = { storeId: st.id, hour: trackingSweepHour(now) };
    out.push({ queue: TRACKING_SWEEP_QUEUE, name: TRACKING_SWEEP_JOB, payload, key: runKey(TRACKING_SWEEP_JOB, payload, slotOf(now.getTime(), HOUR_MS)) });
  }
  return out;
};

/** Sends one store's waiting events, while tracking is still on (switched off since = nothing). */
export async function runTrackingSweep(deps: JobDeps, p: TrackingSweepPayload): Promise<{ done: boolean; reason?: string; events?: number; failed?: number }> {
  const s = await deps.settings.value('ads.tracking', { storeId: p.storeId });
  if (!s.on) return { done: false, reason: 'off' };
  if (!deps.tracking) return { done: false, reason: 'no-hook' };
  const r = await deps.tracking.sweep(p.storeId);
  if (!r.ok) throw new Error(`tracking.sweep: the web app answered ${r.status}`);
  return { done: true, events: r.events ?? 0, failed: r.failed ?? 0 };
}

/**
 * The hook to the web app inside the server: POST /api/internal/tracking/sweep on this colour's app, with the server's
 * internal token. Null (no sweep planned) without the token or the colour.
 */
export function trackingSweepHookFromEnv(env: NodeJS.ProcessEnv = process.env, fetchFn: typeof fetch = fetch): JobDeps['tracking'] | null {
  const token = env.CACHE_HOOK_TOKEN ?? '';
  const color = env.EXTAS_COLOR ?? '';
  if (token.length < 32 || !/^[a-z0-9-]+$/.test(color)) return null;
  const url = `http://app-${color}:${env.APP_PORT || '3000'}/api/internal/tracking/sweep`; // hardcode-ok: the app's port inside the server (deploy.sh APP_PORT)
  return {
    async sweep(storeId) {
      const res = await fetchFn(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-extas-cache-hook': token }, body: JSON.stringify({ storeId }) });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; events?: number; failed?: number };
      return { ok: res.ok && body.ok === true, status: res.status, events: body.events ?? 0, failed: body.failed ?? 0 };
    },
  };
}

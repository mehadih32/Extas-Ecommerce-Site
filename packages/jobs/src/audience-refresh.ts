// S13 · PR 264 (Blueprint C6.2 point 3, "refreshed daily") — the daily audience refresh. Each live store whose
// `ads.audienceRefresh` is on gets one run per store day, at or after the owner's hour (store time): the day is in the
// payload and the run key, so the worker looking every tick runs it once. The run asks the web app (inside the server,
// with the server's internal token) to count every live audience again and send again the ones already sent, plus the
// refused-parcel exclusion list (apps/web lib/marketing/audience-push.ts `refreshAudiences`): the audience engine lives
// with the admin, so the worker calls it rather than keeping a second copy. Off as it ships; nothing here moves money or
// touches a budget or a campaign (rule 6).
// This module imports `./keys`, never `./scheduler` (the scheduler imports the catalogue, which imports this).
import { localClock } from '@extas/inventory';
import { nowOf, type JobDeps } from './context';
import { runKey, textSlot } from './keys';
import type { Planner } from './worker';

export const AUDIENCE_REFRESH_JOB = 'audiences.refresh';
export const AUDIENCE_REFRESH_QUEUE = 'reports';

export interface AudienceRefreshPayload {
  storeId: number;
  /** The store day (`YYYY-MM-DD`, store time). */
  day: string;
}

/** What the web app answers (counts only). */
export interface AudienceRefreshAnswer {
  ok: boolean;
  status: number;
  skipped?: string | null;
  counted?: number;
  sent?: number;
}

/** The store day the refresh is due on now, or null (off, or before the owner's hour). */
export function audienceRefreshDue(now: Date, timeZone: string, s: { on: boolean; hour: number }): string | null {
  if (!s.on) return null;
  const c = localClock(now, timeZone);
  return c.minutes >= s.hour * 60 ? c.day : null;
}

/** Each live store whose refresh is due today: one run per store day. Nothing without the web app's hook. */
export const audienceRefreshPlanner: Planner = async (deps, now) => {
  if (!deps.audiences) return [];
  const stores = await deps.db.store.findMany({ where: { status: { not: 'ARCHIVED' }, archivedAt: null }, select: { id: true }, orderBy: { id: 'asc' } });
  const out: Awaited<ReturnType<Planner>> = [];
  for (const st of stores) {
    const at = { storeId: st.id };
    const [s, tz] = await Promise.all([deps.settings.value('ads.audienceRefresh', at), deps.settings.value('store.timeZone', at)]);
    const day = audienceRefreshDue(now, tz, s);
    if (!day) continue;
    const payload = { storeId: st.id, day };
    // ~~key: runKey(AUDIENCE_REFRESH_JOB, payload, 0)~~ fix: slot 0 made every later period the same run as the first (skipped ever after)
    out.push({ queue: AUDIENCE_REFRESH_QUEUE, name: AUDIENCE_REFRESH_JOB, payload, key: runKey(AUDIENCE_REFRESH_JOB, payload, textSlot(day)) });
  }
  return out;
};

/** Refreshes one store's audiences for its day, when it is still due for that day (switched off since = nothing). */
export async function runAudienceRefresh(deps: JobDeps, p: AudienceRefreshPayload): Promise<{ done: boolean; reason?: string; counted?: number; sent?: number }> {
  const at = { storeId: p.storeId };
  const [s, tz] = await Promise.all([deps.settings.value('ads.audienceRefresh', at), deps.settings.value('store.timeZone', at)]);
  if (audienceRefreshDue(nowOf(deps), tz, s) !== p.day) return { done: false, reason: 'not-due' };
  if (!deps.audiences) return { done: false, reason: 'no-hook' };
  const r = await deps.audiences.refresh(p.storeId);
  if (!r.ok) throw new Error(`audiences.refresh: the web app answered ${r.status}`);
  return { done: true, counted: r.counted ?? 0, sent: r.sent ?? 0 };
}

/**
 * The hook to the web app inside the server: POST /api/internal/audiences/refresh on this colour's app, with the
 * server's internal token. Null (no refresh planned) without the token or the colour.
 */
export function audienceRefreshHookFromEnv(env: NodeJS.ProcessEnv = process.env, fetchFn: typeof fetch = fetch): JobDeps['audiences'] | null {
  const token = env.CACHE_HOOK_TOKEN ?? '';
  const color = env.EXTAS_COLOR ?? '';
  if (token.length < 32 || !/^[a-z0-9-]+$/.test(color)) return null;
  const url = `http://app-${color}:${env.APP_PORT || '3000'}/api/internal/audiences/refresh`; // hardcode-ok: the app's port inside the server (deploy.sh APP_PORT)
  return {
    async refresh(storeId) {
      const res = await fetchFn(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-extas-cache-hook': token }, body: JSON.stringify({ storeId }) });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; skipped?: string | null; counted?: number; sent?: unknown[] };
      return { ok: res.ok && body.ok === true, status: res.status, skipped: body.skipped ?? null, counted: body.counted, sent: Array.isArray(body.sent) ? body.sent.length : 0 };
    },
  };
}

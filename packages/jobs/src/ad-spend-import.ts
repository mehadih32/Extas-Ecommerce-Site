// S13 · PR 265 (Blueprint C6.2, register "Ad spend import, per platform, per campaign") — the daily ad spend import.
// Each live store whose `ads.spendImport` is on gets one run per store day, at or after the owner's hour (store time):
// the day is in the payload and the run key, so the worker looking every tick runs it once. The run asks the web app
// (inside the server, with the server's internal token) to read what Meta, TikTok and Google spent per campaign over the
// owner's last days and keep it (apps/web lib/marketing/ad-spend.ts `importAdSpend`): the ad readers live with the
// admin, so the worker calls them rather than keeping a second copy. Off as it ships; read only on the platforms:
// nothing here moves money or touches a budget or a campaign (rule 6).
// This module imports `./keys`, never `./scheduler` (the scheduler imports the catalogue, which imports this).
import { localClock } from '@extas/inventory';
import { nowOf, type JobDeps } from './context';
import { runKey } from './keys';
import type { Planner } from './worker';

export const AD_SPEND_IMPORT_JOB = 'ads.spend.import';
export const AD_SPEND_IMPORT_QUEUE = 'reports';

export interface AdSpendImportPayload {
  storeId: number;
  /** The store day (`YYYY-MM-DD`, store time). */
  day: string;
}

/** What the web app answers (counts only). */
export interface AdSpendImportAnswer {
  ok: boolean;
  status: number;
  skipped?: string | null;
  /** Campaign days kept, over every platform. */
  rows?: number;
  /** Platforms that refused (their own words stay in the web app's log). */
  refused?: number;
}

/** The store day the import is due on now, or null (off, or before the owner's hour). */
export function adSpendImportDue(now: Date, timeZone: string, s: { on: boolean; hour: number }): string | null {
  if (!s.on) return null;
  const c = localClock(now, timeZone);
  return c.minutes >= s.hour * 60 ? c.day : null;
}

/** Each live store whose import is due today: one run per store day. Nothing without the web app's hook. */
export const adSpendImportPlanner: Planner = async (deps, now) => {
  if (!deps.adSpend) return [];
  const stores = await deps.db.store.findMany({ where: { status: { not: 'ARCHIVED' }, archivedAt: null }, select: { id: true }, orderBy: { id: 'asc' } });
  const out: Awaited<ReturnType<Planner>> = [];
  for (const st of stores) {
    const at = { storeId: st.id };
    const [s, tz] = await Promise.all([deps.settings.value('ads.spendImport', at), deps.settings.value('store.timeZone', at)]);
    const day = adSpendImportDue(now, tz, s);
    if (!day) continue;
    const payload = { storeId: st.id, day };
    out.push({ queue: AD_SPEND_IMPORT_QUEUE, name: AD_SPEND_IMPORT_JOB, payload, key: runKey(AD_SPEND_IMPORT_JOB, payload, 0) });
  }
  return out;
};

/** Imports one store's spend for its day, when it is still due for that day (switched off since = nothing). */
export async function runAdSpendImport(deps: JobDeps, p: AdSpendImportPayload): Promise<{ done: boolean; reason?: string; rows?: number; refused?: number }> {
  const at = { storeId: p.storeId };
  const [s, tz] = await Promise.all([deps.settings.value('ads.spendImport', at), deps.settings.value('store.timeZone', at)]);
  if (adSpendImportDue(nowOf(deps), tz, s) !== p.day) return { done: false, reason: 'not-due' };
  if (!deps.adSpend) return { done: false, reason: 'no-hook' };
  const r = await deps.adSpend.import(p.storeId);
  if (!r.ok) throw new Error(`ads.spend.import: the web app answered ${r.status}`);
  return { done: true, rows: r.rows ?? 0, refused: r.refused ?? 0 };
}

/**
 * The hook to the web app inside the server: POST /api/internal/ads/spend-import on this colour's app, with the
 * server's internal token. Null (no import planned) without the token or the colour.
 */
export function adSpendImportHookFromEnv(env: NodeJS.ProcessEnv = process.env, fetchFn: typeof fetch = fetch): JobDeps['adSpend'] | null {
  const token = env.CACHE_HOOK_TOKEN ?? '';
  const color = env.EXTAS_COLOR ?? '';
  if (token.length < 32 || !/^[a-z0-9-]+$/.test(color)) return null;
  const url = `http://app-${color}:${env.APP_PORT || '3000'}/api/internal/ads/spend-import`; // hardcode-ok: the app's port inside the server (deploy.sh APP_PORT)
  return {
    async import(storeId) {
      const res = await fetchFn(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-extas-cache-hook': token }, body: JSON.stringify({ storeId }) });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; skipped?: string | null; results?: { rows?: number; error?: string | null; practice?: boolean }[] };
      const results = Array.isArray(body.results) ? body.results : [];
      return {
        ok: res.ok && body.ok === true,
        status: res.status,
        skipped: body.skipped ?? null,
        rows: results.reduce((n, r) => n + (r.practice ? 0 : (r.rows ?? 0)), 0),
        refused: results.filter((r) => r.error).length,
      };
    },
  };
}

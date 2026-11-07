// Follow-up 602 (PR 257) — the sweep for tracked events still waiting: planned once an hour per store while tracking is
// on and an event has waited past the resting time, only with the web app's hook; refused when the web app does not
// answer ok; the hook only with the server's internal token.
import { describe, expect, it, vi } from 'vitest';
import { registry } from '@extas/settings';
import { jobDefinition } from './catalogue';
import type { JobDeps } from './context';
import { runTrackingSweep, TRACKING_SWEEP_JOB, trackingSweepHookFromEnv, trackingSweepPlanner, trackingSweepHour } from './tracking-sweep';

const TOKEN = 't'.repeat(40);
const at = (iso: string) => new Date(iso);

function depsWith(on: boolean, waiting: number, hook?: JobDeps['tracking'], now = at('2026-11-07T09:20:00Z')): { deps: JobDeps; count: ReturnType<typeof vi.fn> } {
  const values: Record<string, unknown> = { 'ads.tracking': { ...registry['ads.tracking'].default, on } };
  const count = vi.fn(async () => waiting);
  const deps = {
    db: { store: { findMany: async () => [{ id: 1 }] }, trackedEvent: { count } },
    settings: { value: async (k: string) => (k in values ? values[k] : (registry as Record<string, { default: unknown }>)[k]!.default) },
    tracking: hook,
    now: () => now,
  } as unknown as JobDeps;
  return { deps, count };
}

describe('follow-up 602 · tracked events sweep', () => {
  it('plans one run per store and hour while tracking is on and an event waits; nothing otherwise', async () => {
    expect(registry['ads.tracking'].default.on).toBe(false);
    const hook = { sweep: vi.fn() };
    const { deps, count } = depsWith(true, 2, hook);
    const runs = await trackingSweepPlanner(deps, at('2026-11-07T09:20:00Z'));
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ name: TRACKING_SWEEP_JOB, payload: { storeId: 1, hour: '2026-11-07T09' } });
    // only events that rested past the resting time count
    const where = (count.mock.calls[0] as unknown as [{ where: { storeId: number; pending: boolean; updatedAt: { lt: Date } } }])[0].where;
    expect(where).toMatchObject({ storeId: 1, pending: true, test: false });
    expect(where.updatedAt.lt.getTime()).toBeLessThan(at('2026-11-07T09:20:00Z').getTime());
    expect((await trackingSweepPlanner(deps, at('2026-11-07T09:55:00Z')))[0]!.key).toBe(runs[0]!.key);
    expect((await trackingSweepPlanner(deps, at('2026-11-07T10:05:00Z')))[0]!.key).not.toBe(runs[0]!.key);
    expect(await trackingSweepPlanner(depsWith(true, 2).deps, at('2026-11-07T09:20:00Z'))).toEqual([]);
    expect(await trackingSweepPlanner(depsWith(false, 2, hook).deps, at('2026-11-07T09:20:00Z'))).toEqual([]);
    expect(await trackingSweepPlanner(depsWith(true, 0, hook).deps, at('2026-11-07T09:20:00Z'))).toEqual([]);
    expect(trackingSweepHour(at('2026-11-07T23:59:59Z'))).toBe('2026-11-07T23');
    expect(jobDefinition(TRACKING_SWEEP_JOB)?.parse({ storeId: 1, hour: '2026-11-07T09' })).toEqual({ storeId: 1, hour: '2026-11-07T09' });
    expect(() => jobDefinition(TRACKING_SWEEP_JOB)?.parse({ storeId: 1, hour: 'now' })).toThrow();
  });

  it('runs only while tracking is still on, and fails (to be retried) when the web app does not answer ok', async () => {
    const ok = { sweep: vi.fn(async () => ({ ok: true, status: 200, events: 3, failed: 1 })) };
    expect(await runTrackingSweep(depsWith(true, 1, ok).deps, { storeId: 1, hour: '2026-11-07T09' })).toEqual({ done: true, events: 3, failed: 1 });
    expect(ok.sweep).toHaveBeenCalledWith(1);
    expect(await runTrackingSweep(depsWith(false, 1, ok).deps, { storeId: 1, hour: '2026-11-07T09' })).toEqual({ done: false, reason: 'off' });
    expect(await runTrackingSweep(depsWith(true, 1).deps, { storeId: 1, hour: '2026-11-07T09' })).toEqual({ done: false, reason: 'no-hook' });
    const bad = { sweep: async () => ({ ok: false, status: 503 }) };
    await expect(runTrackingSweep(depsWith(true, 1, bad).deps, { storeId: 1, hour: '2026-11-07T09' })).rejects.toThrow(/503/);
  });

  it('calls this colour’s app with the internal token, and is none without one', async () => {
    expect(trackingSweepHookFromEnv({ EXTAS_COLOR: 'blue' })).toBeNull();
    expect(trackingSweepHookFromEnv({ CACHE_HOOK_TOKEN: TOKEN })).toBeNull();
    const f = vi.fn(async () => new Response(JSON.stringify({ ok: true, events: 2, failed: 0 }), { status: 200 }));
    const hook = trackingSweepHookFromEnv({ EXTAS_COLOR: 'green', CACHE_HOOK_TOKEN: TOKEN }, f as unknown as typeof fetch)!;
    expect(await hook.sweep(1)).toEqual({ ok: true, status: 200, events: 2, failed: 0 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://app-green:3000/api/internal/tracking/sweep');
    expect((init.headers as Record<string, string>)['x-extas-cache-hook']).toBe(TOKEN);
    expect(JSON.parse(String(init.body))).toEqual({ storeId: 1 });
  });
});

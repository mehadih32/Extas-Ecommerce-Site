// S13 · PR 264 — the daily audience refresh: due once per store day from the owner's hour (store time), off as it ships,
// planned only with the web app's hook, refused when the web app does not answer ok, and the hook only with the
// server's internal token.
import { describe, expect, it, vi } from 'vitest';
import { registry } from '@extas/settings';
import { AUDIENCE_REFRESH_JOB, audienceRefreshDue, audienceRefreshHookFromEnv, audienceRefreshPlanner, runAudienceRefresh } from './audience-refresh';
import { jobDefinition } from './catalogue';
import type { JobDeps } from './context';

const TZ = 'Asia/Dhaka';
const dhaka = (hhmm: string) => new Date(`2026-11-01T${hhmm}:00+06:00`);
const TOKEN = 't'.repeat(40);

function depsWith(refresh: { on: boolean; hour: number }, hook?: JobDeps['audiences'], now = dhaka('09:00')): JobDeps {
  const values: Record<string, unknown> = { 'ads.audienceRefresh': refresh, 'store.timeZone': TZ };
  return {
    db: { store: { findMany: async () => [{ id: 1 }] } },
    settings: { value: async (k: string) => (k in values ? values[k] : (registry as Record<string, { default: unknown }>)[k]!.default) },
    audiences: hook,
    now: () => now,
  } as unknown as JobDeps;
}

describe('PR 264 · audience refresh', () => {
  it('is off as it ships, and due from the owner’s hour on the store’s own day', () => {
    expect(registry['ads.audienceRefresh'].default).toEqual({ on: false, hour: 0 });
    expect(audienceRefreshDue(dhaka('09:00'), TZ, { on: false, hour: 0 })).toBeNull();
    expect(audienceRefreshDue(dhaka('05:59'), TZ, { on: true, hour: 6 })).toBeNull();
    expect(audienceRefreshDue(dhaka('06:00'), TZ, { on: true, hour: 6 })).toBe('2026-11-01');
    // 00:30 in Dhaka is still the 31st in UTC: the store's day counts
    expect(audienceRefreshDue(dhaka('00:30'), TZ, { on: true, hour: 0 })).toBe('2026-11-01');
  });

  it('plans one run per store day, and nothing without the hook or while off', async () => {
    const hook = { refresh: vi.fn() };
    const runs = await audienceRefreshPlanner(depsWith({ on: true, hour: 6 }, hook), dhaka('09:00'));
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ name: AUDIENCE_REFRESH_JOB, payload: { storeId: 1, day: '2026-11-01' } });
    expect((await audienceRefreshPlanner(depsWith({ on: true, hour: 6 }, hook), dhaka('09:30')))[0]!.key).toBe(runs[0]!.key);
    // the next store day is a new run (its key names the day; a key without it ran once and was skipped ever after)
    expect((await audienceRefreshPlanner(depsWith({ on: true, hour: 6 }, hook), new Date('2026-11-02T09:00:00+06:00')))[0]!.key).not.toBe(runs[0]!.key);
    expect(await audienceRefreshPlanner(depsWith({ on: true, hour: 6 }), dhaka('09:00'))).toEqual([]);
    expect(await audienceRefreshPlanner(depsWith({ on: false, hour: 6 }, hook), dhaka('09:00'))).toEqual([]);
    expect(jobDefinition(AUDIENCE_REFRESH_JOB)?.parse({ storeId: 1, day: '2026-11-01' })).toEqual({ storeId: 1, day: '2026-11-01' });
    expect(() => jobDefinition(AUDIENCE_REFRESH_JOB)?.parse({ storeId: 1, day: 'today' })).toThrow();
  });

  it('runs only while still due, and fails (to be retried) when the web app does not answer ok', async () => {
    const ok = { refresh: vi.fn(async () => ({ ok: true, status: 200, counted: 4, sent: 2 })) };
    expect(await runAudienceRefresh(depsWith({ on: true, hour: 6 }, ok), { storeId: 1, day: '2026-11-01' })).toEqual({ done: true, counted: 4, sent: 2 });
    expect(ok.refresh).toHaveBeenCalledWith(1);
    expect(await runAudienceRefresh(depsWith({ on: false, hour: 6 }, ok), { storeId: 1, day: '2026-11-01' })).toEqual({ done: false, reason: 'not-due' });
    expect(await runAudienceRefresh(depsWith({ on: true, hour: 6 }, ok), { storeId: 1, day: '2026-10-31' })).toEqual({ done: false, reason: 'not-due' });
    const bad = { refresh: async () => ({ ok: false, status: 503 }) };
    await expect(runAudienceRefresh(depsWith({ on: true, hour: 6 }, bad), { storeId: 1, day: '2026-11-01' })).rejects.toThrow(/503/);
  });

  it('calls this colour’s app with the internal token, and is none without one', async () => {
    expect(audienceRefreshHookFromEnv({ EXTAS_COLOR: 'blue' })).toBeNull();
    expect(audienceRefreshHookFromEnv({ EXTAS_COLOR: 'blue', CACHE_HOOK_TOKEN: 'short' })).toBeNull();
    expect(audienceRefreshHookFromEnv({ CACHE_HOOK_TOKEN: TOKEN })).toBeNull();
    const f = vi.fn(async () => new Response(JSON.stringify({ ok: true, skipped: null, counted: 3, sent: [{}, {}] }), { status: 200 }));
    const hook = audienceRefreshHookFromEnv({ EXTAS_COLOR: 'green', CACHE_HOOK_TOKEN: TOKEN }, f as unknown as typeof fetch)!;
    expect(await hook.refresh(1)).toEqual({ ok: true, status: 200, skipped: null, counted: 3, sent: 2 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://app-green:3000/api/internal/audiences/refresh');
    expect((init.headers as Record<string, string>)['x-extas-cache-hook']).toBe(TOKEN);
    expect(JSON.parse(String(init.body))).toEqual({ storeId: 1 });
  });
});

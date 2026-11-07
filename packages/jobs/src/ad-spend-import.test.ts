// S13 · PR 265 — the daily ad spend import: due once per store day from the owner's hour (store time), off as it ships,
// planned only with the web app's hook, refused when the web app does not answer ok, and the hook only with the
// server's internal token.
import { describe, expect, it, vi } from 'vitest';
import { registry } from '@extas/settings';
import { AD_SPEND_IMPORT_JOB, adSpendImportDue, adSpendImportHookFromEnv, adSpendImportPlanner, runAdSpendImport } from './ad-spend-import';
import { jobDefinition } from './catalogue';
import type { JobDeps } from './context';

const TZ = 'Asia/Dhaka';
const dhaka = (hhmm: string) => new Date(`2026-11-01T${hhmm}:00+06:00`);
const TOKEN = 't'.repeat(40);

function depsWith(s: { on: boolean; days: number; hour: number }, hook?: JobDeps['adSpend'], now = dhaka('09:00')): JobDeps {
  const values: Record<string, unknown> = { 'ads.spendImport': s, 'store.timeZone': TZ };
  return {
    db: { store: { findMany: async () => [{ id: 1 }] } },
    settings: { value: async (k: string) => (k in values ? values[k] : (registry as Record<string, { default: unknown }>)[k]!.default) },
    adSpend: hook,
    now: () => now,
  } as unknown as JobDeps;
}

describe('PR 265 · ad spend import', () => {
  it('is off as it ships, and due from the owner’s hour on the store’s own day', () => {
    expect(registry['ads.spendImport'].default.on).toBe(false);
    expect(adSpendImportDue(dhaka('09:00'), TZ, { on: false, hour: 0 })).toBeNull();
    expect(adSpendImportDue(dhaka('05:59'), TZ, { on: true, hour: 6 })).toBeNull();
    expect(adSpendImportDue(dhaka('00:30'), TZ, { on: true, hour: 0 })).toBe('2026-11-01');
  });

  it('plans one run per store day, nothing without the hook or while off, and runs only while due', async () => {
    const hook = { import: vi.fn(async () => ({ ok: true, status: 200, skipped: null, rows: 9, refused: 1 })) };
    const on = { on: true, days: 3, hour: 6 };
    const runs = await adSpendImportPlanner(depsWith(on, hook), dhaka('09:00'));
    expect(runs).toEqual([expect.objectContaining({ name: AD_SPEND_IMPORT_JOB, queue: 'reports', payload: { storeId: 1, day: '2026-11-01' } })]);
    expect((await adSpendImportPlanner(depsWith(on, hook), dhaka('10:00')))[0]!.key).toBe(runs[0]!.key);
    // the next store day is a new run (its key names the day; a key without it ran once and was skipped ever after)
    expect((await adSpendImportPlanner(depsWith(on, hook), new Date('2026-11-02T09:00:00+06:00')))[0]!.key).not.toBe(runs[0]!.key);
    expect(await adSpendImportPlanner(depsWith(on), dhaka('09:00'))).toEqual([]);
    expect(await adSpendImportPlanner(depsWith({ ...on, on: false }, hook), dhaka('09:00'))).toEqual([]);
    expect(() => jobDefinition(AD_SPEND_IMPORT_JOB)?.parse({ storeId: 0, day: '2026-11-01' })).toThrow();
    expect(await runAdSpendImport(depsWith(on, hook), { storeId: 1, day: '2026-11-01' })).toEqual({ done: true, rows: 9, refused: 1 });
    expect(await runAdSpendImport(depsWith(on, hook), { storeId: 1, day: '2026-10-31' })).toEqual({ done: false, reason: 'not-due' });
    await expect(runAdSpendImport(depsWith(on, { import: async () => ({ ok: false, status: 500 }) }), { storeId: 1, day: '2026-11-01' })).rejects.toThrow(/500/);
  });

  it('calls this colour’s app with the internal token (practice rows not counted), and is none without one', async () => {
    expect(adSpendImportHookFromEnv({ EXTAS_COLOR: 'blue' })).toBeNull();
    expect(adSpendImportHookFromEnv({ CACHE_HOOK_TOKEN: TOKEN })).toBeNull();
    const answer = { ok: true, skipped: null, results: [{ rows: 6, error: null }, { rows: 3, practice: true, error: null }, { rows: 0, error: 'PLATFORM' }] };
    const f = vi.fn(async () => new Response(JSON.stringify(answer), { status: 200 }));
    const hook = adSpendImportHookFromEnv({ EXTAS_COLOR: 'green', CACHE_HOOK_TOKEN: TOKEN }, f as unknown as typeof fetch)!;
    expect(await hook.import(1)).toEqual({ ok: true, status: 200, skipped: null, rows: 6, refused: 1 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://app-green:3000/api/internal/ads/spend-import');
    expect((init.headers as Record<string, string>)['x-extas-cache-hook']).toBe(TOKEN);
  });
});

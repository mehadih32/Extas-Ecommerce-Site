import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INSTALLATION, memoryBackend, registry, SettingsResolver, storeTarget, type SettingsBackend } from '@extas/settings';
import { adminSettingsResponse, displaySettings, resetSettingsPause, settingsResolver } from './settings';

const resolverOn = (backend: SettingsBackend) => new SettingsResolver(backend, registry);

describe('displaySettings', () => {
  beforeEach(() => {
    resetSettingsPause();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.EXTAS_LOCALE;
    delete process.env.EXTAS_TIMEZONE;
  });

  it('without a database (CI, next build) uses the environment and never creates a resolver', async () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    process.env.EXTAS_TIMEZONE = 'Asia/Dhaka';
    expect(settingsResolver()).toBeNull();
    expect(await displaySettings()).toEqual({ locale: 'bn-BD', timeZone: 'Asia/Dhaka', source: 'env' });
    if (saved !== undefined) process.env.DATABASE_URL = saved;
  });

  it('reads locale and time zone through the resolver: store value over installation value over default', async () => {
    const r = resolverOn(memoryBackend());
    expect(await displaySettings({ resolver: r })).toEqual({ locale: 'bn-BD', timeZone: 'Asia/Dhaka', source: 'settings' });
    await r.set('store.timeZone', 'Asia/Kolkata', INSTALLATION);
    await r.set('store.locale', 'en-GB', storeTarget(1));
    expect(await displaySettings({ resolver: r, storeId: 1 })).toEqual({ locale: 'en-GB', timeZone: 'Asia/Kolkata', source: 'settings' });
  });

  it('falls back to the environment when the database fails or hangs, and pauses before trying again', async () => {
    process.env.EXTAS_LOCALE = 'en-US';
    const failing = memoryBackend();
    const broken = { ...failing, load: () => Promise.reject(new Error('connection refused')) };
    expect(await displaySettings({ resolver: resolverOn(broken) })).toMatchObject({ locale: 'en-US', source: 'env' });

    // Paused: even a healthy resolver is not asked until the pause ends.
    let clock = Date.now();
    const healthy = resolverOn(memoryBackend());
    expect(await displaySettings({ resolver: healthy, now: () => clock })).toMatchObject({ source: 'env' });
    clock += 60_000;
    expect(await displaySettings({ resolver: healthy, now: () => clock })).toMatchObject({ source: 'settings' });

    const hanging = { ...failing, load: () => new Promise<never>(() => {}) };
    const started = Date.now();
    expect(await displaySettings({ resolver: resolverOn(hanging), timeoutMs: 50 })).toMatchObject({ source: 'env' });
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});

describe('GET /api/admin/settings', () => {
  it("lists effective values with their source and never the owner's own data", async () => {
    const r = resolverOn(memoryBackend());
    await r.set('store.name', 'Private Owner Shop Name', storeTarget(1));
    await r.set('store.currency', 'USD', INSTALLATION);
    const res = await adminSettingsResponse('http://x/api/admin/settings?storeId=1', r);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const text = await res.text();
    expect(text).not.toContain('Private Owner Shop Name');
    const body = JSON.parse(text) as { ok: boolean; settings: { key: string; source: string; value?: unknown; redacted: boolean }[] };
    const row = (k: string) => body.settings.find((s) => s.key === k);
    expect(row('store.name')).toMatchObject({ source: 'store', redacted: true });
    expect(row('store.currency')).toMatchObject({ source: 'installation', value: 'USD' });
    expect(row('store.locale')).toMatchObject({ source: 'default', value: 'bn-BD' });
  });

  it('answers 503 without a database and 400 for a bad store id', async () => {
    expect((await adminSettingsResponse('http://x/api/admin/settings', null)).status).toBe(503);
    const r = resolverOn(memoryBackend());
    expect((await adminSettingsResponse('http://x/api/admin/settings?storeId=abc', r)).status).toBe(400);
    expect((await adminSettingsResponse('http://x/api/admin/settings?storeId=0', r)).status).toBe(400);
  });

  it('answers 503 (no details) when the database is unreachable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = { ...memoryBackend(), load: () => Promise.reject(new Error('password authentication failed')) };
    const res = await adminSettingsResponse('http://x/api/admin/settings', resolverOn(broken));
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain('password');
    vi.restoreAllMocks();
  });
});

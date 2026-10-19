// Pure-logic tests: the in-memory backend, no database.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  INSTALLATION,
  listSettingsForAdmin,
  memoryBackend,
  messages,
  registry,
  resolveValue,
  setting,
  SettingsError,
  SettingsResolver,
  storeTarget,
  type SettingTarget,
} from '../src';
import { backendContract } from './contract';

backendContract('in-memory', async () => {
  const b = memoryBackend({ knownKeys: Object.keys(registry), stores: [1, 2] });
  return {
    backend: b,
    changes: async () => b.log.map(({ createdAt: _at, ...rest }) => rest),
    seedRaw: async (t: SettingTarget, k: string, v: unknown) => b.seedRaw(t, k, v),
    storeId: 1,
    otherStoreId: 2,
  };
});

describe('resolveValue', () => {
  const spec = registry['store.locale'];
  it('ignores a store row for an installation-only setting', () => {
    const got = resolveValue('system.stagingHost', registry['system.stagingHost'], {
      store: { value: 'a.example.com', version: 1 },
      installation: { value: 'b.example.com', version: 3 },
    });
    expect(got).toMatchObject({ value: 'b.example.com', source: 'installation', version: 3 });
    expect(got.issues).toHaveLength(1);
  });
  it('falls back to the default when nothing is stored', () => {
    expect(resolveValue('store.locale', spec, {})).toEqual({ key: 'store.locale', value: 'bn-BD', source: 'default', version: 0, issues: [] });
  });
});

describe('cache', () => {
  it('reads inside the check interval never touch the backend; after it, an unchanged version keeps the snapshot', async () => {
    const b = memoryBackend();
    let clock = 0;
    let versionChecks = 0;
    const counted = { ...b, version: async () => (versionChecks++, b.version()) };
    const r = new SettingsResolver(counted, registry, { checkIntervalMs: 1_000, now: () => clock });
    await r.value('store.locale');
    await r.value('store.currency');
    clock = 999;
    await r.value('store.timeZone');
    expect([b.loads(), versionChecks]).toEqual([1, 0]);
    clock = 1_000;
    await r.value('store.locale');
    expect([b.loads(), versionChecks]).toEqual([1, 1]);
  });

  it('a write in this process is visible at once', async () => {
    const r = new SettingsResolver(memoryBackend(), registry, { checkIntervalMs: 60_000 });
    expect(await r.value('store.locale')).toBe('bn-BD');
    await r.set('store.locale', 'en-GB', INSTALLATION);
    expect(await r.value('store.locale')).toBe('en-GB');
  });

  it('concurrent reads share one load', async () => {
    const b = memoryBackend();
    const r = new SettingsResolver(b, registry);
    await Promise.all([r.value('store.locale'), r.value('store.currency'), r.all({ storeId: 1 })]);
    expect(b.loads()).toBe(1);
  });

  it('keeps answering from the last snapshot while the database is briefly unreachable', async () => {
    const b = memoryBackend();
    let down = false;
    let clock = 0;
    const stale: unknown[] = [];
    const flaky = {
      ...b,
      version: async () => {
        if (down) throw new Error('connection refused');
        return b.version();
      },
      load: async () => {
        if (down) throw new Error('connection refused');
        return b.load();
      },
    };
    const r = new SettingsResolver(flaky, registry, { checkIntervalMs: 10, now: () => clock, onStale: (e) => stale.push(e) });
    expect(await r.value('store.currency')).toBe('BDT');
    down = true;
    clock = 50;
    expect(await r.value('store.currency')).toBe('BDT');
    expect(stale).toHaveLength(1);
    const cold = new SettingsResolver(flaky, registry);
    await expect(cold.value('store.currency')).rejects.toThrow('connection refused');
  });
});

describe('owner OK (CLAUDE.md rule 6)', () => {
  const guarded = {
    'test.guarded': setting({
      schema: z.boolean(),
      default: false,
      scope: 'store',
      valueType: 'BOOLEAN',
      group: 'store',
      labelKey: 'store.name.label',
      isOwnerData: false,
      requiresOwnerOk: true,
      version: 1,
    }),
  };
  it("refuses a change without the owner's written OK, accepts it with one", async () => {
    const r = new SettingsResolver(memoryBackend(), guarded);
    await expect(r.set('test.guarded', true, storeTarget(1))).rejects.toMatchObject({ code: 'OWNER_OK_REQUIRED' });
    await expect(r.reset('test.guarded', storeTarget(1))).rejects.toBeInstanceOf(SettingsError);
    await expect(r.set('test.guarded', true, storeTarget(1), { ownerApproved: true })).resolves.toMatchObject({ changed: true });
  });
});

describe('admin list', () => {
  it("lists every setting with value and source, and never the owner's own data or vault references", async () => {
    const withSecret = {
      ...registry,
      'test.secret': setting({
        schema: z.string().nullable(),
        default: 'vault:sample-ref',
        scope: 'installation',
        valueType: 'SECRET_REF',
        group: 'system',
        labelKey: 'system.stagingHost.label',
        isOwnerData: false,
        version: 1,
      }),
    };
    const r = new SettingsResolver(memoryBackend(), withSecret);
    await r.set('store.name', 'Owner Private Name', storeTarget(1));
    await r.set('store.locale', 'en-GB', storeTarget(1));
    await r.set('test.secret', 'vault:live-ref', INSTALLATION);
    const rows = await listSettingsForAdmin(r, messages, { storeId: 1 });
    const json = JSON.stringify(rows);
    expect(json).not.toContain('Owner Private Name');
    expect(json).not.toContain('vault:');
    expect(rows.find((x) => x.key === 'store.name')).toMatchObject({ redacted: true, source: 'store', isOwnerData: true });
    expect(rows.find((x) => x.key === 'store.name')).not.toHaveProperty('value');
    expect(rows.find((x) => x.key === 'test.secret')).toMatchObject({ redacted: true, source: 'installation' });
    expect(rows.find((x) => x.key === 'store.locale')).toMatchObject({
      value: 'en-GB',
      default: 'bn-BD',
      source: 'store',
      redacted: false,
      label: { en: 'Language and number format', bn: 'ভাষা ও সংখ্যার ধরন' },
    });
    expect(rows.find((x) => x.key === 'store.currency')).toMatchObject({ value: 'BDT', source: 'default' });
  });
});

// The behaviour every backend must have, run against the in-memory backend (no database) and against PostgreSQL
// (prisma backend, when a test database is available). One suite, so the two can never drift apart.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  INSTALLATION,
  registry,
  SettingsError,
  SettingsResolver,
  storeTarget,
  type ChangeLogEntry,
  type SettingsBackend,
  type SettingTarget,
} from '../src';

export interface Harness {
  backend: SettingsBackend;
  /** The change log, oldest first. */
  changes(): Promise<Pick<ChangeLogEntry, 'storeId' | 'key' | 'action' | 'oldValue' | 'newValue' | 'reason' | 'actorId'>[]>;
  /** Puts a raw value row in place, bypassing validation and the log (a value saved before a schema change). */
  seedRaw(target: SettingTarget, key: string, value: unknown): Promise<void>;
  storeId: number;
  otherStoreId: number;
}

const ACTOR = '01890a5d-ac96-774b-bcce-b302099a8057';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof SettingsError) return e.code;
    throw e;
  }
  return 'no error';
}

export function backendContract(name: string, setup: () => Promise<Harness>) {
  describe(`resolver on the ${name} backend`, () => {
    let h: Harness;
    let r: SettingsResolver<typeof registry>;
    let store: SettingTarget;

    beforeEach(async () => {
      h = await setup();
      // checkIntervalMs 0: every read checks the version, so each assertion sees the database as it is.
      r = new SettingsResolver(h.backend, registry, { checkIntervalMs: 0 });
      store = storeTarget(h.storeId);
    });

    it('precedence: store value, then installation value, then the definition default', async () => {
      const opts = { storeId: h.storeId };
      expect(await r.get('store.timeZone', opts)).toMatchObject({ value: 'Asia/Dhaka', source: 'default', version: 0 });

      await r.set('store.timeZone', 'Asia/Kolkata', INSTALLATION, { actorId: ACTOR });
      expect(await r.get('store.timeZone', opts)).toMatchObject({ value: 'Asia/Kolkata', source: 'installation' });

      await r.set('store.timeZone', 'Europe/London', store, { actorId: ACTOR });
      expect(await r.get('store.timeZone', opts)).toMatchObject({ value: 'Europe/London', source: 'store', version: 1 });
      // Another store still inherits the installation value; no store at all reads the installation tier.
      expect(await r.get('store.timeZone', { storeId: h.otherStoreId })).toMatchObject({ value: 'Asia/Kolkata', source: 'installation' });
      expect(await r.get('store.timeZone')).toMatchObject({ value: 'Asia/Kolkata', source: 'installation' });
    });

    it('rejects an invalid value and writes nothing', async () => {
      expect(await code(r.set('store.locale', 'not a locale', INSTALLATION))).toBe('INVALID_VALUE');
      expect(await code(r.set('store.currency', 'usd', store))).toBe('INVALID_VALUE');
      // @ts-expect-error — the type system already refuses a number for a string setting
      expect(await code(r.set('store.currency', 42, store))).toBe('INVALID_VALUE');
      expect(await h.changes()).toEqual([]);
      expect(await r.get('store.locale')).toMatchObject({ source: 'default' });
    });

    it('rejects a store value for an installation-only setting, unknown keys and bad actor ids', async () => {
      expect(await code(r.set('system.stagingHost', 'preview.example.com', store))).toBe('WRONG_SCOPE');
      // @ts-expect-error — not a registry key
      expect(await code(r.set('nope.missing', 'x', INSTALLATION))).toBe('UNKNOWN_KEY');
      expect(await code(r.set('store.locale', 'en-GB', INSTALLATION, { actorId: 'robert' }))).toBe('INVALID_ACTOR');
      expect(await code(r.set('store.locale', 'en-GB', storeTarget(987654)))).toBe('UNKNOWN_STORE');
      expect(await h.changes()).toEqual([]);
    });

    it('a stored value that no longer passes the schema is skipped, with an issue', async () => {
      await h.seedRaw(INSTALLATION, 'store.currency', 'Taka');
      await h.seedRaw(store, 'store.currency', 'usd');
      r.invalidate();
      const got = await r.get('store.currency', { storeId: h.storeId });
      expect(got).toMatchObject({ value: 'BDT', source: 'default' });
      expect(got.issues.map((i) => i.tier)).toEqual(['store', 'installation']);
    });

    it('logs every write: who, old value, new value', async () => {
      await r.set('store.locale', 'en-GB', INSTALLATION, { actorId: ACTOR, reason: 'test' });
      await r.set('store.locale', 'en-US', INSTALLATION, { actorId: ACTOR });
      await r.set('store.locale', 'en-US', INSTALLATION, { actorId: ACTOR }); // same value again: no change, no entry
      await r.set('store.name', 'Sample shop', store);
      expect(await h.changes()).toEqual([
        { storeId: null, key: 'store.locale', action: 'SET', oldValue: null, newValue: 'en-GB', reason: 'test', actorId: ACTOR },
        { storeId: null, key: 'store.locale', action: 'SET', oldValue: 'en-GB', newValue: 'en-US', reason: null, actorId: ACTOR },
        { storeId: h.storeId, key: 'store.name', action: 'SET', oldValue: null, newValue: 'Sample shop', reason: null, actorId: null },
      ]);
    });

    it('stores the parsed value (trimmed), and a nullable setting can hold null', async () => {
      await r.set('store.name', '  Sample shop  ', store);
      expect(await r.value('store.name', { storeId: h.storeId })).toBe('Sample shop');
      await r.set('store.name', null, store);
      expect(await r.get('store.name', { storeId: h.storeId })).toMatchObject({ value: null, source: 'store', version: 2 });
    });

    it('reset to default (PR 510): store → installation value, installation → definition default, both logged', async () => {
      await r.set('store.currency', 'USD', INSTALLATION, { actorId: ACTOR });
      await r.set('store.currency', 'EUR', store, { actorId: ACTOR });

      const storeReset = await r.reset('store.currency', store, { actorId: ACTOR, reason: 'back to shared' });
      expect(storeReset).toMatchObject({ changed: true, oldValue: 'EUR', version: 0 });
      expect(await r.get('store.currency', { storeId: h.storeId })).toMatchObject({ value: 'USD', source: 'installation' });

      await r.reset('store.currency', INSTALLATION, { actorId: ACTOR });
      expect(await r.get('store.currency', { storeId: h.storeId })).toMatchObject({ value: 'BDT', source: 'default' });

      // Nothing left to reset: no change, nothing logged.
      expect(await r.reset('store.currency', INSTALLATION)).toMatchObject({ changed: false });

      const log = await h.changes();
      expect(log.slice(2)).toEqual([
        { storeId: h.storeId, key: 'store.currency', action: 'RESET_TO_DEFAULT', oldValue: 'EUR', newValue: null, reason: 'back to shared', actorId: ACTOR },
        { storeId: null, key: 'store.currency', action: 'RESET_TO_DEFAULT', oldValue: 'USD', newValue: null, reason: null, actorId: ACTOR },
      ]);
      expect(log).toHaveLength(4);
    });

    it('reset is also refused at store level for an installation-only setting', async () => {
      expect(await code(r.reset('system.stagingHost', store))).toBe('WRONG_SCOPE');
    });

    it('optimistic lock: a save naming an old version is refused', async () => {
      const first = await r.set('store.locale', 'en-GB', INSTALLATION, { expectedVersion: 0 });
      expect(first).toMatchObject({ changed: true, version: 1 });
      expect(await code(r.set('store.locale', 'en-US', INSTALLATION, { expectedVersion: 0 }))).toBe('VERSION_CONFLICT');
      expect(await r.set('store.locale', 'en-US', INSTALLATION, { expectedVersion: 1 })).toMatchObject({ version: 2 });
      expect(await code(r.reset('store.locale', INSTALLATION, { expectedVersion: 1 }))).toBe('VERSION_CONFLICT');
      expect(await r.value('store.locale')).toBe('en-US');
    });

    it('a second resolver (another replica) sees a write once its check interval passes', async () => {
      let clock = 1_000;
      const other = new SettingsResolver(h.backend, registry, { checkIntervalMs: 500, now: () => clock });
      expect(await other.value('store.locale')).toBe('bn-BD');
      await r.set('store.locale', 'en-GB', INSTALLATION);
      clock += 100;
      expect(await other.value('store.locale')).toBe('bn-BD'); // still inside the interval: cached
      clock += 500;
      expect(await other.value('store.locale')).toBe('en-GB'); // version moved: reloaded
    });
  });
}

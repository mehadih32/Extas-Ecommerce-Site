// Where values are kept. The resolver talks to a backend: `prismaBackend` (PostgreSQL, prisma-backend.ts) in the app,
// `memoryBackend` (below) in pure-logic tests. Both follow the same rules, which the tests check on each:
// - every write and every reset writes one SettingChange entry in the same transaction as the value;
// - the change log only grows, so its length is the cache version counter (resolver.ts);
// - a reset removes the override row at that tier (a missing row means "inherit"); the old value stays in the log.
import type { SettingTarget } from './define';
import { SettingsError } from './errors';
import type { StoredValue } from './resolve';

export interface Snapshot {
  /** Change-log length when the snapshot was read. */
  version: string;
  installation: Map<string, StoredValue>;
  stores: Map<number, Map<string, StoredValue>>;
}

export interface ChangeMeta {
  /** StaffUser id (UUID) of whoever made the change; null for the system. */
  actorId?: string | null;
  reason?: string | null;
  /** Version of the value at the target tier that the caller read (0 = no row). Omit to skip the optimistic lock. */
  expectedVersion?: number;
}

export interface WriteRequest extends ChangeMeta {
  key: string;
  target: SettingTarget;
  value: unknown;
}

export interface ClearRequest extends ChangeMeta {
  key: string;
  target: SettingTarget;
}

export interface ChangeResult {
  /** false when nothing changed (same value saved again, or a reset with no override); nothing is logged then. */
  changed: boolean;
  oldValue?: unknown;
  newValue?: unknown;
  /** Version of the row after the change (0 after a reset). */
  version: number;
}

export type ChangeAction = 'SET' | 'RESET_TO_DEFAULT';

export interface ChangeLogEntry {
  storeId: number | null;
  key: string;
  action: ChangeAction | 'MIGRATION_ADDED';
  oldValue: unknown;
  newValue: unknown;
  reason: string | null;
  actorId: string | null;
  createdAt: Date;
}

export interface SettingsBackend {
  /** Cheap: the change-log length. */
  version(): Promise<string>;
  /** Every value row of every tier. */
  load(): Promise<Snapshot>;
  write(req: WriteRequest): Promise<ChangeResult>;
  clear(req: ClearRequest): Promise<ChangeResult>;
}

/** Order-independent JSON equality (values are plain JSON). */
export function sameJson(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

export function canonicalJson(v: unknown): string {
  return JSON.stringify(v, (_k, val: unknown) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)))
      : val,
  );
}

const storeIdOf = (t: SettingTarget) => (t.level === 'store' ? t.storeId : null);

/** In-memory backend for tests and tools. `knownKeys`/`stores` mimic the foreign keys of the real tables. */
export function memoryBackend(opts: { knownKeys?: Iterable<string>; stores?: Iterable<number> } = {}) {
  const installation = new Map<string, StoredValue>();
  const stores = new Map<number, Map<string, StoredValue>>();
  const log: ChangeLogEntry[] = [];
  const knownKeys = opts.knownKeys ? new Set(opts.knownKeys) : undefined;
  const knownStores = opts.stores ? new Set(opts.stores) : undefined;
  let loads = 0;

  const tier = (t: SettingTarget, create: boolean) => {
    if (t.level === 'installation') return installation;
    let m = stores.get(t.storeId);
    if (!m && create) stores.set(t.storeId, (m = new Map()));
    return m;
  };
  const check = (key: string, t: SettingTarget) => {
    if (knownKeys && !knownKeys.has(key)) throw new SettingsError('NOT_SYNCED', key, 'no definition row');
    if (t.level === 'store' && knownStores && !knownStores.has(t.storeId)) {
      throw new SettingsError('UNKNOWN_STORE', key, `store ${t.storeId} does not exist`);
    }
  };
  const lock = (key: string, row: StoredValue | undefined, expected: number | undefined) => {
    if (expected !== undefined && (row?.version ?? 0) !== expected) {
      throw new SettingsError('VERSION_CONFLICT', key, `expected version ${expected}, found ${row?.version ?? 0}`);
    }
  };
  const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

  const backend: SettingsBackend & {
    log: ChangeLogEntry[];
    loads: () => number;
    /** Puts a raw row in place without validation or logging (tests: a value stored before a schema change). */
    seedRaw: (target: SettingTarget, key: string, value: unknown) => void;
  } = {
    log,
    loads: () => loads,
    seedRaw(target, key, value) {
      tier(target, true)!.set(key, { value: clone(value), version: 1 });
    },
    async version() {
      return String(log.length);
    },
    async load() {
      loads += 1;
      const copy = (m: Map<string, StoredValue>) => new Map([...m].map(([k, v]) => [k, { ...v, value: clone(v.value) }]));
      return {
        version: String(log.length),
        installation: copy(installation),
        stores: new Map([...stores].map(([id, m]) => [id, copy(m)])),
      };
    },
    async write(req) {
      check(req.key, req.target);
      const m = tier(req.target, true)!;
      const row = m.get(req.key);
      lock(req.key, row, req.expectedVersion);
      if (row && sameJson(row.value, req.value)) return { changed: false, oldValue: row.value, newValue: row.value, version: row.version };
      const version = (row?.version ?? 0) + 1;
      m.set(req.key, { value: clone(req.value), version });
      log.push({
        storeId: storeIdOf(req.target),
        key: req.key,
        action: 'SET',
        oldValue: row ? clone(row.value) : null,
        newValue: clone(req.value),
        reason: req.reason ?? null,
        actorId: req.actorId ?? null,
        createdAt: new Date(),
      });
      return { changed: true, oldValue: row?.value, newValue: req.value, version };
    },
    async clear(req) {
      check(req.key, req.target);
      const m = tier(req.target, false);
      const row = m?.get(req.key);
      lock(req.key, row, req.expectedVersion);
      if (!m || !row) return { changed: false, version: 0 };
      m.delete(req.key);
      log.push({
        storeId: storeIdOf(req.target),
        key: req.key,
        action: 'RESET_TO_DEFAULT',
        oldValue: clone(row.value),
        newValue: null,
        reason: req.reason ?? null,
        actorId: req.actorId ?? null,
        createdAt: new Date(),
      });
      return { changed: true, oldValue: row.value, version: 0 };
    },
  };
  return backend;
}

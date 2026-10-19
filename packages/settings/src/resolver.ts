// PR 492 — the two-tier resolver with its in-process cache; PR 491 writes; PR 510 reset to default.
//
// Cache: one snapshot of every value row (the tables are small: a few hundred keys × a few stores). The snapshot is
// trusted for `checkIntervalMs`; after that the next read asks the backend for its version — the length of the
// append-only SettingChange log, which every write and reset grows in the same transaction — and reloads only when it
// moved. A write in this process drops the snapshot at once; other processes (the other replicas) see it within one
// check interval. This "version counter" was chosen over LISTEN/NOTIFY: LISTEN does not work through PgBouncer in
// transaction mode, so NOTIFY would need a second, direct connection per replica plus reconnect handling.
//
// If the database is briefly unreachable after a snapshot was loaded, the last snapshot keeps answering and the next
// read retries; without any snapshot the read fails and the caller decides (the status page falls back to env).
import type { RegistryShape, SettingKey, SettingTarget, SettingValue } from './define';
import type { ChangeMeta, ChangeResult, SettingsBackend, Snapshot } from './backend';
import { SettingsError } from './errors';
import { resolveValue, type Resolved } from './resolve';

/** How long a snapshot is trusted before the version is checked again. A technical default; callers may pass their own. */
export const DEFAULT_CHECK_INTERVAL_MS = 2_000;

export interface ResolverOptions {
  checkIntervalMs?: number;
  /** Clock, for tests. */
  now?: () => number;
  /** Called when a refresh fails and the last snapshot keeps answering. */
  onStale?: (error: unknown) => void;
}

export interface WriteOptions extends ChangeMeta {
  /** The owner's written OK, required for settings flagged `requiresOwnerOk` (CLAUDE.md rule 6). */
  ownerApproved?: boolean;
}

export class SettingsResolver<R extends RegistryShape> {
  readonly registry: R;
  private readonly backend: SettingsBackend;
  private readonly checkIntervalMs: number;
  private readonly now: () => number;
  private readonly onStale?: (error: unknown) => void;
  private snapshot: Snapshot | undefined;
  private checkedAt = 0;
  private refreshing: Promise<Snapshot> | undefined;

  constructor(backend: SettingsBackend, registry: R, opts: ResolverOptions = {}) {
    this.backend = backend;
    this.registry = registry;
    this.checkIntervalMs = opts.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
    this.now = opts.now ?? Date.now;
    this.onStale = opts.onStale;
  }

  /** The effective value of one setting for a store (or installation-wide when storeId is omitted). */
  async get<K extends SettingKey<R>>(key: K, opts: { storeId?: number } = {}): Promise<Resolved<SettingValue<R, K>>> {
    const spec = this.spec(key);
    const snap = await this.current();
    return resolveValue(key, spec, {
      store: opts.storeId === undefined ? undefined : snap.stores.get(opts.storeId)?.get(key),
      installation: snap.installation.get(key),
    }) as Resolved<SettingValue<R, K>>;
  }

  /** Just the value. */
  async value<K extends SettingKey<R>>(key: K, opts: { storeId?: number } = {}): Promise<SettingValue<R, K>> {
    return (await this.get(key, opts)).value;
  }

  /** Every registry setting, resolved for one store (or installation-wide). */
  async all(opts: { storeId?: number } = {}): Promise<Resolved<unknown>[]> {
    const snap = await this.current();
    return (Object.keys(this.registry) as SettingKey<R>[]).map((key) =>
      resolveValue(key, this.spec(key), {
        store: opts.storeId === undefined ? undefined : snap.stores.get(opts.storeId)?.get(key),
        installation: snap.installation.get(key),
      }),
    );
  }

  /** Validates and saves a value at one tier; logs a SettingChange (who, old, new, when). */
  async set<K extends SettingKey<R>>(
    key: K,
    value: SettingValue<R, K>,
    target: SettingTarget,
    opts: WriteOptions = {},
  ): Promise<ChangeResult> {
    const spec = this.spec(key);
    this.checkWrite(key, target, opts);
    const parsed = spec.schema.safeParse(value);
    if (!parsed.success) {
      throw new SettingsError(
        'INVALID_VALUE',
        key,
        'value rejected by the setting schema',
        parsed.error.issues.map((i) => `${i.path.join('.') || '(value)'}: ${i.message}`),
      );
    }
    try {
      return await this.backend.write({ key, target, value: parsed.data, ...meta(opts) });
    } finally {
      this.invalidate();
    }
  }

  /**
   * PR 510 — "Reset to default": removes the override at that tier and logs it. At store level the store goes back
   * to the installation value; at installation level the definition default answers again.
   */
  async reset<K extends SettingKey<R>>(key: K, target: SettingTarget, opts: WriteOptions = {}): Promise<ChangeResult> {
    this.spec(key);
    this.checkWrite(key, target, opts);
    try {
      return await this.backend.clear({ key, target, ...meta(opts) });
    } finally {
      this.invalidate();
    }
  }

  /** Drops the cached snapshot; the next read reloads. */
  invalidate(): void {
    this.snapshot = undefined;
    this.checkedAt = 0;
  }

  private spec(key: string) {
    const spec = Object.prototype.hasOwnProperty.call(this.registry, key) ? this.registry[key] : undefined;
    if (!spec) throw new SettingsError('UNKNOWN_KEY', key, 'not in the settings registry');
    return spec;
  }

  private checkWrite(key: string, target: SettingTarget, opts: WriteOptions) {
    const spec = this.spec(key);
    if (target.level === 'store' && spec.scope === 'installation') {
      throw new SettingsError('WRONG_SCOPE', key, 'installation-only setting cannot be set for a store');
    }
    if (target.level === 'store' && (!Number.isInteger(target.storeId) || target.storeId < 1)) {
      throw new SettingsError('UNKNOWN_STORE', key, 'store id must be a positive integer');
    }
    if (spec.requiresOwnerOk && !opts.ownerApproved) {
      throw new SettingsError('OWNER_OK_REQUIRED', key, "needs the owner's written OK");
    }
    if (opts.actorId != null && !UUID.test(opts.actorId)) {
      throw new SettingsError('INVALID_ACTOR', key, 'actor id must be a staff user id (UUID)');
    }
  }

  private async current(): Promise<Snapshot> {
    if (this.snapshot && this.now() - this.checkedAt < this.checkIntervalMs) return this.snapshot;
    this.refreshing ??= this.refresh().finally(() => {
      this.refreshing = undefined;
    });
    return this.refreshing;
  }

  private async refresh(): Promise<Snapshot> {
    const previous = this.snapshot;
    try {
      if (previous) {
        const version = await this.backend.version();
        if (version === previous.version && this.snapshot === previous) {
          this.checkedAt = this.now();
          return previous;
        }
      }
      // The version is read before the rows, so a write landing in between only causes one extra reload later.
      const snap = await this.backend.load();
      this.snapshot = snap;
      this.checkedAt = this.now();
      return snap;
    } catch (error) {
      // No snapshot yet, or a write in this process dropped it meanwhile: never answer with pre-write values.
      if (!previous || this.snapshot !== previous) throw error;
      this.onStale?.(error);
      this.checkedAt = this.now();
      return previous;
    }
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function meta(opts: WriteOptions): ChangeMeta {
  return { actorId: opts.actorId ?? null, reason: opts.reason ?? null, expectedVersion: opts.expectedVersion };
}
